/**
 * Domain validation — checks domain/agent invariants after domain loading.
 *
 * Runs against an array of LoadedDomain objects and produces diagnostics
 * for issues like missing persona prompts, unresolvable capabilities,
 * extensions, subagents, leads, and named-chain agents.
 */

import type { DomainBindingResolver } from "./bindings.ts";
import { canAccessSurfaceName } from "./public-surface.ts";
import type { LoadedDomain } from "./types.ts";

/** Severity level for a validation diagnostic. */
type DiagnosticSeverity = "error" | "warning";
type LoadedAgent =
	LoadedDomain["agents"] extends Map<string, infer Agent> ? Agent : never;
type AgentVisibility =
	| { readonly kind: "visible" }
	| { readonly kind: "not-found" }
	| {
			readonly kind: "internal";
			readonly domain: string;
			readonly agent: string;
	  };
interface AgentIndex {
	readonly ids: ReadonlySet<string>;
	readonly domains: readonly LoadedDomain[];
}
export interface DomainValidationOptions {
	readonly bindingResolver?: DomainBindingResolver;
}

/** A single validation issue found during domain validation. */
export interface DomainValidationDiagnostic {
	readonly domain: string;
	readonly agent?: string;
	readonly chain?: string;
	readonly message: string;
	readonly severity: DiagnosticSeverity;
}

/** Aggregates all error-severity diagnostics into a single throwable error. */
export class DomainValidationError extends Error {
	readonly diagnostics: readonly DomainValidationDiagnostic[];

	constructor(diagnostics: readonly DomainValidationDiagnostic[]) {
		const errors = diagnostics.filter((d) => d.severity === "error");
		const lines = errors.map(
			(d) =>
				`  [${d.domain}${d.agent ? `/${d.agent}` : ""}${d.chain ? ` chain:${d.chain}` : ""}] ${d.message}`,
		);
		super(
			`Domain validation failed with ${errors.length} error${errors.length === 1 ? "" : "s"}:\n${lines.join("\n")}`,
		);
		this.name = "DomainValidationError";
		this.diagnostics = errors;
	}
}

/**
 * Validate loaded domains against structural invariants.
 *
 * Returns an array of diagnostics (may be empty if everything is valid).
 * Does not throw — callers decide how to handle the diagnostics.
 */
export function validateDomains(
	domains: readonly LoadedDomain[],
	options: DomainValidationOptions = {},
): DomainValidationDiagnostic[] {
	const shared = findSharedDomain(domains);
	const portableDomains = findPortableDomains(domains);
	const agentIndex = collectKnownAgentIndex(domains);

	return [
		...validatePortableCapabilityOverlap(portableDomains),
		...domains.flatMap((domain) => [
			...validateDomainLead(domain),
			...validateNamedChainAgents(domain, agentIndex, options),
			...validateDomainAgents(
				domain,
				shared,
				portableDomains,
				agentIndex,
				options,
			),
		]),
	];
}

function findSharedDomain(
	domains: readonly LoadedDomain[],
): LoadedDomain | undefined {
	return domains.find((domain) => domain.manifest.id === "shared");
}

function findPortableDomains(domains: readonly LoadedDomain[]): LoadedDomain[] {
	return domains.filter(
		(domain) => domain.portable && domain.manifest.id !== "shared",
	);
}

function validatePortableCapabilityOverlap(
	portableDomains: readonly LoadedDomain[],
): DomainValidationDiagnostic[] {
	const diagnostics: DomainValidationDiagnostic[] = [];
	const portableCapProviders = new Map<string, string[]>();

	for (const domain of portableDomains) {
		for (const cap of domain.capabilities) {
			const providers = portableCapProviders.get(cap) ?? [];
			providers.push(domain.manifest.id);
			portableCapProviders.set(cap, providers);
		}
	}
	for (const [cap, providers] of portableCapProviders) {
		const firstProvider = providers[0];
		if (providers.length > 1 && firstProvider !== undefined) {
			diagnostics.push({
				domain: firstProvider,
				message: `Capability "${cap}" is provided by multiple portable domains: ${providers.join(", ")}`,
				severity: "warning",
			});
		}
	}

	return diagnostics;
}

function collectKnownAgentIndex(domains: readonly LoadedDomain[]): AgentIndex {
	const allAgentIds = new Set<string>();

	for (const domain of domains) {
		for (const agentId of domain.agents.keys()) {
			allAgentIds.add(agentId);
			allAgentIds.add(`${domain.manifest.id}/${agentId}`);
		}
	}

	return { ids: allAgentIds, domains };
}

