import {
	type AgentDefinition,
	CosmonautsRuntime,
	type NamedChain,
} from "cosmonauts";
import { normalizeChain, selectChain } from "cosmonauts/chains";
import { createSessionExtension } from "cosmonauts/extensions/orchestration";
import { runStage } from "cosmonauts/orchestration/chain-runner";
import { createAgentSessionFromDefinition } from "cosmonauts/orchestration/session-factory";
import type { SpawnConfig } from "cosmonauts/orchestration/types";
import {
	consumerChainAdapter,
	consumerChains,
	consumerSessionPolicies,
} from "./policies.ts";

// A readonly, ephemeral, low-effort explorer.
// The consumer supplies its own voice rather than borrowing content resources.
export const explorer: AgentDefinition = {
	id: "visitor/explorer",
	description: "Readonly exploration and fact-finding",
	instructions: { kind: "inline", content: "Explore files and report facts." },
	model: "openai-codex/gpt-5.6-sol",
	tools: "readonly",
	capabilities: [],
	extensions: ["orchestration"],
	skills: [],
	subagents: [],
	projectContext: false,
	session: "ephemeral",
	loop: false,
	thinkingLevel: "low",
	memory: {},
};

// A memory/session-focused agent with no tasks, Drive, specialists or
// orchestration resources.
export const notebook: AgentDefinition = {
	...explorer,
	id: "visitor/notebook",
	description: "Consumer assistant with authored memory and episodes",
	instructions: { kind: "inline", content: "Remember useful facts." },
	tools: "none",
	extensions: [],
	session: "persistent",
	thinkingLevel: "high",
	memory: { authored: true, episodes: true },
};

// The shipped verify chain's single-stage topology, assigned to our explorer.
// This ports the declaration shape, not quality review's sealed behavior.
export const inspect: NamedChain = {
	name: "inspect",
	description: "Explore once and report facts",
	episodes: true,
	stages: [{ name: "visitor/explorer", prompt: "Report the project facts." }],
};

export async function createConsumerRuntime(
	projectRoot: string,
	knowledgeEnabled = false,
) {
	return CosmonautsRuntime.create({
		projectRoot,
		projectConfig: { knowledgeSurface: { enabled: knowledgeEnabled } },
		extensionProviders: { orchestration: createSessionExtension },
		workerAgent: "visitor/explorer",
		agents: [explorer, notebook],
		chains: [inspect],
	});
}

/** Exercise public execution/session seams offline; no prompt is sent to Pi. */
export async function exerciseConsumer(
	projectRoot: string,
	knowledgeEnabled = false,
) {
	const runtime = await createConsumerRuntime(projectRoot, knowledgeEnabled);
	const selection = selectChain("inspect", runtime.chains);
	const normalized = normalizeChain({
		runtime,
		projectRoot,
		registry: runtime.agentRegistry,
		steps: selection.steps,
	});
	if (!normalized.ok) throw new Error("Consumer normalization failed");
	const stage = normalized.stages[0];
	if (!stage || "kind" in stage) throw new Error("Expected one ordinary stage");
	const spawns: SpawnConfig[] = [];
	const chain = await runStage(
		stage,
		{
			runtime,
			projectRoot,
			registry: runtime.agentRegistry,
			steps: selection.steps,
			episodes: selection.episodes,
		},
		{
			async spawn(config) {
				spawns.push(config);
				return { success: true, sessionId: "offline", messages: [] };
			},
			dispose() {},
		},
	);
	const tools: Record<string, string[]> = {};
	for (const id of ["visitor/explorer", "visitor/notebook"]) {
		const created = await createAgentSessionFromDefinition(
			runtime.agentRegistry.resolve(id),
			{ runtime, role: id, cwd: projectRoot, prompt: "" },
			undefined,
			runtime.domainResolver,
		);
		try {
			tools[id] = created.session.getActiveToolNames().sort();
		} finally {
			created.session.dispose();
		}
	}
	return {
		domains: runtime.domains.map((domain) => domain.manifest.id),
		domainsDir: runtime.domainsDir ?? null,
		normalized: {
			adapterAbsent: runtime.chainAdapter === undefined,
			declarationId: stage.declarationId,
			loop: stage.loop,
		},
		workerAgent: runtime.workerAgent,
		agentIds: runtime.agentRegistry
			.listAll()
			.map((agent) => agent.id)
			.sort(),
		chain: { success: chain.success, iterations: chain.iterations },
		episodes: selection.episodes,
		spawns: spawns.map((config) => ({
			role: config.role,
			prompt: config.prompt,
			model: config.model,
			sameRuntime: config.runtime === runtime,
		})),
		tools,
		policies: await exerciseConsumerPolicies(projectRoot),
	};
}

export {
	consumerChainAdapter,
	consumerChains,
	consumerSessionPolicies,
	createConsumerSessionPolicy,
} from "./policies.ts";

