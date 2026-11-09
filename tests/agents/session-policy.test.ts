import { afterEach, expect, test, vi } from "vitest";
import {
	getSessionPolicy,
	getSessionRuntime,
	registerSessionPolicy,
	removeSessionPolicy,
	type SessionPolicy,
} from "../../lib/agents/session-policy.ts";

const sessionId = "consumer-policy-test";
afterEach(() => {
	removeSessionPolicy(sessionId);
});

test("keeps host policy across module reloads used by extension loaders", async () => {
	const policy: SessionPolicy = { toolPreset: "none" };
	const runtime = {} as import("../../lib/runtime.ts").CosmonautsRuntime;
	registerSessionPolicy(sessionId, policy, runtime);
	vi.resetModules();
	const reloaded = await import("../../lib/agents/session-policy.ts");
	expect(reloaded.getSessionPolicy(sessionId)).toBe(policy);
	expect(reloaded.getSessionRuntime(sessionId)).toBe(runtime);
	reloaded.removeSessionPolicy(sessionId);
	expect(getSessionPolicy(sessionId)).toBeUndefined();
	expect(getSessionRuntime(sessionId)).toBeUndefined();
});

test("rejects a duplicate host binding without replacing the original policy", () => {
	const original: SessionPolicy = { toolPreset: "readonly" };
	const runtime = {} as import("../../lib/runtime.ts").CosmonautsRuntime;
	registerSessionPolicy(sessionId, original, runtime);
	expect(() =>
		registerSessionPolicy(
			sessionId,
			{},
			{} as import("../../lib/runtime.ts").CosmonautsRuntime,
		),
	).toThrow(`Duplicate host session policy: ${sessionId}`);
	expect(getSessionPolicy(sessionId)).toBe(original);
	expect(getSessionRuntime(sessionId)).toBe(runtime);
	removeSessionPolicy(sessionId);
	expect(getSessionPolicy(sessionId)).toBeUndefined();
	expect(getSessionRuntime(sessionId)).toBeUndefined();
	// Repeated disposal remains harmless.
	removeSessionPolicy(sessionId);
});
