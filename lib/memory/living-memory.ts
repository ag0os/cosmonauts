import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { constants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import matter from "gray-matter";
import type {
	ConsolidationProposalMaterialization,
	ConsolidationProposalStoreWithMaterializations,
} from "./consolidation-proposals.ts";
import {
	type ConsolidationSourceInventoryRecord,
	type ConsolidationSourceRecord,
	collectConsolidationSources,
} from "./consolidation-sources.ts";
import { parseHumanKnowledgeRecord } from "./knowledge-records.ts";
import type {
	AcceptedJudgmentReceipt,
	ConsolidationEvidenceRef,
	ConsolidationObservation,
	ConsolidationObservationKind,
	CorpusJudgmentOutput,
	JudgedProposal,
	KnowledgeConsolidator,
	KnowledgeIndexPressureResult,
	LivingMemoryConsolidatorDependencies,
	LivingMemoryLimits,
	MemoryConsolidateDetails,
	MemoryConsolidateOptions,
	MemoryWarning,
	ProposedMemoryRecord,
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
			const recoveryRun = dryRun
				? undefined
				: await dependencies.retirementStore.apply({
						candidates: [],
						dryRun: false,
						date: dependencies.clock(),
						maxRetirements: dependencies.limits.maxRetirements,
						lockOptions: dependencies.lockOptions,
						...(options.signal === undefined ? {} : { signal: options.signal }),
					});
			if (recoveryRun !== undefined) {
				details = {
					...details,
					retirements: recoveryRun.details.retirements,
					declines: recoveryRun.details.declines,
					warnings: recoveryRun.details.warnings,
					recovery: recoveryRun.details.recovery,
					writesCommitted: recoveryRun.details.writesCommitted,
					...(recoveryRun.details.manifestPath === undefined
						? {}
						: { manifestPath: recoveryRun.details.manifestPath }),
				};
			}
			if (recoveryRun?.kind === "failed") {
				return {
					kind: "failed" as const,
					reason: recoveryRun.reason,
					details,
				};
			}
			const [initialReceipts, proposalEvidence, proposalMaterializations] =
				await Promise.all([
					dependencies.acceptedJudgmentReceiptStore.list(),
					dependencies.proposalStore.readEvidence(),
					(
						dependencies.proposalStore as Partial<ConsolidationProposalStoreWithMaterializations>
					).readMaterializations?.() ??
						Promise.resolve(
							Object.freeze(
								[],
							) as readonly ConsolidationProposalMaterialization[],
						),
				]);
			const representedBeforeCollection = Object.freeze([
				...initialReceipts.flatMap((receipt) =>
					receipt.state === "materialized" ? receipt.inputDigests : [],
				),
				...proposalEvidence.map((evidence) => evidence.digest),
			]);
			const collected = await collectConsolidationSources({
				sources: dependencies.sources,
				maxCorpusRecords: dependencies.limits.maxCorpusRecords,
				maxEpisodeRecords: dependencies.limits.maxEpisodeRecords,
				representedDigests: representedBeforeCollection,
				...(options.signal === undefined ? {} : { signal: options.signal }),
			});
			details = {
				...details,
				sources: collected.sources,
				declines: Object.freeze([
					...details.declines,
					...collected.sources
						.filter((source) => source.omitted > 0)
						.map((source) => ({
							code: "source-deferred",
							reason: `${source.omitted} record(s) from ${source.sourceId} were deferred by the bounded source pass.`,
						})),
				]),
				recovery: recoveryRun?.details.recovery ?? "none",
				writesCommitted: recoveryRun?.details.writesCommitted ?? false,
			};
			const dischargedReceipts = dryRun
				? Object.freeze([])
				: await dependencies.acceptedJudgmentReceiptStore.dischargeStale({
						currentDigests: Object.freeze(
							collected.inventory.map((record) => record.digest),
						),
						lockOptions: dependencies.lockOptions,
					});
			const dischargedPaths = new Set(dischargedReceipts);
			const receipts = initialReceipts.filter(
				(receipt) => !dischargedPaths.has(receipt.path),
			);
			const retirementInspection = await dependencies.retirementStore.inspect(
				collected.records,
			);
			if (dryRun && retirementInspection.recovery !== "none") {
				details = {
					...details,
					warnings: retirementInspection.warnings,
					recovery: retirementInspection.recovery,
				};
				return {
					kind: "failed" as const,
					reason:
						"Dry-run observes retirement state but never acquires a lock or performs recovery.",
					details,
				};
			}
			const episodeRecovery = dryRun
				? undefined
				: await recoverAcceptedEpisodeFinalization({
						records: collected.records,
						receipts,
						proposals: proposalMaterializations,
						dependencies,
					});
			if (episodeRecovery !== undefined) {
				details = {
					...details,
					proposals: episodeRecovery.proposals,
					episodePrunes: episodeRecovery.episodePrunes,
					writesCommitted:
						details.writesCommitted || episodeRecovery.writesCommitted,
					...(episodeRecovery.receiptPath === undefined
						? {}
						: {
								acceptedJudgmentReceiptPath: episodeRecovery.receiptPath,
							}),
				};
				return { kind: "ran" as const, details };
			}
			const representedDigests = new Set([
				...receipts.flatMap((receipt) =>
					receipt.state === "materialized" ? receipt.inputDigests : [],
				),
				...proposalEvidence.map((evidence) => evidence.digest),
				...retirementInspection.representedDigests,
			]);
			const mutationCandidates = collected.records.filter(
				(record) => record.scope === "project",
			);
			const currentDigests = mutationCandidates
				.map((record) => record.digest)
				.sort();
			const acceptedCurrentBatch = receipts.some(
				(receipt) =>
					receipt.state === "accepted" &&
					sameStrings([...receipt.inputDigests].sort(), currentDigests),
			);
			const selectedRecords = Object.freeze(
				acceptedCurrentBatch
					? mutationCandidates
					: mutationCandidates.filter(
							(record) => !representedDigests.has(record.digest),
						),
			);
			const maintenanceCommitted =
				details.writesCommitted || dischargedReceipts.length > 0;
			details = {
				...details,
				warnings: Object.freeze([
					...details.warnings,
					...retirementInspection.warnings,
				]),
				recovery:
					details.recovery === "none"
						? retirementInspection.recovery
						: details.recovery,
				writesCommitted: maintenanceCommitted,
			};
			const pressure = dependencies.indexPressure.measure(
				toIndexRecords(collected.inventory),
			);
			if (selectedRecords.length === 0) {
				details = {
					...details,
					declines: Object.freeze([
						...details.declines,
						...targetUnmetDeclines({ pressure, retirements: [] }),
					]),
				};
				return maintenanceCommitted
					? { kind: "ran" as const, details }
					: {
							kind: "noop" as const,
							reason:
								collected.records.length === 0
									? "No consolidation work was admitted from healthy sources."
									: "All admitted consolidation evidence is already represented.",
							details,
						};
			}
			const inventoryRoot = deterministicInventoryRoot(selectedRecords);
			const needsRetirementInventory = selectedRecords.some(
				(record) => structuredRetireWhen(record.metadata) !== undefined,
			);
			const inventory =
				needsRetirementInventory && inventoryRoot !== undefined
					? await inspectLivingMemoryCitationInventory({
							projectRoot: inventoryRoot,
						})
					: undefined;
			if (inventory !== undefined && !inventory.healthy) {
				details = {
					...details,
					warnings: inventory.warnings,
					declines: Object.freeze([
						...details.declines,
						{
							code: "citation-inventory-incomplete",
							reason:
								"Relevant citation discovery was incomplete; every retirement is blocked.",
						},
					]),
				};
			}
			const observedDeterministic = await observeDeterministicRecords(
				selectedRecords,
				inventory,
			);
			const deterministic = observedDeterministic.slice(
				0,
				dependencies.limits.maxObservations,
			);
			const observationCapDeferred = observedDeterministic.slice(
				dependencies.limits.maxObservations,
			);
			const needsJudgment =
				modelMode === "full" &&
				deterministic.some(
					(finding) =>
						finding.retirement !== undefined && finding.proposal === undefined,
				);
			if (deterministic.length > 0 && !needsJudgment) {
				const observedProposalFindings = deterministic.filter(
					(finding) => finding.proposal !== undefined,
				);
				const proposalFindings = observedProposalFindings.slice(
					0,
					dependencies.limits.maxProposals,
				);
				const proposalCapDeferred = observedProposalFindings.slice(
					dependencies.limits.maxProposals,
				);
				const proposals = [];
				for (const finding of proposalFindings) {
					if (finding.proposal === undefined || finding.key === undefined)
						continue;
					proposals.push(
						await dependencies.proposalStore.persist({
							batchKey: finding.key,
							observation: finding.observation,
							proposal: finding.proposal,
							dryRun,
							...(options.signal === undefined
								? {}
								: { signal: options.signal }),
						}),
					);
				}
				const observedRetirementCandidates = deterministic.flatMap(
					(finding) => {
						if (finding.retirement === undefined) return [];
						const evidence = finding.observation.inputs[0];
						if (evidence === undefined) return [];
						const record = selectedRecords.find(
							(item) =>
								item.id === evidence.id && item.sourceId === evidence.sourceId,
						);
						if (record === undefined) return [];
						return [
							{
								record,
								reason: finding.retirement.reason as
									| "superseded"
									| "merged"
									| "obsolete"
									| "retire-when-met",
								evidence: finding.observation.inputs,
								evidenceReason: finding.observation.reason,
							},
						];
					},
				);
				const retirementCandidates = observedRetirementCandidates.slice(
					0,
					dependencies.limits.maxRetirements,
				);
				const capDeferredRetirements = observedRetirementCandidates
					.slice(dependencies.limits.maxRetirements)
					.map((candidate) => ({
						path: candidate.record.path,
						digest: candidate.record.digest,
						status: "deferred" as const,
						reason: candidate.reason,
					}));
				const retirementRun =
					retirementCandidates.length === 0
						? undefined
						: await dependencies.retirementStore.apply({
								candidates: retirementCandidates,
								dryRun,
								date: dependencies.clock(),
								maxRetirements: dependencies.limits.maxRetirements,
								lockOptions: dependencies.lockOptions,
								...(options.signal === undefined
									? {}
									: { signal: options.signal }),
							});
				const reportedRetirements =
					retirementRun === undefined
						? deterministic.flatMap((finding) =>
								finding.retirement === undefined ? [] : [finding.retirement],
							)
						: [...retirementRun.details.retirements, ...capDeferredRetirements];
				details = {
					...details,
					observations: Object.freeze(
						deterministic.map((finding) => finding.observation),
					),
					retirements: Object.freeze(reportedRetirements),
					proposals: Object.freeze(proposals),
					declines: Object.freeze([
						...details.declines,
						...deterministicCapDeclines(proposalCapDeferred, "proposal"),
						...deterministicCapDeclines(observationCapDeferred, "observation"),
						...(retirementRun?.details.declines ?? []),
						...capDeferredRetirements.map((retirement) => ({
							code: "retirement-cap-deferred",
							path: retirement.path,
							reason: "The bounded retirement cap deferred this candidate.",
						})),
						...targetUnmetDeclines({
							pressure,
							retirements: reportedRetirements,
						}),
					]),
					warnings: Object.freeze([
						...details.warnings,
						...(retirementRun?.details.warnings ?? []),
					]),
					recovery: retirementRun?.details.recovery ?? details.recovery,
					writesCommitted:
						details.writesCommitted ||
						proposals.some((proposal) => proposal.status === "written") ||
						(retirementRun?.details.writesCommitted ?? false),
					...(retirementRun?.details.manifestPath === undefined
						? {}
						: { manifestPath: retirementRun.details.manifestPath }),
				};
				if (retirementRun?.kind === "failed") {
					return {
						kind: "failed" as const,
						reason: retirementRun.reason,
						details,
					};
				}
				return { kind: "ran" as const, details };
			}
			if (modelMode === "deterministic-only") {
				details = {
					...details,
					declines: Object.freeze([
						...details.declines,
						...deterministicCapDeclines(observationCapDeferred, "observation"),
						...targetUnmetDeclines({ pressure, retirements: [] }),
					]),
				};
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
					records: selectedRecords,
					deterministicObservations: deterministic.map(
						(finding) => finding.observation,
					),
				}),
				records: selectedRecords,
				deterministicObservations: Object.freeze(
					deterministic.map((finding) => finding.observation),
				),
				limits: Object.freeze({ ...dependencies.limits }),
			});
			const existingReceipt = dryRun
				? undefined
				: await dependencies.acceptedJudgmentReceiptStore.read(input.batchKey);
			const output =
				existingReceipt?.output ??
				(await dependencies.judgmentProvider.judge(input, {
					...(options.signal === undefined ? {} : { signal: options.signal }),
				}));
			throwIfAborted(options.signal);
			let normalized = validateJudgmentOutput({
				output,
				records: selectedRecords,
				limits: dependencies.limits,
			});
			let acceptedReceipt = existingReceipt;
			const receiptAcceptedThisPass = !dryRun && acceptedReceipt === undefined;
			if (!dryRun && acceptedReceipt === undefined) {
				acceptedReceipt = await dependencies.acceptedJudgmentReceiptStore.write(
					{
						schemaVersion: 1,
						batchKey: input.batchKey,
						state: "accepted",
						inputDigests: Object.freeze(
							selectedRecords.map((record) => record.digest),
						),
						output: normalizedJudgmentOutput(output),
						path: dependencies.acceptedJudgmentReceiptStore.pathFor(
							input.batchKey,
						),
					},
				);
			}
			if (acceptedReceipt !== undefined) {
				normalized = validateJudgmentOutput({
					output: acceptedReceipt.output,
					records: selectedRecords,
					limits: dependencies.limits,
				});
				details = {
					...details,
					acceptedJudgmentReceiptPath: acceptedReceipt.path,
					writesCommitted: details.writesCommitted || receiptAcceptedThisPass,
				};
			}
			const proposals = [];
			const representedEpisodes = new Map<
				string,
				Map<
					string,
					{
						readonly id: string;
						readonly digest: string;
						readonly proposalPaths: Set<string>;
					}
				>
			>();
			for (const item of normalized) {
				if (item.proposal === undefined) continue;
				const proposal = await dependencies.proposalStore.persist({
					batchKey: input.batchKey,
					observation: item.observation,
					proposal: item.proposal,
					dryRun,
					...(options.signal === undefined ? {} : { signal: options.signal }),
				});
				proposals.push(proposal);
				if (
					item.proposal.proposalKind === "create" &&
					item.proposal.record.type === "note" &&
					proposal.path !== undefined
				) {
					for (const evidence of item.observation.inputs) {
						const record = selectedRecords.find(
							(candidate) =>
								candidate.sourceId === evidence.sourceId &&
								candidate.id === evidence.id &&
								candidate.digest === evidence.digest &&
								candidate.kind === "episode" &&
								candidate.scope === "project",
						);
						if (record === undefined) continue;
						const sourceRecords =
							representedEpisodes.get(record.sourceId) ?? new Map();
						const represented = sourceRecords.get(record.id) ?? {
							id: record.id,
							digest: record.digest,
							proposalPaths: new Set<string>(),
						};
						represented.proposalPaths.add(proposal.path);
						sourceRecords.set(record.id, represented);
						representedEpisodes.set(record.sourceId, sourceRecords);
					}
				}
			}
			const retirementCandidates = deterministic.flatMap((finding) => {
				if (finding.retirement === undefined) return [];
				const evidence = finding.observation.inputs[0];
				if (evidence === undefined) return [];
				const record = selectedRecords.find(
					(item) =>
						item.id === evidence.id && item.sourceId === evidence.sourceId,
				);
				if (record === undefined) return [];
				return [
					{
						record,
						reason: finding.retirement.reason as
							| "superseded"
							| "merged"
							| "obsolete"
							| "retire-when-met",
						evidence: finding.observation.inputs,
						evidenceReason: finding.observation.reason,
					},
				];
			});
			const retirementRun =
				retirementCandidates.length === 0
					? undefined
					: await dependencies.retirementStore.apply({
							candidates: retirementCandidates,
							dryRun,
							date: dependencies.clock(),
							maxRetirements: dependencies.limits.maxRetirements,
							lockOptions: dependencies.lockOptions,
							...(options.signal === undefined
								? {}
								: { signal: options.signal }),
						});
			const modelOnlyRetirements = normalized.flatMap((item) => {
				if (item.proposal?.proposalKind !== "retire") return [];
				const evidence = item.observation.inputs[0];
				if (
					evidence === undefined ||
					deterministic.some(
						(finding) =>
							finding.retirement !== undefined &&
							finding.observation.inputs.some(
								(input) =>
									input.sourceId === evidence.sourceId &&
									input.id === evidence.id &&
									input.digest === evidence.digest,
							),
					)
				) {
					return [];
				}
				return [
					{
						path: evidence.path,
						digest: evidence.digest,
						status: "deferred" as const,
						reason: item.proposal.reason,
					},
				];
			});
			const episodePrunes: string[] = [];
			if (!dryRun && retirementRun?.kind !== "failed") {
				for (const source of dependencies.sources) {
					const represented = representedEpisodes.get(source.id);
					if (represented === undefined || represented.size === 0) continue;
					if (source.finalize === undefined) {
						throw new Error(
							`Episode source ${source.id} cannot finalize represented records.`,
						);
					}
					episodePrunes.push(
						...(await source.finalize(
							Object.freeze(
								[...represented.values()].map((record) =>
									Object.freeze({
										id: record.id,
										digest: record.digest,
										proposalPaths: Object.freeze([...record.proposalPaths]),
									}),
								),
							),
						)),
					);
				}
			}
			const shouldMaterializeReceipt =
				acceptedReceipt?.state === "accepted" &&
				retirementRun?.kind !== "failed";
			if (shouldMaterializeReceipt) {
				acceptedReceipt =
					await dependencies.acceptedJudgmentReceiptStore.markMaterialized(
						input.batchKey,
					);
			}
			const reportedRetirements = [
				...(retirementRun?.details.retirements ?? []),
				...modelOnlyRetirements,
			];
			details = {
				...details,
				observations: Object.freeze([
					...deterministic.map((finding) => finding.observation),
					...normalized.map((item) => item.observation),
				]),
				proposals: Object.freeze(proposals),
				episodePrunes: Object.freeze(episodePrunes),
				retirements: Object.freeze(reportedRetirements),
				declines: Object.freeze([
					...details.declines,
					...deterministicCapDeclines(observationCapDeferred, "observation"),
					...(retirementRun?.details.declines ?? []),
					...modelOnlyRetirements.map((retirement) => ({
						code: "retirement-authority-deferred",
						path: retirement.path,
						reason: "Model judgment alone cannot grant retirement authority.",
					})),
					...targetUnmetDeclines({
						pressure,
						retirements: reportedRetirements,
					}),
				]),
				warnings: Object.freeze([
					...details.warnings,
					...(retirementRun?.details.warnings ?? []),
				]),
				recovery: retirementRun?.details.recovery ?? details.recovery,
				writesCommitted:
					acceptedReceipt !== undefined ||
					proposals.some((proposal) => proposal.status === "written") ||
					episodePrunes.length > 0 ||
					(retirementRun?.details.writesCommitted ?? false),
				...(acceptedReceipt === undefined
					? {}
					: { acceptedJudgmentReceiptPath: acceptedReceipt.path }),
				...(retirementRun?.details.manifestPath === undefined
					? {}
					: { manifestPath: retirementRun.details.manifestPath }),
			};
			if (retirementRun?.kind === "failed") {
				return {
					kind: "failed" as const,
					reason: retirementRun.reason,
					details,
				};
			}
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

