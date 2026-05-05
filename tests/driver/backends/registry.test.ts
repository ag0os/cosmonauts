import { describe, expect, test } from "vitest";
import {
	DetachedBackendNotSupportedError,
	resolveBackend,
	UnknownBackendError,
} from "../../../lib/driver/backends/registry.ts";

describe("backend registry", () => {
	test("resolves codex backend with codexBinary forwarded", () => {
		const backend = resolveBackend("codex", { codexBinary: "codex-dev" });

		expect(backend.name).toBe("codex");
		expect(backend.livenessCheck?.()).toEqual({
			argv: ["codex-dev", "--version"],
			expectExitZero: true,
		});
	});

	test("resolves claude-cli backend with claudeBinary forwarded", () => {
		const backend = resolveBackend("claude-cli", {
			claudeBinary: "claude-dev",
		});

		expect(backend.name).toBe("claude-cli");
		expect(backend.livenessCheck?.()).toEqual({
			argv: ["claude-dev", "--version"],
			expectExitZero: true,
		});
	});

	test("rejects cosmonauts-subagent for detached mode", () => {
		expect(() => resolveBackend("cosmonauts-subagent")).toThrow(
			DetachedBackendNotSupportedError,
		);

		try {
			resolveBackend("cosmonauts-subagent");
		} catch (error) {
			expect(error).toBeInstanceOf(DetachedBackendNotSupportedError);
			expect(error).toMatchObject({
				name: "DetachedBackendNotSupportedError",
				backendName: "cosmonauts-subagent",
			});
			return;
		}

		throw new Error("Expected cosmonauts-subagent to be rejected");
	});

	test("rejects unknown backend", () => {
		expect(() => resolveBackend("unknown")).toThrow(UnknownBackendError);

		try {
			resolveBackend("unknown");
		} catch (error) {
			expect(error).toBeInstanceOf(UnknownBackendError);
			expect(error).toMatchObject({
				name: "UnknownBackendError",
				backendName: "unknown",
			});
			return;
		}

		throw new Error("Expected unknown backend to be rejected");
	});
});
