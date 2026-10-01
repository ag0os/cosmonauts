/**
 * Chooses the test files a scoped mutation run executes, in two tiers.
 *
 * Tier 1: the changed files' own tests — changed spec files, the mirrored
 * `tests/` path and spec files that import a changed file directly. Tier 2:
 * tests of the changed files' direct source importers, then the rest of the
 * blast-radius signal's tests, which do not tell direct importers from
 * transitive ones. Tier 2 runs only when the budget allows. `maxTests` caps
 * the whole selection, tier 1 first; everything left out is `skipped`.
 * Only spec files are ever selected, and sandbox-unsafe tests are removed.
 */

import { dependentsOf, type FileGraph } from "../../architecture-map/index.ts";
import { blastRadius } from "../graph/blast-radius.ts";

/**
 * Tests that fail in Stryker's sandbox, which has no `.git` of its own: `git`
 * there resolves to the enclosing checkout. A trailing `*` matches a prefix.
 */
export const DEFAULT_SANDBOX_UNSAFE_TESTS = [
	"tests/scripts/validate-harness-exports.test.ts",
	"tests/extensions/project-tools-fallow-fixtures.test.ts",
	"tests/orchestration/quality-review-repository-pins*",
	"tests/config/biome*",
	"tests/lean-run/providers/mutation.test.ts",
] as const;

/** Vitest's default include, wider than the architecture map's TypeScript-only rule. */
const SPEC_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/u;
/**
 * `git clone` or `git worktree add`, as a shell string or an argument list.
 * Other git calls against the test's own checkout (`ls-files`, `check-ignore`)
 * are not detected; those tests belong in the deny-list.
 */
