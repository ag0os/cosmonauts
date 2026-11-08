// The current content installs its host only for direct Pi discovery.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import orchestrationExtension from "../../../../lib/extensions/orchestration/index.ts";
import { installContentRuntimeHost } from "../../../host-runtime.ts";

export { createSessionExtension } from "../../../../lib/extensions/orchestration/index.ts";
export default function contentOrchestration(pi: ExtensionAPI): void {
	installContentRuntimeHost();
	orchestrationExtension(pi);
}
