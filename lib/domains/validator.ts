/**
 * Domain validation — checks domain/agent invariants after domain loading.
 *
 * Runs against an array of LoadedDomain objects and produces diagnostics
 * for issues like missing persona prompts, unresolvable capabilities,
 * extensions, subagents, leads, and workflow agents.
 */

import type { LoadedDomain } from "./types.ts";

/** Severity level for a validation diagnostic. */
type DiagnosticSeverity = "error" | "warning";
type LoadedAgent =
	LoadedDomain["agents"] extends Map<string, infer Agent> ? Agent : never;

/** A single validation issue found during domain validation. */
export interface DomainValidationDiagnostic {
	readonly domain: string;
	readonly agent?: string;
	readonly workflow?: string;
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
				`  [${d.domain}${d.agent ? `/${d.agent}` : ""}${d.workflow ? ` workflow:${d.workflow}` : ""}] ${d.message}`,
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
): DomainValidationDiagnostic[] {
	const shared = findSharedDomain(domains);
	const portableDomains = findPortableDomains(domains);
	const allAgentIds = collectKnownAgentIds(domains);

	return [
		...validatePortableCapabilityOverlap(portableDomains),
		...domains.flatMap((domain) => [
			...validateDomainLead(domain),
			...validateWorkflowAgents(domain, allAgentIds),
			...validateDomainAgents(domain, shared, portableDomains, allAgentIds),
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

function collectKnownAgentIds(domains: readonly LoadedDomain[]): Set<string> {
	const allAgentIds = new Set<string>();

	for (const domain of domains) {
		for (const agentId of domain.agents.keys()) {
			allAgentIds.add(agentId);
			allAgentIds.add(`${domain.manifest.id}/${agentId}`);
		}
	}

	return allAgentIds;
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

function validateWorkflowAgents(
	domain: LoadedDomain,
	allAgentIds: ReadonlySet<string>,
): DomainValidationDiagnostic[] {
	const diagnostics: DomainValidationDiagnostic[] = [];

	for (const workflow of domain.workflows) {
		for (const stage of parseWorkflowStages(workflow.chain)) {
			if (!allAgentIds.has(stage)) {
				diagnostics.push({
					domain: domain.manifest.id,
					workflow: workflow.name,
					message: `Workflow stage "${stage}" does not resolve to any known agent`,
					severity: "warning",
				});
			}
		}
	}

	return diagnostics;
}

function parseWorkflowStages(chain: string): string[] {
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
			message: `Missing persona prompt "${agentId}" in domain prompts`,
			severity: "error",
		},
	];
}

function validateDomainAgents(
	domain: LoadedDomain,
	shared: LoadedDomain | undefined,
	portableDomains: readonly LoadedDomain[],
	allAgentIds: ReadonlySet<string>,
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
		...validateAgentSubagents(agentId, agent, domain, allAgentIds),
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
	allAgentIds: ReadonlySet<string>,
): DomainValidationDiagnostic[] {
	const diagnostics: DomainValidationDiagnostic[] = [];

	for (const subagent of agent.subagents ?? []) {
		if (!allAgentIds.has(subagent)) {
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
