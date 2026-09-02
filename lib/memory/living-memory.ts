import { createHash } from "node:crypto";
import {
	type ConsolidationSourceRecord,
	collectConsolidationSources,
} from "./consolidation-sources.ts";
import type {
	ConsolidationEvidenceRef,
	ConsolidationObservation,
	ConsolidationObservationKind,
	CorpusJudgmentOutput,
	JudgedProposal,
	KnowledgeConsolidator,
	LivingMemoryConsolidatorDependencies,
	LivingMemoryLimits,
	MemoryConsolidateDetails,
	MemoryConsolidateOptions,
} from "./types.ts";

export const DEFAULT_LIVING_MEMORY_LIMITS = Object.freeze({
	maxCorpusRecords: 50,
	maxEpisodeRecords: 50,
	maxObservations: 25,
	maxProposals: 10,
	maxRetirements: 5,
	maxModelRequests: 1,
}) satisfies LivingMemoryLimits;

const OBSERVATION_KINDS = new Set<ConsolidationObservationKind>([
	"duplicate",
	"superseded",
	"stale-reference",
	"merge-candidate",
	"retire-condition-met",
	"obsolete-cause",
	"improvement",
]);

export function createLivingMemoryConsolidator(
	dependencies: LivingMemoryConsolidatorDependencies,
): KnowledgeConsolidator {
	assertLimits(dependencies.limits);
	assertLockOptions(dependencies.lockOptions);

	return async (options: MemoryConsolidateOptions = {}) => {
		const dryRun = options.dryRun ?? false;
		const modelMode = options.modelMode ?? "full";
		let details = emptyDetails({ dryRun, modelMode });

		try {
			throwIfAborted(options.signal);
			const collected = await collectConsolidationSources({
				sources: dependencies.sources,
				maxCorpusRecords: dependencies.limits.maxCorpusRecords,
				maxEpisodeRecords: dependencies.limits.maxEpisodeRecords,
				...(options.signal === undefined ? {} : { signal: options.signal }),
			});
			details = {
				...details,
				sources: collected.sources,
				declines: collected.sources
					.filter((source) => source.omitted > 0)
					.map((source) => ({
						code: "source-deferred",
						reason: `${source.omitted} record(s) from ${source.sourceId} were deferred by the bounded source pass.`,
					})),
			};

			if (collected.records.length === 0) {
				return {
					kind: "noop" as const,
					reason: "No consolidation work was admitted from healthy sources.",
					details,
				};
			}
			if (modelMode === "deterministic-only") {
				return {
					kind: "noop" as const,
					reason: "No deterministic consolidation observations were found.",
					details,
				};
			}
			if (!dependencies.judgmentProvider) {
				return {
					kind: "failed" as const,
					reason:
						"Full living-memory consolidation requires a judgment provider.",
					details,
				};
			}

			const input = Object.freeze({
				schemaVersion: 1 as const,
				batchKey: batchKey({
					providerId: dependencies.judgmentProvider.id,
					records: collected.records,
				}),
				records: collected.records,
				deterministicObservations: Object.freeze([]),
				limits: Object.freeze({ ...dependencies.limits }),
			});
			const output = await dependencies.judgmentProvider.judge(input, {
				...(options.signal === undefined ? {} : { signal: options.signal }),
			});
			throwIfAborted(options.signal);
			const normalized = validateJudgmentOutput({
				output,
				records: collected.records,
				limits: dependencies.limits,
			});
			const retirements = normalized.flatMap((item) => {
				if (item.proposal?.proposalKind !== "retire") return [];
				const inputRecord = item.observation.inputs[0];
				if (!inputRecord) return [];
				return [
					{
						path: inputRecord.path,
						digest: inputRecord.digest,
						status: "deferred" as const,
						reason: item.proposal.reason,
					},
				];
			});
			const proposalDeclines = normalized
				.filter((item) => item.proposal !== undefined)
				.map((item) => ({
					code: "proposal-deferred",
					path: item.observation.inputs[0]?.path,
					reason:
						"Validated judgment is deferred until proposal persistence is configured by its owning slice.",
				}));
			details = {
				...details,
				observations: Object.freeze(normalized.map((item) => item.observation)),
				retirements: Object.freeze(retirements),
				declines: Object.freeze([...details.declines, ...proposalDeclines]),
			};
			return { kind: "ran" as const, details };
		} catch (error: unknown) {
			return {
				kind: "failed" as const,
				reason: error instanceof Error ? error.message : String(error),
				details,
			};
		}
	};
}

