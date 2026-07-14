import type {
	AgentContext,
	AgentTool,
	AgentToolResult,
} from "@earendil-works/pi-agent-core";
import { runAgentLoop } from "@earendil-works/pi-agent-core";
import type { Context, Model } from "@earendil-works/pi-ai";
import {
	createFauxCore,
	fauxAssistantMessage,
	fauxToolCall,
} from "@earendil-works/pi-ai";
import { stream as anthropicStream } from "@earendil-works/pi-ai/api/anthropic-messages";
import { Type } from "typebox";
import { describe, expect, test } from "vitest";

// Contract tests against the REAL @earendil-works/pi-* packages (no MockPi, no
// network). Cosmonauts depends on undocumented Pi behaviors that nothing in
// Pi's public API promises; each test here pins one of them so a lockstep
// version bump that shifts the behavior fails loudly instead of silently
// breaking agent memory. See missions/plans/memory-hardening/plan.md.
//
// Not covered here: pi-coding-agent's session-level wiring (the `context`
// extension event mapping onto transformContext, before_agent_start custom
// message merging, and the frozen tool allowlist). Those run only inside
// createAgentSession, which requires settings/auth scaffolding that outweighs
// the value while tests/extensions/agent-memory.test.ts pins our side of the
// composed pipeline. Re-audit that layer by hand on each Pi bump.

const CAPTURE_ONLY = "capture-only client: request intentionally not sent";

function contractModel(): Model<"anthropic-messages"> {
	return {
		id: "claude-contract-test",
		name: "Contract Test Model",
		api: "anthropic-messages",
		provider: "anthropic",
		baseUrl: "http://localhost:0",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128_000,
		maxTokens: 4_096,
	} as Model<"anthropic-messages">;
}

describe("pi contract: anthropic tool schema serialization", () => {
	// The remember tool's flat object-root schema exists because of this
	// behavior: the adapter serializes only the schema root's `properties`,
	// so a top-level union reaches the model as a zero-parameter tool.
	test("adapter serializes object-root properties and reduces a union root to zero parameters", async () => {
		let captured: {
			tools?: {
				name: string;
				input_schema: {
					type: string;
					properties: Record<string, unknown>;
					required: string[];
				};
			}[];
		} = {};
		const client = {
			messages: {
				create: (params: typeof captured) => {
					captured = params;
					throw new Error(CAPTURE_ONLY);
				},
			},
		};

		const context: Context = {
			systemPrompt: "contract",
			messages: [{ role: "user", content: "go", timestamp: 0 }],
			tools: [
				{
					name: "object_tool",
					description: "Object-rooted tool.",
					parameters: Type.Object({ foo: Type.String() }),
				},
				{
					name: "union_tool",
					description: "Union-rooted tool.",
					parameters: Type.Union([
						Type.Object({ a: Type.String() }),
						Type.Object({ b: Type.String() }),
					]),
				},
			],
		};

		const result = await anthropicStream(contractModel(), context, {
			client: client as never,
		}).result();

		expect(result.stopReason).toBe("error");
		expect(result.errorMessage).toContain(CAPTURE_ONLY);

		const objectTool = captured.tools?.find((t) => t.name === "object_tool");
		expect(objectTool?.input_schema.type).toBe("object");
		expect(objectTool?.input_schema.properties).toHaveProperty("foo");
		expect(objectTool?.input_schema.required).toEqual(["foo"]);

		const unionTool = captured.tools?.find((t) => t.name === "union_tool");
		expect(unionTool?.input_schema).toEqual({
			type: "object",
			properties: {},
			required: [],
		});
	});
});

interface DispatchProbe {
	readonly events: string[];
	readonly toolA: AgentTool;
	readonly toolB: AgentTool;
}

