import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { CosmonautsRuntime } from "../lib/runtime.ts";
import { consumerSessionPolicies as qualityReviewSessionPolicies } from "./fixtures/library-consumer/policies.ts";
import { useTempDir } from "./helpers/fs.ts";

const tmp = useTempDir("runtime-seals-");
const policyURL = new URL(
	"./fixtures/library-consumer/policies.ts",
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
		`import {consumerSessionPolicies as seal} from ${JSON.stringify(policyURL)}; export default {id:${JSON.stringify(id)},description:"Fixture",${extra}};`,
	);
	return join(tmp.path, "domains");
}

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

test("higher generic domain layers inherit omitted policy metadata", async () => {
	const builtinDomainsDir = await domain("sealed", "sessionPolicies:seal");
	const plugins = join(tmp.path, "plugins");
	await mkdir(join(plugins, "sealed"), { recursive: true });
	await writeFile(
		join(plugins, "sealed", "domain.ts"),
		'export default {id:"sealed",description:"Older override"}',
	);
	const runtime = await CosmonautsRuntime.create({
		projectRoot: tmp.path,
		builtinDomainsDir,
		pluginDirs: [plugins],
		projectConfig: {},
	});
	expect(runtime.sessionPolicies).toBe(qualityReviewSessionPolicies);
});
