/** The shipped CLI/content is a library consumer. This is its explicit discovery and policy. */
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { codingChainAdapter } from "../bundled/coding/chain-adapter.ts";
import { loadProjectConfig } from "../lib/config/index.ts";
import { loadDomainsFromSources } from "../lib/domains/loader.ts";
import { qualityReviewSessionPolicies } from "../lib/orchestration/quality-review-session-provider.ts";
import { discoverFrameworkBundledPackageDirs } from "../lib/packages/dev-bundled.ts";
import { scanDomainSources } from "../lib/packages/scanner.ts";
import { CosmonautsRuntime } from "../lib/runtime.ts";
import {
	hasRuntimeHost,
	type RuntimeHostRequest,
	setRuntimeHost,
} from "../lib/runtime-host.ts";

const CONTENT_DEFAULT_MODEL = "anthropic/claude-opus-4-7";
export async function createContentRuntime(
	request: RuntimeHostRequest,
): Promise<CosmonautsRuntime> {
	const frameworkRoot = resolve(fileURLToPath(import.meta.url), "..", "..");
	const builtinDomainsDir = join(frameworkRoot, "domains");
	const projectConfig = await loadProjectConfig(request.projectRoot);
	const sources = await scanDomainSources({
		builtinDomainsDir,
		projectRoot: request.projectRoot,
		bundledDirs: await discoverFrameworkBundledPackageDirs(frameworkRoot),
		pluginDirs: request.pluginDirs ? [...request.pluginDirs] : undefined,
	});
	const domains = await loadDomainsFromSources(sources, undefined, {
		activeDomainIds: projectConfig.activeDomains,
	});
	const hasCoding = domains.some((domain) => domain.manifest.id === "coding");
	return CosmonautsRuntime.create({
		projectRoot: request.projectRoot,
		projectConfig,
		domainSources: [],
		domains,
		builtinDomainsDir,
		domainOverride: request.domainOverride,
		extensionProviders: {
			orchestration: async (context) =>
				(
					await import("../lib/extensions/orchestration/index.ts")
				).createSessionExtension(context),
		},
		...(hasCoding
			? {
					chainAdapter: codingChainAdapter,
					sessionPolicies: qualityReviewSessionPolicies,
					workerAgent: "coding/worker",
				}
			: {}),
		defaultModel: CONTENT_DEFAULT_MODEL,
	});
}
export function installContentRuntimeHost(): void {
	if (!hasRuntimeHost()) setRuntimeHost(createContentRuntime);
}

// Importing this content entry installs its consumer host before the CLI evaluates.
installContentRuntimeHost();
