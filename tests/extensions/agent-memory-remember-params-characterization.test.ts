import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { createAgentMemoryExtension } from "../../domains/shared/extensions/agent-memory/index.ts";
import { buildAgentIdentityMarker } from "../../lib/agents/runtime-identity.ts";
import {
	createMarkdownMemoryStore,
	type MemoryRecordDraft,
} from "../../lib/memory/index.ts";
import { useTempDir } from "../helpers/fs.ts";
import { createMockPi } from "../helpers/mocks/index.ts";

const tmp = useTempDir("agent-memory-remember-params-");

interface ToolResult {
	content: { type: "text"; text: string }[];
	details: Record<string, unknown>;
}

async function rememberWith(params: Record<string, unknown>) {
	const projectRoot = join(tmp.path, "project");
	const userRoot = join(tmp.path, "user");
	const drafts: MemoryRecordDraft[] = [];
	const pi = createMockPi({ cwd: projectRoot });
	createAgentMemoryExtension({
		userCosmonautsRoot: userRoot,
		now: () => new Date("2026-07-08T14:00:00.000Z"),
		storeFactory: (options) => {
			const real = createMarkdownMemoryStore(options);
			return {
				write: (draft: MemoryRecordDraft) => {
					drafts.push(draft);
					return real.write(draft);
				},
				retrieve: real.retrieve.bind(real),
				consolidate: real.consolidate.bind(real),
			} as never;
		},
	})(pi as never);
	await pi.fireEvent("before_agent_start", {
		systemPrompt: buildAgentIdentityMarker("main/cosmo"),
	});
	const result = (await pi.callTool("remember", params)) as ToolResult;
	return { result, drafts };
}

async function invalidReason(params: Record<string, unknown>) {
	const { result, drafts } = await rememberWith(params);
	expect(drafts).toEqual([]);
	expect(result.details.status).toBe("invalid_request");
	return { reason: result.details.reason, text: result.content[0]?.text };
}

