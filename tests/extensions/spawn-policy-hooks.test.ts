import { afterEach, expect, test, vi } from "vitest";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import {
	getSessionRuntime,
	registerSessionRuntime,
	removeSessionRuntime,
	type SessionSpawnPolicy,
} from "../../lib/agents/session-policy.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { registerSpawnTool } from "../../lib/extensions/orchestration/spawn-tool.ts";
import {
	getPlanSlugForSession,
	registerPlanContext,
	removePlanContext,
} from "../../lib/orchestration/plan-session-context.ts";
import {
	getOrCreateTracker,
	removeTracker,
} from "../../lib/orchestration/spawn-tracker.ts";
import type { CosmonautsRuntime } from "../../lib/runtime.ts";
import { createMockPi, flushAsync } from "./orchestration-helpers.ts";

const mocks = vi.hoisted(() => ({ factory: vi.fn() }));
vi.mock("../../lib/orchestration/session-factory.ts", () => ({
	createAgentSessionFromDefinition: mocks.factory,
}));
const parentId = "consumer-spawn-policy";
afterEach(() => {
	removeSessionRuntime(parentId);
	removeTracker(parentId);
	vi.clearAllMocks();
});
function actor(id: string, subagents: string[] = []): AgentDefinition {
	return {
		id,
		domain: "studio",
		description: "Consumer",
		model: "test/model",
		tools: "none",
		capabilities: [],
		extensions: [],
		skills: [],
		projectContext: false,
		session: "ephemeral",
		loop: false,
		subagents,
	};
}
function consumerRuntime(policy: SessionSpawnPolicy): CosmonautsRuntime {
	return {
		agentRegistry: new AgentRegistry([
			actor("lead", ["reader"]),
			actor("reader"),
		]),
		domainContext: "studio",
		domainsDir: "/consumer/domains",
		domainResolver: {},
		projectSkills: [],
		skillPaths: [],
		sessionPolicies: {
			forAgent: () => undefined,
			spawnPolicy: vi.fn(() => policy),
		},
	} as unknown as CosmonautsRuntime;
}
function setup(policy: SessionSpawnPolicy, bootstrapPolicy = policy) {
	const runtime = consumerRuntime(policy);
	const bootstrapRuntime =
		bootstrapPolicy === policy ? runtime : consumerRuntime(bootstrapPolicy);
	const bootstrap = vi.fn(async () => bootstrapRuntime);
	const pi = createMockPi("/untrusted/checkout", {
		sessionId: parentId,
		systemPrompt: "<!-- COSMONAUTS_AGENT_ID:studio/lead -->",
	});
	registerSessionRuntime(parentId, runtime);
	registerSpawnTool(pi as never, bootstrap);
	const tracker = getOrCreateTracker(parentId, undefined, {
		deliveryMode: "external",
	});
	return { pi, bootstrap, tracker, runtime };
}
function child() {
	return {
		sessionId: "consumer-child",
		model: { provider: "test", id: "model" },
		messages: [
			{ role: "assistant", content: [{ type: "text", text: "finished" }] },
		],
		prompt: vi.fn(async () => undefined),
		subscribe: vi.fn(() => () => undefined),
		dispose: vi.fn(),
	};
}

test("host denial is enforced even when normal agent delegation would allow the target", async () => {
	const authorize = vi.fn(() => "host refused");
	const { pi, bootstrap, runtime } = setup({ authorize });
	await expect(
		pi.callTool("spawn_agent", {
			role: "reader",
			prompt: "work",
			model: "test/chosen",
			thinkingLevel: "high",
		}),
	).resolves.toMatchObject({
		content: [{ type: "text", text: "spawn_agent denied: host refused" }],
		details: { status: "denied" },
	});
	expect(authorize).toHaveBeenCalledWith({
		callerRole: "studio/lead",
		resolvedTargetRole: "studio/reader",
		prompt: "work",
		model: "test/chosen",
		thinkingLevel: "high",
	});
	expect(runtime.sessionPolicies?.spawnPolicy).toHaveBeenCalledWith(parentId);
	expect(bootstrap).not.toHaveBeenCalled();
	expect(mocks.factory).not.toHaveBeenCalled();
});

test("a nested session is authorized by its bound runtime's provider, not by checkout discovery", async () => {
	const { pi, bootstrap } = setup(
		{ authorize: () => "bound host refused" },
		{ authorize: () => undefined },
	);
	await expect(
		pi.callTool("spawn_agent", { role: "reader", prompt: "work" }),
	).resolves.toMatchObject({
		content: [{ type: "text", text: "spawn_agent denied: bound host refused" }],
	});
	expect(bootstrap).not.toHaveBeenCalled();
	expect(mocks.factory).not.toHaveBeenCalled();
});