interface AcceptedEpisodeRecovery {
	readonly proposals: readonly ConsolidationProposalMaterialization[];
	readonly episodePrunes: readonly string[];
	readonly receiptPath?: string;
	readonly writesCommitted: boolean;
}

async function recoverAcceptedEpisodeFinalization(options: {
	readonly records: readonly ConsolidationSourceRecord[];
	readonly receipts: readonly AcceptedJudgmentReceipt[];
	readonly proposals: readonly ConsolidationProposalMaterialization[];
	readonly dependencies: LivingMemoryConsolidatorDependencies;
}): Promise<AcceptedEpisodeRecovery | undefined> {
	const acceptedReceipts = new Map(
		options.receipts
			.filter((receipt) => receipt.state === "accepted")
			.map((receipt) => [receipt.batchKey, receipt] as const),
	);
	const recoverable = new Map<
		string,
		Map<
			string,
			{
				readonly id: string;
				readonly digest: string;
				readonly proposalPaths: Set<string>;
				readonly receiptKeys: Set<string>;
			}
		>
	>();
	const materializations: ConsolidationProposalMaterialization[] = [];
	for (const proposal of options.proposals) {
		const receipt = acceptedReceipts.get(proposal.key);
		if (
			receipt === undefined ||
			proposal.proposalKind !== "create" ||
			proposal.outputType !== "note"
		) {
			continue;
		}
		let matched = false;
		for (const evidence of proposal.inputs) {
			if (!receipt.inputDigests.includes(evidence.digest)) continue;
			const record = options.records.find(
				(candidate) =>
					candidate.sourceId === evidence.sourceId &&
					candidate.id === evidence.id &&
					candidate.digest === evidence.digest &&
					candidate.kind === "episode" &&
					candidate.scope === "project",
			);
			if (record === undefined) continue;
			matched = true;
			const sourceRecords = recoverable.get(record.sourceId) ?? new Map();
			const represented = sourceRecords.get(record.id) ?? {
				id: record.id,
				digest: record.digest,
				proposalPaths: new Set<string>(),
				receiptKeys: new Set<string>(),
			};
			represented.proposalPaths.add(proposal.path);
			represented.receiptKeys.add(receipt.batchKey);
			sourceRecords.set(record.id, represented);
			recoverable.set(record.sourceId, sourceRecords);
		}
		if (matched) materializations.push(proposal);
	}
	if (recoverable.size === 0) return undefined;

	const episodePrunes: string[] = [];
	const completedIds = new Set<string>();
	for (const source of options.dependencies.sources) {
		const records = recoverable.get(source.id);
		if (records === undefined || records.size === 0) continue;
		if (source.finalize === undefined) {
			throw new Error(
				`Episode source ${source.id} cannot finalize represented records.`,
			);
		}
		const pruned = await source.finalize(
			Object.freeze(
				[...records.values()].map((record) =>
					Object.freeze({
						id: record.id,
						digest: record.digest,
						proposalPaths: Object.freeze([...record.proposalPaths]),
					}),
				),
			),
		);
		episodePrunes.push(...pruned);
		for (const id of pruned) completedIds.add(`${source.id}\0${id}`);
	}

	const recoverableReceiptKeys = new Set<string>();
	for (const records of recoverable.values()) {
		for (const record of records.values()) {
			for (const key of record.receiptKeys) recoverableReceiptKeys.add(key);
		}
	}
	const completedReceiptKeys = new Set<string>();
	for (const key of recoverableReceiptKeys) {
		const everyMatchingRecordPruned = [...recoverable].every(
			([sourceId, records]) =>
				[...records.values()].every(
					(record) =>
						!record.receiptKeys.has(key) ||
						completedIds.has(`${sourceId}\0${record.id}`),
				),
		);
		if (everyMatchingRecordPruned) completedReceiptKeys.add(key);
	}
	for (const key of completedReceiptKeys) {
		await options.dependencies.acceptedJudgmentReceiptStore.markMaterialized(
			key,
		);
	}
	const receipt = acceptedReceipts.get([...completedReceiptKeys][0] ?? "");
	return Object.freeze({
		proposals: Object.freeze(materializations),
		episodePrunes: Object.freeze(episodePrunes),
		...(receipt === undefined ? {} : { receiptPath: receipt.path }),
		writesCommitted: episodePrunes.length > 0 || completedReceiptKeys.size > 0,
	});
}

