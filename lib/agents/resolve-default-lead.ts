import type { LoadedDomain } from "../domains/types.ts";
import type { AgentDefinition } from "./types.ts";

interface DefaultLeadRuntime {
	readonly domains: readonly LoadedDomain[];
	readonly domainContext?: string;
	readonly domainRegistry: {
		get(id: string): LoadedDomain | undefined;
	};
	readonly agentRegistry: {
		resolve(id: string, domainContext?: string): AgentDefinition;
	};
}

interface ResolveDefaultLeadOptions {
	readonly agent?: string;
	readonly domain?: string;
}

export function resolveDefaultLead(
	runtime: DefaultLeadRuntime,
	options: ResolveDefaultLeadOptions,
): AgentDefinition {
	const domainContext = options.domain ?? runtime.domainContext;

	if (options.agent) {
		return runtime.agentRegistry.resolve(options.agent, domainContext);
	}

	if (domainContext) {
		const domainLead = runtime.domainRegistry.get(domainContext)?.manifest.lead;
		if (domainLead) {
			return runtime.agentRegistry.resolve(domainLead, domainContext);
		}
		throw new Error(`Domain "${domainContext}" has no lead agent`);
	}

	const mainLead = runtime.domainRegistry.get("main")?.manifest.lead;
	if (mainLead) {
		return runtime.agentRegistry.resolve(mainLead, "main");
	}

	const fallback = runtime.domains.find(
		(domain) =>
			!["shared", "main"].includes(domain.manifest.id) && domain.manifest.lead,
	);
	if (fallback?.manifest.lead) {
		return runtime.agentRegistry.resolve(
			fallback.manifest.lead,
			fallback.manifest.id,
		);
	}

	throw new Error("No domain with a lead agent installed");
}
