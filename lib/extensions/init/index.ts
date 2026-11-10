import type {
	ExtensionAPI,
	InlineExtension,
} from "@earendil-works/pi-coding-agent";
import { createDefaultProjectConfig } from "../../config/defaults.ts";
import {
	buildInitBootstrapPrompt,
	type InitInstructionsResolution,
	resolveDomainInitInstructions,
} from "../../init/prompt.ts";
import type { SessionProviderContext } from "../session-provider.ts";

export function buildInitPrompt(cwd: string, instructions: string): string {
	return buildInitBootstrapPrompt({
		cwd,
		defaultConfig: createDefaultProjectConfig(),
		instructions,
	});
}

/** `/init` gives the active agent the init instructions of its own domain. */
export function createSessionExtension(
	context: SessionProviderContext,
): InlineExtension {
	return (pi) => registerInitCommand(pi, context);
}

/** Loaded by path, with no session context: `/init` reports that it cannot run. */
export default function initExtension(pi: ExtensionAPI): void {
	registerInitCommand(pi, undefined);
}

function registerInitCommand(
	pi: ExtensionAPI,
	context: SessionProviderContext | undefined,
): void {
	pi.registerCommand("init", {
		description: "Initialize AGENTS.md for the current project",
		handler: async (_args, ctx) => {
			const init = await resolveSessionInit(context);
			if (!init.ok) {
				ctx.ui.notify(init.message, "error");
				return;
			}
			pi.sendUserMessage(buildInitPrompt(ctx.cwd, init.instructions));
		},
	});
}

async function resolveSessionInit(
	context: SessionProviderContext | undefined,
): Promise<InitInstructionsResolution> {
	const runtime = context?.runtime;
	if (!context || !runtime)
		return {
			ok: false,
			message:
				"/init needs a Cosmonauts runtime to find the active agent's init instructions.",
		};
	const { agentId } = context;
	const slash = agentId.indexOf("/");
	if (slash < 0)
		return {
			ok: false,
			message: `/init: the active agent "${agentId}" belongs to no domain, so it has no init instructions.`,
		};
	const domainId = agentId.slice(0, slash);
	if (!runtime.domainRegistry.get(domainId))
		return {
			ok: false,
			message: `/init: the active agent "${agentId}" belongs to domain "${domainId}", which this session's runtime does not have.`,
		};
	return resolveDomainInitInstructions(runtime, domainId);
}
