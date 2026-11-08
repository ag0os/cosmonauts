import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { createCosmonautsSubagentBackend } from "../../lib/driver/backends/cosmonauts-subagent.ts";
import {
	isFrozenDriveEpisodeWorkerSource,
	resolveDriveEpisodeWorker,
	resolveDriveWorker,
	resolveFrozenDriveEpisodeWorker,
} from "../../lib/driver/episode-identity.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("declared-drive-worker-");
function actor(domain: string | undefined, episodes: boolean): AgentDefinition {
	return {
		id: "assembler",
		domain,
		description: "Consumer executor",
		model: "test/model",
		capabilities: [],
		tools: "none",
		extensions: [],
		skills: [],
		projectContext: false,
		session: "ephemeral",
		loop: false,
		memory: { episodes },
	};
}
describe("declared Drive worker identity", () => {
	test.each([
		false,
		true,
	])("execution is independent of the episode grant: %s", (episodes) => {
		const definition = actor("studio", episodes);
		const runtime = {
			workerAgent: "studio/assembler",
			domainContext: "studio",
			agentRegistry: new AgentRegistry([definition]),
		};
		const warning = vi.spyOn(process.stderr, "write").mockReturnValue(true);
		try {
			expect(resolveDriveWorker(runtime)?.definition).toBe(definition);
			expect(resolveDriveEpisodeWorker(runtime)?.definition).toBe(
				episodes ? definition : undefined,
			);
		} finally {
			warning.mockRestore();
		}
	});
	test("frozen selection neither rebinds nor borrows the live actor's grant", () => {
		const live = actor("studio", true);
		const frozen = actor("vendor", false);
		const runtime = {
			workerAgent: "studio/assembler",
			domainContext: "studio",
			agentRegistry: new AgentRegistry([live, frozen]),
		};
		const warning = vi.spyOn(process.stderr, "write").mockReturnValue(true);
		try {
			expect(resolveDriveWorker(runtime, "vendor/assembler")?.definition).toBe(
				frozen,
			);
			expect(
				resolveFrozenDriveEpisodeWorker(runtime, "vendor/assembler"),
			).toBeUndefined();
			expect(resolveDriveWorker(runtime, "retired/assembler")).toBeUndefined();
			expect(resolveDriveWorker(runtime, "vendor/worker")).toBeUndefined();
		} finally {
			warning.mockRestore();
		}
	});
	test("accepts domainless declared identities without a coded domain fallback", () => {
		const definition = actor(undefined, true);
		const runtime = {
			workerAgent: "assembler",
			domainContext: undefined,
			agentRegistry: new AgentRegistry([definition]),
		};
		expect(resolveDriveWorker(runtime, "assembler")?.definition).toBe(
			definition,
		);
		expect(
			resolveFrozenDriveEpisodeWorker(runtime, "assembler")?.qualifiedId,
		).toBe("assembler");
		expect(isFrozenDriveEpisodeWorkerSource("assembler", "assembler")).toBe(
			true,
		);
		expect(
			isFrozenDriveEpisodeWorkerSource("Vendor/assembler", "assembler"),
		).toBe(false);
	});
	test("keeps the declared alias and stored provider distinct in frozen spawn references", () => {
		const registry = new AgentRegistry([actor("vendor", true)]);
		const result = resolveDriveWorker(
			{
				workerAgent: "studio/assembler",
				domainContext: "host",
				agentRegistry: registry,
			},
			"vendor/assembler",
		);
		expect(result?.reference).toEqual({
			requested: {
				role: "studio",
				agentId: "assembler",
				qualifiedId: "studio/assembler",
			},
			resolved: {
				role: "vendor",
				agentId: "assembler",
				qualifiedId: "vendor/assembler",
			},
			binding: { role: "studio", domainId: "vendor", source: "default" },
		});
		const domainless = resolveDriveWorker(
			{
				workerAgent: "assembler",
				domainContext: undefined,
				agentRegistry: new AgentRegistry([actor(undefined, true)]),
			},
			"assembler",
		);
		expect(domainless?.reference).toBeUndefined();
	});

	test("requires explicit workerAgent rather than a default worker", () => {
		const runtime = {
			agentRegistry: new AgentRegistry([actor("studio", true)]),
			domainContext: "studio",
		};
		expect(() => resolveDriveWorker(runtime)).toThrow("requires workerAgent");
		expect(() =>
			createCosmonautsSubagentBackend({
				spawner: { spawn: vi.fn(), dispose() {} },
				cwd: tmp.path,
			} as never),
		).toThrow("Drive workerAgent");
	});
	test("uses a safe plain label while forwarding the frozen declaration to the spawner", async () => {
		const runtime = {
			workerAgent: "studio/assembler",
			domainContext: "studio",
			agentRegistry: new AgentRegistry([
				actor("studio", false),
				actor("vendor", false),
			]),
		};
		const workerResolution = resolveDriveWorker(runtime, "vendor/assembler");
		const spawn = vi
			.fn()
			.mockResolvedValue({ success: true, sessionId: "child", messages: [] });
		const promptPath = join(tmp.path, "prompt.md");
		await writeFile(promptPath, "Build the selected task.");
		const backend = createCosmonautsSubagentBackend({
			workerAgent: runtime.workerAgent,
			workerResolution,
			spawner: { spawn, dispose() {} },
			cwd: tmp.path,
		});
		await backend.run({
			runId: "run",
			promptPath,
			projectRoot: tmp.path,
			workdir: tmp.path,
			taskId: "TASK-1",
			parentSessionId: "parent",
			planSlug: "sample",
			eventSink: async () => {},
		});
		expect(spawn).toHaveBeenCalledWith(
			expect.objectContaining({
				role: "assembler",
				agentReference: expect.objectContaining({
					resolved: expect.objectContaining({
						qualifiedId: "vendor/assembler",
					}),
				}),
				prompt: "Build the selected task.",
			}),
		);
	});
});

test("unavailable capture diagnostics name the declared worker", () => {
	const warning = vi.spyOn(process.stderr, "write").mockReturnValue(true);
	try {
		expect(
			resolveDriveEpisodeWorker({
				workerAgent: "studio/assembler",
				domainContext: "studio",
				agentRegistry: new AgentRegistry([actor("studio", false)]),
			}),
		).toBeUndefined();
		expect(warning.mock.calls.flat().join(" ")).toContain(
			'Declared worker "studio/assembler"',
		);
	} finally {
		warning.mockRestore();
	}
});
