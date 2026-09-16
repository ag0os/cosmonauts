import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CommandIdentity, RuntimeEvidence } from "./runtime-reporter.ts";
import type { TestSurface } from "./schema.ts";
import type { SourceCensus, SourceDeclaration } from "./source-census.ts";

export type CensusState = "complete" | "incomplete" | "blocked";
export interface CensusFinding {
	readonly kind:
		| "source-only"
		| "runtime-only"
		| "parameter-count-mismatch"
		| "filtered-selection"
		| "unsupported-syntax"
		| "collection-error"
		| "unknown-error-phase"
		| "command-mismatch"
		| "skipped-or-todo"
		| "conditional-observation"
		| "outcome-mismatch"
		| "run-end-limitation"
		| "runtime-skipped"
		| "hook-lifecycle-incomplete";
	readonly basis: "observed" | "missing" | "blocked";
	readonly commandId?: string;
	readonly detail: string;
}
export interface CommandEvidence {
	readonly commandId: string;
	readonly surface: TestSurface;
	readonly exitCode: number;
	readonly classification:
		| "completed"
		| "observed-failing-run"
		| "post-run-policy-exit";
	readonly stderr?: string;
}
export interface CensusResult {
	readonly state: CensusState;
	readonly clean: boolean;
	readonly findings: readonly CensusFinding[];
	readonly commandEvidence: readonly CommandEvidence[];
	readonly residualUncertainty: readonly string[];
}
export interface ReconcileCensusInput {
	readonly sources: readonly SourceCensus[];
	readonly runs: readonly RuntimeEvidence[];
	readonly expectedCommands: readonly {
		readonly id: string;
		readonly surface: TestSurface;
		readonly argv?: readonly string[];
	}[];
}

export interface AuditCommandDefinition extends CommandIdentity {
	readonly cwd?: string;
	readonly configFile?: string;
	readonly filters?: readonly string[];
}

