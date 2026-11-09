import { expect, test, vi } from "vitest";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import {
	getSessionPolicy,
	getSessionRuntime,
	type SessionPolicy,
	type SessionPolicyProvider,
} from "../../lib/agents/session-policy.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { createPiSpawner } from "../../lib/orchestration/agent-spawner.ts";
import { useTempDir } from "../helpers/fs.ts";
import { runtimeDouble } from "../helpers/runtime-double.ts";

const mocks = vi.hoisted(() => ({ factory: vi.fn() }));
vi.mock("../../lib/orchestration/session-factory.ts", () => ({
	createAgentSessionFromDefinition: mocks.factory,
}));
const tmp = useTempDir("spawner-runtime-isolation-");
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
const registry = new AgentRegistry([actor]);

function session(sessionId: string) {
	return {
		sessionId,
		messages: [],
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

function project(name: string) {
	const policy: SessionPolicy = { toolPreset: "readonly" };
	const sessionPolicies: SessionPolicyProvider = {
		forAgent: vi.fn(() => policy),
	};
	const runtime = runtimeDouble({ sessionPolicies });
	const child = session(`${name}-session`);
	const bound: { runtime?: unknown; policy?: unknown } = {};
	child.prompt.mockImplementationOnce(async () => {
		bound.runtime = getSessionRuntime(child.sessionId);
		bound.policy = getSessionPolicy(child.sessionId);
	});
	return { runtime, policy, sessionPolicies, child, bound };
}

test("each project's spawner binds and assembles with its own runtime and policies", async () => {
	const first = project("first");
	const second = project("second");
	for (const current of [first, second]) {
		mocks.factory.mockResolvedValueOnce({ session: current.child });
		const spawner = createPiSpawner(registry, tmp.path, {
			runtime: current.runtime,
		});
		const result = await spawner.spawn({
			runtime: current.runtime,
			role: actor.id,
			cwd: tmp.path,
			prompt: "archive",
		});
		expect(result).toMatchObject({ success: true });
	}

	const [firstCall, secondCall] = mocks.factory.mock.calls;
	expect(firstCall?.[1].runtime).toBe(first.runtime);
	expect(firstCall?.[1].sessionPolicy).toBe(first.policy);
	expect(secondCall?.[1].runtime).toBe(second.runtime);
	expect(secondCall?.[1].sessionPolicy).toBe(second.policy);
	expect(first.bound).toEqual({ runtime: first.runtime, policy: first.policy });
	expect(first.bound.runtime).toBe(first.runtime);
	expect(second.bound.runtime).toBe(second.runtime);
	expect(first.sessionPolicies.forAgent).toHaveBeenCalledExactlyOnceWith(actor);
	expect(second.sessionPolicies.forAgent).toHaveBeenCalledExactlyOnceWith(
		actor,
	);
});

test("a spawner refuses a spawn that carries another project's runtime", async () => {
	mocks.factory.mockClear();
	const own = project("own");
	const foreign = project("foreign");
	const spawner = createPiSpawner(registry, tmp.path, { runtime: own.runtime });

	const result = await spawner.spawn({
		runtime: foreign.runtime,
		role: actor.id,
		cwd: tmp.path,
		prompt: "archive",
	});

	expect(result).toEqual({
		success: false,
		sessionId: "",
		messages: [],
		error:
			"Spawn runtime differs from the spawner's runtime; a spawner serves only the project runtime it was created with.",
	});
	expect(mocks.factory).not.toHaveBeenCalled();
	expect(own.sessionPolicies.forAgent).not.toHaveBeenCalled();
	expect(foreign.sessionPolicies.forAgent).not.toHaveBeenCalled();
});

test("an explicit policy provider overrides the runtime's own", async () => {
	mocks.factory.mockClear();
	const current = project("override");
	const override: SessionPolicy = { toolPreset: "none" };
	const sessionPolicies: SessionPolicyProvider = {
		forAgent: vi.fn(() => override),
	};
	mocks.factory.mockResolvedValueOnce({ session: current.child });
	const spawner = createPiSpawner(registry, tmp.path, {
		runtime: current.runtime,
		sessionPolicies,
	});

	await spawner.spawn({
		runtime: current.runtime,
		role: actor.id,
		cwd: tmp.path,
		prompt: "archive",
	});

	expect(mocks.factory.mock.calls[0]?.[1].sessionPolicy).toBe(override);
	expect(current.sessionPolicies.forAgent).not.toHaveBeenCalled();
});
