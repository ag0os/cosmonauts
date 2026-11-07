import { describe, expect, test } from "vitest";
import worker from "../../bundled/coding/agents/worker.ts";
import cosmo from "../../domains/main/agents/cosmo.ts";
import authoredAdapter from "../../domains/shared/extensions/agent-memory/index.ts";
import architectureAdapter from "../../domains/shared/extensions/architecture-memory/index.ts";
import { useTempDir } from "../helpers/fs.ts";
import { createMockPi } from "../helpers/mocks/index.ts";

const tmp = useTempDir("content-memory-grants-");
describe("current content memory adapters", () => {
	test("the raw authored adapter uses the consumer grant and fails closed when it is removed", async () => {
		const saved = cosmo.memory;
		try {
			const pi = createMockPi({ cwd: tmp.path });
			authoredAdapter(pi as never);
			await pi.fireEvent(
				"before_agent_start",
				{ systemPrompt: "<!-- COSMONAUTS_AGENT_ID:main/cosmo -->" },
				{ cwd: tmp.path },
			);
			expect(
				await pi.callTool("remember", {
					content: "Declared content grant",
					scope: "project",
				}),
			).toMatchObject({ details: { status: "saved" } });
			Object.assign(cosmo, { memory: undefined });
			const denied = createMockPi({ cwd: tmp.path });
			authoredAdapter(denied as never);
			await denied.fireEvent(
				"before_agent_start",
				{ systemPrompt: "<!-- COSMONAUTS_AGENT_ID:main/cosmo -->" },
				{ cwd: tmp.path },
			);
			expect(
				await denied.callTool("remember", { content: "No longer allowed" }),
			).toMatchObject({ details: { status: "unauthorized" } });
		} finally {
			Object.assign(cosmo, { memory: saved });
		}
	});

	test("the raw architecture adapter excludes a consumer whose grant is removed", async () => {
		const saved = worker.memory;
		try {
			Object.assign(worker, { memory: undefined });
			const pi = createMockPi({ cwd: tmp.path });
			architectureAdapter(pi as never);
			await pi.fireEvent(
				"before_agent_start",
				{ systemPrompt: "<!-- COSMONAUTS_AGENT_ID:coding/worker -->" },
				{ cwd: tmp.path },
			);
			expect(await pi.callTool("architecture_map_read", {})).toMatchObject({
				details: { status: "scope-ineligible" },
			});
		} finally {
			Object.assign(worker, { memory: saved });
		}
	});
});