export function reconcileCensus(input: ReconcileCensusInput): CensusResult {
	const findings: CensusFinding[] = [];
	const residualUncertainty: string[] = [];
	for (const source of input.sources) {
		for (const limitation of source.limitations)
			findings.push({
				kind: "unsupported-syntax",
				basis: "blocked",
				detail: `${limitation.path}:${limitation.line}: ${limitation.detail}`,
			});
		for (const declaration of source.declarations) {
			if (
				declaration.mode === "skip" ||
				declaration.mode === "todo" ||
				declaration.mode === "only"
			)
				findings.push({
					kind:
						declaration.mode === "only"
							? "filtered-selection"
							: "skipped-or-todo",
					basis: "missing",
					detail: `${declaration.path}:${declaration.line} is ${declaration.mode}`,
				});
			if (
				declaration.mode === "conditional" ||
				declaration.assertionCandidates.some(
					(candidate) => candidate.conditional,
				)
			)
				findings.push({
					kind: "conditional-observation",
					basis: "blocked",
					detail: `${declaration.path}:${declaration.line} has conditional registration or assertion candidates`,
				});
		}
	}
	const expected = new Map(
		input.expectedCommands.map((command) => [command.id, command]),
	);
	for (const run of input.runs) {
		const command = expected.get(run.command.id);
		if (
			!command ||
			command.surface !== run.command.surface ||
			(command.argv !== undefined &&
				JSON.stringify(command.argv) !== JSON.stringify(run.command.argv))
		)
			findings.push({
				kind: "command-mismatch",
				basis: "blocked",
				commandId: run.command.id,
				detail: `unexpected command identity ${run.command.id}/${run.command.surface}`,
			});
		if ((run.filters?.length ?? 0) > 0)
			findings.push({
				kind: "filtered-selection",
				basis: "missing",
				commandId: run.command.id,
				detail: `command used filters: ${run.filters?.join(", ")}`,
			});
		for (const error of run.errors)
			findings.push({
				kind:
					error.phase === "collection"
						? "collection-error"
						: "unknown-error-phase",
				basis: error.phaseBasis === "blocked" ? "blocked" : "observed",
				commandId: run.command.id,
				detail: `${error.entityType} ${error.entityId}: ${error.phase}${error.limitation ? `; ${error.limitation}` : ""}`,
			});
		if (run.reason !== "passed" && run.errors.length === 0)
			findings.push({
				kind: "run-end-limitation",
				basis: "blocked",
				commandId: run.command.id,
				detail: `reporter ended with ${run.reason} without a public error payload`,
			});
		for (const limitation of run.limitations)
			if (!run.errors.some((error) => error.limitation === limitation))
				findings.push({
					kind: "run-end-limitation",
					basis: "blocked",
					commandId: run.command.id,
					detail: limitation,
				});
		for (const module of run.modules)
			for (const testCase of module.cases)
				if (testCase.state === "skipped")
					findings.push({
						kind: "runtime-skipped",
						basis: "missing",
						commandId: run.command.id,
						detail: `${testCase.fullName} was skipped at runtime`,
					});
		for (const hook of unmatchedHookEvents(run))
			findings.push({
				kind: "hook-lifecycle-incomplete",
				basis: "blocked",
				commandId: run.command.id,
				detail: `${hook.name} ${hook.entityId} has unmatched ${hook.event} evidence`,
			});
		reconcileRun(input.sources, run, findings);
	}
	reconcileRepeatedOutcomes(input.runs, findings);
	for (const command of input.expectedCommands)
		if (
			!input.runs.some(
				(run) =>
					run.command.id === command.id &&
					run.command.surface === command.surface,
			)
		)
			findings.push({
				kind: "command-mismatch",
				basis: "blocked",
				commandId: command.id,
				detail: `missing command evidence for ${command.id}/${command.surface}`,
			});
	const commandEvidence = input.runs.map((run): CommandEvidence => {
		const hasReporterError = run.errors.length > 0;
		const hasDeclarationMismatch = findings.some(
			(finding) =>
				finding.commandId === run.command.id &&
				["source-only", "runtime-only", "parameter-count-mismatch"].includes(
					finding.kind,
				),
		);
		const classification =
			run.exitCode === 0
				? "completed"
				: hasReporterError || hasDeclarationMismatch || run.reason !== "passed"
					? "observed-failing-run"
					: "post-run-policy-exit";
		if (classification === "post-run-policy-exit")
			residualUncertainty.push(
				`${run.command.id} exited non-zero after reporter-clean execution; post-run policy cause remains command evidence`,
			);
		return {
			commandId: run.command.id,
			surface: run.command.surface,
			exitCode: run.exitCode,
			classification,
			...(run.stderr ? { stderr: run.stderr } : {}),
		};
	});
	const blocked = findings.some((finding) => finding.basis === "blocked");
	const state: CensusState = blocked
		? "blocked"
		: findings.length > 0
			? "incomplete"
			: "complete";
	return {
		state,
		clean: state === "complete",
		findings,
		commandEvidence,
		residualUncertainty,
	};
}

function unmatchedHookEvents(run: RuntimeEvidence) {
	const unmatched = [...(run.hooks ?? [])];
	for (let index = unmatched.length - 1; index >= 0; index--) {
		const event = unmatched[index];
		if (!event || event.event !== "end") continue;
		const startIndex = unmatched.findIndex(
			(candidate, candidateIndex) =>
				candidateIndex < index &&
				candidate.event === "start" &&
				candidate.name === event.name &&
				candidate.entityId === event.entityId,
		);
		if (startIndex >= 0) {
			unmatched.splice(index, 1);
			unmatched.splice(startIndex, 1);
		}
	}
	return unmatched;
}