function validateJudgmentOutput(options: {
	readonly output: CorpusJudgmentOutput;
	readonly records: readonly ConsolidationSourceRecord[];
	readonly limits: LivingMemoryLimits;
}): readonly {
	readonly observation: ConsolidationObservation;
	readonly proposal?: JudgedProposal;
}[] {
	if (
		options.output.schemaVersion !== 1 ||
		!Array.isArray(options.output.observations)
	) {
		throw new Error("Judgment output has an unsupported schema.");
	}
	if (options.output.observations.length > options.limits.maxObservations) {
		throw new Error(
			`Judgment output exceeds the observation cap (${options.output.observations.length} > ${options.limits.maxObservations}).`,
		);
	}
	const proposalCount = options.output.observations.filter(
		(observation) => observation.proposal !== undefined,
	).length;
	if (proposalCount > options.limits.maxProposals) {
		throw new Error(
			`Judgment output exceeds the proposal cap (${proposalCount} > ${options.limits.maxProposals}).`,
		);
	}
	const retirementCount = options.output.observations.filter(
		(observation) => observation.proposal?.proposalKind === "retire",
	).length;
	if (retirementCount > options.limits.maxRetirements) {
		throw new Error(
			`Judgment output exceeds the retirement cap (${retirementCount} > ${options.limits.maxRetirements}).`,
		);
	}
	if (
		options.output.observations.length > 0 &&
		options.output.observations.length >= options.records.length
	) {
		throw new Error(
			"Judgment output violates the bounded lossy-pass contract by producing one output per input.",
		);
	}

	const recordsById = new Map<string, ConsolidationSourceRecord[]>();
	for (const record of options.records) {
		const matches = recordsById.get(record.id) ?? [];
		matches.push(record);
		recordsById.set(record.id, matches);
	}
	const consumed = new Set<string>();
	return Object.freeze(
		options.output.observations.map((output, index) => {
			if (!OBSERVATION_KINDS.has(output.kind)) {
				throw new Error(
					`Judgment output ${index} has an unsupported observation kind.`,
				);
			}
			if (
				typeof output.reason !== "string" ||
				output.reason.trim().length === 0
			) {
				throw new Error(`Judgment output ${index} requires a reason.`);
			}
			if (!Array.isArray(output.inputIds) || output.inputIds.length === 0) {
				throw new Error(`Judgment output ${index} requires input ids.`);
			}
			const localIds = new Set<string>();
			const inputs = output.inputIds.map((id: unknown) => {
				if (typeof id !== "string" || id.length === 0) {
					throw new Error(`Judgment output ${index} has an invalid input id.`);
				}
				if (localIds.has(id) || consumed.has(id)) {
					throw new Error(`Judgment output repeats input id ${id}.`);
				}
				localIds.add(id);
				consumed.add(id);
				const matches = recordsById.get(id);
				if (matches?.length !== 1) {
					throw new Error(
						`Judgment output references ${matches ? "ambiguous" : "unknown"} input id ${id}.`,
					);
				}
				const record = matches[0];
				if (!record) throw new Error(`Judgment input ${id} disappeared.`);
				return evidenceRef(record);
			});
			if (output.proposal !== undefined)
				validateProposal(output.proposal, index);
			return Object.freeze({
				observation: Object.freeze({
					id: `judgment-${index + 1}`,
					kind: output.kind,
					inputs: Object.freeze(inputs),
					reason: output.reason,
				}),
				...(output.proposal === undefined
					? {}
					: { proposal: Object.freeze(structuredClone(output.proposal)) }),
			});
		}),
	);
}

function validateProposal(proposal: JudgedProposal, index: number): void {
	if (typeof proposal !== "object" || proposal === null) {
		throw new Error(`Judgment output ${index} has an invalid proposal.`);
	}
	if ("path" in proposal) {
		throw new Error(
			`Judgment output ${index} contains model-supplied paths; proposal paths are derived by the core.`,
		);
	}
	switch (proposal.proposalKind) {
		case "create":
			assertExactKeys(proposal, ["proposalKind", "record"], index);
			validateProposedRecord(proposal.record, index);
			return;
		case "merge":
			assertExactKeys(proposal, ["proposalKind", "replacement"], index);
			validateProposedRecord(proposal.replacement, index);
			return;
		case "retire":
			assertExactKeys(proposal, ["proposalKind", "reason"], index);
			if (
				!["superseded", "merged", "obsolete", "retire-when-met"].includes(
					proposal.reason,
				)
			) {
				throw new Error(
					`Judgment output ${index} has an invalid retirement reason.`,
				);
			}
			return;
		case "improve":
			assertExactKeys(
				proposal,
				[
					"proposalKind",
					"observedProblem",
					"whatHappened",
					"suggestedImprovement",
					"whyItHelps",
				],
				index,
			);
			for (const field of [
				proposal.observedProblem,
				proposal.whatHappened,
				proposal.suggestedImprovement,
				proposal.whyItHelps,
			]) {
				if (typeof field !== "string" || field.trim().length === 0) {
					throw new Error(
						`Judgment output ${index} has an incomplete improvement proposal.`,
					);
				}
			}
			return;
		default:
			throw new Error(
				`Judgment output ${index} has an unsupported proposal kind.`,
			);
	}
}

