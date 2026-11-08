import { mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import type { SettingsManager } from "@earendil-works/pi-coding-agent";
import { expect, test, vi } from "vitest";
import type { SpawnPolicyRequest } from "../../lib/agents/session-policy.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import * as projectTools from "../../lib/extensions/project-tools/index.ts";
import {
	getQualityReviewSession,
	type QualityReviewSessionContext,
} from "../../lib/orchestration/quality-review-context.ts";
import { qualityReviewPolicyFor } from "../../lib/orchestration/quality-review-profile.ts";
import { createQualityReviewSessionPolicy } from "../../lib/orchestration/quality-review-session-policy.ts";
import { qualityReviewSpawnPolicy } from "../../lib/orchestration/quality-review-spawn-policy.ts";
import type { CosmonautsRuntime } from "../../lib/runtime.ts";
import { useTempDir } from "../helpers/fs.ts";

function actor(id: string, domain = "coding"): AgentDefinition {
	return {
		id,
		domain,
		description: "Actor",
		model: "test/model",
		tools: "coding",
		capabilities: [],
		extensions: [],
		skills: [],
		projectContext: false,
		session: "ephemeral",
		loop: false,
	};
}
function context(
	overrides: Partial<QualityReviewSessionContext> = {},
): QualityReviewSessionContext {
	return {
		runId: "scope",
		workspaceRoot: "/captured/checkout",
		materialsRoot: "/captured/materials",
		hostRunStoreRoot: "/host/run",
		base: "captured-base",
		changedFiles: ["lib/changed.ts"],
		activeSpawns: new Set(),
		allowedLenses: new Set(["reviewer"]),
		attemptedLenses: new Set(),
		integrityFailures: [],
		artifactSink: {} as never,
		...overrides,
	};
}
const request: SpawnPolicyRequest = {
	callerRole: "coding/quality-manager",
	resolvedTargetRole: "coding/reviewer",
	prompt: "review this",
};

test("content selects manager policy exactly and accepts only declared child roles", () => {
	expect(
		qualityReviewPolicyFor(actor("quality-manager", "studio")),
	).toBeUndefined();
	expect(qualityReviewPolicyFor(actor("reviewer"))).toBeUndefined();
	const manager = qualityReviewPolicyFor(actor("quality-manager"));
	expect(manager?.toolPreset).toBe("readonly");
	expect(manager?.filterTools?.(["read", "spawn_agent", "bash"])).toEqual([
		"read",
		"spawn_agent",
	]);
	const child = qualityReviewPolicyFor(actor("reviewer"), true);
	expect(child?.filterTools?.(["read", "spawn_agent", "bash"])).toEqual([
		"read",
	]);
	expect(() => qualityReviewPolicyFor(actor("intruder"), true)).toThrow(
		"Quality review child role is forbidden: intruder",
	);
});

test("manager child spawning needs a host context and a registered base runtime", async () => {
	const empty = qualityReviewSpawnPolicy();
	expect(empty.authorize(request)).toBe("quality review context missing");
	expect(
		empty.authorize({ ...request, callerRole: "studio/lead" }),
	).toBeUndefined();
	expect(qualityReviewSpawnPolicy(context())).not.toHaveProperty("runtime");
	const { registerSessionPolicy, getSessionRuntime, removeSessionPolicy } =
		await import("../../lib/agents/session-policy.ts");
	const baseRuntime = {} as CosmonautsRuntime;
	const policy = createQualityReviewSessionPolicy(context({ baseRuntime }));
	registerSessionPolicy("sealed-runtime", policy, baseRuntime);
	try {
		expect(getSessionRuntime("sealed-runtime")).toBe(baseRuntime);
	} finally {
		removeSessionPolicy("sealed-runtime");
	}
	expect(getSessionRuntime("sealed-runtime")).toBeUndefined();
});

test("panel admission checks actual reviewer, caller, lens and both override fields independently", () => {
	const host = context();
	const policy = qualityReviewSpawnPolicy(host);
	expect(policy.authorize(request)).toBeUndefined();
	for (const change of [
		{ callerRole: "coding/reviewer" },
		{ resolvedTargetRole: "coding/worker" },
		{ resolvedTargetRole: "coding/security-reviewer" },
		{ model: "test/override" },
		{ thinkingLevel: "high" as const },
	]) {
		expect(policy.authorize({ ...request, ...change })).toBe(
			"quality panel permits only configured reviewer lenses",
		);
	}
	const allowedSpecialist = qualityReviewSpawnPolicy(
		context({ allowedLenses: new Set(["security-reviewer"]) }),
	);
	expect(
		allowedSpecialist.authorize({
			...request,
			resolvedTargetRole: "coding/security-reviewer",
		}),
	).toBeUndefined();
});

test("host records reviewer admission exactly once and releases active spawns while retaining attempts", () => {
	const host = context();
	const policy = qualityReviewSpawnPolicy(host);
	policy.onRegistered?.("spawn-1", "coding/reviewer");
	expect([...host.activeSpawns]).toEqual(["spawn-1"]);
	expect([...host.attemptedLenses]).toEqual(["reviewer"]);
	expect(policy.authorize(request)).toBe("duplicate reviewer reviewer");
	expect(host.integrityFailures).toEqual([
		"Duplicate reviewer spawn: reviewer",
	]);
	policy.onFailure?.("child failed");
	expect(host.integrityFailures).toEqual([
		"Duplicate reviewer spawn: reviewer",
		"child failed",
	]);
	policy.onSettled?.("spawn-1");
	expect(host.activeSpawns.size).toBe(0);
	expect(policy.authorize(request)).toBe("duplicate reviewer reviewer");
});

test("host constructs sealed child scope and refuses an unbound child policy factory", () => {
	const host = context({ reviewerModel: "test/generalist" });
	expect(() => qualityReviewSpawnPolicy(host).prepare?.(request)).toThrow(
		"Quality review child policy is missing",
	);
	const child = { toolPreset: "none" as const };
	const factory = vi.fn(() => child);
	const prepared = qualityReviewSpawnPolicy(host, factory).prepare?.(request);
	expect(factory).toHaveBeenCalledOnce();
	expect(prepared).toMatchObject({
		cwd: host.workspaceRoot,
		model: "test/generalist",
		sessionPolicy: child,
	});
	expect(prepared?.prompt).toContain("captured-base");
	expect(prepared?.prompt).toContain("/captured/materials/full.diff");
	expect(prepared?.prompt).toContain("lib/changed.ts");
	expect(prepared?.prompt).toContain("review this");
});

test("child session policy validates roles and applies the reviewer tool profile", () => {
	const policy = createQualityReviewSessionPolicy(context(), true);
	expect(() => policy.validateDefinition?.(actor("intruder"))).toThrow(
		"Quality review child role is forbidden",
	);
	expect(
		policy.filterTools?.(["read", "bash", "spawn_agent", "analysis_audit"]),
	).toEqual(["read"]);
	expect(policy.toolPreset).toBe("readonly");
	expect(policy.retainTranscript).toBe(true);
});

test("session lifecycle registers and removes the captured host context", () => {
	const host = context();
	const policy = createQualityReviewSessionPolicy(host, true);
	policy.onCreated?.({ sessionId: "host-policy-child", messages: [] });
	expect(getQualityReviewSession("host-policy-child")).toBe(host);
	policy.onDisposed?.("host-policy-child");
	expect(getQualityReviewSession("host-policy-child")).toBeUndefined();
});

test("completion timeout integrity recognizes a timeout among successful siblings", () => {
	const host = context();
	const policy = createQualityReviewSessionPolicy(host);
	policy.onCompletionWait?.(["ready"], 17);
	expect(host.integrityFailures).toEqual([]);
	policy.onCompletionWait?.(["ready", "Timed out after 17ms"], 17);
	expect(host.integrityFailures).toEqual([
		"Panel completion timed out after 17ms",
	]);
});

test("manager policy retains safe orchestration tools with untrusted in-memory settings", () => {
	const policy = createQualityReviewSessionPolicy(context());
	expect(
		policy.filterTools?.(["read", "spawn_agent", "analysis_audit"]),
	).toEqual(["read", "spawn_agent", "analysis_audit"]);
	expect(
		(policy.settingsManager?.() as SettingsManager).isProjectTrusted(),
	).toBe(false);
});

test("sealed resources clear append text and honor context opt-out even without a base root", async () => {
	const policy = createQualityReviewSessionPolicy(context());
	const resourceOptions = policy.resourceOptions;
	expect(resourceOptions).toBeTypeOf("function");
	if (!resourceOptions) throw new Error("Missing host resource override");
	const resources = {
		projectContext: true,
		extensionPaths: [],
		extensionFactories: [],
	};
	const withContext = await resourceOptions(resources, "/host/domains");
	expect(withContext.appendSystemPrompt).toEqual([]);
	expect(withContext.agentsFilesOverride).toBeUndefined();
	const withoutContext = await resourceOptions(
		{ ...resources, projectContext: false },
		"/host/domains",
	);
	expect(withoutContext.appendSystemPrompt).toEqual([]);
	expect(withoutContext.agentsFilesOverride).toBeTypeOf("function");
	expect((withoutContext.agentsFilesOverride as () => unknown)()).toEqual({
		agentsFiles: [],
	});
	expect(withoutContext).not.toHaveProperty("settingsManager");
	expect(policy.settingsManager).toBeTypeOf("function");
});

test("the bound parent creates a readonly child policy and preserves unrelated consent-scoped extensions", async () => {
	const authorization = {
		runId: "scope",
		snapshotRealPath: "/captured/checkout",
		consented: true,
		authorizationFor: vi.fn(),
		dispose: vi.fn(),
	};
	const consentFactory = () => undefined;
	const createExtension = vi
		.spyOn(projectTools, "createProjectToolsExtension")
		.mockReturnValue(consentFactory);
	const policy = createQualityReviewSessionPolicy(
		context({ analysisConsent: authorization }),
	);
	const child = policy.spawn?.prepare?.(request)?.sessionPolicy;
	expect(
		child?.filterTools?.(["read", "spawn_agent", "analysis_audit"]),
	).toEqual(["read"]);
	const inline = () => undefined;
	const options = await policy.resourceOptions?.(
		{
			projectContext: false,
			extensionPaths: [
				"/host/domains/shared/extensions/project-tools",
				"/consumer/unrelated",
			],
			extensionFactories: [inline],
		},
		"/host/domains",
	);
	expect(createExtension).toHaveBeenCalledWith({
		snapshotAuthorization: authorization,
	});
	expect(options?.additionalExtensionPaths).toEqual(["/consumer/unrelated"]);
	expect(options?.extensionFactories).toEqual([inline, expect.any(Function)]);
});

const skillFixture = useTempDir("policy-framework-skills-");
test("consented resource policy rejects a missing root rather than mounting an unfiltered provider", async () => {
	const policy = createQualityReviewSessionPolicy(
		context({
			analysisConsent: {
				runId: "scope",
				snapshotRealPath: "/captured/checkout",
				consented: true,
			} as never,
		}),
	);
	const resources = policy.resourceOptions;
	if (!resources) throw new Error("Missing resource policy");
	await expect(
		resources(
			{ projectContext: false, extensionPaths: [], extensionFactories: [] },
			undefined,
		),
	).rejects.toThrow("requires an explicit resource root");
});

test("quality skill fallback admits only the explicit framework root and handles an omitted root", async () => {
	const fixtureRoot = await realpath(skillFixture.path);
	const root = join(fixtureRoot, "framework");
	const domains = join(root, "domains");
	const inside = join(root, "skills");
	const outside = join(fixtureRoot, "outside");
	for (const path of [domains, inside, outside])
		await mkdir(path, { recursive: true });
	const omittedSkillPaths: string[] = [];
	const policy = createQualityReviewSessionPolicy(
		context({ omittedSkillPaths }),
	);
	const prepare = policy.prepareSkills;
	if (!prepare) throw new Error("Missing skill policy");
	await expect(prepare([inside, outside], domains)).resolves.toEqual([inside]);
	expect(omittedSkillPaths).toEqual([outside]);
	await expect(prepare([inside], undefined)).resolves.toEqual([]);
});