test("an unbound session is authorized by the discovered runtime's provider", async () => {
	const { pi, bootstrap } = setup(
		{ authorize: () => undefined },
		{ authorize: () => "discovered host refused" },
	);
	removeSessionRuntime(parentId);
	await expect(
		pi.callTool("spawn_agent", { role: "reader", prompt: "work" }),
	).resolves.toMatchObject({
		content: [
			{ type: "text", text: "spawn_agent denied: discovered host refused" },
		],
	});
	expect(bootstrap).toHaveBeenCalledWith("/untrusted/checkout");
	expect(mocks.factory).not.toHaveBeenCalled();
});

test("a host provider without a spawn policy leaves delegation to ordinary authorization", async () => {
	const session = child();
	const { pi, tracker, runtime } = setup({ authorize: () => "unused" });
	if (!runtime.sessionPolicies) throw new Error("Missing test policy provider");
	delete (runtime.sessionPolicies as { spawnPolicy?: unknown }).spawnPolicy;
	mocks.factory.mockResolvedValue({ session, resolvedModel: session.model });
	const result = (await pi.callTool("spawn_agent", {
		role: "reader",
		prompt: "work",
	})) as { details: { status: string } };
	expect(result.details.status).toBe("accepted");
	await tracker.nextCompletion();
	await flushAsync();
	expect(mocks.factory).toHaveBeenCalledOnce();
});

test("an authorized detached child runs with the request and the target's host session policy", async () => {
	const session = child();
	const childPolicy = { toolPreset: "none" as const };
	const { pi, tracker, bootstrap, runtime } = setup({
		authorize: () => undefined,
	});
	const select = vi.fn(() => childPolicy);
	if (!runtime.sessionPolicies) throw new Error("Missing test policy provider");
	runtime.sessionPolicies.forAgent = select;
	mocks.factory.mockResolvedValue({ session, resolvedModel: session.model });
	const result = (await pi.callTool("spawn_agent", {
		role: "reader",
		prompt: "operator text",
		model: "test/chosen",
	})) as { details: { status: string; spawnId: string } };
	expect(result.details.status).toBe("accepted");
	const completion = await tracker.nextCompletion();
	await flushAsync();
	expect(completion.type).toBe("spawn_completed");
	expect(bootstrap).not.toHaveBeenCalled();
	expect(select).toHaveBeenCalledWith(
		expect.objectContaining({ id: "reader" }),
	);
	expect(mocks.factory.mock.calls[0]?.[1]).toMatchObject({
		cwd: "/untrusted/checkout",
		prompt: "operator text",
		model: "test/chosen",
		sessionPolicy: childPolicy,
	});
	expect(session.dispose).toHaveBeenCalledOnce();
});

test("a failed session factory fails the tracked child", async () => {
	const { pi, tracker } = setup({ authorize: () => undefined });
	mocks.factory.mockRejectedValue(new Error("factory failed"));
	const result = (await pi.callTool("spawn_agent", {
		role: "reader",
		prompt: "work",
	})) as { details: { spawnId: string } };
	await expect(tracker.nextCompletion()).resolves.toMatchObject({
		type: "spawn_failed",
		spawnId: result.details.spawnId,
	});
});

for (const bound of [false, true]) {
	test(`ordinary spawning supports an unbound host or a registered runtime (${bound})`, async () => {
		const { pi, tracker, bootstrap, runtime } = setup({
			authorize: () => undefined,
		});
		removeSessionRuntime(parentId);
		if (bound) registerSessionRuntime(parentId, runtime);
		const session = child();
		mocks.factory.mockResolvedValue({ session });
		await expect(
			pi.callTool("spawn_agent", { role: "reader", prompt: "work" }),
		).resolves.toMatchObject({ details: { status: "accepted" } });
		expect((await tracker.nextCompletion()).type).toBe("spawn_completed");
		if (bound) expect(bootstrap).not.toHaveBeenCalled();
		else expect(bootstrap).toHaveBeenCalledWith("/untrusted/checkout");
		await flushAsync();
		expect(session.dispose).toHaveBeenCalledOnce();
	});
}

