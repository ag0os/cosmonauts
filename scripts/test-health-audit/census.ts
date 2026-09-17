import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
	CommandIdentity,
	RunTimingEvidence,
	RuntimeEvidence,
	WatcherStartEvidence,
} from "./runtime-reporter.ts";
import type { Assessor, TestSurface } from "./schema.ts";
import type { SourceCensus, SourceDeclaration } from "./source-census.ts";

export type CensusState = "complete" | "incomplete" | "blocked";
export interface CensusFinding {
	readonly id: string;
	readonly kind:
		| "source-only"
		| "not-selected"
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
		| "hook-lifecycle-incomplete"
		| "bounded-collector-limitation";
	readonly lane: "objective-observation" | "agent-assessed-judgment";
	readonly basis: "observed" | "missing" | "blocked" | "reasoned";
	readonly commandId?: string;
	readonly detail: string;
	readonly accountedFor: boolean;
	readonly disposition?: FindingDisposition;
}
type FindingDraft = Omit<
	CensusFinding,
	"id" | "lane" | "accountedFor" | "disposition"
> & { readonly lane?: CensusFinding["lane"] };
export interface FindingDisposition {
	readonly findingId: string;
	readonly disposition:
		| "accounted-for"
		| "limitation-accepted"
		| "repair-required-tooling"
		| "repair-required-suite";
	readonly reasoning: string;
	readonly assessor: Extract<Assessor, { kind: "agent" }>;
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
	readonly timing?: RunTimingEvidence;
	readonly watcherStart?: WatcherStartEvidence;
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
	readonly dispositions?: readonly FindingDisposition[];
}

export interface AuditCommandDefinition extends CommandIdentity {
	readonly cwd?: string;
	readonly configFile?: string;
	readonly filters?: readonly string[];
}

