/**
 * Qualified-role string utilities.
 *
 * Centralises all domain/role string manipulation that was previously
 * duplicated across agent-spawner, chain-runner, resolver, runtime-identity,
 * and orchestration/index.
 *
 * A "qualified" role has the form `"domain/id"` (e.g. `"coding/worker"`).
 * An "unqualified" role is just the bare id (e.g. `"worker"`).
 */

import type { ModelConfig } from "../orchestration/types.ts";

// ============================================================================
// Qualify / Unqualify
// ============================================================================

/** Prefix an id with a domain.  When `domain` is omitted the id is returned as-is. */
export function qualifyRole(id: string, domain?: string): string {
	return domain ? `${domain}/${id}` : id;
}

/** Strip the domain prefix, returning only the bare role id. */
export function unqualifyRole(qualified: string): string {
	const slashIndex = qualified.lastIndexOf("/");
	return slashIndex === -1 ? qualified : qualified.slice(slashIndex + 1);
}

// ============================================================================
// Split
// ============================================================================

/** Split a possibly-qualified role into its domain and id parts. */
export function splitRole(qualified: string): {
	domain: string | undefined;
	id: string;
} {
	const slashIndex = qualified.indexOf("/");
	if (slashIndex < 0) {
		return { domain: undefined, id: qualified };
	}
	return {
		domain: qualified.slice(0, slashIndex),
		id: qualified.slice(slashIndex + 1),
	};
}

// ============================================================================
// Config-key mapping
// ============================================================================

/**
 * Map a role string (qualified or unqualified) to its corresponding
 * {@link ModelConfig} key.  Returns `undefined` for unknown roles.
 */
export function roleToConfigKey(
	role: string,
): keyof Omit<ModelConfig, "default"> | undefined {
	switch (unqualifyRole(role)) {
		case "planner":
			return "planner";
		case "task-manager":
			return "taskManager";
		case "coordinator":
			return "coordinator";
		case "worker":
			return "worker";
		case "quality-manager":
			return "qualityManager";
		case "integration-verifier":
			return "integrationVerifier";
		case "reviewer":
			return "reviewer";
		case "fixer":
			return "fixer";
		default:
			return undefined;
	}
}
