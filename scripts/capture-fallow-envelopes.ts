import { spawn } from "node:child_process";
import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	realpath,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REFERENCE_ENGINE_VERSION = "2.54.2";
const FIXTURE_SCHEMA_VERSION = 1;
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIR, "..");

export type FallowEnvelopeSource = "live-engine" | "captured-payload";

export const FALLOW_CAPABILITY_FIXTURES = [
	"dead-code",
	"duplication",
	"complexity",
	"boundary-conformance",
	"changed-scope-audit",
	"trace",
	"fix-preview",
] as const;

export const FALLOW_CONFIG_FIXTURES = [
	"config-healthy",
	"config-defaults",
	"config-error",
] as const;

type CapabilityFixtureName = (typeof FALLOW_CAPABILITY_FIXTURES)[number];
type ConfigFixtureName = (typeof FALLOW_CONFIG_FIXTURES)[number];
type FixtureName = CapabilityFixtureName | ConfigFixtureName;

interface CommandOutcome {
	readonly code: number | null;
	readonly signal: NodeJS.Signals | null;
	readonly stdout: string;
	readonly stderr: string;
}

interface FixtureCommand {
	readonly executable: "node_modules/.bin/fallow";
	readonly args: readonly string[];
	readonly cwd: "<fixture-project>";
}

interface FixtureProvenance {
	readonly envelopeSource: FallowEnvelopeSource;
	readonly provider: "fallow";
	readonly package: "fallow";
	readonly engineVersion: typeof REFERENCE_ENGINE_VERSION;
}

interface CapturedFixture {
	readonly fixtureSchemaVersion: typeof FIXTURE_SCHEMA_VERSION;
	readonly name: FixtureName;
	readonly kind: "capability" | "config-introspection";
	readonly provenance: FixtureProvenance;
	readonly command: FixtureCommand;
	readonly expectedWorkingTreeChanges?: {
		readonly tracked: readonly string[];
		readonly staged: readonly string[];
		readonly untracked: readonly string[];
	};
	readonly envelope: CommandOutcome & {
		readonly payload: unknown;
	};
}

interface CaptureOptions {
	readonly outputRoot: string;
	readonly repositoryRoot?: string;
}

interface ProjectCapture {
	readonly name: FixtureName;
	readonly kind: CapturedFixture["kind"];
	readonly cwd: string;
	readonly args: readonly string[];
	readonly expectedCodes: readonly number[];
	readonly expectedWorkingTreeChanges?: CapturedFixture["expectedWorkingTreeChanges"];
}

interface FileSnapshotEntry {
	readonly path: string;
	readonly type: "directory" | "file" | "symlink";
	readonly contents?: string;
}

