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
import { dirname, join, relative, resolve } from "node:path";
import matter from "gray-matter";
import ts from "typescript";

declare const Bun: { TOML: { parse(source: string): unknown } };

const root = resolve(process.argv[2] ?? ".");
const errors: string[] = [];

function read(path: string): string {
	return readFileSync(join(root, path), "utf8");
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
		return (
			existsSync(join(root, path)) &&
			matter(read(path)).data.status === "active"
		);
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
		if (existsSync(candidate))
			return relative(root, candidate).replaceAll("\\", "/");
	}
	return undefined;
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
		if (
			ts.isPropertyAssignment(node) &&
			node.name.getText(source) === "runnerModule" &&
			ts.isStringLiteral(node.initializer)
		)
			add(node.initializer.text);
		if (
			ts.isImportDeclaration(node) &&
			ts.isStringLiteral(node.moduleSpecifier)
		) {
			const clause = node.importClause;
			if (
				!clause?.isTypeOnly &&
				(!clause?.namedBindings ||
					!ts.isNamedImports(clause.namedBindings) ||
					clause.name ||
					clause.namedBindings.elements.some((element) => !element.isTypeOnly))
			)
				add(node.moduleSpecifier.text);
		} else if (
			ts.isExportDeclaration(node) &&
			node.moduleSpecifier &&
			ts.isStringLiteral(node.moduleSpecifier)
		) {
			if (
				!node.isTypeOnly &&
				(!node.exportClause ||
					!ts.isNamedExports(node.exportClause) ||
					node.exportClause.elements.some((element) => !element.isTypeOnly))
			)
				add(node.moduleSpecifier.text);
		} else if (
			ts.isCallExpression(node) &&
			node.arguments.length === 1 &&
			node.arguments[0] &&
			ts.isStringLiteral(node.arguments[0]) &&
			(node.expression.kind === ts.SyntaxKind.ImportKeyword ||
				node.expression.getText(source) === "require")
		) {
			add(node.arguments[0].text);
		}
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

	const modules = [
		...files("lib"),
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
	const binScripts = Object.values(
		(JSON.parse(read("package.json")) as { bin?: Record<string, string> })
			.bin ?? {},
	);
	const binEntries = binScripts.flatMap((script) => {
		const path = join(root, script);
		if (!existsSync(path)) return [];
		return [...read(script).matchAll(/^import\s+["']([^"']+)["']/gm)].map(
			(match) => relative(root, resolve(dirname(path), match[1] ?? "")),
		);
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
	for (const path of files("lib").sort())
		if (!reached.has(path) && hasRuntimeCode(path))
			errors.push(`unreachable: ${path}`);
	for (const error of errors) console.log(error);
	console.log(
		`reachability: ${files("lib").length - errors.filter((x) => x.startsWith("unreachable:")).length}/${files("lib").length} lib modules reached; ${staged.length} staged`,
	);
	if (errors.length > 0) process.exitCode = 1;
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
