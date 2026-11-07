import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { qualifyAgentId } from "../../../../lib/agents/runtime-identity.ts";
import { createAgentMemoryExtension } from "../../../../lib/extensions/agent-memory/index.ts";
import definition from "../../../main/agents/cosmo.ts";
import { manifest } from "../../../main/domain.ts";

export {
	type AgentMemoryExtensionDeps,
	type AgentMemoryStoreFactoryOptions,
	createAgentMemoryExtension,
} from "../../../../lib/extensions/agent-memory/index.ts";

// The current content is a consumer; bare Pi loading uses its explicit grant.
export default function agentMemoryExtension(pi: ExtensionAPI): void {
	createAgentMemoryExtension({
		authorizedAgentId: definition.memory?.authored
			? qualifyAgentId(definition.id, manifest.id)
			: null,
		episodes: definition.memory?.episodes,
	})(pi);
}

export { createSessionExtension } from "../../../../lib/extensions/agent-memory/index.ts";
