import { describe, expect, it } from "vitest";
import { assertRawSourcePromptExportable } from "../../lib/agent-packages/compatibility.ts";
import type { AgentPackageDefinition } from "../../lib/agent-packages/types.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";

const baseDefinition = {
	schemaVersion: 1,
	id: "planner-claude",
	description: "Planner packaged for Claude.",
	sourceAgent: "coding/planner",
	prompt: { kind: "source-agent" },
	tools: { preset: "readonly" },
	skills: { mode: "source-agent" },
	projectContext: "omit",
	targets: { "claude-cli": {} },
} satisfies AgentPackageDefinition;

function makeAgent(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
	return {
		id: "planner",
		domain: "coding",
		description: "Plans implementation work.",
		capabilities: ["core"],
		model: "anthropic/claude-sonnet-4-5",
		tools: "readonly",
		extensions: [],
		skills: [],
		projectContext: false,
		session: "ephemeral",
		loop: false,
		...overrides,
	};
}

describe("assertRawSourcePromptExportable", () => {
	it("rejects raw source-agent prompts and names every incompatible feature", () => {
		const sourceAgent = makeAgent({
			capabilities: ["core", "spawning", "tasks", "todo", "drive"],
			extensions: ["orchestration", "tasks"],
			subagents: ["worker", "reviewer"],
		});

		expect(() =>
			assertRawSourcePromptExportable({
				definition: baseDefinition,
				sourceAgent,
			}),
		).toThrow(
			/extensions.*orchestration.*tasks.*subagents.*worker.*reviewer.*extension-backed capabilities.*spawning.*tasks.*todo.*drive/s,
		);
	});

	it("allows raw source-agent prompts for agents without incompatible features", () => {
		const sourceAgent = makeAgent({
			capabilities: ["core", "coding-readonly"],
		});

		expect(() =>
			assertRawSourcePromptExportable({
				definition: baseDefinition,
				sourceAgent,
			}),
		).not.toThrow();
	});

	it.each([
		"file",
		"inline",
	] as const)("does not reject %s prompts that reference nonportable source agents", (kind) => {
		const sourceAgent = makeAgent({
			capabilities: ["spawning", "tasks", "todo", "drive"],
			extensions: ["orchestration"],
			subagents: ["worker"],
		});
		const definition: AgentPackageDefinition = {
			...baseDefinition,
			prompt:
				kind === "file"
					? { kind, path: "/prompts/planner.md" }
					: { kind, content: "External-safe planner prompt." },
		};

		expect(() =>
			assertRawSourcePromptExportable({ definition, sourceAgent }),
		).not.toThrow();
	});
});
