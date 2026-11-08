import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
	ExtensionAPI,
	InlineExtension,
} from "@earendil-works/pi-coding-agent";
import { type AgentDefinition, CosmonautsRuntime } from "cosmonauts";
import { createAgentSessionFromDefinition } from "cosmonauts/orchestration/session-factory";

const actor: AgentDefinition = {
	id: "visitor/archivist",
	description: "Consumer-owned memory actor",
	instructions: {
		kind: "inline",
		content: "Use consumer-owned memory grants.",
	},
	model: "openai-codex/gpt-5.6-sol",
	tools: "none",
	extensions: [],
	capabilities: [],
	skills: [],
	subagents: [],
	projectContext: false,
	session: "ephemeral",
	loop: false,
	memory: {
		authored: true,
		architecture: true,
		knowledge: true,
		proposals: true,
	},
};

type Handler = (event: unknown, ctx: unknown) => unknown;
interface Tool {
	name: string;
	execute: (...args: unknown[]) => Promise<unknown>;
}

/** Consumer-owned offline driver for the factories selected by real session assembly. */
async function assemble(
	projectRoot: string,
	enabled: boolean,
	memory = actor.memory,
	transcript?: string,
) {
	const runtime = await CosmonautsRuntime.create({
		projectRoot,
		projectConfig: { knowledgeSurface: { enabled } },
		agents: [{ ...actor, memory }],
	});
	let factories: readonly unknown[] = [];
	const created = await createAgentSessionFromDefinition(
		runtime.agentRegistry.resolve(actor.id),
		{
			runtime,
			role: actor.id,
			cwd: projectRoot,
			prompt: "",
			sessionPolicy: {
				...(transcript ? { transcriptPath: async () => transcript } : {}),
				resourceOptions: async (resources) => {
					factories = resources.extensionFactories;
					return {};
				},
			},
		},
		undefined,
		runtime.domainResolver,
	);
	const tools = new Map<string, Tool>();
	const handlers = new Map<string, Handler[]>();
	const pi = {
		registerTool(tool: Tool) {
			if (tools.has(tool.name)) throw new Error(`Duplicate tool: ${tool.name}`);
			tools.set(tool.name, tool);
		},
		on(event: string, handler: Handler) {
			handlers.set(event, [...(handlers.get(event) ?? []), handler]);
		},
	};
	try {
		for (const entry of factories as InlineExtension[]) {
			await (typeof entry === "function" ? entry : entry.factory)(
				pi as unknown as ExtensionAPI,
			);
		}
	} catch (error) {
		created.session.dispose();
		throw error;
	}
	return {
		created,
		tools,
		active: created.session.getActiveToolNames().sort(),
		async fire(event: string, value: unknown) {
			const results = [];
			for (const handler of handlers.get(event) ?? [])
				results.push(await handler(value, { cwd: projectRoot }));
			return results.filter((result) => result !== undefined);
		},
		async call(name: string, params: unknown) {
			const tool = tools.get(name);
			if (!tool) throw new Error(`Missing consumer tool: ${name}`);
			return tool.execute("consumer-call", params, undefined, undefined, {
				cwd: projectRoot,
			});
		},
	};
}

function prompt(id = actor.id) {
	return { systemPrompt: `<!-- COSMONAUTS_AGENT_ID:${id} -->` };
}
function details(result: unknown): Record<string, unknown> {
	if (
		!result ||
		typeof result !== "object" ||
		!("details" in result) ||
		!result.details ||
		typeof result.details !== "object"
	)
		throw new Error("Missing tool details");
	return result.details as Record<string, unknown>;
}