test("ordinary child prompt failures still dispose the child without optional host callbacks", async () => {
	const { pi, tracker } = setup({ authorize: () => undefined });
	removeSessionRuntime(parentId);
	const session = child();
	session.prompt.mockRejectedValue(new Error("prompt failed"));
	mocks.factory.mockResolvedValue({ session });
	await pi.callTool("spawn_agent", { role: "reader", prompt: "work" });
	await expect(tracker.nextCompletion()).resolves.toMatchObject({
		type: "spawn_failed",
		error: "prompt failed",
	});
	await flushAsync();
	expect(session.dispose).toHaveBeenCalledOnce();
});

for (const bound of [false, true]) {
	test(`factory failures without a settlement hook produce no unhandled rejection (${bound})`, async () => {
		const { pi, tracker } = setup({ authorize: () => undefined });
		if (!bound) removeSessionRuntime(parentId);
		const errors: unknown[] = [];
		const observe = (reason: unknown) => {
			errors.push(reason);
		};
		process.on("unhandledRejection", observe);
		try {
			mocks.factory.mockRejectedValue(new Error("factory failed"));
			await pi.callTool("spawn_agent", { role: "reader", prompt: "work" });
			await expect(tracker.nextCompletion()).resolves.toMatchObject({
				type: "spawn_failed",
				error: "factory failed",
			});
			await flushAsync(20);
			expect(errors).toEqual([]);
		} finally {
			process.off("unhandledRejection", observe);
		}
	});
}

test("an ordinary child resolves its host session policy exactly once even when absent", async () => {
	const { pi, tracker, runtime } = setup({ authorize: () => undefined });
	const select = vi.fn(() => undefined);
	if (!runtime.sessionPolicies) throw new Error("Missing test policy provider");
	runtime.sessionPolicies.forAgent = select;
	mocks.factory.mockResolvedValue({ session: child() });
	await pi.callTool("spawn_agent", { role: "reader", prompt: "work" });
	await tracker.nextCompletion();
	expect(select).toHaveBeenCalledOnce();
});

for (const [label, bound] of [
	["bound", true],
	["discovered", false],
] as const) {
	for (const failing of [false, true]) {
		test(`a detached child binds the ${label} parent runtime while it runs and unbinds at disposal (prompt fails: ${failing})`, async () => {
			const { pi, tracker, bootstrap, runtime } = setup(
				{ authorize: () => undefined },
				{ authorize: () => undefined },
			);
			if (!bound) removeSessionRuntime(parentId);
			const session = child();
			const seen: unknown[] = [];
			session.prompt.mockImplementation(async () => {
				seen.push(getSessionRuntime(session.sessionId));
				if (failing) throw new Error("prompt failed");
			});
			mocks.factory.mockResolvedValue({ session });
			await pi.callTool("spawn_agent", { role: "reader", prompt: "work" });
			expect((await tracker.nextCompletion()).type).toBe(
				failing ? "spawn_failed" : "spawn_completed",
			);
			await flushAsync();
			const discovered = await bootstrap.mock.results[0]?.value;
			expect(bootstrap).toHaveBeenCalledTimes(bound ? 0 : 1);
			expect(discovered).not.toBe(runtime);
			expect(seen[0]).toBe(bound ? runtime : discovered);
			expect(seen).toHaveLength(1);
			expect(getSessionRuntime(session.sessionId)).toBeUndefined();
			expect(session.dispose).toHaveBeenCalledOnce();
		});
	}
}

test("a detached child whose session id is already bound is disposed and refused, and the other session keeps its state", async () => {
	const { pi, tracker } = setup({ authorize: () => undefined });
	const session = child();
	const original = {} as CosmonautsRuntime;
	registerSessionRuntime(session.sessionId, original);
	const otherTracker = getOrCreateTracker(session.sessionId);
	registerPlanContext(session.sessionId, "other-plan");
	try {
		mocks.factory.mockResolvedValue({ session });
		await pi.callTool("spawn_agent", { role: "reader", prompt: "work" });
		await expect(tracker.nextCompletion()).resolves.toMatchObject({
			type: "spawn_failed",
			error: "Duplicate host session binding: consumer-child",
		});
		await flushAsync();
		expect(session.dispose).toHaveBeenCalledOnce();
		expect(session.prompt).not.toHaveBeenCalled();
		expect(getSessionRuntime(session.sessionId)).toBe(original);
		expect(getOrCreateTracker(session.sessionId)).toBe(otherTracker);
		expect(getPlanSlugForSession(session.sessionId)).toBe("other-plan");
	} finally {
		removeSessionRuntime(session.sessionId);
		removeTracker(session.sessionId);
		removePlanContext(session.sessionId);
	}
});
