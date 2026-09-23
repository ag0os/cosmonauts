/**
 * Draws the mutation-probe sample of framework-health Stage 2
 * (plan D-021, D-024, D-030, D-032, D-034, D-037) from the committed tests.
 *
 * Usage: bun scripts/probe-census.ts [repoRoot]   → JSON on stdout
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

const PRODUCTION_ROOTS = ["lib/", "cli/", "domains/", "scripts/", "bundled/"];
const IMPORT_RE =
	/(?:import|export)\s[^;]*?from\s*["']([^"']+)["']|import\(\s*["'`]([^"'`]+)["'`]\s*\)|import\s*["']([^"']+)["']|vi\.mock\(\s*["']([^"']+)["']/g;
const SUBPROCESS_RE = /\b(?:spawn|execFile|exec)\w*\s*\(/;
const BIN_RE = /bin\/cosmonauts|["']bin["']/;
const DECLARATION_RE =
	/^\s*(?:it|test)(?:\.(?:each\([^)]*\)|concurrent|skipIf\([^)]*\)|runIf\([^)]*\)))?\s*\(\s*(["'`])(.*?)\1/;

interface Admission {
	file: string;
	stratum: string;
	rule: string;
	via: string;
}

function resolveImport(fromFile: string, specifier: string): string | null {
	if (!specifier.startsWith(".")) return null;
	const base = resolve(dirname(fromFile), specifier);
	const tsTwin = base.endsWith(".js") ? `${base.slice(0, -3)}.ts` : base;
	for (const candidate of [base, tsTwin, `${base}.ts`, `${base}/index.ts`]) {
		if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
	}
	return null;
}

function importsOf(file: string): string[] {
	const source = readFileSync(file, "utf8");
	return [...source.matchAll(IMPORT_RE)]
		.map((match) => match[1] ?? match[2] ?? match[3] ?? match[4] ?? "")
		.map((specifier) => resolveImport(file, specifier))
		.filter((path): path is string => path !== null);
}

/** Breadth-first over relative imports inside tests/ until production is reached. */
function productionReach(root: string, testFile: string): string | null {
	const start = resolve(root, testFile);
	const seen = new Set<string>();
	const queue: Array<{ path: string; via: string[] }> = [
		{ path: start, via: [] },
	];
	while (queue.length > 0) {
		const { path, via } = queue.shift() as { path: string; via: string[] };
		if (seen.has(path)) continue;
		seen.add(path);
		const rel = relative(root, path);
		if (PRODUCTION_ROOTS.some((prefix) => rel.startsWith(prefix))) {
			return [...via, rel].join(" -> ");
		}
		if (!rel.startsWith("tests/")) continue;
		const nextVia = path === start ? via : [...via, rel];
		for (const next of importsOf(path))
			queue.push({ path: next, via: nextVia });
	}
	return null;
}

function admit(root: string, file: string): Admission | null {
	const parts = file.split("/");
	const stratum = parts.length === 2 ? "(root)" : (parts[1] ?? "(root)");
	const source = readFileSync(resolve(root, file), "utf8");
	const runsBin = BIN_RE.test(source) && SUBPROCESS_RE.test(source);
	const route = productionReach(root, file);
	if (route === null) {
		return runsBin
			? { file, stratum, rule: "bin-subprocess", via: "bin/" }
			: null;
	}
	const importRule = route.includes(" -> ") ? "via-helper" : "direct-import";
	return {
		file,
		stratum,
		rule: runsBin ? `${importRule}+bin-subprocess` : importRule,
		via: route,
	};
}

function medianDeclaration(root: string, file: string) {
	const lines = readFileSync(resolve(root, file), "utf8").split("\n");
	const declarations = lines.flatMap((line, index) => {
		const match = line.match(DECLARATION_RE);
		return match ? [{ line: index + 1, name: match[2] ?? "" }] : [];
	});
	return {
		declarations: declarations.length,
		median: declarations[Math.floor((declarations.length - 1) / 2)] ?? null,
	};
}

function census(root: string) {
	const files = execFileSync(
		"git",
		["ls-files", "tests/**/*.test.ts", "tests/*.test.ts"],
		{ cwd: root, encoding: "utf8" },
	)
		.trim()
		.split("\n")
		.filter((file) => !file.startsWith("tests/fixtures/"))
		.sort();
	const admitted: Admission[] = [];
	const excluded: string[] = [];
	for (const file of files) {
		const admission = admit(root, file);
		if (admission) admitted.push(admission);
		else excluded.push(file);
	}
	const strata = new Map<string, Admission[]>();
	for (const admission of admitted) {
		strata.set(admission.stratum, [
			...(strata.get(admission.stratum) ?? []),
			admission,
		]);
	}
	return {
		commit: execFileSync("git", ["rev-parse", "--short", "HEAD"], {
			cwd: root,
			encoding: "utf8",
		}).trim(),
		population: admitted.length,
		excluded,
		strata: [...strata.entries()]
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([name, members]) => {
				const size = members.length;
				const sample = Math.min(size, Math.max(3, Math.ceil(size / 10)));
				const stride = size / sample;
				const picks = Array.from({ length: sample }, (_, i) => {
					const pick = members[Math.floor(i * stride)] as Admission;
					return { ...pick, ...medianDeclaration(root, pick.file) };
				});
				return { name, size, sample, stride: Number(stride.toFixed(3)), picks };
			}),
	};
}

console.log(JSON.stringify(census(resolve(process.argv[2] ?? ".")), null, 2));
