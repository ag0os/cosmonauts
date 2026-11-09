import { expect, test, vi } from "vitest";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import {
	getSessionPolicy,
	getSessionRuntime,
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

test("consumer policy reaches creation, is bound with its runtime before the prompt, and is unbound at disposal", async () => {
	const child = session("consumer-hooks");
	const runtime = {} as import("../../lib/runtime.ts").CosmonautsRuntime;
	const policy: SessionPolicy = { toolPreset: "readonly" };
	child.prompt.mockImplementationOnce(async () => {
		expect(getSessionPolicy(child.sessionId)).toBe(policy);
		expect(getSessionRuntime(child.sessionId)).toBe(runtime);
		const tracker = getOrCreateTracker(child.sessionId);
		tracker.register("nested", "scribe", 1);
		tracker.complete("nested", "finished");
	});
	mocks.factory.mockResolvedValue({ session: child });
	const selectPolicy = vi.fn(() => policy);
	const spawner = createPiSpawner(new AgentRegistry([actor]), tmp.path, {
		sessionPolicies: { forAgent: selectPolicy },
		runtime,
	});
	const result = await spawner.spawn({
		role: actor.id,
		cwd: tmp.path,
		prompt: "archive",
	});
	expect(result.success).toBe(true);
	expect(selectPolicy).toHaveBeenCalledWith(actor);
	expect(mocks.factory.mock.calls.at(-1)?.[1].sessionPolicy).toBe(policy);
	expect(child.prompt).toHaveBeenLastCalledWith(
		expect.stringContaining("finished"),
	);
	expect(getSessionPolicy(child.sessionId)).toBeUndefined();
	expect(getSessionRuntime(child.sessionId)).toBeUndefined();
	expect(child.dispose).toHaveBeenCalledOnce();
});

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

test("completion delivery accepts an empty host policy", async () => {
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
	const policy: SessionPolicy = { toolPreset: "none" };
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