/** All inputs are synthetic; no repository records, content shims or model calls. */
export async function exerciseConsumerGrants(projectRoot: string) {
	const architecture = join(projectRoot, "memory", "architecture");
	await mkdir(architecture, { recursive: true });
	await writeFile(
		join(architecture, "index.md"),
		"---\ntype: code-structure-index\nresource: memory/architecture/index.md\nstatFingerprint: synthetic\n---\n\n# Consumer architecture\n\n## Module Inventory\n- `src/notes` - Consumer notes.\n",
	);
	const off = await assemble(projectRoot, false);
	let offTools: string[];
	try {
		offTools = off.active;
	} finally {
		off.created.session.dispose();
	}
	const transcript = join(projectRoot, "consumer-a.jsonl");
	const on = await assemble(projectRoot, true, actor.memory, transcript);
	try {
		const beforeTurn = details(
			await on.call("remember", { content: "Must be denied" }),
		);
		await on.fire("before_agent_start", prompt());
		const playbook = {
			type: "playbook",
			title: "Consumer routine",
			scope: "project",
			content: "ORIGINAL_CONSUMER_BODY",
		};
		const first = details(await on.call("remember", playbook));
		const pending = details(
			await on.call("remember", {
				...playbook,
				content: "CONFIRMED_CONSUMER_BODY",
			}),
		);
		const unchanged = await readFile(String(first.path), "utf8");
		const confirmed = details(
			await on.call("remember", {
				...playbook,
				content: "CONFIRMED_CONSUMER_BODY",
				confirmUpdate: true,
			}),
		);
		const persisted = await readFile(String(first.path), "utf8");
		const proposal = details(
			await on.call("propose_knowledge", {
				planSlug: "consumer-plan",
				type: "convention",
				title: "Consumer convention",
				description: "Synthetic consumer convention",
				content: "CONSUMER_PROPOSAL_BODY",
				tags: ["consumer"],
				source: "consumer/notes.md",
				sourceDate: "2026-01-01T00:00:00.000Z",
			}),
		);
		const proposalFile = await readFile(String(proposal.path), "utf8");
		const architectureRead = await on.call("architecture_map_read", {});
		const recalled = await on.call("recall", {
			query: "CONFIRMED_CONSUMER_BODY",
		});
		const injection = await on.fire("before_agent_start", prompt());
		await on.fire("before_agent_start", prompt("visitor/stranger"));
		const wrongIdentity = details(
			await on.call("remember", { content: "Denied stranger" }),
		);
		const wrongArchitecture = details(
			await on.call("architecture_map_read", {}),
		);
		await on.fire("before_agent_start", prompt());
		await on.fire("session_start", {});
		const switched = details(
			await on.call("remember", { content: "Denied after switch" }),
		);
		on.created.session.sessionManager.appendMessage({
			role: "user",
			content: "TRANSCRIPT_A_ONLY",
			timestamp: Date.now(),
		});
		const other = await assemble(
			projectRoot,
			true,
			{},
			join(projectRoot, "consumer-b.jsonl"),
		);
		try {
			other.created.session.sessionManager.appendMessage({
				role: "user",
				content: "TRANSCRIPT_B_ONLY",
				timestamp: Date.now(),
			});
			const a = await readFile(transcript, "utf8");
			const b = await readFile(join(projectRoot, "consumer-b.jsonl"), "utf8");
			const offAgain = await assemble(projectRoot, false, {});
			try {
				return {
					offTools,
					onTools: on.active,
					revokedTools: other.active,
					offAgainTools: offAgain.active,
					writes: {
						beforeTurn: beforeTurn.status,
						first: first.status,
						pending: pending.status,
						confirmed: confirmed.status,
						unchanged:
							unchanged.includes("ORIGINAL_CONSUMER_BODY") &&
							!unchanged.includes("CONFIRMED_CONSUMER_BODY"),
						persisted: persisted.includes("CONFIRMED_CONSUMER_BODY"),
						wrongIdentity: wrongIdentity.status,
						switched: switched.status,
					},
					proposal: {
						status: proposal.status,
						writer: (proposal.record as Record<string, unknown>).writer,
						persisted: proposalFile.includes("CONSUMER_PROPOSAL_BODY"),
						promoted: (await readdir(projectRoot)).includes("knowledge"),
					},
					architecture: {
						eligible: JSON.stringify(architectureRead).includes(
							"Consumer architecture",
						),
						ineligible: wrongArchitecture.status,
					},
					recall: JSON.stringify(recalled).includes("CONFIRMED_CONSUMER_BODY"),
					injected: JSON.stringify(injection).includes("Consumer routine"),
					transcripts: {
						a:
							a.includes("TRANSCRIPT_A_ONLY") &&
							!a.includes("TRANSCRIPT_B_ONLY"),
						b:
							b.includes("TRANSCRIPT_B_ONLY") &&
							!b.includes("TRANSCRIPT_A_ONLY"),
						memoryIsolated:
							!a.includes("CONFIRMED_CONSUMER_BODY") &&
							!b.includes("CONSUMER_PROPOSAL_BODY"),
					},
				};
			} finally {
				offAgain.created.session.dispose();
			}
		} finally {
			other.created.session.dispose();
		}
	} finally {
		on.created.session.dispose();
	}
}
