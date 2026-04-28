import type { ProjectConfig } from "../config/types.ts";

interface InitPromptOptions {
	cwd: string;
	defaultConfig: ProjectConfig;
}

export function buildInitBootstrapPrompt(options: InitPromptOptions): string {
	const configTemplate = JSON.stringify(options.defaultConfig, null, 2);
	const fence = "```";

	return `You are running Cosmonauts init for ${options.cwd}. Load /skill:init before doing anything else.

This flow is interactive. Do not write or overwrite any files until the user explicitly confirms.

If you need to create .cosmonauts/config.json, start from this canonical default template:
${fence}json
${configTemplate}
${fence}`;
}
