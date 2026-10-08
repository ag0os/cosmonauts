/**
 * The claude-cli and codex-cli lean backends never load Pi: every Pi package
 * fails on import here, and a lean run's backends are built and run through
 * the CLI's runtime path with a stub process runner in place of the harness.
 */

import { afterEach, describe, expect, test, vi } from "vitest";
import {
	createExternalBuilderBackend,
	leanPackageResolver,
} from "../../lib/lean-run/backends/external.ts";
import { runtimeBackends } from "../../lib/lean-run/runtime-backends.ts";
import { CosmonautsRuntime } from "../../lib/runtime.ts";
import { useTempDir } from "../helpers/fs.ts";

const piLoads = vi.hoisted(() => [] as string[]);
function failPiLoad(specifier: string): never {
	piLoads.push(specifier);
	throw new Error(`Pi loaded: ${specifier}`);
}
vi.mock("@earendil-works/pi-agent-core", () =>
	failPiLoad("@earendil-works/pi-agent-core"),
);
vi.mock("@earendil-works/pi-ai", () => failPiLoad("@earendil-works/pi-ai"));
vi.mock("@earendil-works/pi-ai/providers/all", () =>
	failPiLoad("@earendil-works/pi-ai/providers/all"),
);
vi.mock("@earendil-works/pi-coding-agent", () =>
	failPiLoad("@earendil-works/pi-coding-agent"),
);
vi.mock("@earendil-works/pi-tui", () => failPiLoad("@earendil-works/pi-tui"));

const tmp = useTempDir("lean-external-pi-free-");

afterEach(() => {
	vi.restoreAllMocks();
});

describe("external lean backends without Pi", () => {
	test.each([
		"claude-cli",
		"codex-cli",
	] as const)("%s builds its backends and runs a builder stage", async (kind) => {
		const create = vi.spyOn(CosmonautsRuntime, "create");

		const backends = await runtimeBackends()(kind, tmp.path);
		const runtime: CosmonautsRuntime = await create.mock.results[0]?.value;
		const commands: string[] = [];
		const result = await createExternalBuilderBackend({
			kind,
			resolvePackage: leanPackageResolver({
				kind,
				registry: runtime.agentRegistry,
				domainsDir: runtime.domainsDir,
				resolver: runtime.domainResolver,
				skillPaths: runtime.skillPaths,
			}),
			runProcess: async (request) => {
				commands.push(request.command);
				return { exitCode: 0, stdout: '{"outcome":"done"}', stderr: "" };
			},
		}).run({ prompt: "build it", worktree: tmp.path, role: "lean/builder" });

		expect(piLoads).toEqual([]);
		expect(backends.builder).toBe(backends.reviewer);
		expect(commands).toEqual([kind === "claude-cli" ? "claude" : "codex"]);
		expect(result.text).toContain('"outcome":"done"');
	});

	test("a Pi run still loads its backend, so the mocks do fail on Pi", async () => {
		await expect(runtimeBackends()("pi", tmp.path)).rejects.toThrow();
		expect(piLoads).not.toEqual([]);
	});
});
