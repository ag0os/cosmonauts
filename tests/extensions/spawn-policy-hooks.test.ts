import { afterEach, expect, test, vi } from "vitest";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import {
	registerSessionPolicy,
	removeSessionPolicy,
	type SessionSpawnPolicy,
} from "../../lib/agents/session-policy.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { registerSpawnTool } from "../../lib/extensions/orchestration/spawn-tool.ts";
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
	removeSessionPolicy(parentId);
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
function setup(
	policy: SessionSpawnPolicy,
	launchTarget?: NonNullable<
		CosmonautsRuntime["sessionPolicies"]
	>["launchTarget"],
) {
	const runtime = {
		agentRegistry: new AgentRegistry([
			actor("lead", ["reader"]),
			actor("reader"),
		]),
		domainContext: "studio",
		domainsDir: "/consumer/domains",
		domainResolver: {},
		projectSkills: [],
		skillPaths: [],
		sessionPolicies: { forAgent: () => undefined, launchTarget },
	} as unknown as CosmonautsRuntime;
	const bootstrap = vi.fn(async () => runtime);
	const pi = createMockPi("/untrusted/checkout", {
		sessionId: parentId,
		systemPrompt: "<!-- COSMONAUTS_AGENT_ID:studio/lead -->",
	});
	registerSessionPolicy(parentId, {
		spawn: { runtime: () => runtime, ...policy },
	});
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
	const { pi, bootstrap } = setup({ authorize });
	await expect(
		pi.callTool("spawn_agent", { role: "reader", prompt: "work" }),
	).resolves.toMatchObject({
		content: [{ type: "text", text: "spawn_agent denied: host refused" }],
		details: { status: "denied" },
	});
	expect(authorize).toHaveBeenCalledWith(
		expect.objectContaining({
			callerRole: "studio/lead",
			resolvedTargetRole: "studio/reader",
		}),
	);
	expect(bootstrap).not.toHaveBeenCalled();
	expect(mocks.factory).not.toHaveBeenCalled();
});

for (const rejectEvidence of [false, true]) {
	test(`detached children retain host correlation, cleanup and evidence outcome (${rejectEvidence})`, async () => {
		const session = child();
		const childPolicy = { toolPreset: "none" as const };
		const onCompleted = vi.fn(async () => {
			if (rejectEvidence) throw new Error("evidence rejected");
		});
		const onFailure = vi.fn();
		const onRegistered = vi.fn();
		const onSettled = vi.fn();
		const { pi, tracker, bootstrap } = setup({
			authorize: () => undefined,
			prepare: () => ({
				cwd: "/captured",
				prompt: "sealed prompt",
				model: "test/chosen",
				sessionPolicy: childPolicy,
			}),
			onCompleted,
			onFailure,
			onRegistered,
			onSettled,
		});
		mocks.factory.mockResolvedValue({ session, resolvedModel: session.model });
		const result = (await pi.callTool("spawn_agent", {
			role: "reader",
			prompt: "operator text",
		})) as { details: { status: string; spawnId: string } };
		expect(result.details.status).toBe("accepted");
		const completion = await tracker.nextCompletion();
		await flushAsync();
		expect(completion.type).toBe(
			rejectEvidence ? "spawn_failed" : "spawn_completed",
		);
		expect(bootstrap).not.toHaveBeenCalled();
		expect(mocks.factory.mock.calls[0]?.[1]).toMatchObject({
			cwd: "/captured",
			prompt: "sealed prompt",
			model: "test/chosen",
			sessionPolicy: childPolicy,
		});
		expect(onRegistered).toHaveBeenCalledWith(
			result.details.spawnId,
			"studio/reader",
		);
		expect(onCompleted).toHaveBeenCalledWith(
			expect.objectContaining({
				session,
				resolvedRole: "studio/reader",
				resolvedModel: session.model,
				spawnId: result.details.spawnId,
			}),
		);
		expect(onSettled).toHaveBeenCalledWith(result.details.spawnId);
		if (rejectEvidence)
			expect(onFailure).toHaveBeenCalledWith("evidence rejected");
		else expect(onFailure).not.toHaveBeenCalled();
		expect(session.dispose).toHaveBeenCalledOnce();
	});
}

test("a failed session factory releases the host spawn admission", async () => {
	const onSettled = vi.fn();
	const { pi, tracker } = setup({ authorize: () => undefined, onSettled });
	mocks.factory.mockRejectedValue(new Error("factory failed"));
	const result = (await pi.callTool("spawn_agent", {
		role: "reader",
		prompt: "work",
	})) as { details: { spawnId: string } };
	expect((await tracker.nextCompletion()).type).toBe("spawn_failed");
	await flushAsync();
	expect(onSettled).toHaveBeenCalledWith(result.details.spawnId);
});

test("a host delegated launch is tracked without creating an ordinary child session", async () => {
	const launchTarget = vi.fn(async () => ({
		outcome: "success" as const,
		summary: "external result",
	}));
	const { pi, tracker } = setup({ authorize: () => undefined }, launchTarget);
	await pi.callTool("spawn_agent", { role: "reader", prompt: "work" });
	const completion = await tracker.nextCompletion();
	expect(completion).toMatchObject({
		type: "spawn_completed",
		summary: "external result",
	});
	expect(launchTarget).toHaveBeenCalledWith(
		expect.objectContaining({
			resolved: expect.objectContaining({ qualifiedId: "studio/reader" }),
		}),
		expect.objectContaining({
			projectRoot: "/untrusted/checkout",
			operatorNote: "work",
		}),
	);
	expect(mocks.factory).not.toHaveBeenCalled();
});

for (const bound of [false, true]) {
	test(`ordinary spawning supports omitted runtime and optional host callbacks (${bound})`, async () => {
		const { pi, tracker, bootstrap } = setup({ authorize: () => undefined });
		removeSessionPolicy(parentId);
		if (bound)
			registerSessionPolicy(parentId, {
				spawn: { authorize: () => undefined },
			});
		const session = child();
		mocks.factory.mockResolvedValue({ session });
		await expect(
			pi.callTool("spawn_agent", { role: "reader", prompt: "work" }),
		).resolves.toMatchObject({ details: { status: "accepted" } });
		expect((await tracker.nextCompletion()).type).toBe("spawn_completed");
		expect(bootstrap).toHaveBeenCalledWith("/untrusted/checkout");
		await flushAsync();
		expect(session.dispose).toHaveBeenCalledOnce();
	});
}

test("ordinary child prompt failures still dispose the child without optional host callbacks", async () => {
	const { pi, tracker } = setup({ authorize: () => undefined });
	removeSessionPolicy(parentId);
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
		if (!bound) removeSessionPolicy(parentId);
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
