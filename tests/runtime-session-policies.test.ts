import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { qualityReviewSessionPolicies } from "../lib/orchestration/quality-review-session-provider.ts";
import { discoverFrameworkBundledPackageDirs } from "../lib/packages/dev-bundled.ts";
import { CosmonautsRuntime } from "../lib/runtime.ts";
import { useTempDir } from "./helpers/fs.ts";

const tmp = useTempDir("runtime-seals-");
const root = fileURLToPath(new URL("../", import.meta.url));
const policyURL = new URL(
	"../lib/orchestration/quality-review-session-provider.ts",
	import.meta.url,
).href;
beforeEach(() => {
	vi.stubEnv("HOME", join(tmp.path, "home"));
});
afterEach(() => {
	vi.unstubAllEnvs();
});
async function domain(id: string, extra: string) {
	const dir = join(tmp.path, "domains", id);
	await mkdir(dir, { recursive: true });
	await writeFile(
		join(dir, "domain.ts"),
		`import {qualityReviewSessionPolicies as seal} from ${JSON.stringify(policyURL)}; export default {id:${JSON.stringify(id)},description:"Fixture",${extra}};`,
	);
	return join(tmp.path, "domains");
}

test("an older project override inherits the coding session seal from its lower layer", async () => {
	const override = join(tmp.path, ".cosmonauts", "domains", "coding");
	await mkdir(override, { recursive: true });
	await writeFile(
		join(override, "domain.ts"),
		'export default {id:"coding",description:"Older override",chainAdapter:{defaultModel:"test/override"}}',
	);
	const runtime = await CosmonautsRuntime.create({
		projectRoot: tmp.path,
		builtinDomainsDir: join(root, "domains"),
		bundledDirs: await discoverFrameworkBundledPackageDirs(root),
		includeUserSources: false,
	});
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

test("a sole declaring policy survives multiple adapters and a different selected adapter", async () => {
	await domain(
		"sealed",
		'chainAdapter:{defaultModel:"test/sealed"},sessionPolicies:seal',
	);
	const builtinDomainsDir = await domain(
		"other",
		'chainAdapter:{defaultModel:"test/other"}',
	);
	for (const domainOverride of [undefined, "other"]) {
		const runtime = await CosmonautsRuntime.create({
			projectRoot: tmp.path,
			builtinDomainsDir,
			domainOverride,
			includeUserSources: false,
		});
		expect(runtime.sessionPolicies).toBe(qualityReviewSessionPolicies);
	}
});

test("distinct domain policies fail loading unless the host explicitly chooses one", async () => {
	await domain("first", "sessionPolicies:seal");
	const builtinDomainsDir = await domain(
		"second",
		"sessionPolicies:{forAgent:()=>undefined}",
	);
	await expect(
		CosmonautsRuntime.create({
			projectRoot: tmp.path,
			builtinDomainsDir,
			includeUserSources: false,
		}),
	).rejects.toMatchObject({
		name: "AmbiguousSessionPolicyProviderError",
		message: expect.stringContaining("first, second"),
	});
	const runtime = await CosmonautsRuntime.create({
		projectRoot: tmp.path,
		builtinDomainsDir,
		includeUserSources: false,
		sessionPolicies: qualityReviewSessionPolicies,
	});
	expect(runtime.sessionPolicies).toBe(qualityReviewSessionPolicies);
});

test("the same policy object declared by multiple domains is unambiguous", async () => {
	await domain("first", "sessionPolicies:seal");
	const builtinDomainsDir = await domain("second", "sessionPolicies:seal");
	const runtime = await CosmonautsRuntime.create({
		projectRoot: tmp.path,
		builtinDomainsDir,
		includeUserSources: false,
	});
	expect(runtime.sessionPolicies).toBe(qualityReviewSessionPolicies);
});
