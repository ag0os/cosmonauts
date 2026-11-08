import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import {
	getSessionPolicy,
	registerSessionPolicy,
	type SessionPolicy,
} from "../../lib/agents/session-policy.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { createPiSpawner } from "../../lib/orchestration/agent-spawner.ts";
import { getOrCreateTracker } from "../../lib/orchestration/spawn-tracker.ts";
import { useTempDir } from "../helpers/fs.ts";

const mocks = vi.hoisted(() => ({ factory: vi.fn() }));
vi.mock("../../lib/orchestration/session-factory.ts", () => ({
	createAgentSessionFromDefinition: mocks.factory,
}));
const tmp = useTempDir("consumer-session-policy-");
const actor: AgentDefinition = {
	id: "archivist",
	description: "Archive",
	instructions: { kind: "inline", content: "Archive" },
	model: "test/model",
	tools: "none",
	capabilities: [],
	extensions: [],
	skills: [],
	projectContext: false,
	session: "ephemeral",
	loop: false,
};
function session(sessionId: string) {
	return {
		sessionId,
		messages: [],
		model: { provider: "test", id: "model" },
		prompt: vi.fn(async () => undefined),
		dispose: vi.fn(),
		subscribe: vi.fn(() => () => undefined),
		getSessionStats: () => ({
			tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			cost: 0,
			userMessages: 1,
			toolCalls: 0,
		}),
	};
}

test("consumer policy reaches creation, pre-prompt binding, completion observation and disposal", async () => {
	const child = session("consumer-hooks");
	const policy: SessionPolicy = {
		onCreated: vi.fn(),
		onDisposed: vi.fn(),
		onCompletionWait: vi.fn(),
	};
	child.prompt.mockImplementationOnce(async () => {
		expect(getSessionPolicy(child.sessionId)).toBe(policy);
		const tracker = getOrCreateTracker(child.sessionId);
		tracker.register("nested", "scribe", 1);
		tracker.complete("nested", "finished");
	});
	mocks.factory.mockResolvedValue({ session: child });
	const selectPolicy = vi.fn(() => policy);
	const spawner = createPiSpawner(new AgentRegistry([actor]), tmp.path, {
		sessionPolicies: { forAgent: selectPolicy },
	});
	const result = await spawner.spawn({
		role: actor.id,
		cwd: tmp.path,
		prompt: "archive",
	});
	expect(result.success).toBe(true);
	expect(selectPolicy).toHaveBeenCalledWith(actor);
	expect(mocks.factory.mock.calls.at(-1)?.[1].sessionPolicy).toBe(policy);
	expect(policy.onCreated).toHaveBeenCalledWith(child);
	expect(policy.onCompletionWait).toHaveBeenCalledWith(
		[expect.stringContaining("finished")],
		300000,
	);
	expect(policy.onDisposed).toHaveBeenCalledWith(child.sessionId);
	expect(getSessionPolicy(child.sessionId)).toBeUndefined();
	expect(child.dispose).toHaveBeenCalledOnce();
});

for (const retainTranscript of [true, false]) {
	test(`transcript retention obeys the explicit host choice (${retainTranscript})`, async () => {
		const child = session(`transcript-${retainTranscript}`);
		const path = join(tmp.path, "captured.jsonl");
		mocks.factory.mockResolvedValue({ session: child, sessionFilePath: path });
		const spawner = createPiSpawner(new AgentRegistry([actor]), tmp.path);
		await expect(
			spawner.spawn({
				role: actor.id,
				cwd: tmp.path,
				prompt: "archive",
				sessionPolicy: { retainTranscript },
			}),
		).resolves.toMatchObject({ success: true });
		const transcript = readFile(
			join(tmp.path, "captured.transcript.md"),
			"utf8",
		);
		if (retainTranscript)
			await expect(transcript).resolves.toContain("archivist");
		else await expect(transcript).rejects.toMatchObject({ code: "ENOENT" });
	});
}

test("unknown actors return a spawn failure with an optional consumer provider", async () => {
	const spawner = createPiSpawner(new AgentRegistry([actor]), tmp.path, {
		sessionPolicies: { forAgent: vi.fn(() => undefined) },
	});
	await expect(
		spawner.spawn({ role: "missing", cwd: tmp.path, prompt: "archive" }),
	).resolves.toMatchObject({
		success: false,
		error: expect.stringContaining("Unknown agent role"),
	});
});

test("completion delivery accepts a host policy without optional observation callbacks", async () => {
	const child = session("optional-observers");
	child.prompt.mockImplementationOnce(async () => {
		const tracker = getOrCreateTracker(child.sessionId);
		tracker.register("nested", "scribe", 1);
		tracker.complete("nested", "finished");
	});
	mocks.factory.mockResolvedValue({ session: child });
	const spawner = createPiSpawner(new AgentRegistry([actor]), tmp.path);
	await expect(
		spawner.spawn({
			role: actor.id,
			cwd: tmp.path,
			prompt: "work",
			sessionPolicy: {},
		}),
	).resolves.toMatchObject({ success: true });
});

test("ordinary sessions leave the host binding slot vacant until a host registers a real policy", async () => {
	const child = session("late-host-binding");
	const policy = { retainTranscript: false };
	child.prompt.mockImplementationOnce(async () => {
		expect(getSessionPolicy(child.sessionId)).toBeUndefined();
		registerSessionPolicy(child.sessionId, policy);
		expect(getSessionPolicy(child.sessionId)).toBe(policy);
	});
	mocks.factory.mockResolvedValue({ session: child });
	const spawner = createPiSpawner(new AgentRegistry([actor]), tmp.path);
	await expect(
		spawner.spawn({ role: actor.id, cwd: tmp.path, prompt: "work" }),
	).resolves.toMatchObject({ success: true });
	expect(getSessionPolicy(child.sessionId)).toBeUndefined();
});