export function reconcileCensus(input: ReconcileCensusInput): CensusResult {
	const findingDrafts: FindingDraft[] = [];
	const residualUncertainty: string[] = [];
	for (const source of input.sources) {
		for (const limitation of source.limitations)
			if (limitation.kind === "unsupported-syntax")
				findingDrafts.push({
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
				findingDrafts.push({
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
				findingDrafts.push({
					kind: "conditional-observation",
					lane: "agent-assessed-judgment",
					basis: "reasoned",
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
			findingDrafts.push({
				kind: "command-mismatch",
				basis: "blocked",
				commandId: run.command.id,
				detail: `unexpected command identity ${run.command.id}/${run.command.surface}`,
			});
		if ((run.filters?.length ?? 0) > 0)
			findingDrafts.push({
				kind: "filtered-selection",
				basis: "missing",
				commandId: run.command.id,
				detail: `command used filters: ${run.filters?.join(", ")}`,
			});
		for (const error of run.errors)
			findingDrafts.push({
				kind:
					error.phase === "collection"
						? "collection-error"
						: "unknown-error-phase",
				basis: error.phaseBasis === "blocked" ? "blocked" : "observed",
				commandId: run.command.id,
				detail: `${error.entityType} ${error.entityId}: ${error.phase}${error.limitation ? `; ${error.limitation}` : ""}`,
			});
		if (run.reason !== "passed" && run.errors.length === 0)
			findingDrafts.push({
				kind: "run-end-limitation",
				basis: "blocked",
				commandId: run.command.id,
				detail: `reporter ended with ${run.reason} without a public error payload`,
			});
		for (const limitation of run.limitations)
			if (!run.errors.some((error) => error.limitation === limitation))
				findingDrafts.push({
					kind: "run-end-limitation",
					basis: "blocked",
					commandId: run.command.id,
					detail: limitation,
				});
		for (const module of run.modules)
			for (const testCase of module.cases)
				if (testCase.state === "skipped")
					findingDrafts.push({
						kind: "runtime-skipped",
						basis: "missing",
						commandId: run.command.id,
						detail: `${testCase.fullName} from ${module.moduleId} was skipped at runtime`,
					});
		for (const hook of unmatchedHookEvents(run))
			findingDrafts.push({
				kind: "hook-lifecycle-incomplete",
				basis: "blocked",
				commandId: run.command.id,
				detail: `${hook.name} ${hook.entityId} has unmatched ${hook.event} evidence`,
			});
		reconcileRun(input.sources, run, findingDrafts);
	}
	reconcileRepeatedOutcomes(input.runs, findingDrafts);
	for (const source of input.sources)
		for (const limitation of source.limitations)
			if (
				limitation.kind === "external-helper-registration" &&
				!findingDrafts.some(
					(finding) =>
						finding.kind === "bounded-collector-limitation" &&
						finding.detail.includes(limitation.helperPath),
				)
			)
				findingDrafts.push({
					kind: "bounded-collector-limitation",
					basis: "missing",
					detail: `${limitation.path}:${limitation.line} calls ${limitation.helperPath}; no selected runtime module evidence covered the out-of-file declarations`,
				});
	for (const command of input.expectedCommands)
		if (
			!input.runs.some(
				(run) =>
					run.command.id === command.id &&
					run.command.surface === command.surface,
			)
		)
			findingDrafts.push({
				kind: "command-mismatch",
				basis: "blocked",
				commandId: command.id,
				detail: `missing command evidence for ${command.id}/${command.surface}`,
			});
	const commandEvidence = input.runs.map((run): CommandEvidence => {
		const hasReporterError = run.errors.length > 0;
		const classification =
			run.exitCode === 0
				? "completed"
				: hasReporterError
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
			...(run.timing ? { timing: run.timing } : {}),
			...(run.watcherStart ? { watcherStart: run.watcherStart } : {}),
		};
	});
	const findings = applyDispositions(findingDrafts, input.dispositions ?? []);
	const unresolved = findings.filter(
		(finding) => finding.basis !== "reasoned" && !finding.accountedFor,
	);
	const blocked = unresolved.some((finding) => finding.basis === "blocked");
	const state: CensusState = blocked
		? "blocked"
		: unresolved.length > 0
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

function applyDispositions(
	findings: readonly FindingDraft[],
	dispositions: readonly FindingDisposition[],
): CensusFinding[] {
	const dispositionsByFinding = new Map<string, FindingDisposition>();
	const findingIdOccurrences = new Map<string, number>();
	for (const disposition of dispositions) {
		if (dispositionsByFinding.has(disposition.findingId))
			throw new Error(`duplicate disposition for ${disposition.findingId}`);
		dispositionsByFinding.set(disposition.findingId, disposition);
	}
	const reconciled = findings.map((finding) => {
		const identity = JSON.stringify({
			kind: finding.kind,
			commandId: finding.commandId ?? null,
			detail: finding.detail,
		});
		const occurrence = (findingIdOccurrences.get(identity) ?? 0) + 1;
		findingIdOccurrences.set(identity, occurrence);
		const id = createHash("sha256")
			.update(JSON.stringify({ identity: JSON.parse(identity), occurrence }))
			.digest("hex");
		const disposition = dispositionsByFinding.get(id);
		return {
			...finding,
			id,
			lane: finding.lane ?? "objective-observation",
			accountedFor: disposition !== undefined,
			...(disposition ? { disposition } : {}),
		};
	});
	const findingIds = new Set(reconciled.map((finding) => finding.id));
	for (const disposition of dispositions)
		if (!findingIds.has(disposition.findingId))
			throw new Error(
				`disposition references unknown finding ${disposition.findingId}`,
			);
	return reconciled;
}

function unmatchedHookEvents(run: RuntimeEvidence) {
	const errorEntityIds = new Set(run.errors.map((error) => error.entityId));
	const unmatched = (run.hooks ?? []).filter((hook) =>
		errorEntityIds.has(hook.entityId),
	);
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
	findings: FindingDraft[],
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

export function sourceCensusDigest(sources: readonly SourceCensus[]): string {
	return createHash("sha256").update(JSON.stringify(sources)).digest("hex");
}

export function commandCensusDigest(runs: readonly RuntimeEvidence[]): string {
	return createHash("sha256").update(JSON.stringify(runs)).digest("hex");
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
	findings: FindingDraft[],
): void {
	for (const source of sources) {
		const sourceSelected = selectionMatches(source.path, run.filters);
		const module = run.modules.find((candidate) =>
			moduleMatches(candidate.moduleId, source.path, run.root),
		);
		const unmatched = new Set(module?.cases ?? []);
		const externalHelpers = source.limitations.filter(
			(limitation) => limitation.kind === "external-helper-registration",
		);
		const declarations = [...source.declarations].sort(
			(left, right) =>
				Number(isParameterized(left)) - Number(isParameterized(right)),
		);
		for (const declaration of declarations) {
			if (
				(run.filters?.length ?? 0) > 0 &&
				!sourceSelected &&
				!selectionMatches(declaration.title, run.filters)
			) {
				findings.push({
					kind: "not-selected",
					basis: "observed",
					commandId: run.command.id,
					detail: `${declaration.title} from ${source.path} was outside the command selection`,
				});
				continue;
			}
			const candidates = [...unmatched].filter((testCase) =>
				titleMatches(declaration, testCase.fullName),
			);
			const matches =
				declaration.parameterCount === null
					? candidates
					: candidates.slice(0, declaration.parameterCount);
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
		if (module && externalHelpers.length > 0 && unmatched.size > 0) {
			for (const limitation of externalHelpers)
				findings.push({
					kind: "bounded-collector-limitation",
					basis: "missing",
					commandId: run.command.id,
					detail: `${source.path}:${limitation.line} calls ${limitation.helperPath}; ${unmatched.size} runtime case${unmatched.size === 1 ? "" : "s"} covered the out-of-file declarations`,
				});
			unmatched.clear();
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

function isParameterized(declaration: SourceDeclaration): boolean {
	return (
		declaration.parameterCount !== 1 ||
		/%[sdifjo#%]|\$\w+/.test(declaration.titleTemplate)
	);
}

function selectionMatches(
	value: string,
	filters: readonly string[] | undefined,
): boolean {
	return filters?.some((filter) => value.includes(filter)) ?? false;
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