function toIndexRecords(
	records: readonly ConsolidationSourceInventoryRecord[],
): readonly import("./types.ts").RetrievedMemoryRecord[] {
	return Object.freeze(
		records.flatMap((record) => {
			if (record.kind !== "knowledge") return [];
			const metadata = record.metadata;
			if (
				typeof metadata.type !== "string" ||
				typeof metadata.title !== "string" ||
				typeof metadata.description !== "string" ||
				typeof metadata.resource !== "string" ||
				typeof metadata.timestamp !== "string" ||
				!Array.isArray(metadata.tags) ||
				!metadata.tags.every((tag) => typeof tag === "string")
			) {
				return [];
			}
			const scopeRoot = metadata.scopeRoot;
			return [
				Object.freeze({
					type: metadata.type,
					scope: record.scope,
					kind: "semantic" as const,
					title: metadata.title,
					description: metadata.description,
					resource: metadata.resource,
					tags: Object.freeze(metadata.tags.map((tag) => String(tag))),
					timestamp: metadata.timestamp,
					content: "",
					path:
						typeof scopeRoot === "string" && isAbsolute(scopeRoot)
							? join(scopeRoot, ...record.path.split("/"))
							: record.path,
				}),
			];
		}),
	);
}

interface DeterministicFinding {
	readonly observation: ConsolidationObservation;
	readonly retirement?: MemoryConsolidateDetails["retirements"][number];
	readonly proposal?: JudgedProposal;
	readonly key?: string;
}