/** Offline protocol proof reused in process and in the separate installed copy. */
async function exerciseConsumerPolicies(projectRoot: string) {
	const runtime = await CosmonautsRuntime.create({
		projectRoot,
		projectConfig: {},
		agents: [
			"planner",
			"plan-reviewer",
			"task-manager",
			"coordinator",
			"checkpoint",
			"policy-reader",
			"forbidden",
		].map((id) => ({
			...explorer,
			id: `visitor/${id}`,
			extensions: id === "planner" ? ["orchestration"] : [],
			subagents: id === "planner" ? ["visitor/forbidden"] : [],
			loop: id === "coordinator",
		})),
		chains: consumerChains,
		chainAdapter: consumerChainAdapter,
		sessionPolicies: consumerSessionPolicies,
		extensionProviders: { orchestration: createSessionExtension },
	});
	const config = {
		runtime,
		projectRoot,
		registry: runtime.agentRegistry,
		chainAdapter: runtime.chainAdapter,
		episodes: false,
	};
	const selected = selectChain("review-cycle", runtime.chains);
	const review = normalizeChain({ ...config, steps: selected.steps });
	if (!review.ok) throw new Error(JSON.stringify(review.errors));
	let spawns = 0;
	const spawner = {
		async spawn() {
			spawns++;
			return { success: true, sessionId: "consumer-loop", messages: [] };
		},
		dispose() {},
	};
	const loop = await runStage(
		{
			name: "coordinator",
			loop: true,
			completionPolicy: {
				kind: "state",
				evaluate: async () => ({
					status: spawns >= 2 ? "complete" : "pending",
				}),
			},
		},
		{ ...config, steps: [] },
		spawner,
	);
	const terminal = await runStage(
		{
			name: "coordinator",
			loop: true,
			completionPolicy: {
				kind: "state",
				evaluate: async () => ({
					status: "terminal",
					reason: "Consumer scope exhausted",
				}),
			},
		},
		{ ...config, steps: [] },
		spawner,
	);
	let terminalSpawns = 0;
	const terminalAfterOne = await runStage(
		{
			name: "coordinator",
			loop: true,
			completionPolicy: {
				kind: "state",
				evaluate: async () =>
					terminalSpawns
						? { status: "terminal", reason: "Consumer scope became terminal" }
						: { status: "pending" },
			},
		},
		{ ...config, steps: [] },
		{
			async spawn() {
				terminalSpawns++;
				return { success: true, sessionId: "consumer-terminal", messages: [] };
			},
			dispose() {},
		},
	);

	const checkpoint = await runStage(
		{ name: "checkpoint" },
		{ ...config, steps: [] },
		spawner,
	);
	const refused = await runStage(
		{ name: "checkpoint", terminalGate: "missing" },
		{ ...config, steps: [] },
		spawner,
	);
	const reader = runtime.agentRegistry.resolve("visitor/policy-reader");
	const session = await createAgentSessionFromDefinition(
		reader,
		{
			runtime,
			role: "visitor/policy-reader",
			cwd: projectRoot,
			prompt: "",
			sessionPolicy: runtime.sessionPolicies?.forAgent(reader),
		},
		undefined,
		runtime.domainResolver,
	);
	let tools: string[];
	try {
		tools = session.session.getActiveToolNames().sort();
	} finally {
		session.session.dispose();
	}
	return {
		purposes: review.stages.map((stage) =>
			"kind" in stage ? undefined : stage.purpose?.kind,
		),
		requiresTarget: review.stages.map((stage) =>
			"kind" in stage ? false : stage.requiresPlanReviewTarget,
		),
		loop: { success: loop.success, iterations: loop.iterations },
		terminalAfterOne: {
			success: terminalAfterOne.success,
			iterations: terminalAfterOne.iterations,
			error: terminalAfterOne.error,
		},
		terminalSpawns,
		terminal: {
			success: terminal.success,
			iterations: terminal.iterations,
			error: terminal.error,
		},
		checkpoint: { success: checkpoint.success, summary: checkpoint.summary },
		refused: { success: refused.success, error: refused.error },
		spawns,
		tools,
		denial: await exerciseConsumerDenial(runtime, projectRoot),
	};
}

async function exerciseConsumerDenial(
	runtime: CosmonautsRuntime,
	projectRoot: string,
) {
	const tools = new Map<
		string,
		{ execute: (...args: unknown[]) => Promise<unknown> }
	>();
	const extension = createSessionExtension({
		runtime,
		agentId: "visitor/planner",
		memory: {
			knowledge: false,
			authored: false,
			architecture: false,
			proposals: false,
			episodes: false,
		},
	});
	await (typeof extension === "function" ? extension : extension.factory)({
		registerTool(tool: {
			name: string;
			execute: (...args: unknown[]) => Promise<unknown>;
		}) {
			tools.set(tool.name, tool);
		},
		on() {},
		registerMessageRenderer() {},
		sendMessage() {},
		sendUserMessage() {
			throw new Error("Denied delegation must not prompt a session");
		},
	} as never);
	const spawn = tools.get("spawn_agent");
	if (!spawn) throw new Error("Consumer spawn tool missing");
	const denied = await spawn.execute(
		"consumer-denial",
		{ role: "visitor/forbidden", prompt: "delegate" },
		undefined,
		undefined,
		{
			cwd: projectRoot,
			getSystemPrompt: () => "<!-- COSMONAUTS_AGENT_ID:visitor/planner -->",
			sessionManager: { getSessionId: () => "consumer-denial" },
		},
	);
	return consumerDenialResult(denied);
}

function consumerDenialResult(value: unknown) {
	if (!value || typeof value !== "object")
		throw new Error("Consumer denial missing");
	const result = value as {
		details?: { status?: unknown };
		content?: Array<{ text?: unknown }>;
	};
	const text = result.content?.[0]?.text;
	if (result.details?.status !== "denied" || typeof text !== "string")
		throw new Error("Consumer denial missing");
	return { status: result.details.status, text };
}

export { exerciseConsumerGrants } from "./grants.ts";