const MUTATES_REPOSITORY =
	/["'`]clone["'`]|\bgit clone\b|["'`]worktree["'`],\s*["'`]add["'`]|\bgit worktree add\b/u;

export interface TestSelectionInput {
	/** Repo-relative files that hold a changed function. */
	readonly sourceFiles: readonly string[];
	/** Every repo-relative file the change touched. */
	readonly changedFiles: readonly string[];
	readonly graph?: FileGraph;
	/** The `blast-radius` signal's tests; undefined when no such signal ran. */
	readonly blastRadiusTests?: readonly string[];
	readonly includeTier2: boolean;
	readonly maxTests: number;
	readonly exists: (path: string) => boolean;
	readonly isDenied: (path: string) => boolean;
}

export interface TestSelection {
	readonly tier1: string[];
	readonly tier2: string[];
	/** Tier 1 followed by tier 2: what Stryker runs. */
	readonly selected: string[];
	readonly denied: string[];
	/** Tests left out by the budget or `maxTests`. */
	readonly skipped: string[];
}

export function selectMutationTests(input: TestSelectionInput): TestSelection {
	const denied = new Set<string>();
	const keep = (path: string): boolean => {
		if (!isSpecFile(path) || !input.exists(path)) return false;
		if (!input.isDenied(path)) return true;
		denied.add(path);
		return false;
	};
	const tier1Candidates = unique(tier1CandidateTests(input)).filter(keep);
	const inTier1 = new Set(tier1Candidates);
	const tier2Candidates = unique(tier2CandidateTests(input)).filter(
		(path) => !inTier1.has(path) && keep(path),
	);
	const tier1 = tier1Candidates.slice(0, input.maxTests);
	const room = input.includeTier2 ? input.maxTests - tier1.length : 0;
	const tier2 = tier2Candidates.slice(0, room);
	return {
		tier1,
		tier2,
		selected: [...tier1, ...tier2],
		denied: [...denied].sort(),
		skipped: [
			...tier1Candidates.slice(tier1.length),
			...tier2Candidates.slice(tier2.length),
		],
	};
}

/** A temp directory the test builds for itself. */
const TEMP_FIXTURE =
	/\bmkdtemp(?:Sync)?\s*\(|\btmpdir\s*\(\s*\)|\buseTempDir\s*\(/u;
/** Ways a test names the checkout it lives in. */
const PROJECT_ROOT_REFERENCE =
	/\bprocess\.cwd\s*\(|\bimport\.meta\.(?:url|dirname|filename)\b|\b__(?:dirname|filename)\b/u;

/**
 * What matters is behaviour: whether the test runs `git` against the live
 * checkout. Running the test to find out is not cheap, so the text decides:
 * a deny-listed path is unsafe, and so is a test that clones or adds a
 * worktree, unless its git commands target a temp fixture (see
 * {@link gitTargetsTempFixture}).
 */
export function isSandboxUnsafeTest(options: {
	readonly path: string;
	readonly content: string;
	readonly denyList: readonly string[];
}): boolean {
	if (options.denyList.some((entry) => matchesEntry(entry, options.path)))
		return true;
	return (
		MUTATES_REPOSITORY.test(options.content) &&
		!gitTargetsTempFixture(options.content)
	);
}

/**
 * The test builds a temp fixture (`mkdtemp`, `tmpdir()`, `useTempDir`) and
 * never names the checkout it lives in (`process.cwd()`, `import.meta`,
 * `__dirname`), so its git commands can only run in that fixture, which is
 * outside the sandbox's enclosing checkout.
 */
export function gitTargetsTempFixture(content: string): boolean {
	return TEMP_FIXTURE.test(content) && !PROJECT_ROOT_REFERENCE.test(content);
}

export interface CoverageInput {
	/** Repo-relative files that hold a changed function. */
	readonly sourceFiles: readonly string[];
	readonly graph?: FileGraph;
	/** The `blast-radius` signal's tests; undefined when no such signal ran. */
	readonly blastRadiusTests?: readonly string[];
	readonly exists: (path: string) => boolean;
	readonly isDenied: (path: string) => boolean;
}

export interface UntestableFile {
	readonly file: string;
	/** Its covering tests, every one denied. */
	readonly covering: string[];
}

/**
 * Source files whose covering tests are all sandbox-unsafe: their mutants
 * cannot be killed under Stryker, so survivors there say nothing about the
 * change. A file with no covering test at all is not listed.
 */
export function untestableFiles(input: CoverageInput): UntestableFile[] {
	return input.sourceFiles.flatMap((file) => {
		const covering = coveringTests(file, input);
		return covering.length > 0 && covering.every(input.isDenied)
			? [{ file, covering }]
			: [];
	});
}

/**
 * The spec files that import `file`: its mirrored test and direct test
 * importers, and the blast-radius signal's tests that reach it through the
 * import graph (all of them when there is no graph to tell them apart).
 */
export function coveringTests(file: string, input: CoverageInput): string[] {
	const reach =
		input.graph === undefined
			? undefined
			: new Set(
					blastRadius({ graph: input.graph, changedFiles: [file] }).tests,
				);
	const viaBlastRadius = (input.blastRadiusTests ?? []).filter(
		(test) => reach === undefined || reach.has(test),
	);
	return unique([...ownTests(file, input.graph), ...viaBlastRadius])
		.filter((path) => isSpecFile(path) && input.exists(path))
		.sort();
}

/** Any file under `tests/` or named like a spec: never a mutation target. */
export function isTestFile(path: string): boolean {
	return path.startsWith("tests/") || isSpecFile(path);
}

/** A file vitest runs as a test suite; helpers and fixtures are not. */
export function isSpecFile(path: string): boolean {
	return SPEC_FILE.test(path);
}

/** `lib/a/b.ts` → `tests/a/b.test.ts`; any other root keeps its name: `cli/a.ts` → `tests/cli/a.test.ts`. */
export function mirroredTestPath(sourceFile: string): string | undefined {
	const match = /^(.*)\.([cm]?[jt]sx?)$/u.exec(sourceFile);
	if (match?.[1] === undefined) return undefined;
	const stem = match[1].startsWith("lib/") ? match[1].slice(4) : match[1];
	return `tests/${stem}.test.${match[2]}`;
}

function matchesEntry(entry: string, path: string): boolean {
	return entry.endsWith("*")
		? path.startsWith(entry.slice(0, -1))
		: path === entry;
}

function tier1CandidateTests(input: TestSelectionInput): string[] {
	return [
		...input.changedFiles,
		...input.sourceFiles.flatMap((file) => ownTests(file, input.graph)),
	];
}

function tier2CandidateTests(input: TestSelectionInput): string[] {
	return [
		...importerTests(input.sourceFiles, input.graph),
		...(input.blastRadiusTests ?? []),
	];
}

function ownTests(file: string, graph: FileGraph | undefined): string[] {
	return [...optional(mirroredTestPath(file)), ...testImportersOf(file, graph)];
}

function importerTests(
	sourceFiles: readonly string[],
	graph: FileGraph | undefined,
): string[] {
	if (graph === undefined) return [];
	const importers = unique(
		sourceFiles.flatMap((file) => runtimeImporters(file, graph)),
	).filter((path) => nodeKind(graph, path) === "source");
	return importers.sort().flatMap((file) => ownTests(file, graph));
}

function testImportersOf(file: string, graph: FileGraph | undefined): string[] {
	if (graph === undefined) return [];
	return runtimeImporters(file, graph)
		.filter((path) => nodeKind(graph, path) === "test")
		.sort();
}

/** Type-only importers never execute the file, so they cannot kill its mutants. */
function runtimeImporters(file: string, graph: FileGraph): string[] {
	return dependentsOf(graph, file)
		.filter((edge) => !edge.typeOnly)
		.map((edge) => edge.from);
}

function nodeKind(graph: FileGraph, path: string): string | undefined {
	return graph.nodes.find((node) => node.path === path)?.kind;
}

function optional(value: string | undefined): string[] {
	return value === undefined ? [] : [value];
}

function unique(values: readonly string[]): string[] {
	return [...new Set(values)];
}
