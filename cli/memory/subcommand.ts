import { lstat, readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { Command } from "commander";
import { withEntityFileLock } from "../../lib/entity-file-lock.ts";
import { createKnowledgeIndexPressurePolicy } from "../../lib/extensions/knowledge-surface/index-policy.ts";
import {
	createAcceptedJudgmentReceiptStore,
	createConsolidationProposalStore,
	createDurableMachineFiles,
	createImproveProposalResolver,
	createKnowledgeMemoryStore,
	createLivingMemoryConsolidator,
	createLivingMemoryRetirementStore,
	createProjectCorpusConsolidationSource,
	createProjectEpisodeConsolidationSource,
	DEFAULT_LIVING_MEMORY_LIMITS,
	type ImprovementActionPointer,
	type ImproveProposalResolutionResult,
	type ImproveProposalResolver,
	type LivingMemoryRestorationResult,
	type LivingMemoryRestorationStore,
	type MemoryConsolidateResult,
	type MemoryStore,
} from "../../lib/memory/index.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
import {
	type CliOutputMode,
	getOutputMode,
	printJson,
	printLines,
} from "../shared/output.ts";
import { createPiCorpusJudgmentProvider } from "./judgment-provider.ts";

const LOCK_RETRY_MS = 50;
const LOCK_TIMEOUT_MS = 10_000;

export interface MemoryConsolidationStoreOptions {
	readonly projectRoot: string;
	readonly modelMode: "full" | "deterministic-only";
	readonly model?: string;
}

interface MemoryProgramOptions {
	readonly projectRoot?: string;
	readonly createConsolidationStore?: (
		options: MemoryConsolidationStoreOptions,
	) => Pick<MemoryStore, "consolidate">;
	readonly improveResolver?: ImproveProposalResolver;
	readonly retirementStore?: LivingMemoryRestorationStore;
	readonly now?: () => Date;
}

interface ExecuteMemoryConsolidateOptions extends MemoryProgramOptions {
	readonly projectRoot: string;
	readonly dryRun: boolean;
	readonly noModel: boolean;
	readonly model?: string;
	readonly outputMode: CliOutputMode;
	readonly signal?: AbortSignal;
}

interface MemoryConsolidateCommandResult {
	readonly result: MemoryConsolidateResult;
	readonly rendered: RenderedMemoryResult<MemoryConsolidateResult>;
	readonly exitCode: number;
}

interface MemoryOutputOptions {
	readonly json?: boolean;
	readonly plain?: boolean;
}

interface MemoryConsolidateOptions extends MemoryOutputOptions {
	readonly dryRun?: boolean;
	readonly model?: string | boolean;
}

interface MemoryImproveActionOptions extends MemoryOutputOptions {
	readonly kind: string;
	readonly pointer: string;
}

interface MemoryImproveRejectOptions extends MemoryOutputOptions {
	readonly reason: string;
}

interface MemoryRestoreOptions extends MemoryOutputOptions {
	readonly reason: string;
}

type RenderedMemoryResult<T> =
	| { readonly kind: "json"; readonly value: T }
	| { readonly kind: "lines"; readonly lines: readonly string[] };

export function createMemoryProgram(
	options: MemoryProgramOptions = {},
): Command {
	const projectRoot = resolve(options.projectRoot ?? process.cwd());
	const now = options.now ?? (() => new Date());
	const program = new Command();
	program
		.name("cosmonauts memory")
		.description("Consolidate memory and close owner lifecycle actions")
		.version("1.0.0");

	program
		.command("consolidate")
		.description("Run one bounded project living-memory pass")
		.option("--dry-run", "Preview the pass without writing")
		.option("--no-model", "Run deterministic observation only")
		.option("--model <provider/model>", "Override the judgment model")
		.option("--json", "Output the result as JSON")
		.option("--plain", "Output in plain text format")
		.action(
			async (commandOptions: MemoryConsolidateOptions, command: Command) => {
				const rawArgs =
					(command.parent as (Command & { readonly rawArgs?: string[] }) | null)
						?.rawArgs ?? [];
				const noModel = rawArgs.includes("--no-model");
				const model = optionValue(rawArgs, "--model");
				validateOutputFlags(commandOptions);
				validateModelFlags({ noModel, model });
				const controller = new AbortController();
				const removeCancellation = installCancellation(controller);
				try {
					const commandResult = await executeMemoryConsolidate({
						...options,
						projectRoot,
						dryRun: commandOptions.dryRun === true,
						noModel,
						...(model === undefined ? {} : { model }),
						outputMode: getOutputMode(commandOptions),
						signal: controller.signal,
					});
					emit(commandResult.rendered);
					setExitCode(commandResult.exitCode);
				} finally {
					removeCancellation();
				}
			},
		);

	const improve = program
		.command("improve")
		.description("Resolve a living-memory improve proposal");
	improve
		.command("action <proposal>")
		.requiredOption("--kind <roadmap|task|prompt|skill>")
		.requiredOption("--pointer <value>")
		.option("--json", "Output the result as JSON")
		.option("--plain", "Output in plain text format")
		.action(
			async (proposal: string, commandOptions: MemoryImproveActionOptions) => {
				validateOutputFlags(commandOptions);
				const pointer = await validateImprovementPointer({
					projectRoot,
					kind: commandOptions.kind,
					value: commandOptions.pointer,
				});
				const resolver =
					options.improveResolver ??
					createImproveProposalResolver({ projectRoot });
				const result = await resolver.resolve({
					proposalPath: proposal,
					resolution: { kind: "actioned", pointer },
					date: now(),
					lockOptions: finiteLockOptions(),
				});
				emit(renderImproveResult(result, getOutputMode(commandOptions)));
			},
		);
	improve
		.command("reject <proposal>")
		.requiredOption("--reason <text>")
		.option("--json", "Output the result as JSON")
		.option("--plain", "Output in plain text format")
		.action(
			async (proposal: string, commandOptions: MemoryImproveRejectOptions) => {
				validateOutputFlags(commandOptions);
				const reason = nonEmpty(commandOptions.reason, "rejection reason");
				const resolver =
					options.improveResolver ??
					createImproveProposalResolver({ projectRoot });
				const result = await resolver.resolve({
					proposalPath: proposal,
					resolution: { kind: "rejected", reason },
					date: now(),
					lockOptions: finiteLockOptions(),
				});
				emit(renderImproveResult(result, getOutputMode(commandOptions)));
			},
		);

	program
		.command("restore <knowledge-path>")
		.description("Annotate a human-performed knowledge restoration")
		.requiredOption("--reason <text>")
		.option("--json", "Output the result as JSON")
		.option("--plain", "Output in plain text format")
		.action(
			async (knowledgePath: string, commandOptions: MemoryRestoreOptions) => {
				validateOutputFlags(commandOptions);
				const controller = new AbortController();
				const removeCancellation = installCancellation(controller);
				try {
					const store =
						options.retirementStore ??
						createLivingMemoryRetirementStore({ projectRoot });
					const result = await store.restore({
						path: knowledgePath,
						reason: nonEmpty(commandOptions.reason, "restoration reason"),
						date: now(),
						signal: controller.signal,
						lockOptions: finiteLockOptions(),
					});
					emit(renderRestoreResult(result, getOutputMode(commandOptions)));
					setExitCode(result.kind === "completed" ? 0 : 1);
				} finally {
					removeCancellation();
				}
			},
		);

	return program;
}

export async function executeMemoryConsolidate(
	options: ExecuteMemoryConsolidateOptions,
): Promise<MemoryConsolidateCommandResult> {
	validateModelFlags(options);
	const modelMode = options.noModel ? "deterministic-only" : "full";
	const createStore =
		options.createConsolidationStore ?? createDefaultConsolidationStore;
	const store = createStore({
		projectRoot: options.projectRoot,
		modelMode,
		...(options.model === undefined ? {} : { model: options.model }),
	});
	const result = await store.consolidate({
		dryRun: options.dryRun,
		modelMode,
		...(options.signal === undefined ? {} : { signal: options.signal }),
	});
	return {
		result,
		...renderMemoryConsolidateResult(result, options.outputMode),
	};
}

function renderMemoryConsolidateResult(
	result: MemoryConsolidateResult,
	mode: CliOutputMode,
): Pick<MemoryConsolidateCommandResult, "rendered" | "exitCode"> {
	const exitCode = consolidationExitCode(result);
	if (mode === "json") {
		return { exitCode, rendered: { kind: "json", value: result } };
	}
	if (mode === "plain") {
		return {
			exitCode,
			rendered: {
				kind: "lines",
				lines:
					result.kind === "ran"
						? ["kind=ran"]
						: [`kind=${result.kind}`, `reason=${result.reason}`],
			},
		};
	}
	return {
		exitCode,
		rendered: {
			kind: "lines",
			lines:
				result.kind === "ran"
					? ["Living-memory consolidation completed."]
					: result.kind === "noop"
						? [
								`Living-memory consolidation found nothing to do: ${result.reason}`,
							]
						: [`Living-memory consolidation failed: ${result.reason}`],
		},
	};
}

async function validateImprovementPointer(options: {
	readonly projectRoot: string;
	readonly kind: string;
	readonly value: string;
}): Promise<ImprovementActionPointer> {
	const value = nonEmpty(options.value, "improvement pointer");
	switch (options.kind) {
		case "roadmap":
			await validateRoadmapHeading(options.projectRoot, value);
			return { kind: "roadmap", value };
		case "task": {
			const task = (
				await new TaskManager(options.projectRoot).listTasksReadOnly()
			).find((candidate) => candidate.id.toLowerCase() === value.toLowerCase());
			if (!task)
				throw new Error(`Improvement task pointer does not exist: ${value}.`);
			return { kind: "task", value: task.id };
		}
		case "prompt":
			return {
				kind: "prompt",
				value: await validateProjectFilePointer({
					projectRoot: options.projectRoot,
					value,
					kind: "prompt",
				}),
			};
		case "skill":
			return {
				kind: "skill",
				value: await validateProjectFilePointer({
					projectRoot: options.projectRoot,
					value,
					kind: "skill",
				}),
			};
		default:
			throw new Error(
				`Invalid improvement pointer kind: ${options.kind}. Expected roadmap, task, prompt, or skill.`,
			);
	}
}

async function validateRoadmapHeading(
	projectRoot: string,
	pointer: string,
): Promise<void> {
	const path = join(projectRoot, "ROADMAP.md");
	await assertRegularContainedFile(projectRoot, path, "ROADMAP pointer");
	const raw = await readFile(path, "utf-8");
	const headings = [...raw.matchAll(/^#{1,6}\s+(.+?)\s*$/gmu)].map(
		(match) => match[1] ?? "",
	);
	const requested = pointer.startsWith("ROADMAP.md#")
		? pointer.slice("ROADMAP.md#".length)
		: pointer.replace(/^#+\s*/u, "");
	const matches = headings.some(
		(heading) =>
			heading === requested ||
			markdownAnchor(heading) === requested.toLowerCase(),
	);
	if (!matches) {
		throw new Error(`Improvement roadmap pointer does not exist: ${pointer}.`);
	}
}

async function validateProjectFilePointer(options: {
	readonly projectRoot: string;
	readonly value: string;
	readonly kind: "prompt" | "skill";
}): Promise<string> {
	const absolute = isAbsolute(options.value)
		? resolve(options.value)
		: resolve(options.projectRoot, ...options.value.split("/"));
	await assertRegularContainedFile(
		options.projectRoot,
		absolute,
		`${options.kind} pointer`,
	);
	const relativePath = relative(options.projectRoot, absolute)
		.split(sep)
		.join("/");
	const valid =
		options.kind === "prompt"
			? relativePath.split("/").includes("prompts") &&
				relativePath.endsWith(".md")
			: relativePath.split("/").includes("skills") &&
				relativePath.endsWith("/SKILL.md");
	if (!valid) {
		throw new Error(
			`Improvement ${options.kind} pointer is not a ${options.kind} file: ${options.value}.`,
		);
	}
	return relativePath;
}

async function assertRegularContainedFile(
	projectRoot: string,
	path: string,
	label: string,
): Promise<void> {
	let metadata: Awaited<ReturnType<typeof lstat>>;
	try {
		metadata = await lstat(path);
	} catch (error: unknown) {
		if (errorCode(error) === "ENOENT") {
			throw new Error(`${label} does not exist: ${path}.`);
		}
		throw error;
	}
	if (metadata.isSymbolicLink() || !metadata.isFile()) {
		throw new Error(`${label} is not a regular file: ${path}.`);
	}
	const [realRoot, realFile] = await Promise.all([
		realpath(projectRoot),
		realpath(path),
	]);
	const child = relative(realRoot, realFile);
	if (
		child === "" ||
		child === ".." ||
		child.startsWith(`..${sep}`) ||
		isAbsolute(child)
	) {
		throw new Error(`${label} escapes the project root: ${path}.`);
	}
}

function createDefaultConsolidationStore(
	options: MemoryConsolidationStoreOptions,
): Pick<MemoryStore, "consolidate"> {
	const durableFiles = createDurableMachineFiles();
	const userCosmonautsRoot = join(homedir(), ".cosmonauts");
	const judgmentProvider =
		options.modelMode === "full"
			? createPiCorpusJudgmentProvider({
					projectRoot: options.projectRoot,
					...(options.model === undefined ? {} : { model: options.model }),
				})
			: undefined;
	const consolidator = createLivingMemoryConsolidator({
		lockPath: join(options.projectRoot, ".cosmonauts", "living-memory.lock"),
		withLock: withEntityFileLock,
		sources: [
			createProjectCorpusConsolidationSource({
				projectRoot: options.projectRoot,
				userCosmonautsRoot,
			}),
			createProjectEpisodeConsolidationSource({
				projectRoot: options.projectRoot,
				durableFiles,
			}),
		],
		...(judgmentProvider === undefined ? {} : { judgmentProvider }),
		proposalStore: createConsolidationProposalStore({
			projectRoot: options.projectRoot,
			durableFiles,
		}),
		acceptedJudgmentReceiptStore: createAcceptedJudgmentReceiptStore({
			projectRoot: options.projectRoot,
			durableFiles,
		}),
		retirementStore: createLivingMemoryRetirementStore({
			projectRoot: options.projectRoot,
			userCosmonautsRoot,
		}),
		durableFiles,
		indexPressure: createKnowledgeIndexPressurePolicy(),
		clock: () => new Date(),
		limits: DEFAULT_LIVING_MEMORY_LIMITS,
		lockOptions: finiteLockOptions(),
	});
	return createKnowledgeMemoryStore({
		projectRoot: options.projectRoot,
		userCosmonautsRoot,
		consolidator,
	});
}

function renderImproveResult(
	result: ImproveProposalResolutionResult,
	mode: CliOutputMode,
): RenderedMemoryResult<ImproveProposalResolutionResult> {
	if (mode === "json") return { kind: "json", value: result };
	return {
		kind: "lines",
		lines:
			mode === "plain"
				? [
						`kind=${result.kind}`,
						"status=closed",
						`existing=${String(result.existing)}`,
						`historyPath=${result.historyPath}`,
					]
				: [
						`Improve proposal ${result.kind} and closed${result.existing ? " (already recorded)" : ""}.`,
						`History: ${result.historyPath}`,
					],
	};
}

function renderRestoreResult(
	result: LivingMemoryRestorationResult,
	mode: CliOutputMode,
): RenderedMemoryResult<LivingMemoryRestorationResult> {
	if (mode === "json") return { kind: "json", value: result };
	return {
		kind: "lines",
		lines:
			mode === "plain"
				? [
						`kind=${result.kind}`,
						...(result.kind === "failed" ? [`reason=${result.reason}`] : []),
						`path=${result.details.path}`,
						`status=${result.details.status ?? "failed"}`,
					]
				: result.kind === "completed"
					? [
							`Knowledge restoration ${result.details.status === "existing" ? "already recorded" : "recorded"}: ${result.details.path}.`,
						]
					: [`Knowledge restoration failed: ${result.reason}`],
	};
}

function consolidationExitCode(result: MemoryConsolidateResult): number {
	if (result.kind === "failed") return 1;
	const recovery = result.details?.recovery;
	return recovery === "pending" ||
		recovery === "release-unconfirmed" ||
		recovery === "concurrent-mutation"
		? 1
		: 0;
}

function validateModelFlags(options: {
	readonly noModel: boolean;
	readonly model?: string;
}): void {
	if (options.noModel && options.model !== undefined) {
		throw new Error("--no-model cannot be used with --model.");
	}
}

function validateOutputFlags(options: MemoryOutputOptions): void {
	if (options.json && options.plain) {
		throw new Error("--json cannot be used with --plain.");
	}
}

function finiteLockOptions() {
	return {
		retryMs: LOCK_RETRY_MS,
		timeoutMs: LOCK_TIMEOUT_MS,
		onReleaseUnconfirmed: () => undefined,
	};
}

function installCancellation(controller: AbortController): () => void {
	const abort = () => controller.abort();
	process.once("SIGINT", abort);
	return () => process.removeListener("SIGINT", abort);
}

function optionValue(
	args: readonly string[],
	name: string,
): string | undefined {
	const index = args.lastIndexOf(name);
	return index === -1 ? undefined : args[index + 1];
}

function nonEmpty(value: string, label: string): string {
	if (value.trim() !== value || value.length === 0) {
		throw new Error(`${label} must be non-empty.`);
	}
	return value;
}

function markdownAnchor(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s-]/gu, "")
		.replace(/\s+/gu, "-");
}

function emit<T>(rendered: RenderedMemoryResult<T>): void {
	if (rendered.kind === "json") printJson(rendered.value);
	else printLines(rendered.lines);
}

function setExitCode(code: number): void {
	if (code !== 0) process.exitCode = code;
}

function errorCode(error: unknown): string | undefined {
	return error !== null && typeof error === "object" && "code" in error
		? String((error as NodeJS.ErrnoException).code)
		: undefined;
}