function reconcileRepeatedOutcomes(
	runs: readonly RuntimeEvidence[],
	findings: CensusFinding[],
): void {
	const normal = runs.find((run) => run.command.surface === "normal");
	if (!normal) return;
	const baseline = runtimeStates(normal);
	for (const run of runs) {
		if (!["repeat", "shuffle", "isolation"].includes(run.command.surface))
			continue;
		for (const [identity, state] of runtimeStates(run)) {
			const normalState = baseline.get(identity);
			if (normalState !== undefined && normalState !== state)
				findings.push({
					kind: "outcome-mismatch",
					basis: "blocked",
					commandId: run.command.id,
					detail: `${identity} changed from ${normalState} to ${state}`,
				});
		}
	}
}

function runtimeStates(run: RuntimeEvidence): Map<string, string> {
	return new Map(
		run.modules.flatMap((module) =>
			module.cases.map(
				(testCase) =>
					[`${module.moduleId}::${testCase.fullName}`, testCase.state] as const,
			),
		),
	);
}

export function censusDigest(
	sources: readonly SourceCensus[],
	runs: readonly RuntimeEvidence[],
): string {
	return createHash("sha256")
		.update(JSON.stringify({ sources, runs }))
		.digest("hex");
}

export async function runAuditCommand(options: {
	readonly projectRoot: string;
	readonly rawDirectory: string;
	readonly command: AuditCommandDefinition;
	readonly timeoutMs?: number;
}): Promise<RuntimeEvidence> {
	const { command } = options;
	const [executable, ...arguments_] = command.argv;
	if (!executable) throw new Error(`command ${command.id} has no argv`);
	await mkdir(options.rawDirectory, { recursive: true });
	const reporterPath = join(
		options.rawDirectory,
		`${command.id}.reporter.json`,
	);
	const reporterModule = fileURLToPath(
		new URL("./runtime-reporter.ts", import.meta.url),
	);
	const child: ChildProcess = spawn(
		executable,
		[...arguments_, `--reporter=${reporterModule}`],
		{
			cwd: resolve(options.projectRoot, command.cwd ?? "."),
			env: {
				...process.env,
				COSMONAUTS_AUDIT_REPORT_PATH: reporterPath,
				COSMONAUTS_AUDIT_COMMAND: JSON.stringify(command),
				COSMONAUTS_AUDIT_PROJECT_ROOT: options.projectRoot,
				COSMONAUTS_AUDIT_CONFIG_FILE: resolve(
					options.projectRoot,
					command.configFile ?? "vitest.config.ts",
				),
				COSMONAUTS_AUDIT_FILTERS: JSON.stringify(command.filters ?? []),
			},
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	let stderr = "";
	if (!child.stderr)
		throw new Error(`command ${command.id} has no stderr pipe`);
	child.stderr.setEncoding("utf8");
	child.stderr.on("data", (chunk: string) => {
		stderr = `${stderr}${chunk}`.slice(-64_000);
	});
	const exit = new Promise<{ code: number; signal: NodeJS.Signals | null }>(
		(resolveExit, reject) => {
			child.once("error", reject);
			child.once("exit", (code, signal) =>
				resolveExit({ code: code ?? 1, signal }),
			);
		},
	);
	let processExit: { code: number; signal: NodeJS.Signals | null };
	if (command.surface === "watch") {
		try {
			await waitForFile(reporterPath, options.timeoutMs ?? 120_000);
			child.kill("SIGINT");
			processExit = await withTimeout(
				exit,
				10_000,
				`watch command ${command.id} did not stop after SIGINT`,
			);
		} catch (error) {
			child.kill("SIGTERM");
			await withTimeout(
				exit,
				10_000,
				`watch command ${command.id} did not stop`,
			).catch(() => child.kill("SIGKILL"));
			throw error;
		}
	} else {
		try {
			processExit = await withTimeout(
				exit,
				options.timeoutMs ?? 600_000,
				`command ${command.id} timed out`,
			);
		} catch (error) {
			child.kill("SIGTERM");
			await withTimeout(
				exit,
				10_000,
				`command ${command.id} did not stop`,
			).catch(() => child.kill("SIGKILL"));
			throw error;
		}
	}
	let reporterPayload: string;
	try {
		reporterPayload = await readFile(reporterPath, "utf8");
	} catch {
		throw new Error(
			`reporter did not publish evidence for ${command.id}; stderr:\n${stderr.slice(-4_000)}`,
		);
	}
	const parsed = JSON.parse(reporterPayload) as RuntimeEvidence;
	if (
		parsed.reporterVersion !== 1 ||
		parsed.command.id !== command.id ||
		parsed.command.surface !== command.surface
	)
		throw new Error(`reporter incompatibility for command ${command.id}`);
	return {
		...parsed,
		exitCode: command.surface === "watch" ? 0 : processExit.code,
		stderr,
		termination: command.surface === "watch" ? "harness-watch-stop" : "natural",
		...(processExit.signal && command.surface !== "watch"
			? {
					limitations: [
						...parsed.limitations,
						`command exited from signal ${processExit.signal}`,
					],
				}
			: {}),
	};
}

async function waitForFile(path: string, timeoutMs: number): Promise<void> {
	const started = Date.now();
	while (Date.now() - started < timeoutMs) {
		try {
			await access(path);
			return;
		} catch {
			await new Promise((resolveWait) => setTimeout(resolveWait, 50));
		}
	}
	throw new Error(`reporter did not publish ${path} within ${timeoutMs}ms`);
}

async function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	message: string,
): Promise<T> {
	let timer: NodeJS.Timeout | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error(message)), timeoutMs);
			}),
		]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

