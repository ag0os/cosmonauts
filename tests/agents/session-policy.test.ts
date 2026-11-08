import { afterEach, expect, test, vi } from "vitest";
import {
	getSessionPolicy,
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
	registerSessionPolicy(sessionId, policy);
	vi.resetModules();
	const reloaded = await import("../../lib/agents/session-policy.ts");
	expect(reloaded.getSessionPolicy(sessionId)).toBe(policy);
	reloaded.removeSessionPolicy(sessionId);
	expect(getSessionPolicy(sessionId)).toBeUndefined();
});

test("rejects a duplicate host binding without replacing the original policy", () => {
	const original: SessionPolicy = { retainTranscript: true };
	registerSessionPolicy(sessionId, original);
	expect(() => registerSessionPolicy(sessionId, {})).toThrow(
		`Duplicate host session policy: ${sessionId}`,
	);
	expect(getSessionPolicy(sessionId)).toBe(original);
	removeSessionPolicy(sessionId);
	expect(getSessionPolicy(sessionId)).toBeUndefined();
	// Repeated disposal remains harmless.
	removeSessionPolicy(sessionId);
});