function deterministicCapDeclines(
	findings: readonly DeterministicFinding[],
	kind: "observation" | "proposal",
): MemoryConsolidateDetails["declines"] {
	return Object.freeze(
		findings.map((finding) => ({
			code: `${kind}-cap-deferred`,
			...(finding.observation.inputs[0]?.path === undefined
				? {}
				: { path: finding.observation.inputs[0].path }),
			reason: `The bounded ${kind} cap deferred this deterministic finding.`,
		})),
	);
}

async function observeDeterministicRecords(
	records: readonly ConsolidationSourceRecord[],
	inventory: LivingMemoryCitationInventory | undefined,
): Promise<readonly DeterministicFinding[]> {
	const findings: DeterministicFinding[] = [];
	for (const record of records) {
		if (record.kind !== "knowledge" || record.scope !== "project") continue;
		const stale = await staleCitationFinding(record);
		if (stale !== undefined) findings.push(stale);
		const retireWhen = retireWhenFromMetadata(record.metadata);
		if (retireWhen === undefined || typeof retireWhen === "string") continue;
		const scopeRoot = record.metadata.scopeRoot;
		if (typeof scopeRoot !== "string" || !isAbsolute(scopeRoot)) continue;
		const observed = await observeContainedPath({
			root: scopeRoot,
			path: retireWhen.check.path,
		});
		if (!observed.safe) continue;
		const met =
			retireWhen.check.kind === "path-exists"
				? observed.exists
				: !observed.exists;
		if (!met) continue;
		const predicate = `${retireWhen.check.kind} ${retireWhen.check.path} observed ${String(met)}`;
		const input = evidenceRef(record);
		const inbound =
			inventory?.healthy === true
				? inventory.entries
						.filter(
							(entry) =>
								entry.scope === record.scope &&
								entry.path !== record.path &&
								entry.targets.includes(record.path),
						)
						.map(citationEvidenceRef)
				: [];
		findings.push(
			Object.freeze({
				observation: Object.freeze({
					id: `retire-condition-${createHash("sha256")
						.update(`${record.digest}\0${predicate}`)
						.digest("hex")
						.slice(0, 16)}`,
					kind: "retire-condition-met",
					inputs: Object.freeze([input, ...inbound]),
					reason: `${retireWhen.condition} (${predicate}).`,
				}),
				...(inventory?.healthy !== false
					? {
							retirement: Object.freeze({
								path: record.path,
								digest: record.digest,
								status: "deferred" as const,
								reason: "retire-when-met",
							}),
						}
					: {}),
			}),
		);
	}
	return Object.freeze(findings);
}

