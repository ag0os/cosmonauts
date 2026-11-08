import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "vitest";
import { loadAgentDeclarations } from "../../lib/agents/directory-loader.ts";
import { CosmonautsRuntime } from "../../lib/runtime.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("declaration-directory-");
const actor = {
	id: "scribe",
	description: "External",
	model: "consumer/model",
	instructions: { kind: "inline", content: "Write" },
	capabilities: [],
	extensions: [],
	skills: [],
	tools: "none",
	projectContext: false,
	loop: false,
	session: "ephemeral",
	memory: { authored: true },
};

test("loads only declaration modules from an explicit consumer directory", async () => {
	await writeFile(
		join(tmp.path, "scribe.mjs"),
		`export default ${JSON.stringify(actor)}`,
	);
	await writeFile(join(tmp.path, ".hidden.js"), "throw new Error('hidden')");
	await writeFile(join(tmp.path, "types.d.ts"), "throw new Error('types')");
	await writeFile(join(tmp.path, "README.md"), "Ignored");
	await mkdir(join(tmp.path, "nested.ts"));
	const agents = await loadAgentDeclarations(tmp.path);
	expect(agents).toEqual([actor]);
	const runtime = await CosmonautsRuntime.create({
		projectRoot: tmp.path,
		agents,
		projectConfig: {},
	});
	expect(runtime.agentRegistry.resolve("scribe").memory).toEqual({
		authored: true,
	});
	expect(runtime.domains).toEqual([]);
});

test("rejects relative roots, missing exports and undeclared file memory policy", async () => {
	await expect(loadAgentDeclarations("relative")).rejects.toThrow(
		"must be absolute",
	);
	await writeFile(join(tmp.path, "missing.js"), "export const ignored = true");
	await expect(loadAgentDeclarations(tmp.path)).rejects.toThrow(
		"must default-export",
	);
	const other = join(tmp.path, "other");
	await mkdir(other);
	await writeFile(
		join(other, "actor.js"),
		`export default ${JSON.stringify({ ...actor, memory: undefined })}`,
	);
	await expect(loadAgentDeclarations(other)).rejects.toThrow(
		"explicit memory grants",
	);
});