function createDispatchProbe(options: {
	readonly sequentialToolA: boolean;
}): DispatchProbe {
	const events: string[] = [];
	const okResult: AgentToolResult<unknown> = {
		content: [{ type: "text", text: "ok" }],
		details: {},
	};
	const makeTool = (name: string, sequential: boolean): AgentTool => ({
		name,
		label: name,
		description: `${name} contract probe`,
		parameters: Type.Object({}),
		...(sequential ? { executionMode: "sequential" as const } : {}),
		execute: async () => {
			events.push(`${name}:start`);
			await new Promise((resolve) => setTimeout(resolve, 150));
			events.push(`${name}:end`);
			return okResult;
		},
	});
	return {
		events,
		toolA: makeTool("tool_a", options.sequentialToolA),
		toolB: makeTool("tool_b", false),
	};
}

async function runToolBatch(probe: DispatchProbe): Promise<void> {
	const core = createFauxCore({});
	core.setResponses([
		fauxAssistantMessage(
			[fauxToolCall("tool_a", {}), fauxToolCall("tool_b", {})],
			{ stopReason: "toolUse" },
		),
		fauxAssistantMessage("done"),
	]);
	const context: AgentContext = {
		systemPrompt: "contract",
		messages: [],
		tools: [probe.toolA, probe.toolB],
	};
	await runAgentLoop(
		[{ role: "user", content: "go", timestamp: 0 }],
		context,
		{
			model: core.models[0] as Model<never>,
			convertToLlm: (messages) => messages as never,
		},
		async () => {},
		undefined,
		core.stream,
	);
}

describe("pi contract: same-message tool batch dispatch", () => {
	// remember declares executionMode "sequential" so two same-batch saves
	// cannot both preflight an absent name and silently bypass collision
	// confirmation. That protection is real only while the loop honors the
	// per-tool declaration.
	test("default dispatch overlaps tools in one assistant batch", async () => {
		const probe = createDispatchProbe({ sequentialToolA: false });
		await runToolBatch(probe);
		expect(probe.events.indexOf("tool_b:start")).toBeLessThan(
			probe.events.indexOf("tool_a:end"),
		);
	});

	test("one sequential tool serializes the entire batch", async () => {
		const probe = createDispatchProbe({ sequentialToolA: true });
		await runToolBatch(probe);
		expect(probe.events).toEqual([
			"tool_a:start",
			"tool_a:end",
			"tool_b:start",
			"tool_b:end",
		]);
	});
});

describe("pi contract: transformContext runs before every provider call", () => {
	// The agent-memory `context` hook (keep-newest injected index) is applied
	// through this seam. W1 shipped dead because the hook's output IS what the
	// provider sees on every call of the turn, including the post-tool-result
	// call — this pins that reach.
	test("a message injected by transformContext reaches the provider on each call of a tool-use run", async () => {
		const core = createFauxCore({});
		core.setResponses([
			fauxAssistantMessage([fauxToolCall("tool_a", {})], {
				stopReason: "toolUse",
			}),
			fauxAssistantMessage("done"),
		]);
		const probe = createDispatchProbe({ sequentialToolA: false });
		const seenCallTexts: string[][] = [];
		const context: AgentContext = {
			systemPrompt: "contract",
			messages: [],
			tools: [probe.toolA],
		};
		await runAgentLoop(
			[{ role: "user", content: "go", timestamp: 0 }],
			context,
			{
				model: core.models[0] as Model<never>,
				convertToLlm: (messages) => messages as never,
				transformContext: async (messages) => [
					{ role: "user", content: "INJECTED-MARKER", timestamp: 0 },
					...messages,
				],
			},
			async () => {},
			undefined,
			(model, streamedContext, options) => {
				seenCallTexts.push(
					streamedContext.messages.map((message) =>
						typeof message.content === "string"
							? message.content
							: JSON.stringify(message.content),
					),
				);
				return core.stream(model, streamedContext, options);
			},
		);

		expect(seenCallTexts).toHaveLength(2);
		for (const texts of seenCallTexts) {
			expect(texts.some((text) => text.includes("INJECTED-MARKER"))).toBe(true);
		}
	});
});
