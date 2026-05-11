import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createDefaultProjectConfig } from "../../../../lib/config/defaults.ts";
import { buildInitBootstrapPrompt } from "../../../../lib/init/prompt.ts";

export function buildInitPrompt(cwd: string): string {
	return buildInitBootstrapPrompt({
		cwd,
		defaultConfig: createDefaultProjectConfig(),
	});
}

export default function initExtension(pi: ExtensionAPI): void {
	pi.registerCommand("init", {
		description: "Initialize AGENTS.md for the current project",
		handler: async (_args, ctx) => {
			pi.sendUserMessage(buildInitPrompt(ctx.cwd));
		},
	});
}
