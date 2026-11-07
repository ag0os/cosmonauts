import { describe, expect, test, vi } from "vitest";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import {
	resolveDriveEpisodeWorker,
	resolveFrozenDriveEpisodeWorker,
} from "../../lib/driver/episode-identity.ts";

describe("Drive episode grants", () => {
	test.each([
		undefined,
		false,
		true,
	])("requires the executed worker's grant for live and frozen actors: %s", (grant) => {
		const worker: AgentDefinition = {
			id: "worker",
			domain: "coding",
			description: "Consumer worker",
			capabilities: [],
			model: "test/model",
			tools: "none",
			extensions: [],
			skills: [],
			projectContext: false,
			session: "ephemeral",
			loop: false,
			memory: { episodes: grant },
		};
		const runtime = {
			agentRegistry: new AgentRegistry([worker]),
			domainContext: "coding",
			workerAgent: "coding/worker",
		};
		expect(resolveDriveEpisodeWorker(runtime)?.definition).toBe(
			grant ? worker : undefined,
		);
		expect(
			resolveFrozenDriveEpisodeWorker(runtime, "coding/worker")?.definition,
		).toBe(grant ? worker : undefined);
	});
	test("skips missing actors and missing memory declarations non-fatally with bounded diagnostics", () => {
		const warnings = vi.spyOn(process.stderr, "write").mockReturnValue(true);
		const worker: AgentDefinition = {
			id: "worker",
			domain: "coding",
			description: "No memory grant",
			capabilities: [],
			model: "test/model",
			tools: "none",
			extensions: [],
			skills: [],
			projectContext: false,
			session: "ephemeral",
			loop: false,
		};
		for (const definitions of [[], [worker]]) {
			const runtime = {
				agentRegistry: new AgentRegistry(definitions),
				domainContext: "coding",
				workerAgent: "coding/worker",
			};
			expect(resolveDriveEpisodeWorker(runtime)).toBeUndefined();
			expect(
				resolveFrozenDriveEpisodeWorker(runtime, "coding/worker"),
			).toBeUndefined();
		}
		expect(warnings).toHaveBeenCalledTimes(4);
		for (const [message] of warnings.mock.calls) {
			expect(String(message)).toContain(
				"[warning] Drive episode capture skipped:",
			);
			expect(String(message).length).toBeLessThan(600);
		}
	});
});
