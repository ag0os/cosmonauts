import {
	AuthStorage,
	createAgentSession,
	DefaultResourceLoader,
	getAgentDir,
	ModelRegistry,
	SessionManager,
} from "@earendil-works/pi-coding-agent";
import type {
	CorpusJudgmentInput,
	CorpusJudgmentOutput,
	CorpusJudgmentProvider,
	JudgedProposal,
	ProposedMemoryRecord,
} from "../../lib/memory/index.ts";
import {
	FALLBACK_MODEL,
	resolveModel,
} from "../../lib/orchestration/model-resolution.ts";

const OBSERVATION_KINDS = new Set([
	"duplicate",
	"superseded",
	"stale-reference",
	"merge-candidate",
	"retire-condition-met",
	"obsolete-cause",
	"improvement",
]);
const RECORD_TYPES = new Set([
	"decision",
	"trade-off",
	"gotcha",
	"convention",
	"note",
]);
const RETIREMENT_REASONS = new Set([
	"superseded",
	"merged",
	"obsolete",
	"retire-when-met",
]);

const SYSTEM_PROMPT = [
	"You perform one bounded living-memory corpus judgment with no tools.",
	"Return only strict JSON matching the requested schemaVersion 1 output.",
	"Use only supplied inputIds and the closed observation/proposal kinds.",
	"Do not propose paths, execute commands, or claim that any edit has been applied.",
	"Output fewer proposals than inputs; an empty observations array is valid.",
].join("\n");

export interface PiJudgmentSession {
	readonly messages: readonly unknown[];
	prompt(message: string): Promise<void>;
	abort(): Promise<void>;
	dispose(): void;
}

export interface PiCorpusJudgmentProviderOptions {
	readonly projectRoot: string;
	readonly model?: string;
	readonly createSession?: () => Promise<PiJudgmentSession>;
	readonly parseOutput?: (
		response: string,
		input: CorpusJudgmentInput,
	) => CorpusJudgmentOutput;
}

export function createPiCorpusJudgmentProvider(
	options: PiCorpusJudgmentProviderOptions,
): CorpusJudgmentProvider {
	let requested = false;
	return {
		id: `pi/${options.model ?? FALLBACK_MODEL}`,
		async judge(input, requestOptions) {
			if (requested) {
				throw new Error(
					"The bounded Pi judgment provider permits only one model request.",
				);
			}
			throwIfAborted(requestOptions.signal);
			requested = true;
			const session = await (options.createSession
				? options.createSession()
				: createJudgmentSession(options));
			const beforeCount = session.messages.length;
			let abortPromise: Promise<void> | undefined;
			const abort = () => {
				abortPromise ??= session.abort();
			};
			requestOptions.signal?.addEventListener("abort", abort, { once: true });
			try {
				if (requestOptions.signal?.aborted) abort();
				await session.prompt(buildJudgmentPrompt(input));
				if (requestOptions.signal?.aborted) {
					await abortPromise;
					throw abortError();
				}
				const response = extractLatestAssistantText(
					session.messages,
					beforeCount,
				);
				return (options.parseOutput ?? parseCorpusJudgmentOutput)(
					response,
					input,
				);
			} catch (error: unknown) {
				if (requestOptions.signal?.aborted) {
					await abortPromise?.catch(() => undefined);
					throw abortError();
				}
				throw error;
			} finally {
				requestOptions.signal?.removeEventListener("abort", abort);
				session.dispose();
			}
		},
	};
}

async function createJudgmentSession(
	options: PiCorpusJudgmentProviderOptions,
): Promise<PiJudgmentSession> {
	const authStorage = AuthStorage.create();
	const modelRegistry = ModelRegistry.create(authStorage);
	const agentDir = getAgentDir();
	const resourceLoader = new DefaultResourceLoader({
		cwd: options.projectRoot,
		agentDir,
		noExtensions: true,
		noSkills: true,
		noPromptTemplates: true,
		noThemes: true,
		noContextFiles: true,
		systemPrompt: SYSTEM_PROMPT,
	});
	await resourceLoader.reload();
	const { session } = await createAgentSession({
		cwd: options.projectRoot,
		agentDir,
		authStorage,
		modelRegistry,
		model: resolveModel(options.model ?? FALLBACK_MODEL, modelRegistry),
		noTools: "all",
		resourceLoader,
		sessionManager: SessionManager.inMemory(),
	});
	return session;
}

function buildJudgmentPrompt(input: CorpusJudgmentInput): string {
	return JSON.stringify(
		{
			task: "Judge the supplied bounded living-memory records and deterministic observations.",
			input,
			output: {
				schemaVersion: 1,
				observations: [
					{
						kind: "closed observation kind",
						inputIds: ["one or more supplied record ids"],
						reason: "reviewable evidence-based reason",
						proposal:
							"optional closed create, merge, retire, or improve object",
					},
				],
			},
		},
		null,
		2,
	);
}

