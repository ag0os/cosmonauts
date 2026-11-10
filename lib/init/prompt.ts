import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { resolveDefaultLead } from "../agents/resolve-default-lead.ts";
import type { AgentInstructions } from "../agents/types.ts";
import type { ProjectConfig } from "../config/types.ts";
import type { CosmonautsRuntime } from "../runtime.ts";

interface InitPromptOptions {
	cwd: string;
	defaultConfig: ProjectConfig;
	/** The consumer's init instructions, from the lead domain's manifest. */
	instructions: string;
}

export type InitInstructionsResolution =
	| { readonly ok: true; readonly instructions: string }
	| { readonly ok: false; readonly message: string };

interface ResolveInitInstructionsOptions {
	readonly agent?: string;
	readonly domain?: string;
}

export function buildInitBootstrapPrompt(options: InitPromptOptions): string {
	const configTemplate = JSON.stringify(options.defaultConfig, null, 2);
	const fence = "```";

	return `You are running Cosmonauts init for ${options.cwd}.

This flow is interactive. Do not write or overwrite any files until the user explicitly confirms.

Follow these init instructions from your domain:

${options.instructions}

If you need to create .cosmonauts/config.json, start from this canonical default template:
${fence}json
${configTemplate}
${fence}`;
}

/**
 * Init instructions come from the consumer: the `init` field of the manifest
 * of the domain whose lead runs init. Cosmonauts ships none.
 */
export async function resolveInitInstructions(
	runtime: Pick<
		CosmonautsRuntime,
		| "domains"
		| "domainContext"
		| "domainRegistry"
		| "bindingResolver"
		| "agentRegistry"
	>,
	options: ResolveInitInstructionsOptions = {},
): Promise<InitInstructionsResolution> {
	const lead = resolveDefaultLead(runtime, options);
	if (!lead.domain)
		return {
			ok: false,
			message: `The init lead "${lead.id}" belongs to no domain, so it has no init instructions.`,
		};
	return resolveDomainInitInstructions(runtime, lead.domain);
}

/** Reads the `init` instructions a domain's manifest declares. */
export async function resolveDomainInitInstructions(
	runtime: Pick<CosmonautsRuntime, "domainRegistry">,
	domainId: string,
): Promise<InitInstructionsResolution> {
	const source = runtime.domainRegistry.get(domainId)?.manifest.init;
	if (!source)
		return {
			ok: false,
			message: `Domain "${domainId}" declares no init instructions. Add init: { kind: "inline", content } or { kind: "file", path } to its domain.ts manifest, then run init again.`,
		};
	return { ok: true, instructions: await readInitInstructions(source) };
}

async function readInitInstructions(
	source: AgentInstructions,
): Promise<string> {
	if (source.kind === "inline" && typeof source.content === "string")
		return source.content;
	if (source.kind === "file" && isAbsolute(source.path))
		return readFile(source.path, "utf-8");
	throw new Error(
		"Domain init instructions require inline content or an absolute file path",
	);
}
