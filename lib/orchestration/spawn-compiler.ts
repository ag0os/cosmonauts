import type { ResolvedAgentReference } from "../domains/bindings.ts";
import type {
	BackendSpec,
	RunGraph,
	RunGraphStep,
} from "../durable-runtime/index.ts";
import type {
	CompactionConfig,
	SpawnConfig,
	SpawnRuntimeContext,
} from "./types.ts";

const DEFAULT_SPAWN_SCOPE = "spawn";
const DEFAULT_SPAWN_STEP_ID = "spawn-agent";

export interface CompileSpawnToGraphOptions {
	runId: string;
	scope?: string;
	stepId?: string;
	title?: string;
	role: string;
	agentReference?: ResolvedAgentReference;
	domainContext?: string;
	cwd: string;
	model?: string;
	prompt: string;
	runtimeContext?: SpawnRuntimeContext;
	projectSkills?: readonly string[];
	skillPaths?: readonly string[];
	thinkingLevel?: SpawnConfig["thinkingLevel"];
	compaction?: CompactionConfig;
	spawnDepth?: number;
	parentSessionId?: string;
	planSlug?: string;
}

export interface DurableSpawnOptions {
	role: string;
	agentReference?: ResolvedAgentReference;
	domainContext?: string;
	cwd: string;
	model?: string;
	prompt: string;
	runtimeContext?: SpawnRuntimeContext;
	projectSkills?: string[];
	skillPaths?: string[];
	thinkingLevel?: SpawnConfig["thinkingLevel"];
	compaction?: CompactionConfig;
	spawnDepth?: number;
	parentSessionId?: string;
	planSlug?: string;
}

export interface CompiledSpawnGraph {
	scope: string;
	graph: RunGraph;
	step: RunGraphStep;
}

export function compileSpawnToGraph(
	options: CompileSpawnToGraphOptions,
): CompiledSpawnGraph {
	const spawn = durableSpawnOptions(options);
	const step: RunGraphStep = {
		id: options.stepId ?? DEFAULT_SPAWN_STEP_ID,
		runId: options.runId,
		title: options.title ?? `Spawn ${options.role}`,
		kind: "agent",
		backend: spawnAgentBackend(spawn),
		dependsOn: [],
		inputArtifacts: [],
	};

	return {
		scope: options.scope ?? DEFAULT_SPAWN_SCOPE,
		graph: { steps: [step], edges: [] },
		step,
	};
}

function spawnAgentBackend(spawn: DurableSpawnOptions): BackendSpec {
	return {
		name: "cosmonauts-subagent",
		options: {
			source: "spawn",
			spawn,
		},
	};
}

function durableSpawnOptions(
	options: CompileSpawnToGraphOptions,
): DurableSpawnOptions {
	return {
		role: options.role,
		...(options.agentReference !== undefined && {
			agentReference: options.agentReference,
		}),
		...(options.domainContext !== undefined && {
			domainContext: options.domainContext,
		}),
		cwd: options.cwd,
		...(options.model !== undefined && { model: options.model }),
		prompt: options.prompt,
		...(options.runtimeContext !== undefined && {
			runtimeContext: { ...options.runtimeContext },
		}),
		...(options.projectSkills !== undefined && {
			projectSkills: [...options.projectSkills],
		}),
		...(options.skillPaths !== undefined && {
			skillPaths: [...options.skillPaths],
		}),
		...(options.thinkingLevel !== undefined && {
			thinkingLevel: options.thinkingLevel,
		}),
		...(options.compaction !== undefined && {
			compaction: { ...options.compaction },
		}),
		...(options.spawnDepth !== undefined && { spawnDepth: options.spawnDepth }),
		...(options.parentSessionId !== undefined && {
			parentSessionId: options.parentSessionId,
		}),
		...(options.planSlug !== undefined && { planSlug: options.planSlug }),
	};
}
