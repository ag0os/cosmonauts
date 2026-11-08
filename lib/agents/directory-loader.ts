import { readdir } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import { validateLoadedAgentDefinition } from "./declaration.ts";
import type { AgentDefinition } from "./types.ts";

/** Load the consumer's declaration modules, with no framework root or Markdown convention. */
export async function loadAgentDeclarations(
	directory: string,
): Promise<AgentDefinition[]> {
	if (!isAbsolute(directory))
		throw new Error("Agent declaration directory must be absolute");
	const definitions: AgentDefinition[] = [];
	const files = (await readdir(directory, { withFileTypes: true }))
		.filter(
			(entry) =>
				entry.isFile() &&
				!entry.name.startsWith(".") &&
				/\.(?:ts|js|mjs)$/.test(entry.name) &&
				!entry.name.endsWith(".d.ts"),
		)
		.sort((a, b) => a.name.localeCompare(b.name));
	for (const file of files) {
		const module = await import(pathToFileURL(join(directory, file.name)).href);
		const definition = module.default as AgentDefinition;
		if (!definition || typeof definition !== "object")
			throw new Error(
				`Agent declaration ${file.name} must default-export an AgentDefinition`,
			);
		validateLoadedAgentDefinition(definition);
		definitions.push(definition);
	}
	return definitions;
}