function reconcileRun(
	sources: readonly SourceCensus[],
	run: RuntimeEvidence,
	findings: CensusFinding[],
): void {
	for (const source of sources) {
		const module = run.modules.find((candidate) =>
			moduleMatches(candidate.moduleId, source.path, run.root),
		);
		const unmatched = new Set(module?.cases ?? []);
		for (const declaration of source.declarations) {
			const matches = [...unmatched].filter((testCase) =>
				titleMatches(declaration, testCase.fullName),
			);
			if (matches.length === 0)
				findings.push({
					kind: "source-only",
					basis: "missing",
					commandId: run.command.id,
					detail: `${declaration.title} was not collected from ${source.path}`,
				});
			else for (const match of matches) unmatched.delete(match);
			if (
				declaration.parameterCount !== null &&
				matches.length !== declaration.parameterCount
			)
				findings.push({
					kind: "parameter-count-mismatch",
					basis: "missing",
					commandId: run.command.id,
					detail: `${declaration.title} expected ${declaration.parameterCount} cases but runtime collected ${matches.length}`,
				});
		}
		for (const testCase of unmatched)
			findings.push({
				kind: "runtime-only",
				basis: "missing",
				commandId: run.command.id,
				detail: `${testCase.fullName} has no supported source declaration in ${source.path}`,
			});
	}
}
function moduleMatches(
	moduleId: string,
	sourcePath: string,
	root: string,
): boolean {
	const normalized = moduleId.replaceAll("\\", "/");
	const expected = `${root.replaceAll("\\", "/").replace(/\/$/, "")}/${sourcePath.replaceAll("\\", "/")}`;
	return (
		normalized === expected ||
		normalized.endsWith(`/${sourcePath.replaceAll("\\", "/")}`)
	);
}
function titleMatches(
	declaration: SourceDeclaration,
	runtimeTitle: string,
): boolean {
	if (
		declaration.parameterCount === 1 &&
		!/%[sdifjo#%]|\$\w+/.test(declaration.titleTemplate)
	)
		return runtimeTitle === declaration.title;
	const escaped = declaration.title
		.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
		.replace(/%[sdifjo#]/g, ".+?")
		.replace(/\\\$\w+/g, ".+?");
	return new RegExp(`^${escaped}$`).test(runtimeTitle);
}