function validateProposedRecord(record: unknown, index: number): void {
	if (typeof record !== "object" || record === null) {
		throw new Error(
			`Judgment output ${index} has an invalid replacement record.`,
		);
	}
	const candidate = record as Record<string, unknown>;
	assertExactKeys(
		candidate,
		["type", "title", "description", "content", "tags"],
		index,
	);
	if (
		!["decision", "trade-off", "gotcha", "convention", "note"].includes(
			String(candidate.type),
		) ||
		![candidate.title, candidate.description, candidate.content].every(
			(value) => typeof value === "string" && value.trim().length > 0,
		) ||
		!Array.isArray(candidate.tags) ||
		!candidate.tags.every((tag) => typeof tag === "string")
	) {
		throw new Error(
			`Judgment output ${index} has an incomplete replacement record.`,
		);
	}
}

function assertExactKeys(
	value: object,
	allowed: readonly string[],
	index: number,
): void {
	const allowedKeys = new Set(allowed);
	const unexpected = Object.keys(value).filter((key) => !allowedKeys.has(key));
	if (unexpected.length > 0) {
		throw new Error(
			`Judgment output ${index} has unsupported proposal fields: ${unexpected.join(", ")}.`,
		);
	}
}

function evidenceRef(
	record: ConsolidationSourceRecord,
): ConsolidationEvidenceRef {
	return Object.freeze({
		id: record.id,
		sourceId: record.sourceId,
		scope: record.scope,
		path: record.path,
		digest: record.digest,
	});
}

function batchKey(options: {
	readonly providerId: string;
	readonly records: readonly ConsolidationSourceRecord[];
}): string {
	const evidence = options.records
		.map((record) => ({
			sourceId: record.sourceId,
			scope: record.scope,
			path: record.path,
			digest: record.digest,
		}))
		.sort((a, b) =>
			`${a.sourceId}\0${a.scope}\0${a.path}`.localeCompare(
				`${b.sourceId}\0${b.scope}\0${b.path}`,
			),
		);
	return createHash("sha256")
		.update(
			JSON.stringify({
				schemaVersion: 1,
				modelMode: "full",
				providerId: options.providerId,
				records: evidence,
				deterministicObservations: [],
			}),
		)
		.digest("hex");
}

function emptyDetails(options: {
	readonly dryRun: boolean;
	readonly modelMode: "full" | "deterministic-only";
}): MemoryConsolidateDetails {
	return {
		dryRun: options.dryRun,
		modelMode: options.modelMode,
		sources: [],
		observations: [],
		proposals: [],
		retirements: [],
		episodePrunes: [],
		declines: [],
		warnings: [],
		recovery: "none",
		writesCommitted: false,
	};
}

function assertLimits(limits: LivingMemoryLimits): void {
	for (const [key, ceiling] of Object.entries(DEFAULT_LIVING_MEMORY_LIMITS)) {
		const value = limits[key as keyof LivingMemoryLimits];
		if (!Number.isSafeInteger(value) || value < 1 || value > ceiling) {
			throw new Error(
				`Living-memory limit ${key} must be between 1 and ${ceiling}.`,
			);
		}
	}
	if (limits.maxModelRequests !== 1) {
		throw new Error(
			"Living-memory passes require exactly one model-request slot.",
		);
	}
}

function assertLockOptions(
	options: LivingMemoryConsolidatorDependencies["lockOptions"],
): void {
	if (options.retryMs !== 50 || options.timeoutMs !== 10_000) {
		throw new Error(
			"Living-memory lock options require a 50 ms retry and 10-second timeout.",
		);
	}
}

function throwIfAborted(signal: AbortSignal | undefined): void {
	if (signal?.aborted) {
		throw signal.reason instanceof Error
			? signal.reason
			: new Error("Living-memory consolidation was cancelled.");
	}
}
