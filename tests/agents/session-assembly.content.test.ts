import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { buildSessionParams } from "../../lib/agents/session-assembly.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { qualityReviewPolicyFor } from "../../lib/orchestration/quality-review-profile.ts";
import { useTempDir } from "../helpers/fs.ts";

vi.mock("@earendil-works/pi-ai/providers/all", () => ({
	builtinModels: () => ({
		getModel: (provider: string, id: string) => ({ provider, id }),
	}),
}));
const tmp = useTempDir("session-assembly-content-");

test("does not give an ordinary reviewer session the quality child profile", async () => {
	const def: AgentDefinition = {
		id: "reviewer",
		domain: "coding",
		description: "Ordinary reviewer",
		instructions: { kind: "inline", content: "Review the supplied input." },
		model: "anthropic/test-sonnet",
		tools: "coding",
		memory: {},
		capabilities: [],
		extensions: [],
		skills: [],
		projectContext: false,
		session: "ephemeral",
		loop: false,
	};
	const options = { def, cwd: tmp.path, domainsDir: join(tmp.path, "absent") };
	const ordinary = await buildSessionParams(options);
	const panel = await buildSessionParams({
		...options,
		sessionPolicy: qualityReviewPolicyFor(def, true),
	});
	expect(ordinary.sessionPolicy).toBeUndefined();
	expect(ordinary.tools).toContain("bash");
	expect(panel.sessionPolicy?.toolPreset).toBe("readonly");
	expect(panel.tools).toEqual(["read", "grep", "find", "ls"]);
});
