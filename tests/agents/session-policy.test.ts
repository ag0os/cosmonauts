import { afterEach, expect, test, vi } from "vitest";
import {
	bindSessionRuntimeOrDispose,
	getSessionRuntime,
	registerSessionRuntime,
	removeSessionRuntime,
} from "../../lib/agents/session-policy.ts";
import type { CosmonautsRuntime } from "../../lib/runtime.ts";

const sessionId = "consumer-runtime-binding-test";
afterEach(() => {
	removeSessionRuntime(sessionId);
});

test("keeps the runtime binding across module reloads used by extension loaders", async () => {
	const runtime = {} as CosmonautsRuntime;
	registerSessionRuntime(sessionId, runtime);
	vi.resetModules();
	const reloaded = await import("../../lib/agents/session-policy.ts");
	expect(reloaded.getSessionRuntime(sessionId)).toBe(runtime);
	reloaded.removeSessionRuntime(sessionId);
	expect(getSessionRuntime(sessionId)).toBeUndefined();
});

test("rejects a duplicate binding without replacing the original runtime", () => {
	const runtime = {} as CosmonautsRuntime;
	registerSessionRuntime(sessionId, runtime);
	expect(() =>
		registerSessionRuntime(sessionId, {} as CosmonautsRuntime),
	).toThrow(`Duplicate host session binding: ${sessionId}`);
	expect(getSessionRuntime(sessionId)).toBe(runtime);
	removeSessionRuntime(sessionId);
	expect(getSessionRuntime(sessionId)).toBeUndefined();
	// Repeated disposal remains harmless.
	removeSessionRuntime(sessionId);
});

test("a removed binding frees the session id for a new runtime", () => {
	registerSessionRuntime(sessionId, {} as CosmonautsRuntime);
	removeSessionRuntime(sessionId);
	const next = {} as CosmonautsRuntime;
	registerSessionRuntime(sessionId, next);
	expect(getSessionRuntime(sessionId)).toBe(next);
});

test("binding a new session leaves it undisposed", () => {
	const runtime = {} as CosmonautsRuntime;
	const session = { sessionId, dispose: vi.fn() };
	bindSessionRuntimeOrDispose(session, runtime);
	expect(getSessionRuntime(sessionId)).toBe(runtime);
	expect(session.dispose).not.toHaveBeenCalled();
});

test("a refused binding disposes only the new session and rethrows", () => {
	const original = {} as CosmonautsRuntime;
	registerSessionRuntime(sessionId, original);
	const session = { sessionId, dispose: vi.fn() };
	expect(() =>
		bindSessionRuntimeOrDispose(session, {} as CosmonautsRuntime),
	).toThrow(`Duplicate host session binding: ${sessionId}`);
	expect(session.dispose).toHaveBeenCalledOnce();
	expect(getSessionRuntime(sessionId)).toBe(original);
});
