import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test } from "vitest";
import type { AgentDefinition } from "../../lib/agents/types.ts";

test("only the four consuming coding agents grant architecture memory", async () => {
	const agentDefinitions = await loadBundledCodingAgents();
	const consumers = agentDefinitions
		.filter((definition) => definition.memory?.architecture)
		.map((definition) => definition.id)
		.sort();

	expect(consumers).toEqual([
		"coordinator",
		"plan-reviewer",
		"planner",
		"worker",
	]);
});

async function loadBundledCodingAgents(): Promise<AgentDefinition[]> {
	const agentsDir = fileURLToPath(
		new URL("../../bundled/coding/agents/", import.meta.url),
	);
	const files = (await readdir(agentsDir))
		.filter((file) => file.endsWith(".ts"))
		.sort();
	const definitions: AgentDefinition[] = [];
	for (const file of files) {
		const module = (await import(
			pathToFileURL(join(agentsDir, file)).href
		)) as { default: AgentDefinition };
		definitions.push(module.default);
	}
	return definitions;
}