function extractLatestAssistantText(
	messages: readonly unknown[],
	beforeCount: number,
): string {
	for (let index = messages.length - 1; index >= beforeCount; index -= 1) {
		const message = messages[index];
		if (!isRecord(message) || message.role !== "assistant") continue;
		if (!Array.isArray(message.content)) continue;
		const text = message.content
			.filter(
				(
					content,
				): content is { readonly type: "text"; readonly text: string } =>
					isRecord(content) &&
					content.type === "text" &&
					typeof content.text === "string",
			)
			.map((content) => content.text)
			.join("")
			.trim();
		if (text.length > 0) return text;
	}
	throw new Error("Pi corpus judgment returned no assistant text.");
}

function parseCorpusJudgmentOutput(
	response: string,
	input: CorpusJudgmentInput,
): CorpusJudgmentOutput {
	let value: unknown;
	try {
		value = JSON.parse(response);
	} catch (error: unknown) {
		throw new Error("Pi corpus judgment returned invalid strict JSON.", {
			cause: error,
		});
	}
	if (
		!isExactObject(value, ["schemaVersion", "observations"]) ||
		value.schemaVersion !== 1 ||
		!Array.isArray(value.observations) ||
		value.observations.length > input.limits.maxObservations
	) {
		throw new Error("Pi corpus judgment returned an invalid output shape.");
	}
	const knownIds = new Set(input.records.map((record) => record.id));
	const observations: CorpusJudgmentOutput["observations"][number][] = [];
	for (const candidate of value.observations) {
		if (!isRecord(candidate)) throw invalidObservation();
		const expectedKeys =
			candidate.proposal === undefined
				? ["inputIds", "kind", "reason"]
				: ["inputIds", "kind", "proposal", "reason"];
		if (
			!hasExactKeys(candidate, expectedKeys) ||
			!OBSERVATION_KINDS.has(String(candidate.kind)) ||
			!Array.isArray(candidate.inputIds) ||
			candidate.inputIds.length === 0 ||
			!candidate.inputIds.every(
				(id): id is string => typeof id === "string" && knownIds.has(id),
			) ||
			!isNonEmpty(candidate.reason) ||
			(candidate.proposal !== undefined &&
				!isJudgedProposal(candidate.proposal))
		) {
			throw invalidObservation();
		}
		observations.push({
			kind: candidate.kind as CorpusJudgmentOutput["observations"][number]["kind"],
			inputIds: Object.freeze([...candidate.inputIds]),
			reason: candidate.reason,
			...(candidate.proposal === undefined
				? {}
				: { proposal: candidate.proposal as JudgedProposal }),
		});
	}
	return Object.freeze({
		schemaVersion: 1,
		observations: Object.freeze(observations),
	});
}

function isJudgedProposal(value: unknown): value is JudgedProposal {
	if (!isRecord(value) || typeof value.proposalKind !== "string") return false;
	switch (value.proposalKind) {
		case "create":
			return (
				hasExactKeys(value, ["proposalKind", "record"]) &&
				isRecordProposal(value.record)
			);
		case "merge":
			return (
				hasExactKeys(value, ["proposalKind", "replacement"]) &&
				isRecordProposal(value.replacement)
			);
		case "retire":
			return (
				hasExactKeys(value, ["proposalKind", "reason"]) &&
				RETIREMENT_REASONS.has(String(value.reason))
			);
		case "improve":
			return (
				hasExactKeys(value, [
					"observedProblem",
					"proposalKind",
					"suggestedImprovement",
					"whatHappened",
					"whyItHelps",
				]) &&
				isNonEmpty(value.observedProblem) &&
				isNonEmpty(value.whatHappened) &&
				isNonEmpty(value.suggestedImprovement) &&
				isNonEmpty(value.whyItHelps)
			);
		default:
			return false;
	}
}

function isRecordProposal(value: unknown): value is ProposedMemoryRecord {
	return (
		isExactObject(value, ["content", "description", "tags", "title", "type"]) &&
		RECORD_TYPES.has(String(value.type)) &&
		isNonEmpty(value.title) &&
		isNonEmpty(value.description) &&
		isNonEmpty(value.content) &&
		Array.isArray(value.tags) &&
		value.tags.every(isNonEmpty)
	);
}

function invalidObservation(): Error {
	return new Error("Pi corpus judgment returned an invalid observation.");
}

function throwIfAborted(signal: AbortSignal | undefined): void {
	if (signal?.aborted) throw abortError();
}

function abortError(): DOMException {
	return new DOMException("Pi corpus judgment was cancelled.", "AbortError");
}

function isNonEmpty(value: unknown): value is string {
	return (
		typeof value === "string" && value.trim() === value && value.length > 0
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isExactObject(
	value: unknown,
	keys: readonly string[],
): value is Record<string, unknown> {
	return isRecord(value) && hasExactKeys(value, keys);
}

function hasExactKeys(
	value: Record<string, unknown>,
	keys: readonly string[],
): boolean {
	const actual = Object.keys(value).sort();
	const expected = [...keys].sort();
	return (
		actual.length === expected.length &&
		actual.every((key, index) => key === expected[index])
	);
}