function citationEvidenceRef(
	entry: LivingMemoryCitationInventoryEntry,
): ConsolidationEvidenceRef {
	return Object.freeze({
		id: `citation-${createHash("sha256")
			.update(`${entry.scope}\0${entry.path}\0${entry.digest}`)
			.digest("hex")
			.slice(0, 16)}`,
		sourceId: "citation-inventory",
		scope: entry.scope,
		path: entry.path,
		digest: entry.digest,
	});
}

export interface LivingMemoryCitationInventoryEntry {
	readonly scope: "project" | "user";
	readonly path: string;
	readonly digest: string;
	readonly targets: readonly string[];
}

export interface LivingMemoryCitationInventory {
	readonly healthy: boolean;
	readonly entries: readonly LivingMemoryCitationInventoryEntry[];
	readonly warnings: readonly MemoryWarning[];
}

/** Complete, read-only inventory used as retirement authority evidence. */
export async function inspectLivingMemoryCitationInventory(options: {
	readonly projectRoot: string;
	readonly userCosmonautsRoot?: string;
}): Promise<LivingMemoryCitationInventory> {
	const projectRoot = resolve(options.projectRoot);
	const warnings: MemoryWarning[] = [];
	const candidates: Array<{
		scope: "project" | "user";
		root: string;
		path: string;
		knowledgeRoot?: string;
	}> = [];
	for (const name of ["AGENTS.md", "CLAUDE.md", "README.md", "ROADMAP.md"]) {
		await addOptionalInventoryFile({
			absolutePath: join(projectRoot, name),
			scope: "project",
			root: projectRoot,
			candidates,
			warnings,
		});
	}
	for (const relativeDirectory of [
		"docs",
		"missions/plans",
		"missions/architecture",
	]) {
		await collectInventoryMarkdown({
			directory: join(projectRoot, relativeDirectory),
			scope: "project",
			root: projectRoot,
			candidates,
			warnings,
			excludeKnowledgeInternals: false,
		});
	}
	const projectKnowledgeRoot = join(projectRoot, "knowledge");
	await collectInventoryMarkdown({
		directory: projectKnowledgeRoot,
		scope: "project",
		root: projectRoot,
		knowledgeRoot: projectKnowledgeRoot,
		candidates,
		warnings,
		excludeKnowledgeInternals: true,
	});
	if (options.userCosmonautsRoot !== undefined) {
		const userRoot = resolve(options.userCosmonautsRoot);
		const userKnowledgeRoot = join(userRoot, "knowledge");
		await collectInventoryMarkdown({
			directory: userKnowledgeRoot,
			scope: "user",
			root: userRoot,
			knowledgeRoot: userKnowledgeRoot,
			candidates,
			warnings,
			excludeKnowledgeInternals: true,
		});
	}

	const entries: LivingMemoryCitationInventoryEntry[] = [];
	for (const candidate of candidates.toSorted((a, b) =>
		`${a.scope}\0${a.path}`.localeCompare(`${b.scope}\0${b.path}`),
	)) {
		const read = await readInventoryFile(candidate.path);
		if (!read.ok) {
			warnings.push({ path: candidate.path, message: read.message });
			continue;
		}
		let files: unknown;
		if (candidate.knowledgeRoot !== undefined) {
			const physicalResource = toPosixPath(
				relative(candidate.knowledgeRoot, candidate.path),
			);
			try {
				const parsed = parseHumanKnowledgeRecord({
					raw: read.raw,
					physicalResource,
					physicalScope: candidate.scope,
					mtime: read.mtime,
				});
				if (!parsed.ok) {
					warnings.push({ path: candidate.path, message: parsed.message });
					continue;
				}
				files = matter(read.raw).data.files;
				if (
					files !== undefined &&
					(!Array.isArray(files) ||
						!files.every((value: unknown) => typeof value === "string"))
				) {
					warnings.push({
						path: candidate.path,
						message: "Knowledge record has malformed files citation metadata.",
					});
					continue;
				}
			} catch (error: unknown) {
				warnings.push({
					path: candidate.path,
					message: error instanceof Error ? error.message : String(error),
				});
				continue;
			}
		}
		const extracted = extractInventoryTargets({
			raw: read.raw,
			path: toPosixPath(relative(candidate.root, candidate.path)),
			files,
		});
		if (!extracted.ok) {
			warnings.push({ path: candidate.path, message: extracted.message });
			continue;
		}
		entries.push(
			Object.freeze({
				scope: candidate.scope,
				path: toPosixPath(relative(candidate.root, candidate.path)),
				digest: createHash("sha256").update(read.raw).digest("hex"),
				targets: Object.freeze(extracted.targets),
			}),
		);
	}
	return Object.freeze({
		healthy: warnings.length === 0,
		entries: Object.freeze(entries),
		warnings: Object.freeze(warnings),
	});
}

