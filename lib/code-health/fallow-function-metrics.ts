/**
 * Per-function complexity inventory from Fallow 2.54.2.
 *
 * `fallow health --complexity` with zero cyclomatic and cognitive thresholds
 * reports every function it analyzes. CRAP appears on a finding only when it
 * meets `--max-crap`, and `--max-crap 0` disables CRAP output entirely, so a
 * small positive threshold is passed to get a (static-estimate) CRAP for every
 * function. Functions under a `fallow-ignore-next-line complexity` comment are
 * not reported at all.
 */

import { access, constants, readFile, realpath, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	FALLOW_VALIDATED_ENGINE_VERSION,
	fallowPlatformPackageName,
} from "../../domains/shared/extensions/project-tools/fallow-provider.ts";
import { runProviderProcess } from "../../domains/shared/extensions/project-tools/process-runner.ts";

export interface FunctionMetrics {
	readonly file: string;
	readonly name: string;
	readonly startLine: number;
	readonly endLine: number;
	readonly cyclomatic: number;
	readonly cognitive: number;
	/** Null when Fallow reports no CRAP score for the function. */
	readonly crap: number | null;
}

/** The subset of one `findings[]` entry this module consumes. */
interface FallowHealthFinding {
	readonly path: string;
	readonly name: string;
	readonly line: number;
	readonly line_count: number;
	readonly cyclomatic: number;
	readonly cognitive: number;
	readonly crap?: number;
}

interface FallowHealthReport {
	readonly findings: readonly unknown[];
}

const INVENTORY_ARGS = [
	"health",
	"--complexity",
	"--max-cyclomatic",
	"0",
	"--max-cognitive",
	"0",
	"--max-crap",
	"0.001",
	"--format",
	"json",
	"--quiet",
	"--no-cache",
] as const;

const DEFAULT_TIMEOUT_MS = 120_000;

interface RunFunctionInventoryOptions {
	readonly executable: string;
	readonly cwd: string;
	readonly signal?: AbortSignal;
	readonly timeoutMs?: number;
}

/** Run Fallow in `cwd` and return every function it reports. */
export async function runFunctionInventory(
	options: RunFunctionInventoryOptions,
): Promise<FunctionMetrics[]> {
	const outcome = await runProviderProcess(
		{
			executablePath: options.executable,
			args: INVENTORY_ARGS,
			cwd: options.cwd,
		},
		options.signal,
		{ timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS },
	);
	// Fallow exits 1 whenever a function exceeds a threshold, which is every
	// function at zero thresholds.
	if (outcome.kind !== "code-exit" || outcome.code > 1) {
		throw new Error(
			`fallow health failed in ${options.cwd} (${describeOutcome(outcome)}): ${outcome.stderr.trim()}`,
		);
	}
	return parseFallowHealthFunctions(outcome.stdout);
}

function describeOutcome(outcome: {
	readonly kind: string;
	readonly code?: number;
	readonly signal?: string;
}): string {
	if (outcome.kind === "code-exit") return `exit ${String(outcome.code)}`;
	if (outcome.kind === "signal-exit") return `signal ${String(outcome.signal)}`;
	return outcome.kind;
}