describe("parseRememberParams through the remember tool (characterization)", () => {
	describe("invalid variants", () => {
		test("rejects an unsupported type", async () => {
			expect(await invalidReason({ type: "diary", content: "x" })).toEqual({
				reason: 'unsupported type "diary"',
				text: 'Remember request is invalid: unsupported type "diary"',
			});
		});

		test.each([
			["missing content", {}],
			["blank content", { content: "   " }],
			["non-string content", { content: 5 }],
		])("rejects %s with the short non-empty-content message", async (_n, params) => {
			expect(await invalidReason(params)).toEqual({
				reason: "content must be a non-empty string",
				text: "Remember requires non-empty content.",
			});
		});

		test.each([
			[
				"note with changeSummary",
				{ content: "x", changeSummary: "s" },
				"changeSummary is only supported for profiles",
			],
			[
				"note with confirmUpdate",
				{ content: "x", confirmUpdate: true },
				"confirmUpdate is only supported for playbooks",
			],
			[
				"profile without changeSummary",
				{ type: "profile", content: "x" },
				"profile changeSummary must be a non-empty string",
			],
			[
				"profile with blank changeSummary",
				{ type: "profile", content: "x", changeSummary: "  " },
				"profile changeSummary must be a non-empty string",
			],
			[
				"profile with project scope",
				{ type: "profile", content: "x", changeSummary: "s", scope: "project" },
				"profiles require user scope",
			],
			[
				"profile with non-semantic kind",
				{ type: "profile", content: "x", changeSummary: "s", kind: "episodic" },
				"profiles require semantic memory kind",
			],
			[
				"profile with confirmUpdate",
				{
					type: "profile",
					content: "x",
					changeSummary: "s",
					confirmUpdate: false,
				},
				"confirmUpdate is only supported for playbooks",
			],
			[
				"playbook without title",
				{ type: "playbook", content: "x", scope: "project" },
				"playbook title must be a non-empty string",
			],
			[
				"playbook without scope",
				{ type: "playbook", content: "x", title: "T" },
				"playbooks require an explicit project or user scope",
			],
			[
				"playbook with unknown scope",
				{ type: "playbook", content: "x", title: "T", scope: "session" },
				"playbooks require an explicit project or user scope",
			],
			[
				"playbook with non-procedural kind",
				{
					type: "playbook",
					content: "x",
					title: "T",
					scope: "user",
					kind: "semantic",
				},
				"playbooks require procedural memory kind",
			],
			[
				"playbook with changeSummary",
				{
					type: "playbook",
					content: "x",
					title: "T",
					scope: "user",
					changeSummary: "s",
				},
				"changeSummary is only supported for profiles",
			],
			[
				"playbook with non-boolean confirmUpdate",
				{
					type: "playbook",
					content: "x",
					title: "T",
					scope: "user",
					confirmUpdate: "yes",
				},
				"confirmUpdate must be a boolean",
			],
		])("rejects %s", async (_name, params, reason) => {
			const result = await invalidReason(params);
			expect(result.reason).toBe(reason);
			expect(result.text).toBe(`Remember request is invalid: ${reason}`);
		});
	});

	describe("accepted variants", () => {
		test("note defaults type, scope, kind, title and description from content", async () => {
			const { drafts, result } = await rememberWith({
				content: `  First line is the title\nsecond line  `,
			});
			expect(result.details.status).not.toBe("invalid_request");
			expect(drafts).toHaveLength(1);
			expect(drafts[0]).toMatchObject({
				type: "note",
				scope: "project",
				kind: "semantic",
				title: "First line is the title",
				description: "First line is the title",
				content: "First line is the title\nsecond line",
				tags: [],
			});
		});

		test("note truncates a derived title to 60 characters", async () => {
			const { drafts } = await rememberWith({ content: "t".repeat(90) });
			expect(drafts[0]?.title).toBe("t".repeat(60));
		});

		test("note keeps explicit title, description, user scope, episodic kind and trimmed string tags", async () => {
			const { drafts } = await rememberWith({
				type: "note",
				content: "body",
				title: " Given ",
				description: " Desc ",
				scope: "user",
				kind: "episodic",
				tags: [" a ", "", 3, "b"],
			});
			expect(drafts[0]).toMatchObject({
				type: "note",
				scope: "user",
				kind: "episodic",
				title: "Given",
				description: "Desc",
				tags: ["a", "b"],
			});
		});

		test.each([
			["an unknown scope", { scope: "session" }, "project"],
			["non-array tags", { tags: "solo" }, "project"],
		])("note normalizes %s to defaults", async (_n, extra, scope) => {
			const { drafts } = await rememberWith({ content: "body", ...extra });
			expect(drafts[0]).toMatchObject({ scope, kind: "semantic", tags: [] });
		});

		test("note maps an unknown kind to semantic and keeps procedural", async () => {
			const unknown = await rememberWith({ content: "body", kind: "weird" });
			expect(unknown.drafts[0]?.kind).toBe("semantic");
			const procedural = await rememberWith({
				content: "body2",
				kind: "procedural",
			});
			expect(procedural.drafts[0]?.kind).toBe("procedural");
		});

		test("profile is forced to user scope and semantic kind with a change summary", async () => {
			const { drafts, result } = await rememberWith({
				type: "profile",
				content: " I like UTC ",
				changeSummary: " added UTC ",
				scope: "user",
				kind: "semantic",
				tags: ["pref"],
			});
			expect(drafts[0]).toMatchObject({
				type: "profile",
				scope: "user",
				kind: "semantic",
				content: "I like UTC",
				tags: ["pref"],
			});
			expect(result.details).toMatchObject({
				changeSummary: "added UTC",
				type: "profile",
			});
		});

		test("playbook keeps scope, uses title as default description and defaults confirmUpdate to false", async () => {
			const { drafts, result } = await rememberWith({
				type: "playbook",
				content: "steps",
				title: " Deploy ",
				scope: "project",
				kind: "procedural",
			});
			expect(drafts[0]).toMatchObject({
				type: "playbook",
				scope: "project",
				kind: "procedural",
				title: "Deploy",
				description: "Deploy",
				content: "steps",
			});
			expect(result.details.type).toBe("playbook");
		});

		test("playbook accepts user scope, explicit description and confirmUpdate boolean", async () => {
			const { drafts } = await rememberWith({
				type: "playbook",
				content: "steps",
				title: "Release",
				scope: "user",
				description: "How to release",
				confirmUpdate: false,
			});
			expect(drafts[0]).toMatchObject({
				scope: "user",
				description: "How to release",
			});
		});
	});
});
