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

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveInstalledFallowExecutable } from "../../domains/shared/extensions/project-tools/fallow-provider.ts";
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

/**
 * Cosmonauts' own pinned Fallow install. A project's `node_modules` binary is
 * deliberately not consulted: executing it needs the per-project consent the
 * analysis tools record, which this host-side check does not have.
 */
export async function resolveFallowExecutable(
	explicit?: string,
): Promise<string> {
	if (explicit !== undefined) return explicit;
	const frameworkRoot = resolve(
		dirname(fileURLToPath(import.meta.url)),
		"..",
		"..",
	);
	const executable = await resolveInstalledFallowExecutable({
		projectRoot: frameworkRoot,
	});
	if (executable === null) {
		throw new Error(
			`fallow is not installed under ${frameworkRoot}/node_modules; install the pinned devDependency`,
		);
	}
	return executable;
}