function run(
	command: string,
	args: readonly string[],
	options: { readonly cwd: string; readonly env?: NodeJS.ProcessEnv },
): Promise<CommandOutcome> {
	return new Promise((resolveOutcome, reject) => {
		const child = spawn(command, args, {
			cwd: options.cwd,
			env: options.env ?? process.env,
			shell: false,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";

		const appendStdout = (chunk: string): void => {
			stdout += chunk;
		};
		const appendStderr = (chunk: string): void => {
			stderr += chunk;
		};
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", appendStdout);
		child.stderr.on("data", appendStderr);
		child.once("error", reject);
		child.once("close", (code, signal) => {
			resolveOutcome({ code, signal, stdout, stderr });
		});
	});
}

async function writeProjectFile(
	projectRoot: string,
	path: string,
	contents: string,
): Promise<void> {
	const destination = join(projectRoot, path);
	await mkdir(dirname(destination), { recursive: true });
	await writeFile(destination, contents, "utf8");
}

async function createConfiguredProject(projectRoot: string): Promise<void> {
	await writeProjectFile(
		projectRoot,
		"package.json",
		`${JSON.stringify(
			{
				name: "fallow-envelope-fixture",
				private: true,
				type: "module",
				scripts: { start: "node src/index.ts" },
			},
			null,
			2,
		)}\n`,
	);
	await writeProjectFile(
		projectRoot,
		"tsconfig.json",
		`${JSON.stringify(
			{
				compilerOptions: {
					module: "NodeNext",
					moduleResolution: "NodeNext",
					strict: true,
					target: "ES2022",
				},
				include: ["src/**/*.ts"],
			},
			null,
			2,
		)}\n`,
	);
	await writeProjectFile(
		projectRoot,
		".fallowrc.json",
		`${JSON.stringify(
			{
				entry: ["src/index.ts"],
				duplicates: {
					enabled: true,
					mode: "mild",
					minTokens: 20,
					minLines: 4,
					threshold: 0,
				},
				health: {
					maxCyclomatic: 2,
					maxCognitive: 2,
					maxCrap: 4,
				},
				boundaries: {
					zones: [
						{ name: "ui", patterns: ["src/ui/**"] },
						{ name: "data", patterns: ["src/data/**"] },
					],
					rules: [{ from: "ui", allow: [] }],
				},
			},
			null,
			2,
		)}\n`,
	);
	await writeProjectFile(
		projectRoot,
		"src/index.ts",
		[
			'import { renderView } from "./ui/view.ts";',
			'import { trackedValue } from "./tracked.ts";',
			"",
			"console.log(renderView(trackedValue));",
			"",
		].join("\n"),
	);
	await writeProjectFile(
		projectRoot,
		"src/data/store.ts",
		[
			"export function readSecret(): string {",
			'\treturn "classified";',
			"}",
			"",
		].join("\n"),
	);
	await writeProjectFile(
		projectRoot,
		"src/ui/view.ts",
		[
			'import { readSecret } from "../data/store.ts";',
			"",
			"export function renderView(value: number): string {",
			"\treturn `" + "$" + "{value}:" + "$" + "{readSecret()}`;",
			"}",
			"",
			"export function unusedRenderHelper(value: string): string {",
			"\treturn value.trim();",
			"}",
			"",
		].join("\n"),
	);
	await writeProjectFile(
		projectRoot,
		"src/lib/unused.ts",
		[
			"export const unusedValue = 42;",
			"",
			"export function unusedHelper(input: string): string {",
			"\treturn input.trim().toUpperCase();",
			"}",
			"",
		].join("\n"),
	);
	await writeProjectFile(
		projectRoot,
		"src/complex.ts",
		[
			"export function classify(input: number): string {",
			"\tif (input > 100) {",
			'\t\treturn "huge";',
			"\t}",
			"\tif (input > 10) {",
			'\t\treturn "large";',
			"\t}",
			"\tif (input > 0) {",
			'\t\treturn "positive";',
			"\t}",
			'\treturn input === 0 ? "zero" : "negative";',
			"}",
			"",
		].join("\n"),
	);
	const duplicateBody = [
		"export function normalizeOrder(input: string): string {",
		"\tconst trimmed = input.trim();",
		"\tconst lowered = trimmed.toLowerCase();",
		'\tconst normalized = lowered.replaceAll(" ", "-");',
		'\treturn normalized.startsWith("order-")',
		"\t\t? normalized",
		"\t\t: `order-" + "$" + "{normalized}`;",
		"}",
		"",
	].join("\n");
	await writeProjectFile(projectRoot, "src/duplicate-a.ts", duplicateBody);
	await writeProjectFile(
		projectRoot,
		"src/duplicate-b.ts",
		duplicateBody.replaceAll("normalizeOrder", "normalizeInvoice"),
	);
	await writeProjectFile(
		projectRoot,
		"src/tracked.ts",
		"export const trackedValue = 1;\n",
	);

	await run("git", ["init", "--quiet"], { cwd: projectRoot });
	await run("git", ["config", "user.name", "Fixture Author"], {
		cwd: projectRoot,
	});
	await run("git", ["config", "user.email", "fixture@example.invalid"], {
		cwd: projectRoot,
	});
	await run("git", ["add", "."], { cwd: projectRoot });
	const commit = await run("git", ["commit", "--quiet", "-m", "fixture base"], {
		cwd: projectRoot,
		env: {
			...process.env,
			GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
			GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
		},
	});
	if (commit.code !== 0) {
		throw new Error(`Unable to commit capture fixture: ${commit.stderr}`);
	}

	await writeProjectFile(
		projectRoot,
		"src/tracked.ts",
		[
			"export const trackedValue = 2;",
			"export const trackedUnused = 99;",
			"",
		].join("\n"),
	);
	await writeProjectFile(
		projectRoot,
		"src/staged.ts",
		"export const stagedValue = 3;\n",
	);
	const stage = await run("git", ["add", "src/staged.ts"], {
		cwd: projectRoot,
	});
	if (stage.code !== 0) {
		throw new Error(`Unable to stage capture fixture: ${stage.stderr}`);
	}
	await writeProjectFile(
		projectRoot,
		"src/untracked.ts",
		"export const untrackedValue = 4;\n",
	);
}

async function createConfigProject(
	projectRoot: string,
	mode: "defaults" | "error",
): Promise<void> {
	await writeProjectFile(
		projectRoot,
		"package.json",
		'{"name":"fallow-config-fixture","private":true,"type":"module"}\n',
	);
	await writeProjectFile(
		projectRoot,
		"tsconfig.json",
		'{"compilerOptions":{"strict":true},"include":["src/**/*.ts"]}\n',
	);
	await writeProjectFile(
		projectRoot,
		"src/index.ts",
		"export const value = 1;\n",
	);
	if (mode === "error") {
		await writeProjectFile(projectRoot, ".fallowrc.json", '{"entry": [}\n');
	}
}

async function snapshotFiles(
	root: string,
): Promise<readonly FileSnapshotEntry[]> {
	const entries: FileSnapshotEntry[] = [];

	async function visit(directory: string): Promise<void> {
		const children = await readdir(directory, { withFileTypes: true });
		children.sort((left, right) => left.name.localeCompare(right.name));
		for (const child of children) {
			const absolutePath = join(directory, child.name);
			const path = relative(root, absolutePath).split(sep).join("/");
			if (child.isDirectory()) {
				entries.push({ path, type: "directory" });
				await visit(absolutePath);
				continue;
			}
			if (child.isSymbolicLink()) {
				entries.push({ path, type: "symlink" });
				continue;
			}
			entries.push({
				path,
				type: "file",
				contents: await readFile(absolutePath, "base64"),
			});
		}
	}

	await visit(root);
	return entries;
}

async function normalizeOutput(
	value: string,
	projectRoot: string,
): Promise<string> {
	const canonicalRoot = await realpath(projectRoot);
	const candidates = new Set([
		projectRoot,
		projectRoot.split(sep).join("/"),
		canonicalRoot,
		canonicalRoot.split(sep).join("/"),
	]);
	let normalized = value;
	for (const candidate of [...candidates].sort(
		(left, right) => right.length - left.length,
	)) {
		normalized = normalized.replaceAll(candidate, "<fixture-project>");
	}
	return normalized;
}

function parsePayload(stdout: string): unknown {
	const trimmed = stdout.trim();
	if (trimmed.length === 0) return null;

	const candidates = [trimmed];
	for (let index = 0; index < trimmed.length; index += 1) {
		const character = trimmed[index];
		if (
			(character === "{" || character === "[") &&
			(index === 0 || trimmed[index - 1] === "\n")
		) {
			candidates.push(trimmed.slice(index));
		}
	}

	for (const candidate of candidates) {
		try {
			return JSON.parse(candidate) as unknown;
		} catch {
			// Continue until a JSON payload after an optional text preamble is found.
		}
	}
	return null;
}

async function verifyPinnedLocalEngine(
	repositoryRoot: string,
	localFallowExecutable: string,
): Promise<void> {
	const packageManifest = JSON.parse(
		await readFile(join(repositoryRoot, "package.json"), "utf8"),
	) as { devDependencies?: Record<string, string> };
	if (packageManifest.devDependencies?.fallow !== REFERENCE_ENGINE_VERSION) {
		throw new Error(
			`Expected package.json to pin fallow exactly at ${REFERENCE_ENGINE_VERSION}.`,
		);
	}

	const executable = await stat(localFallowExecutable).catch(() => null);
	if (executable === null) {
		throw new Error(
			`Project-local Fallow executable is missing: ${localFallowExecutable}`,
		);
	}
	const version = await run(localFallowExecutable, ["--version"], {
		cwd: repositoryRoot,
	});
	if (
		version.code !== 0 ||
		version.stdout.trim() !== `fallow ${REFERENCE_ENGINE_VERSION}`
	) {
		throw new Error(
			`Expected project-local Fallow ${REFERENCE_ENGINE_VERSION}; received code ${version.code}, stdout ${JSON.stringify(version.stdout)}, stderr ${JSON.stringify(version.stderr)}.`,
		);
	}
}

async function assertOutputOutsideRepository(
	outputRoot: string,
	repositoryRoot: string,
): Promise<string> {
	const output = await stat(outputRoot).catch(() => null);
	if (output === null || !output.isDirectory()) {
		throw new Error(
			`Capture output must be an existing directory outside the repository: ${outputRoot}`,
		);
	}
	const [repositoryPath, outputPath] = await Promise.all([
		realpath(repositoryRoot),
		realpath(outputRoot),
	]);
	const fromRepository = relative(repositoryPath, outputPath);
	if (
		fromRepository === "" ||
		(!fromRepository.startsWith(`..${sep}`) && fromRepository !== "..")
	) {
		throw new Error(
			`Capture output must be outside the repository: ${outputPath}`,
		);
	}
	return outputPath;
}

function commandArgs(
	command: string,
	...operationArgs: readonly string[]
): readonly string[] {
	return [
		command,
		...operationArgs,
		"--format",
		"json",
		"--quiet",
		"--no-cache",
	];
}

export async function captureFallowEnvelopes(
	options: CaptureOptions,
): Promise<readonly string[]> {
	const repositoryRoot = options.repositoryRoot ?? REPOSITORY_ROOT;
	const localFallowExecutable = join(
		repositoryRoot,
		"node_modules",
		".bin",
		process.platform === "win32" ? "fallow.cmd" : "fallow",
	);
	await verifyPinnedLocalEngine(repositoryRoot, localFallowExecutable);
	const outputRoot = await assertOutputOutsideRepository(
		options.outputRoot,
		repositoryRoot,
	);
	const captureRoot = await mkdtemp(
		join(tmpdir(), "cosmonauts-fallow-capture-"),
	);
	const configuredRoot = join(captureRoot, "configured");
	const defaultsRoot = join(captureRoot, "defaults");
	const errorRoot = join(captureRoot, "error");
	await Promise.all([
		mkdir(configuredRoot, { recursive: true }),
		mkdir(defaultsRoot, { recursive: true }),
		mkdir(errorRoot, { recursive: true }),
	]);

	try {
		await Promise.all([
			createConfiguredProject(configuredRoot),
			createConfigProject(defaultsRoot, "defaults"),
			createConfigProject(errorRoot, "error"),
		]);

		const captures: readonly ProjectCapture[] = [
			{
				name: "dead-code",
				kind: "capability",
				cwd: configuredRoot,
				args: commandArgs("dead-code"),
				expectedCodes: [0, 1],
			},
			{
				name: "duplication",
				kind: "capability",
				cwd: configuredRoot,
				args: commandArgs("dupes", "--min-tokens", "20", "--min-lines", "4"),
				expectedCodes: [0, 1],
			},
			{
				name: "complexity",
				kind: "capability",
				cwd: configuredRoot,
				args: commandArgs(
					"health",
					"--complexity",
					"--max-cyclomatic",
					"2",
					"--max-cognitive",
					"2",
				),
				expectedCodes: [0, 1],
			},
			{
				name: "boundary-conformance",
				kind: "capability",
				cwd: configuredRoot,
				args: commandArgs("dead-code", "--boundary-violations"),
				expectedCodes: [0, 1],
			},
			{
				name: "changed-scope-audit",
				kind: "capability",
				cwd: configuredRoot,
				args: commandArgs("audit", "--base", "HEAD"),
				expectedCodes: [0, 1],
				expectedWorkingTreeChanges: {
					tracked: ["src/tracked.ts"],
					staged: ["src/staged.ts"],
					untracked: ["src/untracked.ts"],
				},
			},
			{
				name: "trace",
				kind: "capability",
				cwd: configuredRoot,
				args: commandArgs(
					"dead-code",
					"--trace",
					"src/lib/unused.ts:unusedValue",
				),
				expectedCodes: [0, 1],
			},
			{
				name: "fix-preview",
				kind: "capability",
				cwd: configuredRoot,
				args: commandArgs("fix", "--dry-run"),
				expectedCodes: [0, 1],
			},
			{
				name: "config-healthy",
				kind: "config-introspection",
				cwd: configuredRoot,
				args: commandArgs("config"),
				expectedCodes: [0],
			},
			{
				name: "config-defaults",
				kind: "config-introspection",
				cwd: defaultsRoot,
				args: commandArgs("config"),
				expectedCodes: [3],
			},
			{
				name: "config-error",
				kind: "config-introspection",
				cwd: errorRoot,
				args: commandArgs("config"),
				expectedCodes: [2],
			},
		];

		const before = await Promise.all(
			[configuredRoot, defaultsRoot, errorRoot].map(snapshotFiles),
		);
		const written: string[] = [];

		for (const capture of captures) {
			const rawOutcome = await run(localFallowExecutable, capture.args, {
				cwd: capture.cwd,
			});
			if (
				rawOutcome.signal !== null ||
				rawOutcome.code === null ||
				!capture.expectedCodes.includes(rawOutcome.code)
			) {
				throw new Error(
					`${capture.name} exited unexpectedly: code=${rawOutcome.code}, signal=${rawOutcome.signal}, stderr=${rawOutcome.stderr}`,
				);
			}
			const [stdout, stderr] = await Promise.all([
				normalizeOutput(rawOutcome.stdout, capture.cwd),
				normalizeOutput(rawOutcome.stderr, capture.cwd),
			]);
			const fixture: CapturedFixture = {
				fixtureSchemaVersion: FIXTURE_SCHEMA_VERSION,
				name: capture.name,
				kind: capture.kind,
				provenance: {
					envelopeSource: "live-engine",
					provider: "fallow",
					package: "fallow",
					engineVersion: REFERENCE_ENGINE_VERSION,
				},
				command: {
					executable: "node_modules/.bin/fallow",
					args: capture.args,
					cwd: "<fixture-project>",
				},
				...(capture.expectedWorkingTreeChanges === undefined
					? {}
					: {
							expectedWorkingTreeChanges: capture.expectedWorkingTreeChanges,
						}),
				envelope: {
					code: rawOutcome.code,
					signal: rawOutcome.signal,
					stdout,
					stderr,
					payload: parsePayload(stdout),
				},
			};
			const destination = join(outputRoot, `${capture.name}.json`);
			await writeFile(
				destination,
				`${JSON.stringify(fixture, null, 2)}\n`,
				"utf8",
			);
			written.push(destination);
		}

		const after = await Promise.all(
			[configuredRoot, defaultsRoot, errorRoot].map(snapshotFiles),
		);
		if (JSON.stringify(after) !== JSON.stringify(before)) {
			throw new Error(
				"Fallow capture mutated a temporary project despite --no-cache/dry-run.",
			);
		}

		return written;
	} finally {
		await rm(captureRoot, { recursive: true, force: true });
	}
}

async function main(): Promise<void> {
	const outputFlag = process.argv.indexOf("--output");
	let outputRoot: string;
	if (outputFlag === -1) {
		outputRoot = await mkdtemp(join(tmpdir(), "cosmonauts-fallow-envelopes-"));
	} else {
		const value = process.argv[outputFlag + 1];
		if (value === undefined || value.trim().length === 0) {
			throw new Error("--output requires a directory.");
		}
		outputRoot = resolve(value);
	}
	const written = await captureFallowEnvelopes({ outputRoot });
	process.stdout.write(`${written.join("\n")}\n`);
}

const entryPoint = process.argv[1];
if (
	entryPoint !== undefined &&
	import.meta.url === pathToFileURL(resolve(entryPoint)).href
) {
	await main();
}
