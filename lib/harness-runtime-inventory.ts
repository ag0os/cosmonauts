import { join } from "node:path";
import { listNamedChains } from "./chains/loader.ts";
import { listHarnessTargets } from "./harness-adapters/registry.ts";
import type {
	HarnessPathRow,
	RuntimeInventorySnapshot,
} from "./harness-adapters/types.ts";
import type { CosmonautsRuntime } from "./runtime.ts";
import {
	discoverSkillCandidatesStrict,
	discoverSkills,
	type ExtraSkillSource,
} from "./skills/discovery.ts";

export interface ComposeHarnessRuntimeInventoryOptions {
	readonly projectRoot: string;
	readonly runtime: CosmonautsRuntime;
}

/** Compose live runtime facts at the only runtime-to-inward inventory seam. */
export async function composeHarnessRuntimeInventory(
	options: ComposeHarnessRuntimeInventoryOptions,
): Promise<RuntimeInventorySnapshot> {
	const { projectRoot, runtime } = options;
	const extras: ExtraSkillSource[] = (
		runtime.projectConfig.skillPaths ?? []
	).map((skillsDir) => ({ skillsDir, domain: "project" }));

	const [chains, effectiveSkills, strictDiscovery] = await Promise.all([
		listNamedChains(projectRoot, runtime.chains),
		discoverSkills(runtime.domains, extras, {
			domainContext: runtime.domainContext,
		}),
		discoverSkillCandidatesStrict(runtime.domains, extras, {
			domainContext: runtime.domainContext,
		}),
	]);

	return {
		chains: chains.map((chain) => ({
			name: chain.name,
			description: chain.description,
			expression: chain.chain,
		})),
		effectiveSkills: effectiveSkills.map((skill) => ({
			name: skill.name,
			domain: skill.domain,
			description: skill.description,
		})),
		candidates: strictDiscovery.candidates,
		sourceHealth: strictDiscovery.sourceHealth,
		paths: listHarnessPathRows(),
	};
}

function listHarnessPathRows(): HarnessPathRow[] {
	const rows: HarnessPathRow[] = [];
	for (const target of listHarnessTargets()) {
		if (target.status !== "implemented") continue;
		for (const adapter of target.adapters) {
			const relativePath = join(target.ownerDirectory, adapter.directory);
			rows.push({
				target: target.id,
				kind: adapter.kind,
				project: relativePath,
				personal: join("~", relativePath),
			});
		}
	}
	return rows.sort(
		(left, right) =>
			left.target.localeCompare(right.target) ||
			left.kind.localeCompare(right.kind),
	);
}
