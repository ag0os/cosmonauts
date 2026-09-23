/** Project reachability gate. Usage: bun scripts/check-reachability.ts [projectRoot] */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";

const root = resolve(process.argv[2] ?? ".");
const errors: string[] = [];

function read(path: string): string {
	return readFileSync(join(root, path), "utf8");
}

function stringArray(source: string, key: string): string[] {
	const match = source.match(
		new RegExp(`(?:^|\\n)${key}\\s*=\\s*\\[([\\s\\S]*?)\\]`),
	);
	if (!match) throw new Error(`missing ${key} array`);
	const values: string[] = [];
	const cleaned = match[1]?.replace(/#.*$/gm, "") ?? "";
	const tokens = cleaned.match(/"(?:\\.|[^"\\])*"|[^\s,]+/g) ?? [];
	for (const token of tokens) {
		if (!token.startsWith('"'))
			throw new Error(`invalid ${key} item: ${token}`);
		values.push(JSON.parse(token) as string);
	}
	return values;
}

function stagedRows(source: string): Array<{ path: string; owner: string }> {
	return source
		.split(/\[\[staged\]\]/)
		.slice(1)
		.map((block) => {
			const path = block.match(/^path\s*=\s*("(?:\\.|[^"\\])*")/m)?.[1];
			const owner = block.match(/^owner\s*=\s*("(?:\\.|[^"\\])*")/m)?.[1];
			if (!path || !owner)
				throw new Error("staged row requires path and owner");
			return {
				path: JSON.parse(path) as string,
				owner: JSON.parse(owner) as string,
			};
		});
}

function ownerLive(owner: string): boolean {
	if (owner.startsWith("plan:")) {
		const slug = owner.slice(5);
		if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return false;
		const path = `missions/plans/${slug}/plan.md`;
		const frontmatter = existsSync(join(root, path))
			? read(path).match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1]
			: undefined;
		return (
			frontmatter !== undefined && /^status:\s*active\s*$/m.test(frontmatter)
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
	const fallow = spawnSync(
		process.env.FALLOW_BIN ?? join(root, "node_modules/.bin/fallow"),
		[
			"--root",
			root,
			"--production",
			"--format",
			"json",
			"--quiet",
			"--no-cache",
			"dead-code",
			"--unused-files",
		],
		{ encoding: "utf8" },
	);
	if (fallow.error || ![0, 1].includes(fallow.status ?? -1)) {
		throw new Error(
			`fallow failed: ${fallow.error?.message ?? fallow.stderr.trim()}`,
		);
	}
	const result: unknown = JSON.parse(fallow.stdout);
	if (
		!result ||
		typeof result !== "object" ||
		!("unused_files" in result) ||
		!Array.isArray(result.unused_files)
	) {
		throw new Error("fallow did not return unused_files JSON");
	}

	const entry = stringArray(read("fallow.toml"), "entry");
	const registry = read("missions/architecture/staged-code.toml");
	const publicPaths = stringArray(registry, "public");
	const staged = stagedRows(registry);
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
	const roots = new Set<string>([
		...declared,
		...files("cli"),
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
