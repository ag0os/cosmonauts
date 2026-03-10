/**
 * Domain validation — checks domain/agent invariants after domain loading.
 *
 * Runs against an array of LoadedDomain objects and produces diagnostics
 * for issues like missing persona prompts, unresolvable capabilities,
 * extensions, subagents, leads, and workflow agents.
 */

import type { LoadedDomain } from "./types.ts";

/** Severity level for a validation diagnostic. */
export type DiagnosticSeverity = "error" | "warning";

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
	const diagnostics: DomainValidationDiagnostic[] = [];
	const shared = domains.find((d) => d.manifest.id === "shared");

	// Collect all known agent IDs across all domains in both bare and qualified
	// forms because workflows/subagent allowlists may use either.
	const allAgentIds = new Set<string>();
	for (const domain of domains) {
		for (const agentId of domain.agents.keys()) {
			allAgentIds.add(agentId);
			allAgentIds.add(`${domain.manifest.id}/${agentId}`);
		}
	}

	for (const domain of domains) {
		const domainId = domain.manifest.id;
		const isShared = domainId === "shared";

		// Rule 5: Domain lead resolves
		if (domain.manifest.lead !== undefined) {
			if (!domain.agents.has(domain.manifest.lead)) {
				diagnostics.push({
					domain: domainId,
					message: `Lead agent "${domain.manifest.lead}" is not in this domain's agents`,
					severity: "error",
				});
			}
		}

		// Rule 6: Workflow agents resolve
		for (const workflow of domain.workflows) {
			const stages = workflow.chain
				.split("->")
				.map((s) => s.trim())
				.filter((s) => s.length > 0);
			for (const stage of stages) {
				if (!allAgentIds.has(stage)) {
					diagnostics.push({
						domain: domainId,
						workflow: workflow.name,
						message: `Workflow stage "${stage}" does not resolve to any known agent`,
						severity: "warning",
					});
				}
			}
		}

		// Per-agent validations
		for (const [agentId, agent] of domain.agents) {
			// Rule 1: Persona prompt exists (non-shared domains only)
			if (!isShared && !domain.prompts.has(agentId)) {
				diagnostics.push({
					domain: domainId,
					agent: agentId,
					message: `Missing persona prompt "${agentId}" in domain prompts`,
					severity: "error",
				});
			}

			// Rule 2: Capabilities resolve (domain-first, fallback to shared)
			for (const cap of agent.capabilities) {
				const inDomain = domain.capabilities.has(cap);
				const inShared = shared?.capabilities.has(cap) ?? false;
				if (!inDomain && !inShared) {
					diagnostics.push({
						domain: domainId,
						agent: agentId,
						message: `Capability "${cap}" not found in domain "${domainId}" or "shared"`,
						severity: "error",
					});
				}
			}

			// Rule 3: Extensions resolve (domain-first, fallback to shared)
			for (const ext of agent.extensions) {
				const inDomain = domain.extensions.has(ext);
				const inShared = shared?.extensions.has(ext) ?? false;
				if (!inDomain && !inShared) {
					diagnostics.push({
						domain: domainId,
						agent: agentId,
						message: `Extension "${ext}" not found in domain "${domainId}" or "shared"`,
						severity: "error",
					});
				}
			}

			// Rule 4: Subagent entries resolve
			if (agent.subagents) {
				for (const sub of agent.subagents) {
					if (!allAgentIds.has(sub)) {
						diagnostics.push({
							domain: domainId,
							agent: agentId,
							message: `Subagent "${sub}" does not resolve to any known agent`,
							severity: "warning",
						});
					}
				}
			}
		}
	}

	return diagnostics;
}
