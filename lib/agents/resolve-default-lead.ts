import type { DomainBindingResolver } from "../domains/bindings.ts";
import { selectDefaultDomain } from "../domains/default-domain.ts";
import type { LoadedDomain } from "../domains/types.ts";
import type { AgentDefinition } from "./types.ts";

interface DefaultLeadRuntime {
	readonly domains: readonly LoadedDomain[];
	readonly domainContext?: string;
	readonly domainRegistry: {
		get(id: string): LoadedDomain | undefined;
	};
	readonly bindingResolver?: DomainBindingResolver;
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
	const resolvedDomainContext = resolveDomainContext(runtime, domainContext);

	if (options.agent) {
		return runtime.agentRegistry.resolve(options.agent, domainContext);
	}

	if (domainContext) {
		const leadDomain = resolvedDomainContext ?? domainContext;
		const domainLead = runtime.domainRegistry.get(leadDomain)?.manifest.lead;
		if (domainLead) {
			return runtime.agentRegistry.resolve(domainLead, domainContext);
		}
		throw new Error(`Domain "${leadDomain}" has no lead agent`);
	}

	const defaultDomain = selectDefaultDomain(runtime.domains);
	if (defaultDomain?.manifest.lead) {
		return runtime.agentRegistry.resolve(
			defaultDomain.manifest.lead,
			defaultDomain.manifest.id,
		);
	}
	const fallback = runtime.domains.find(
		(domain) => !domain.manifest.resourceFallback && domain.manifest.lead,
	);
	if (fallback?.manifest.lead) {
		return runtime.agentRegistry.resolve(
			fallback.manifest.lead,
			fallback.manifest.id,
		);
	}

	throw new Error("No domain with a lead agent installed");
}

function resolveDomainContext(
	runtime: DefaultLeadRuntime,
	domainContext: string | undefined,
): string | undefined {
	if (!domainContext) return undefined;
	return (
		runtime.bindingResolver?.resolveKnownRole(domainContext)?.domainId ??
		domainContext
	);
}
