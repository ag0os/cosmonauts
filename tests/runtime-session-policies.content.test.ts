// Content acceptance retained until the corresponding deletion PR.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createContentRuntime } from "../domains/host-runtime.ts";
import { qualityReviewSessionPolicies } from "../lib/orchestration/quality-review-session-provider.ts";
import { useTempDir } from "./helpers/fs.ts";
import { installContentTestHost } from "./helpers/library-host.ts";

const tmp = useTempDir("runtime-seals-");
const _policyURL = new URL(
	"../lib/orchestration/quality-review-session-provider.ts",
	import.meta.url,
).href;
beforeEach(() => {
	vi.stubEnv("HOME", join(tmp.path, "home"));
});
afterEach(() => {
	vi.unstubAllEnvs();
});

test("the current host retains the coding session seal with an older project override", async () => {
	const override = join(tmp.path, ".cosmonauts", "domains", "coding");
	await mkdir(override, { recursive: true });
	await writeFile(
		join(override, "domain.ts"),
		'export default {id:"coding",description:"Older override",chainAdapter:{defaultModel:"test/override"}}',
	);
	const runtime = await createContentRuntime({ projectRoot: tmp.path });
	expect(runtime.sessionPolicies).toBe(qualityReviewSessionPolicies);
	const manager = runtime.agentRegistry.resolve("coding/quality-manager");
	expect(runtime.sessionPolicies?.interactiveDenial?.(manager)).toContain(
		"quality review launcher",
	);
	expect(
		runtime.sessionPolicies
			?.forAgent(manager)
			?.filterTools?.(["read", "write", "bash"]),
	).toEqual(["read"]);
	expect(
		runtime.sessionPolicies?.spawnPolicy?.("unbound").authorize({
			callerRole: "coding/quality-manager",
			resolvedTargetRole: "coding/reviewer",
			prompt: "Review",
		}),
	).toBe("quality review context missing");
});

beforeEach(installContentTestHost);