function validateDomainLead(
	domain: LoadedDomain,
): DomainValidationDiagnostic[] {
	const lead = domain.manifest.lead;

	if (lead === undefined || domain.agents.has(lead)) {
		return [];
	}

	return [
		{
			domain: domain.manifest.id,
			message: `Lead agent "${lead}" is not in this domain's agents`,
			severity: "error",
		},
	];
}

function validateNamedChainAgents(
	domain: LoadedDomain,
	agentIndex: AgentIndex,
	options: DomainValidationOptions,
): DomainValidationDiagnostic[] {
	const diagnostics: DomainValidationDiagnostic[] = [];

	for (const chain of domain.chains) {
		for (const stage of parseChainStages(chain.chain)) {
			const visibility = resolveAgentVisibility(
				stage,
				domain.manifest.id,
				agentIndex.domains,
				options.bindingResolver,
			);
			if (visibility.kind === "visible") {
				continue;
			}
			if (visibility.kind === "internal") {
				diagnostics.push({
					domain: domain.manifest.id,
					chain: chain.name,
					message: `Named chain stage "${stage}" resolves to internal agent "${visibility.domain}/${visibility.agent}"`,
					severity: "warning",
				});
			} else {
				diagnostics.push({
					domain: domain.manifest.id,
					chain: chain.name,
					message: `Named chain stage "${stage}" does not resolve to any known agent`,
					severity: "warning",
				});
			}
		}
	}

	return diagnostics;
}

function parseChainStages(chain: string): string[] {
	return chain
		.split("->")
		.map((stage) => stage.trim())
		.filter((stage) => stage.length > 0);
}

function validateAgentPrompts(
	agentId: string,
	domain: LoadedDomain,
): DomainValidationDiagnostic[] {
	if (domain.manifest.id === "shared") {
		return [];
	}

	if (domain.prompts.has(agentId)) {
		return [];
	}

	return [
		{
			domain: domain.manifest.id,
			agent: agentId,
			message: `Missing persona prompt for domain "${domain.manifest.id}" agent "${agentId}"; expected prompts/${agentId}.md`,
			severity: "error",
		},
	];
}

function validateDomainAgents(
	domain: LoadedDomain,
	shared: LoadedDomain | undefined,
	portableDomains: readonly LoadedDomain[],
	agentIndex: AgentIndex,
	options: DomainValidationOptions,
): DomainValidationDiagnostic[] {
	return [...domain.agents].flatMap(([agentId, agent]) => [
		...validateAgentPrompts(agentId, domain),
		...validateAgentCapabilities(
			agentId,
			agent,
			domain,
			shared,
			portableDomains,
		),
		...validateAgentExtensions(agentId, agent, domain, shared, portableDomains),
		...validateAgentSubagents(agentId, agent, domain, agentIndex, options),
	]);
}

function validateAgentCapabilities(
	agentId: string,
	agent: LoadedAgent,
	domain: LoadedDomain,
	shared: LoadedDomain | undefined,
	portableDomains: readonly LoadedDomain[],
): DomainValidationDiagnostic[] {
	const diagnostics: DomainValidationDiagnostic[] = [];

	for (const cap of agent.capabilities) {
		if (isCapabilityResolvable(cap, domain, shared, portableDomains)) {
			continue;
		}

		diagnostics.push({
			domain: domain.manifest.id,
			agent: agentId,
			message: `Capability "${cap}" not found in domain "${domain.manifest.id}" or "shared"`,
			severity: "error",
		});
	}

	return diagnostics;
}

function isCapabilityResolvable(
	capability: string,
	domain: LoadedDomain,
	shared: LoadedDomain | undefined,
	portableDomains: readonly LoadedDomain[],
): boolean {
	return (
		domain.capabilities.has(capability) ||
		(shared?.capabilities.has(capability) ?? false) ||
		portableDomains.some((portable) => portable.capabilities.has(capability))
	);
}

