/**
 * Tests for lib/lean-run/runtime-backends.ts: the runtime it builds sees
 * this framework's domains and bundled packages from its computed root.
 */

import { afterEach, describe, expect, test, vi } from "vitest";
import { runtimeBackends } from "../../lib/lean-run/runtime-backends.ts";
import { CosmonautsRuntime } from "../../lib/runtime.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("lean-runtime-backends-");

afterEach(() => {
	vi.restoreAllMocks();
});

describe("runtimeBackends", () => {
	test("builds a runtime that resolves the lean builder and code reviewer", async () => {
		const create = vi.spyOn(CosmonautsRuntime, "create");

		await runtimeBackends()("pi", tmp.path);

		const runtime = await create.mock.results[0]?.value;
		expect(runtime.agentRegistry.resolve("builder", "lean").id).toBe("builder");
		expect(runtime.agentRegistry.resolve("code-reviewer", "lean").id).toBe(
			"code-reviewer",
		);
	});

	test("builds the reviewer on its own kind when it differs from the builder's", async () => {
		const backends = await runtimeBackends()("claude-cli", tmp.path, {
			reviewerKind: "codex-cli",
		});

		expect([backends.builder.kind, backends.reviewer.kind]).toEqual([
			"claude-cli",
			"codex-cli",
		]);
	});

	test("shares one backend for both roles when the reviewer kind matches", async () => {
		const backends = await runtimeBackends()("codex-cli", tmp.path, {
			reviewerKind: "codex-cli",
		});

		expect(backends.reviewer).toBe(backends.builder);
	});
});
