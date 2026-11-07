import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import coordinator from "../../../../bundled/coding/agents/coordinator.ts";
import planReviewer from "../../../../bundled/coding/agents/plan-reviewer.ts";
import planner from "../../../../bundled/coding/agents/planner.ts";
import qualityManager from "../../../../bundled/coding/agents/quality-manager.ts";
import worker from "../../../../bundled/coding/agents/worker.ts";
import { manifest } from "../../../../bundled/coding/domain.ts";
import { qualifyAgentId } from "../../../../lib/agents/runtime-identity.ts";
import { createArchitectureMemoryExtension } from "../../../../lib/extensions/architecture-memory/index.ts";

export { createArchitectureMemoryExtension } from "../../../../lib/extensions/architecture-memory/index.ts";

export default function architectureMemoryExtension(pi: ExtensionAPI): void {
	const authorizedAgentIds = new Set(
		[planner, planReviewer, coordinator, worker, qualityManager]
			.filter((def) => def.memory?.architecture)
			.map((def) => qualifyAgentId(def.id, manifest.id)),
	);
	createArchitectureMemoryExtension({ authorizedAgentIds })(pi);
}

export { createSessionExtension } from "../../../../lib/extensions/architecture-memory/index.ts";
