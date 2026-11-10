import { expect, test, vi } from "vitest";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import {
	getSessionRuntime,
	registerSessionRuntime,
	removeSessionRuntime,
	type SessionPolicy,
} from "../../lib/agents/session-policy.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { createPiSpawner } from "../../lib/orchestration/agent-spawner.ts";
import {
	getPlanSlugForSession,
	registerPlanContext,
	removePlanContext,
} from "../../lib/orchestration/plan-session-context.ts";
import {
	getOrCreateTracker,
	removeTracker,
} from "../../lib/orchestration/spawn-tracker.ts";
import { useTempDir } from "../helpers/fs.ts";
import { runtimeDouble } from "../helpers/runtime-double.ts";

const TEST_RUNTIME = runtimeDouble();

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

test("consumer policy reaches creation, its runtime is bound before the prompt, and is unbound at disposal", async () => {
	const child = session("consumer-hooks");
	const runtime = {} as import("../../lib/runtime.ts").CosmonautsRuntime;
	const policy: SessionPolicy = { toolPreset: "readonly" };
	child.prompt.mockImplementationOnce(async () => {
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
		runtime,
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
	expect(getSessionRuntime(child.sessionId)).toBeUndefined();
	expect(child.dispose).toHaveBeenCalledOnce();
});

test("unknown actors return a spawn failure with an optional consumer provider", async () => {
	const spawner = createPiSpawner(new AgentRegistry([actor]), tmp.path, {
		sessionPolicies: { forAgent: vi.fn(() => undefined) },
		runtime: TEST_RUNTIME,
	});
	await expect(
		spawner.spawn({
			runtime: TEST_RUNTIME,
			role: "missing",
			cwd: tmp.path,
			prompt: "archive",
		}),
	).resolves.toMatchObject({
		success: false,
		error: 'Unknown agent role "missing". Available agents: archivist',
	});
});

test("an unknown actor in an empty registry names the empty available list", async () => {
	const spawner = createPiSpawner(new AgentRegistry([]), tmp.path, {
		runtime: TEST_RUNTIME,
	});
	await expect(
		spawner.spawn({
			runtime: TEST_RUNTIME,
			role: "missing",
			cwd: tmp.path,
			prompt: "archive",
		}),
	).resolves.toMatchObject({
		success: false,
		error: 'Unknown agent role "missing". Available agents: (none)',
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
	const spawner = createPiSpawner(new AgentRegistry([actor]), tmp.path, {
		runtime: TEST_RUNTIME,
	});
	await expect(
		spawner.spawn({
			runtime: TEST_RUNTIME,
			role: actor.id,
			cwd: tmp.path,
			prompt: "work",
			sessionPolicy: {},
		}),
	).resolves.toMatchObject({ success: true });
});

test("a policy-free spawn binds its runtime before the prompt and unbinds at disposal", async () => {
	const child = session("policy-free-binding");
	const seen: unknown[] = [];
	child.prompt.mockImplementationOnce(async () => {
		seen.push(getSessionRuntime(child.sessionId));
	});
	mocks.factory.mockResolvedValue({ session: child });
	const spawner = createPiSpawner(new AgentRegistry([actor]), tmp.path, {
		runtime: TEST_RUNTIME,
	});
	await expect(
		spawner.spawn({
			runtime: TEST_RUNTIME,
			role: actor.id,
			cwd: tmp.path,
			prompt: "work",
		}),
	).resolves.toMatchObject({ success: true });
	expect(mocks.factory.mock.calls.at(-1)?.[1].sessionPolicy).toBeUndefined();
	expect(seen).toEqual([TEST_RUNTIME]);
	expect(getSessionRuntime(child.sessionId)).toBeUndefined();
});

test("a failed policy-free spawn still unbinds its runtime", async () => {
	const child = session("policy-free-failure");
	child.prompt.mockRejectedValueOnce(new Error("prompt failed"));
	mocks.factory.mockResolvedValue({ session: child });
	const spawner = createPiSpawner(new AgentRegistry([actor]), tmp.path, {
		runtime: TEST_RUNTIME,
	});
	await expect(
		spawner.spawn({
			runtime: TEST_RUNTIME,
			role: actor.id,
			cwd: tmp.path,
			prompt: "work",
		}),
	).resolves.toMatchObject({ success: false, error: "prompt failed" });
	expect(getSessionRuntime(child.sessionId)).toBeUndefined();
	expect(child.dispose).toHaveBeenCalledOnce();
});

test("a session id that is already bound is disposed and refused, and the other session keeps its state", async () => {
	const child = session("already-bound");
	const original = runtimeDouble();
	registerSessionRuntime(child.sessionId, original);
	const otherTracker = getOrCreateTracker(child.sessionId);
	registerPlanContext(child.sessionId, "other-plan");
	try {
		mocks.factory.mockResolvedValue({ session: child });
		const spawner = createPiSpawner(new AgentRegistry([actor]), tmp.path, {
			runtime: TEST_RUNTIME,
		});
		await expect(
			spawner.spawn({
				runtime: TEST_RUNTIME,
				role: actor.id,
				cwd: tmp.path,
				prompt: "work",
			}),
		).resolves.toMatchObject({
			success: false,
			error: "Duplicate host session binding: already-bound",
		});
		expect(child.dispose).toHaveBeenCalledOnce();
		expect(child.prompt).not.toHaveBeenCalled();
		expect(getSessionRuntime(child.sessionId)).toBe(original);
		expect(getOrCreateTracker(child.sessionId)).toBe(otherTracker);
		expect(getPlanSlugForSession(child.sessionId)).toBe("other-plan");
	} finally {
		removeSessionRuntime(child.sessionId);
		removeTracker(child.sessionId);
		removePlanContext(child.sessionId);
	}
});