function deterministicInventoryRoot(
	records: readonly ConsolidationSourceRecord[],
): string | undefined {
	const roots = new Set(
		records
			.filter((record) => record.scope === "project")
			.map((record) => record.metadata.scopeRoot)
			.filter(
				(value): value is string =>
					typeof value === "string" && isAbsolute(value),
			),
	);
	return roots.size === 1 ? [...roots][0] : undefined;
}

function structuredRetireWhen(
	metadata: Readonly<Record<string, unknown>>,
): object | undefined {
	const value = metadata.retireWhen;
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? value
		: undefined;
}

async function addOptionalInventoryFile(options: {
	readonly absolutePath: string;
	readonly scope: "project" | "user";
	readonly root: string;
	readonly candidates: Array<{
		scope: "project" | "user";
		root: string;
		path: string;
		knowledgeRoot?: string;
	}>;
	readonly warnings: MemoryWarning[];
}): Promise<void> {
	try {
		const metadata = await lstat(options.absolutePath);
		if (metadata.isSymbolicLink() || !metadata.isFile()) {
			options.warnings.push({
				path: options.absolutePath,
				message: "Relevant citation source is not a regular no-follow file.",
			});
			return;
		}
		options.candidates.push({
			scope: options.scope,
			root: options.root,
			path: options.absolutePath,
		});
	} catch (error: unknown) {
		if (errorCode(error) !== "ENOENT") {
			options.warnings.push({
				path: options.absolutePath,
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}
}

async function collectInventoryMarkdown(options: {
	readonly directory: string;
	readonly scope: "project" | "user";
	readonly root: string;
	readonly knowledgeRoot?: string;
	readonly candidates: Array<{
		scope: "project" | "user";
		root: string;
		path: string;
		knowledgeRoot?: string;
	}>;
	readonly warnings: MemoryWarning[];
	readonly excludeKnowledgeInternals: boolean;
}): Promise<void> {
	let entries: Dirent[];
	try {
		const metadata = await lstat(options.directory);
		if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
			options.warnings.push({
				path: options.directory,
				message:
					"Relevant citation directory is not a regular no-follow directory.",
			});
			return;
		}
		entries = await readdir(options.directory, { withFileTypes: true });
	} catch (error: unknown) {
		if (errorCode(error) !== "ENOENT") {
			options.warnings.push({
				path: options.directory,
				message: error instanceof Error ? error.message : String(error),
			});
		}
		return;
	}
	for (const entry of entries) {
		if (
			options.excludeKnowledgeInternals &&
			options.directory === options.knowledgeRoot &&
			entry.name === "retired"
		) {
			continue;
		}
		const path = join(options.directory, entry.name);
		if (entry.isSymbolicLink()) {
			options.warnings.push({
				path,
				message: "Relevant citation discovery encountered a symlink.",
			});
		} else if (entry.isDirectory()) {
			await collectInventoryMarkdown({ ...options, directory: path });
		} else if (
			entry.isFile() &&
			entry.name.endsWith(".md") &&
			!(options.excludeKnowledgeInternals && entry.name === "index.md")
		) {
			options.candidates.push({
				scope: options.scope,
				root: options.root,
				path,
				...(options.knowledgeRoot === undefined
					? {}
					: { knowledgeRoot: options.knowledgeRoot }),
			});
		}
	}
}

async function readInventoryFile(
	path: string,
): Promise<
	| { readonly ok: true; readonly raw: string; readonly mtime: Date }
	| { readonly ok: false; readonly message: string }
> {
	try {
		const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
		try {
			const metadata = await handle.stat();
			if (!metadata.isFile()) {
				return { ok: false, message: "Citation source is not a regular file." };
			}
			return {
				ok: true,
				raw: await handle.readFile("utf-8"),
				mtime: metadata.mtime,
			};
		} finally {
			await handle.close();
		}
	} catch (error: unknown) {
		return {
			ok: false,
			message: error instanceof Error ? error.message : String(error),
		};
	}
}

function extractInventoryTargets(options: {
	readonly raw: string;
	readonly path: string;
	readonly files: unknown;
}):
	| { readonly ok: true; readonly targets: readonly string[] }
	| { readonly ok: false; readonly message: string } {
	const rawTargets: Array<{ value: string; rootRelative: boolean }> = [];
	if (Array.isArray(options.files)) {
		for (const value of options.files) {
			rawTargets.push({ value: String(value), rootRelative: true });
		}
	}
	for (const match of options.raw.matchAll(
		/\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/gu,
	)) {
		if (match[1] !== undefined) {
			rawTargets.push({ value: match[1], rootRelative: false });
		}
	}
	for (const match of options.raw.matchAll(/`([^`\n]+)`/gu)) {
		if (match[1] !== undefined && isPathShaped(match[1])) {
			rawTargets.push({ value: match[1], rootRelative: true });
		}
	}
	const targets = new Set<string>();
	for (const target of rawTargets) {
		if (isExternalOrAnchor(target.value)) continue;
		const canonical = canonicalCitation({
			value: target.value,
			citingPath: options.path,
			rootRelative: target.rootRelative,
		});
		if (canonical === undefined) {
			return {
				ok: false,
				message: `Citation target is malformed or escapes its scope: ${target.value}`,
			};
		}
		targets.add(canonical);
	}
	return { ok: true, targets: Object.freeze([...targets].sort()) };
}

function isExternalOrAnchor(value: string): boolean {
	const trimmed = value.trim();
	return trimmed.startsWith("#") || /^[a-z][a-z0-9+.-]*:/iu.test(trimmed);
}

function toPosixPath(value: string): string {
	return value.split(sep).join("/");
}

interface CitationReference {
	readonly raw: string;
	readonly canonical: string;
}

async function staleCitationFinding(
	record: ConsolidationSourceRecord,
): Promise<DeterministicFinding | undefined> {
	const scopeRoot = record.metadata.scopeRoot;
	if (typeof scopeRoot !== "string" || !isAbsolute(scopeRoot)) return undefined;
	const references = citationReferences(record);
	const stale: CitationReference[] = [];
	for (const reference of references) {
		const observed = await observeContainedPath({
			root: scopeRoot,
			path: reference.canonical,
		});
		if (observed.safe && !observed.exists) stale.push(reference);
	}
	if (stale.length === 0) return undefined;
	const replacement = proposedReplacement(record, stale);
	if (replacement === undefined) return undefined;
	const input = evidenceRef(record);
	const canonicalPaths = [
		...new Set(stale.map((item) => item.canonical)),
	].sort();
	const key = createHash("sha256")
		.update(
			JSON.stringify({
				digest: record.digest,
				paths: canonicalPaths,
			}),
		)
		.digest("hex");
	return Object.freeze({
		key,
		observation: Object.freeze({
			id: `stale-reference-${key.slice(0, 16)}`,
			kind: "stale-reference",
			inputs: Object.freeze([input]),
			reason: `${canonicalPaths.length} unresolved citation${canonicalPaths.length === 1 ? "" : "s"}: ${canonicalPaths.join(", ")}.`,
		}),
		proposal: Object.freeze({
			proposalKind: "merge",
			replacement,
		}),
	});
}

function citationReferences(
	record: ConsolidationSourceRecord,
): readonly CitationReference[] {
	const references: CitationReference[] = [];
	const citationContent = citationScanningContent(record.content);
	const files = record.metadata.files;
	if (Array.isArray(files)) {
		for (const value of files) {
			if (typeof value !== "string") continue;
			const canonical = canonicalCitation({
				value,
				citingPath: record.path,
				rootRelative: true,
			});
			if (canonical !== undefined) references.push({ raw: value, canonical });
		}
	}
	for (const match of citationContent.markdownLinks.matchAll(
		/\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/gu,
	)) {
		const raw = match[1];
		if (raw === undefined) continue;
		const canonical = canonicalCitation({
			value: raw,
			citingPath: record.path,
			rootRelative: false,
		});
		if (canonical !== undefined) references.push({ raw, canonical });
	}
	for (const match of citationContent.backtickPaths.matchAll(/`([^`\n]+)`/gu)) {
		const raw = match[1];
		if (raw === undefined || !isPathShaped(raw)) continue;
		const canonical = canonicalCitation({
			value: raw,
			citingPath: record.path,
			rootRelative: true,
		});
		if (canonical !== undefined) references.push({ raw, canonical });
	}
	const unique = new Map<string, CitationReference>();
	for (const reference of references) {
		unique.set(`${reference.raw}\0${reference.canonical}`, reference);
	}
	return Object.freeze([...unique.values()]);
}

function citationScanningContent(content: string): {
	readonly markdownLinks: string;
	readonly backtickPaths: string;
} {
	const backtickPaths = maskFencedCodeBlocks(content);
	return {
		markdownLinks: maskInlineCodeSpans(backtickPaths),
		backtickPaths,
	};
}

function maskFencedCodeBlocks(content: string): string {
	let fence: { readonly marker: string; readonly length: number } | undefined;
	return content
		.split("\n")
		.map((line) => {
			if (fence === undefined) {
				const opening = line.match(/^ {0,3}(`{3,}|~{3,})/u)?.[1];
				if (opening === undefined) return line;
				fence = { marker: opening[0] ?? "", length: opening.length };
				return maskCodeRegion(line);
			}
			const closing = line.match(/^ {0,3}(`+|~+)[\t ]*$/u)?.[1];
			const masked = maskCodeRegion(line);
			if (
				closing?.startsWith(fence.marker) === true &&
				closing.length >= fence.length
			) {
				fence = undefined;
			}
			return masked;
		})
		.join("\n");
}

function maskInlineCodeSpans(content: string): string {
	let masked = "";
	let cursor = 0;
	while (cursor < content.length) {
		const openingStart = content.indexOf("`", cursor);
		if (openingStart === -1) return masked + content.slice(cursor);
		masked += content.slice(cursor, openingStart);
		const openingEnd = endOfBacktickRun(content, openingStart);
		const openingLength = openingEnd - openingStart;
		let searchFrom = openingEnd;
		let closingEnd: number | undefined;
		while (searchFrom < content.length) {
			const candidateStart = content.indexOf("`", searchFrom);
			if (candidateStart === -1) break;
			const candidateEnd = endOfBacktickRun(content, candidateStart);
			if (candidateEnd - candidateStart === openingLength) {
				closingEnd = candidateEnd;
				break;
			}
			searchFrom = candidateEnd;
		}
		if (closingEnd === undefined) {
			masked += content.slice(openingStart, openingEnd);
			cursor = openingEnd;
			continue;
		}
		masked += maskCodeRegion(content.slice(openingStart, closingEnd));
		cursor = closingEnd;
	}
	return masked;
}

function endOfBacktickRun(content: string, start: number): number {
	let end = start;
	while (content[end] === "`") end += 1;
	return end;
}

function maskCodeRegion(content: string): string {
	return content.replace(/[^\n]/gu, " ");
}

function canonicalCitation(options: {
	readonly value: string;
	readonly citingPath: string;
	readonly rootRelative: boolean;
}): string | undefined {
	let value = options.value.trim();
	if (!value || /^[a-z][a-z0-9+.-]*:/iu.test(value) || value.startsWith("#")) {
		return undefined;
	}
	value = value.split(/[?#]/u, 1)[0] ?? "";
	try {
		value = decodeURIComponent(value);
	} catch {
		return undefined;
	}
	const projectRelative =
		options.rootRelative || /^(?:knowledge|docs|missions)\//u.test(value)
			? value.replace(/^\.\//u, "")
			: posix.join(posix.dirname(options.citingPath), value);
	const normalized = posix.normalize(projectRelative);
	return isSafeRelativePath(normalized) ? normalized : undefined;
}

function isPathShaped(value: string): boolean {
	const path = value.split(/[?#]/u, 1)[0];
	if (path === undefined || !path || /\s/u.test(value)) return false;

	const hasPathSeparator = path.includes("/");
	const hasFileExtension = /\.[A-Za-z0-9]{1,12}$/u.test(path);
	const hasExpansionOrGlob = /[{}[\]*]/u.test(path);
	const hasPlaceholder =
		/[<>$]/u.test(path) ||
		path.startsWith("~/") ||
		/(?:^|[-_.])N(?=[-_.]|$)/u.test(path);
	const hasRevisionRangeOrElision = path.includes("..");
	const hasSourceLocationSuffix = /:\d+(?::\d+)?$/u.test(path);

	return (
		hasPathSeparator &&
		hasFileExtension &&
		!hasExpansionOrGlob &&
		!hasPlaceholder &&
		!hasRevisionRangeOrElision &&
		!hasSourceLocationSuffix
	);
}

function proposedReplacement(
	record: ConsolidationSourceRecord,
	stale: readonly CitationReference[],
): ProposedMemoryRecord | undefined {
	const metadata = record.metadata;
	if (
		!["decision", "trade-off", "gotcha", "convention", "note"].includes(
			String(metadata.type),
		) ||
		typeof metadata.title !== "string" ||
		!metadata.title.trim() ||
		typeof metadata.description !== "string" ||
		!metadata.description.trim() ||
		!Array.isArray(metadata.tags) ||
		!metadata.tags.every((tag) => typeof tag === "string")
	) {
		return undefined;
	}
	const markers = [...new Set(stale.map((item) => item.canonical))]
		.sort()
		.map((path) => `<!-- stale reference: ${path} -->`)
		.join("\n");
	return {
		type: metadata.type as
			| "decision"
			| "trade-off"
			| "gotcha"
			| "convention"
			| "note",
		title: metadata.title.trim(),
		description: metadata.description.trim(),
		content: `${record.content.trimEnd()}\n\n${markers}\n`,
		tags: Object.freeze(metadata.tags.map((tag) => String(tag))),
	};
}

function retireWhenFromMetadata(metadata: Readonly<Record<string, unknown>>):
	| string
	| {
			readonly condition: string;
			readonly check: {
				readonly kind: "path-exists" | "path-absent";
				readonly path: string;
			};
	  }
	| undefined {
	const value = metadata.retireWhen;
	if (typeof value === "string" && value.trim()) return value.trim();
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return undefined;
	}
	const candidate = value as Record<string, unknown>;
	if (
		typeof candidate.condition !== "string" ||
		!candidate.condition.trim() ||
		typeof candidate.check !== "object" ||
		candidate.check === null ||
		Array.isArray(candidate.check)
	) {
		return undefined;
	}
	const check = candidate.check as Record<string, unknown>;
	if (
		(check.kind !== "path-exists" && check.kind !== "path-absent") ||
		typeof check.path !== "string" ||
		!isSafeRelativePath(check.path)
	) {
		return undefined;
	}
	return {
		condition: candidate.condition.trim(),
		check: { kind: check.kind, path: check.path },
	};
}

async function observeContainedPath(options: {
	readonly root: string;
	readonly path: string;
}): Promise<{ readonly safe: boolean; readonly exists: boolean }> {
	if (!isSafeRelativePath(options.path)) return { safe: false, exists: false };
	const root = resolve(options.root);
	try {
		const rootMetadata = await lstat(root);
		if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) {
			return { safe: false, exists: false };
		}
		const realRoot = await realpath(root);
		let current = root;
		for (const segment of options.path.split("/")) {
			current = join(current, segment);
			try {
				const metadata = await lstat(current);
				if (metadata.isSymbolicLink()) return { safe: false, exists: false };
			} catch (error: unknown) {
				if (errorCode(error) === "ENOENT") return { safe: true, exists: false };
				return { safe: false, exists: false };
			}
		}
		const realCandidate = await realpath(current);
		return {
			safe: isContainedOrEqual(realRoot, realCandidate),
			exists: isContainedOrEqual(realRoot, realCandidate),
		};
	} catch {
		return { safe: false, exists: false };
	}
}

function isSafeRelativePath(value: string): boolean {
	return (
		value.length > 0 &&
		!value.includes("\\") &&
		!value.includes("\0") &&
		!isAbsolute(value) &&
		!value
			.split("/")
			.some(
				(segment) =>
					segment.length === 0 || segment === "." || segment === "..",
			)
	);
}

function isContainedOrEqual(root: string, candidate: string): boolean {
	const path = relative(root, candidate);
	return (
		path === "" ||
		(!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path))
	);
}

function errorCode(error: unknown): string | undefined {
	return error !== null && typeof error === "object" && "code" in error
		? String((error as NodeJS.ErrnoException).code)
		: undefined;
}

function sameStrings(
	left: readonly string[],
	right: readonly string[],
): boolean {
	return (
		left.length === right.length &&
		left.every((value, index) => value === right[index])
	);
}

function targetUnmetDeclines(options: {
	readonly pressure: KnowledgeIndexPressureResult;
	readonly retirements: MemoryConsolidateDetails["retirements"];
}): MemoryConsolidateDetails["declines"] {
	return !options.pressure.targetSatisfied &&
		!options.retirements.some((retirement) => retirement.status === "applied")
		? Object.freeze([
				{
					code: "target-unmet",
					reason:
						"Knowledge index pressure remains after authority-safe project candidates are exhausted.",
				},
			])
		: Object.freeze([]);
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
			assertExactKeys(
				output,
				["kind", "inputIds", "reason", "proposal"],
				index,
			);
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

function normalizedJudgmentOutput(
	output: CorpusJudgmentOutput,
): CorpusJudgmentOutput {
	return Object.freeze({
		schemaVersion: 1,
		observations: Object.freeze(
			output.observations.map((observation) =>
				Object.freeze({
					kind: observation.kind,
					inputIds: Object.freeze([...observation.inputIds]),
					reason: observation.reason.trim(),
					...(observation.proposal === undefined
						? {}
						: {
								proposal: Object.freeze(structuredClone(observation.proposal)),
							}),
				}),
			),
		),
	});
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
	readonly deterministicObservations: readonly ConsolidationObservation[];
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
				deterministicObservations: options.deterministicObservations,
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
