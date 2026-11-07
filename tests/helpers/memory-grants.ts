/** Explicit consumer grants for the legacy memory behavior fixtures. */
import { createAgentMemoryExtension as createAuthoredProvider } from "../../lib/extensions/agent-memory/index.ts";
import { createArchitectureMemoryExtension as createArchitectureProvider } from "../../lib/extensions/architecture-memory/index.ts";

export function createAgentMemoryExtension(
	deps: Parameters<typeof createAuthoredProvider>[0] = {},
) {
	return createAuthoredProvider({
		authorizedAgentId: "main/cosmo",
		episodes: true,
		...deps,
	});
}

export function createArchitectureMemoryExtension(
	deps: Parameters<typeof createArchitectureProvider>[0] = {},
) {
	return createArchitectureProvider({
		authorizedAgentIds: new Set([
			"coding/planner",
			"coding/plan-reviewer",
			"coding/coordinator",
			"coding/worker",
			"coding/quality-manager",
		]),
		...deps,
	});
}
