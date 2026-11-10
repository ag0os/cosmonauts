import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { InlineExtension } from "@earendil-works/pi-coding-agent";
import ts from "typescript";
import type { DomainResolver } from "../domains/resolver.ts";
import { createSessionExtension as plansProvider } from "../extensions/plans/index.ts";
import type {
	SessionExtensionProvider,
	SessionProviderContext,
} from "../extensions/session-provider.ts";
import { createSessionExtension as tasksProvider } from "../extensions/tasks/index.ts";
import {
	resolveExtensionPaths,
	UnknownExtensionError,
} from "../orchestration/definition-resolution.ts";

const NATIVE_PROVIDERS: Readonly<Record<string, SessionExtensionProvider>> = {
	tasks: tasksProvider,
	plans: plansProvider,
	init: async (context) =>
		(await import("../extensions/init/index.ts")).createSessionExtension(
			context,
		),
	// Library extensions with no session context, imported only when selected.
	"agent-switch": async () =>
		(await import("../extensions/agent-switch/index.ts")).default,
	observability: async () =>
		(await import("../extensions/observability/index.ts")).default,
	"project-tools": async () =>
		(await import("../extensions/project-tools/index.ts")).default,
	todo: async () => (await import("../extensions/todo/index.ts")).default,
};

interface BindingOptions {
	names: readonly string[];
	/** Extension directories the host already loads by path. */
	mountedPaths?: readonly string[];
	domain?: string;
	fallbackDomains?: readonly string[];
	domainsDir?: string;
	resolver?: DomainResolver;
	context: SessionProviderContext;
}

function valueDeclarationHasBinding(
	statement: ts.FunctionDeclaration | ts.VariableStatement,
): boolean {
	if (
		!statement.modifiers?.some(
			(modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
		)
	)
		return false;
	if (
		statement.modifiers.some(
			(modifier) =>
				modifier.kind === ts.SyntaxKind.DefaultKeyword ||
				modifier.kind === ts.SyntaxKind.DeclareKeyword,
		)
	)
		return false;
	if (ts.isFunctionDeclaration(statement))
		return statement.name?.text === "createSessionExtension";
	return statement.declarationList.declarations.some(
		(declaration) =>
			ts.isIdentifier(declaration.name) &&
			declaration.name.text === "createSessionExtension",
	);
}

function explicitlyExportsBinding(statement: ts.Statement): boolean {
	if (ts.isExportDeclaration(statement)) {
		return (
			!statement.isTypeOnly &&
			statement.exportClause !== undefined &&
			ts.isNamedExports(statement.exportClause) &&
			statement.exportClause.elements.some(
				(entry) =>
					!entry.isTypeOnly && entry.name.text === "createSessionExtension",
			)
		);
	}
	if (
		ts.isFunctionDeclaration(statement) ||
		ts.isVariableStatement(statement)
	) {
		return valueDeclarationHasBinding(statement);
	}
	return false;
}

async function hasBindingExport(entry: string): Promise<boolean> {
	if (!existsSync(entry)) return false;
	const source = ts.createSourceFile(
		entry,
		await readFile(entry, "utf8"),
		ts.ScriptTarget.Latest,
	);
	return source.statements.some(explicitlyExportsBinding);
}

function extensionFactory(
	value: unknown,
	name: string,
): InlineExtension | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "function")
		throw new Error(
			`Session extension provider "${name}" must return an inline factory or undefined`,
		);
	return value as InlineExtension;
}

async function selectProvider(
	name: string,
	options: BindingOptions,
): Promise<{
	path?: string;
	factory?: InlineExtension;
}> {
	const native =
		options.context.runtime?.extensionProviders?.[name] ??
		NATIVE_PROVIDERS[name];
	let path: string;
	try {
		path = resolveExtensionPaths([name], options)[0] as string;
	} catch (error) {
		if (!(error instanceof UnknownExtensionError) || !native) throw error;
		return selectNative(name, native, options);
	}
	const entry = ["index.ts", "index.js", "index.mjs"]
		.map((file) => join(path, file))
		.find(existsSync);
	if (!entry) return { path };
	const provider = (await hasBindingExport(entry))
		? ((await import(entry)).createSessionExtension as
				| SessionExtensionProvider
				| undefined)
		: undefined;
	if (typeof provider === "function")
		return { factory: extensionFactory(await provider(options.context), name) };
	return { path };
}

async function selectNative(
	name: string,
	native: (context: SessionProviderContext) => unknown,
	options: BindingOptions,
): Promise<{ factory?: InlineExtension }> {
	if (isLibraryExtensionMounted(name, options)) return {};
	return { factory: extensionFactory(await native(options.context), name) };
}

/**
 * A host that mounts a library extension by path (the CLI mounts agent-switch)
 * already loads it, and a second copy would make Pi rename its commands.
 */
function isLibraryExtensionMounted(
	name: string,
	options: BindingOptions,
): boolean {
	if (options.context.runtime?.extensionProviders?.[name]) return false;
	const directory = fileURLToPath(
		new URL(`../extensions/${name}`, import.meta.url),
	);
	return (options.mountedPaths ?? []).some(
		(path) => resolve(path) === directory,
	);
}

/** Preserve directory/provider precedence; only the selected provider is imported. */
export async function bindSessionExtensions(options: BindingOptions): Promise<{
	paths: string[];
	factories: InlineExtension[];
}> {
	const paths: string[] = [];
	const factories: InlineExtension[] = [];
	for (const name of options.names) {
		const selected = await selectProvider(name, options);
		if (selected.path) paths.push(selected.path);
		if (selected.factory) factories.push(selected.factory);
	}
	return { paths, factories };
}
