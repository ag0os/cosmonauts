/**
 * Init extension — registers /init as a Pi command.
 * Agent-driven project initialization: analyzes the project and creates AGENTS.md.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

/**
 * Build the prompt that tells Cosmo how to initialize AGENTS.md.
 */
export function buildInitPrompt(cwd: string): string {
	return `Initialize this project for use with Cosmonauts by creating an AGENTS.md file in the project root (${cwd}).

Follow these steps:

1. Check if AGENTS.md already exists in the project root.
   - If it exists, report that it already exists and stop. Do not overwrite it.

2. Check if CLAUDE.md exists in the project root.
   - If it exists, use its content as the foundation for AGENTS.md. Adapt the content to the AGENTS.md format but preserve all conventions, rules, and instructions.

3. If neither AGENTS.md nor CLAUDE.md exists, scan the project to understand it:
   - Read package.json, tsconfig.json, Cargo.toml, pyproject.toml, go.mod, or other project manifests
   - Identify the language, framework, package manager, and test runner
   - Look at the project structure (key directories and files)
   - Check for existing linting/formatting configuration

4. Create AGENTS.md with:
   - Project overview (one paragraph: what it is, key technologies)
   - Build and test commands (how to build, run tests, lint, typecheck)
   - Coding conventions (style, imports, error handling patterns observed)
   - File structure overview (key directories and their purposes)

Keep it concise — AGENTS.md should be a practical reference, not documentation. Focus on what an AI coding agent needs to know to work effectively in this project.`;
}

export default function initExtension(pi: ExtensionAPI): void {
	pi.registerCommand("init", {
		description: "Initialize AGENTS.md for the current project",
		handler: async (_args, ctx) => {
			pi.sendUserMessage(buildInitPrompt(ctx.cwd));
		},
	});
}
