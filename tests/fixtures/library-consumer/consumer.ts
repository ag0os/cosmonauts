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

// Port of bundled/coding/agents/explorer.ts: readonly, ephemeral, low effort.
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

// Port of domains/main/agents/cosmo.ts's memory/session slice, without its
// content-specific tasks, Drive, specialists or orchestration resources.
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
	};
}
