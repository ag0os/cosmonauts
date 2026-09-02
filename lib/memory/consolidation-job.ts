import { createKnowledgeMemoryStore } from "./knowledge-store.ts";
import { createLivingMemoryConsolidator } from "./living-memory.ts";
import type {
	ConsolidationModelMode,
	LivingMemoryConsolidatorDependencies,
	MemoryConsolidateResult,
} from "./types.ts";

export interface LivingMemoryPayloadV1 {
	readonly kind: "living-memory.consolidate";
	readonly version: 1;
	readonly scope: "project";
	readonly dryRun: boolean;
	readonly modelMode: ConsolidationModelMode;
}

export interface LivingMemoryConsolidationJobContext {
	readonly projectRoot: string;
	readonly dependencies: LivingMemoryConsolidatorDependencies;
	readonly createConsolidator?: typeof createLivingMemoryConsolidator;
	readonly createKnowledgeStore?: typeof createKnowledgeMemoryStore;
}

export async function executeLivingMemoryConsolidationJob(
	payload: unknown,
	context: LivingMemoryConsolidationJobContext,
): Promise<MemoryConsolidateResult> {
	const input = parseLivingMemoryPayloadV1(payload);
	const createConsolidator =
		context.createConsolidator ?? createLivingMemoryConsolidator;
	const consolidator = createConsolidator(context.dependencies);
	const createKnowledgeStore =
		context.createKnowledgeStore ?? createKnowledgeMemoryStore;
	const store = createKnowledgeStore({
		projectRoot: context.projectRoot,
		consolidator,
	});
	return store.consolidate({
		dryRun: input.dryRun,
		modelMode: input.modelMode,
	});
}

export function parseLivingMemoryPayloadV1(
	payload: unknown,
): LivingMemoryPayloadV1 {
	if (
		typeof payload !== "object" ||
		payload === null ||
		Array.isArray(payload)
	) {
		throw invalidPayload("expected an object");
	}
	const candidate = payload as Record<string, unknown>;
	const keys = Object.keys(candidate).sort();
	const expectedKeys = ["dryRun", "kind", "modelMode", "scope", "version"];
	if (keys.join("\0") !== expectedKeys.join("\0")) {
		throw invalidPayload("expected the closed v1 field set");
	}
	if (candidate.kind !== "living-memory.consolidate") {
		throw invalidPayload("unsupported kind");
	}
	if (candidate.version !== 1) {
		throw invalidPayload("unsupported version");
	}
	if (candidate.scope !== "project") {
		throw invalidPayload("unsupported scope");
	}
	if (typeof candidate.dryRun !== "boolean") {
		throw invalidPayload("dryRun must be boolean");
	}
	if (
		candidate.modelMode !== "full" &&
		candidate.modelMode !== "deterministic-only"
	) {
		throw invalidPayload("unsupported modelMode");
	}
	return Object.freeze({
		kind: "living-memory.consolidate",
		version: 1,
		scope: "project",
		dryRun: candidate.dryRun,
		modelMode: candidate.modelMode,
	});
}

function invalidPayload(reason: string): Error {
	return new Error(`Invalid living-memory payload: ${reason}.`);
}
