import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createDefaultProjectConfig } from "../../config/defaults.ts";
import {
	buildInitBootstrapPrompt,
	resolveInitInstructions,
} from "../../init/prompt.ts";
import { getHostRuntime, hasRuntimeHost } from "../../runtime-host.ts";

export function buildInitPrompt(cwd: string, instructions: string): string {
	return buildInitBootstrapPrompt({
		cwd,
		defaultConfig: createDefaultProjectConfig(),
		instructions,
	});
}

export default function initExtension(pi: ExtensionAPI): void {
	pi.registerCommand("init", {
		description: "Initialize AGENTS.md for the current project",
		handler: async (_args, ctx) => {
			if (!hasRuntimeHost()) {
				ctx.ui.notify(
					"/init needs a Cosmonauts runtime host to find the domain's init instructions.",
					"error",
				);
				return;
			}
			const runtime = await getHostRuntime({ projectRoot: ctx.cwd });
			const init = await resolveInitInstructions(runtime);
			if (!init.ok) {
				ctx.ui.notify(init.message, "error");
				return;
			}
			pi.sendUserMessage(buildInitPrompt(ctx.cwd, init.instructions));
		},
	});
}
