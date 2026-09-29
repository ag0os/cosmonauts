/**
 * Project reachability gate (framework-health D-020, D-024, D-039).
 * Walks runtime imports (type-only imports do not count) from the shipped roots:
 * what package.json `bin` scripts import, `bun build --compile` entries, domain
 * `domain.ts`/`chains.ts`/`workflows.ts` manifests, agents, and extension
 * entries, and the public and staged declarations. Static and dynamic imports,
 * `require()`, and `runnerModule: "<path>"` properties are followed. Unreached
 * lib modules with no runtime code (types only) are not reported.
 * Usage: bun scripts/check-reachability.ts [projectRoot]
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import matter from "gray-matter";
import ts from "typescript";
import { binEntryImports, projectPath } from "./project-path.ts";

declare const Bun: { TOML: { parse(source: string): unknown } };

const root = resolve(process.argv[2] ?? ".");
const errors: string[] = [];

function read(path: string): string {
	return readFileSync(join(root, path), "utf8");
}

function parseYamlFrontmatter(source: string): Record<string, unknown> {
	const opening = /^\uFEFF?---([^\r\n]*)(\r\n|\n|$)/.exec(source);
	if (!opening) throw new Error("unsupported frontmatter language delimiter");
	const language = (opening[1] as string).trim();
	if (!["", "yaml", "yml"].includes(language))
		throw new Error(`unsupported frontmatter language: ${language}`);

	const yamlSource = `---${opening[2] as string}${source.slice(opening[0].length)}`;
	return matter(yamlSource, { language: "yaml" }).data;
}

function parseToml(path: string): Record<string, unknown> {
	try {
		return Bun.TOML.parse(read(path)) as Record<string, unknown>;
	} catch (error) {
		throw new Error(
			`${path}: invalid TOML: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

function stringArray(value: unknown, label: string): string[] {
	if (
		!Array.isArray(value) ||
		!value.every((item): item is string => typeof item === "string")
	)
		throw new Error(`${label} must be an array of strings`);
	return value;
}

function stagedRows(value: unknown): Array<{ path: string; owner: string }> {
	if (value === undefined) return [];
	if (!Array.isArray(value))
		throw new Error("staged-code.toml: staged must be an array of tables");
	return value.map((row: unknown) => {
		const { path, owner } = (row ?? {}) as Record<string, unknown>;
		if (typeof path !== "string" || typeof owner !== "string")
			throw new Error(
				"staged-code.toml: each staged row requires string path and owner",
			);
		return { path, owner };
	});
}

function ownerLive(owner: string): boolean {
	if (owner.startsWith("plan:")) {
		const slug = owner.slice(5);
		if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return false;
		const path = `missions/plans/${slug}/plan.md`;
		if (!existsSync(join(root, path))) return false;
		try {
			return parseYamlFrontmatter(read(path)).status === "active";
		} catch (error) {
			throw new Error(
				`staged owner ${owner} plan ${path}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
	if (owner.startsWith("roadmap:")) {
		const heading = owner.slice(8);
		return (
			heading.length > 0 &&
			existsSync(join(root, "ROADMAP.md")) &&
			read("ROADMAP.md")
				.split("\n")
				.some(
					(line) =>
						/^#{3,6} /.test(line) &&
						line.replace(/^#{3,6} /, "").trim() === heading,
				)
		);
	}
	return false;
}

function files(dir: string): string[] {
	const full = join(root, dir);
	if (!existsSync(full)) return [];
	return readdirSync(full, { withFileTypes: true }).flatMap((entry) => {
		const path = `${dir}/${entry.name}`;
		return entry.isDirectory()
			? files(path)
			: /\.(?:ts|tsx|js|mjs)$/.test(path)
				? [path]
				: [];
	});
}

function resolveImport(from: string, specifier: string): string | undefined {
	if (!specifier.startsWith(".")) return undefined;
	const base = resolve(root, dirname(from), specifier);
	for (const candidate of [
		base,
		`${base}.ts`,
		`${base}.tsx`,
		`${base}/index.ts`,
		base.replace(/\.js$/, ".ts"),
	]) {
		if (existsSync(candidate)) return projectPath(root, candidate);
	}
	return undefined;
}

function runtimeImportClause(clause: ts.ImportClause | undefined): boolean {
	if (!clause) return true;
	if (clause.isTypeOnly) return false;
	return runtimeNamedBindings(clause);
}

function runtimeNamedBindings(clause: ts.ImportClause): boolean {
	if (!clause.namedBindings || !ts.isNamedImports(clause.namedBindings))
		return true;
	if (clause.name) return true;
	return clause.namedBindings.elements.some((element) => !element.isTypeOnly);
}

function runtimeExportDeclaration(node: ts.ExportDeclaration): boolean {
	if (node.isTypeOnly) return false;
	if (!node.exportClause || !ts.isNamedExports(node.exportClause)) return true;
	return node.exportClause.elements.some((element) => !element.isTypeOnly);
}

function literalImportCall(
	node: ts.Node,
	source: ts.SourceFile,
): string | undefined {
	if (!ts.isCallExpression(node)) return undefined;
	return isImportCallee(node.expression, source)
		? literalCallArgument(node)
		: undefined;
}

function literalCallArgument(node: ts.CallExpression): string | undefined {
	if (node.arguments.length !== 1) return undefined;
	const argument = node.arguments[0];
	if (!argument || !ts.isStringLiteral(argument)) return undefined;
	return argument.text;
}

function isImportCallee(
	expression: ts.LeftHandSideExpression,
	source: ts.SourceFile,
): boolean {
	return (
		expression.kind === ts.SyntaxKind.ImportKeyword ||
		expression.getText(source) === "require"
	);
}

function addRunnerModule(
	node: ts.Node,
	source: ts.SourceFile,
	add: (specifier: string) => void,
): void {
	if (
		ts.isPropertyAssignment(node) &&
		node.name.getText(source) === "runnerModule" &&
		ts.isStringLiteral(node.initializer)
	) {
		add(node.initializer.text);
	}
}

function addImportDeclaration(
	node: ts.Node,
	add: (specifier: string) => void,
): void {
	if (
		ts.isImportDeclaration(node) &&
		ts.isStringLiteral(node.moduleSpecifier) &&
		runtimeImportClause(node.importClause)
	) {
		add(node.moduleSpecifier.text);
	}
}

function addExportDeclaration(
	node: ts.Node,
	add: (specifier: string) => void,
): void {
	if (ts.isExportDeclaration(node)) addExportModule(node, add);
}

function addExportModule(
	node: ts.ExportDeclaration,
	add: (specifier: string) => void,
): void {
	if (
		node.moduleSpecifier &&
		ts.isStringLiteral(node.moduleSpecifier) &&
		runtimeExportDeclaration(node)
	) {
		add(node.moduleSpecifier.text);
	}
}

function runtimeImports(path: string): string[] {
	const source = ts.createSourceFile(
		path,
		read(path),
		ts.ScriptTarget.Latest,
		true,
	);
	const imports: string[] = [];
	function add(specifier: string): void {
		const target = resolveImport(path, specifier);
		if (target) imports.push(target);
	}
	function visit(node: ts.Node): void {
		addRunnerModule(node, source, add);
		addImportDeclaration(node, add);
		addExportDeclaration(node, add);
		const call = literalImportCall(node, source);
		if (call !== undefined) add(call);
		ts.forEachChild(node, visit);
	}
	visit(source);
	return imports;
}

function hasRuntimeCode(path: string): boolean {
	const output = ts
		.transpileModule(read(path), {
			compilerOptions: {
				module: ts.ModuleKind.ESNext,
				target: ts.ScriptTarget.ESNext,
				removeComments: true,
			},
		})
		.outputText.trim();
	return output !== "" && output !== "export {};";
}

try {
	const entry = stringArray(
		parseToml("fallow.toml").entry,
		"fallow.toml: entry",
	);
	const registry = parseToml("missions/architecture/staged-code.toml");
	const publicPaths = stringArray(registry.public, "staged-code.toml: public");
	const staged = stagedRows(registry.staged);
	const declared = [...publicPaths, ...staged.map((row) => row.path)];
	for (const [name, paths] of [
		["entry", entry],
		["public/staged", declared],
	] as const) {
		const seen = new Set<string>();
		for (const path of paths) {
			if (seen.has(path)) errors.push(`duplicate ${name}: ${path}`);
			seen.add(path);
		}
	}
	for (const path of entry)
		if (!declared.includes(path)) errors.push(`undeclared entry: ${path}`);
	for (const path of declared)
		if (!entry.includes(path)) errors.push(`missing entry: ${path}`);
	for (const path of declared)
		if (!existsSync(join(root, path)))
			errors.push(`missing declared module: ${path}`);
	for (const row of staged) {
		if (!ownerLive(row.owner))
			errors.push(
				`staged owner archived or absent: ${row.path} -> ${row.owner}`,
			);
	}

	const libModules = files("lib");
	const modules = [
		...libModules,
		...files("cli"),
		...files("domains"),
		...files("bundled"),
	];
	const moduleSet = new Set(modules);
	const packageScripts = Object.values(
		(JSON.parse(read("package.json")) as { scripts?: Record<string, string> })
			.scripts ?? {},
	);
	const compiledEntries = packageScripts.flatMap((command) =>
		[...command.matchAll(/bun build --compile\s+([^\s]+\.ts)/g)].map(
			(match) => match[1] ?? "",
		),
	);
	for (const path of compiledEntries)
		if (!existsSync(join(root, path)))
			errors.push(`missing compile entry: ${path}`);
	const binScripts = Object.values(
		(JSON.parse(read("package.json")) as { bin?: Record<string, string> })
			.bin ?? {},
	);
	const binEntries = binScripts.flatMap((script) => {
		if (!existsSync(join(root, script))) {
			errors.push(`missing bin entry: ${script}`);
			return [];
		}
		return binEntryImports({ root, script, source: read(script) });
	});
	const roots = new Set<string>([
		...declared,
		...binEntries,
		...compiledEntries,
		...modules.filter(
			(path) =>
				/^(?:domains|bundled)\/[^/]+\/(?:domain|chains|workflows)\.ts$/.test(
					path,
				) ||
				/^(?:domains|bundled)\/[^/]+\/agents\/[^/]+\.ts$/.test(path) ||
				/^(?:domains|bundled)\/[^/]+\/extensions\/[^/]+\/index\.ts$/.test(path),
		),
	]);
	const reached = new Set<string>();
	const queue = [...roots];
	while (queue.length > 0) {
		const path = queue.pop();
		if (!path) continue;
		if (reached.has(path) || !moduleSet.has(path)) continue;
		reached.add(path);
		queue.push(...runtimeImports(path));
	}
	const runtimeLibModules = libModules.filter(hasRuntimeCode);
	for (const path of runtimeLibModules.sort())
		if (!reached.has(path)) errors.push(`unreachable: ${path}`);
	const reachedRuntimeModules = runtimeLibModules.filter((path) =>
		reached.has(path),
	).length;
	const typeOnlyLibModules = libModules.length - runtimeLibModules.length;
	const typeOnlyLabel = typeOnlyLibModules === 1 ? "module" : "modules";
	for (const error of errors) console.log(error);
	console.log(
		`reachability: ${reachedRuntimeModules}/${runtimeLibModules.length} runtime lib modules reached; ${typeOnlyLibModules} type-only lib ${typeOnlyLabel} exempt; ${staged.length} staged`,
	);
	if (errors.length > 0) process.exitCode = 1;
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