export function parseFallowHealthFunctions(stdout: string): FunctionMetrics[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch {
		throw new Error("fallow health did not print JSON");
	}
	if (!isHealthReport(parsed)) {
		throw new Error("fallow health JSON has no findings array");
	}
	return parsed.findings.map(toFunctionMetrics);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHealthReport(value: unknown): value is FallowHealthReport {
	return isRecord(value) && Array.isArray(value.findings);
}

function isPositiveInteger(value: unknown): value is number {
	return Number.isInteger(value) && (value as number) > 0;
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function isHealthFinding(value: unknown): value is FallowHealthFinding {
	return (
		isRecord(value) &&
		typeof value.path === "string" &&
		typeof value.name === "string" &&
		isPositiveInteger(value.line) &&
		isPositiveInteger(value.line_count) &&
		isFiniteNumber(value.cyclomatic) &&
		isFiniteNumber(value.cognitive) &&
		(value.crap === undefined || isFiniteNumber(value.crap))
	);
}

function toFunctionMetrics(value: unknown, index: number): FunctionMetrics {
	if (!isHealthFinding(value)) {
		throw new Error(`fallow health finding ${index} has an unexpected shape`);
	}
	return {
		file: value.path,
		name: value.name,
		startLine: value.line,
		endLine: value.line + value.line_count - 1,
		cyclomatic: value.cyclomatic,
		cognitive: value.cognitive,
		crap: value.crap ?? null,
	};
}

/** The one Fallow release this host runs; an install of any other version is reported, never run. */
export const PINNED_FALLOW_VERSION = FALLOW_VALIDATED_ENGINE_VERSION;

export interface ResolveFallowOptions {
	/** Where the upward search starts; defaults to the cosmonauts package root. */
	readonly searchFrom?: string;
}

/**
 * Cosmonauts' pinned Fallow, found the way Node resolves a package from the
 * cosmonauts package: its own `node_modules`, then each enclosing one, so a
 * consumer project's hoisted copy is found too (ruling W3b-OD-1 (b)).
 * Consent-policy refinement: the binary is identified by its exact pinned
 * version rather than by living inside this package; a Fallow of any other
 * version is named in the error and never run. PATH and package fetches
 * are never consulted; a copy that sits in a `node_modules` enclosing the
 * package (including a global install's) is on the search path.
 */
export async function resolveFallowExecutable(
	explicit?: string,
	options: ResolveFallowOptions = {},
): Promise<string> {
	if (explicit !== undefined) return explicit;
	const start = options.searchFrom ?? frameworkRoot();
	const rejected: string[] = [];
	for (const root of enclosingRoots(await realRoot(start))) {
		const found = await fallowAt(root);
		if (found === undefined) continue;
		if (found.version !== PINNED_FALLOW_VERSION) {
			rejected.push(`${found.packageDir} is ${found.version}`);
			continue;
		}
		if (found.executable !== null) return found.executable;
		rejected.push(`${found.packageDir} has no binary for this platform`);
	}
	const seen = rejected.length > 0 ? ` (found: ${rejected.join("; ")})` : "";
	throw new Error(
		`no usable fallow ${PINNED_FALLOW_VERSION} in any node_modules from ${start} upward${seen}; install fallow@${PINNED_FALLOW_VERSION}`,
	);
}

function frameworkRoot(): string {
	return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

/** The real path, so a package a package manager symlinked searches from where it lives. */
async function realRoot(path: string): Promise<string> {
	try {
		return await realpath(path);
	} catch {
		return resolve(path);
	}
}

/** `start` and each ancestor, skipping `node_modules` directories themselves. */
function enclosingRoots(start: string): string[] {
	const roots: string[] = [];
	let current = start;
	while (true) {
		if (basename(current) !== "node_modules") roots.push(current);
		const parent = dirname(current);
		if (parent === current) return roots;
		current = parent;
	}
}

interface FoundFallow {
	readonly packageDir: string;
	readonly version: string;
	readonly executable: string | null;
}

async function fallowAt(root: string): Promise<FoundFallow | undefined> {
	const packageDir = join(root, "node_modules", "fallow");
	const record = await readPackageJson(packageDir);
	if (record?.version === undefined) return undefined;
	return {
		packageDir,
		version: record.version,
		executable: await platformExecutable(packageDir, record.version),
	};
}

interface PackageRecord {
	readonly name?: string;
	readonly version?: string;
}

async function readPackageJson(
	packageDir: string,
): Promise<PackageRecord | undefined> {
	let value: unknown;
	try {
		value = JSON.parse(
			await readFile(join(packageDir, "package.json"), "utf8"),
		);
	} catch {
		return undefined;
	}
	if (typeof value !== "object" || value === null) return undefined;
	const { name, version } = value as Record<string, unknown>;
	return {
		...(typeof name === "string" ? { name } : {}),
		...(typeof version === "string" ? { version } : {}),
	};
}

/**
 * The platform package resolved from fallow's own real directory, the way
 * fallow's npm shim finds it: beside it when hoisted, under `.pnpm/` when
 * pnpm keeps each package's dependencies with it. Must carry fallow's exact
 * version and an executable file.
 */
async function platformExecutable(
	packageDir: string,
	version: string,
): Promise<string | null> {
	const platformPackage = fallowPlatformPackageName({
		platform: process.platform,
		architecture: process.arch,
	});
	if (platformPackage === null) return null;
	let platformDir: string;
	try {
		const require = createRequire(
			join(await realpath(packageDir), "package.json"),
		);
		platformDir = dirname(require.resolve(`${platformPackage}/package.json`));
	} catch {
		return null;
	}
	const record = await readPackageJson(platformDir);
	if (record?.name !== platformPackage || record.version !== version)
		return null;
	const executable = join(
		platformDir,
		process.platform === "win32" ? "fallow.exe" : "fallow",
	);
	return (await isExecutableFile(executable)) ? executable : null;
}

async function isExecutableFile(path: string): Promise<boolean> {
	try {
		if (!(await stat(path)).isFile()) return false;
		if (process.platform !== "win32") await access(path, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}