function validateAgentExtensions(
	agentId: string,
	agent: LoadedAgent,
	domain: LoadedDomain,
	shared: LoadedDomain | undefined,
	portableDomains: readonly LoadedDomain[],
): DomainValidationDiagnostic[] {
	const diagnostics: DomainValidationDiagnostic[] = [];

	for (const extension of agent.extensions) {
		if (isExtensionResolvable(extension, domain, shared, portableDomains)) {
			continue;
		}

		diagnostics.push({
			domain: domain.manifest.id,
			agent: agentId,
			message: `Extension "${extension}" not found in domain "${domain.manifest.id}" or "shared"`,
			severity: "error",
		});
	}

	return diagnostics;
}

function isExtensionResolvable(
	extension: string,
	domain: LoadedDomain,
	shared: LoadedDomain | undefined,
	portableDomains: readonly LoadedDomain[],
): boolean {
	return (
		domain.extensions.has(extension) ||
		(shared?.extensions.has(extension) ?? false) ||
		portableDomains.some((portable) => portable.extensions.has(extension))
	);
}

function validateAgentSubagents(
	agentId: string,
	agent: LoadedAgent,
	domain: LoadedDomain,
	agentIndex: AgentIndex,
	options: DomainValidationOptions,
): DomainValidationDiagnostic[] {
	const diagnostics: DomainValidationDiagnostic[] = [];

	for (const subagent of agent.subagents ?? []) {
		const visibility = resolveAgentVisibility(
			subagent,
			domain.manifest.id,
			agentIndex.domains,
			options.bindingResolver,
		);
		if (visibility.kind === "visible") {
			continue;
		}
		if (visibility.kind === "internal") {
			diagnostics.push({
				domain: domain.manifest.id,
				agent: agentId,
				message: `Subagent "${subagent}" resolves to internal agent "${visibility.domain}/${visibility.agent}"`,
				severity: "warning",
			});
		} else {
			diagnostics.push({
				domain: domain.manifest.id,
				agent: agentId,
				message: `Subagent "${subagent}" does not resolve to any known agent`,
				severity: "warning",
			});
		}
	}

	return diagnostics;
}

function resolveAgentVisibility(
	reference: string,
	requesterDomain: string,
	domains: readonly LoadedDomain[],
	bindingResolver?: DomainBindingResolver,
): AgentVisibility {
	const boundVisibility = resolveBoundAgentVisibility(
		reference,
		requesterDomain,
		domains,
		bindingResolver,
	);
	if (boundVisibility) {
		return boundVisibility;
	}

	const slashIndex = reference.indexOf("/");
	if (slashIndex >= 0) {
		const domainId = reference.slice(0, slashIndex);
		const agentId = reference.slice(slashIndex + 1);
		return resolveQualifiedAgentVisibility(
			domainId,
			agentId,
			requesterDomain,
			domains,
		);
	}

	let visible = false;
	let internal: { domain: string; agent: string } | undefined;
	for (const domain of domains) {
		if (!domain.agents.has(reference)) continue;
		if (
			canAccessSurfaceName({
				domain,
				assetType: "agents",
				name: reference,
				requesterDomain,
			})
		) {
			visible = true;
		} else {
			internal = { domain: domain.manifest.id, agent: reference };
		}
	}

	if (visible) return { kind: "visible" };
	return internal ? { kind: "internal", ...internal } : { kind: "not-found" };
}

function resolveBoundAgentVisibility(
	reference: string,
	requesterDomain: string,
	domains: readonly LoadedDomain[],
	bindingResolver: DomainBindingResolver | undefined,
): AgentVisibility | undefined {
	if (!bindingResolver) return undefined;
	const qualifiedReference = reference.includes("/")
		? reference
		: `${requesterDomain}/${reference}`;
	const resolved = bindingResolver.resolveAgentReference(qualifiedReference);
	const visibility = resolveQualifiedAgentVisibility(
		resolved.resolved.role,
		resolved.resolved.agentId,
		requesterDomain,
		domains,
	);
	if (
		visibility.kind !== "not-found" ||
		resolved.binding.source !== "default" ||
		reference.includes("/")
	) {
		return visibility;
	}
	return undefined;
}

function resolveQualifiedAgentVisibility(
	domainId: string,
	agentId: string,
	requesterDomain: string,
	domains: readonly LoadedDomain[],
): AgentVisibility {
	const domain = domains.find(
		(candidate) => candidate.manifest.id === domainId,
	);
	if (!domain?.agents.has(agentId)) return { kind: "not-found" };
	return canAccessSurfaceName({
		domain,
		assetType: "agents",
		name: agentId,
		requesterDomain,
	})
		? { kind: "visible" }
		: { kind: "internal", domain: domainId, agent: agentId };
}
