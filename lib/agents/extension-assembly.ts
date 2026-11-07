import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { InlineExtension } from "@earendil-works/pi-coding-agent";
import ts from "typescript";
import type { DomainResolver } from "../domains/resolver.ts";
import { createSessionExtension as authoredProvider } from "../extensions/agent-memory/index.ts";
import { createSessionExtension as architectureProvider } from "../extensions/architecture-memory/index.ts";
import { createSessionExtension as plansProvider } from "../extensions/plans/index.ts";
import type {
	SessionExtensionProvider,
	SessionProviderContext,
} from "../extensions/session-provider.ts";
import { createSessionExtension as tasksProvider } from "../extensions/tasks/index.ts";
import { resolveExtensionPaths } from "../orchestration/definition-resolution.ts";

const NATIVE_PROVIDERS: Readonly<Record<string, SessionExtensionProvider>> = {
	tasks: tasksProvider,
	plans: plansProvider,
	"agent-memory": authoredProvider,
	"architecture-memory": architectureProvider,
};

interface BindingOptions {
	names: readonly string[];
	domain: string;
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

async function selectProvider(
	name: string,
	options: BindingOptions,
): Promise<{
	path?: string;
	factory?: InlineExtension;
}> {
	const native =
		!options.domainsDir && !options.resolver
			? NATIVE_PROVIDERS[name]
			: undefined;
	if (native) return { factory: native(options.context) };
	// One requested name produces exactly one path, or resolveExtensionPaths throws.
	const path = resolveExtensionPaths([name], options)[0] as string;
	const entry = join(path, "index.ts");
	const provider = (await hasBindingExport(entry))
		? ((await import(entry)).createSessionExtension as
				| SessionExtensionProvider
				| undefined)
		: undefined;
	if (typeof provider === "function")
		return { factory: provider(options.context) };
	return { path };
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
