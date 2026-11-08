import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { loadDomainsFromSources } from "../../lib/domains/loader.ts";
import { CosmonautsRuntime } from "../../lib/runtime.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("manifest-drop-");

test.each([
	"alwaysActive",
	"resourceFallback",
	"default",
] as const)("an overriding manifest drops omitted %s and emits a source warning", async (flag) => {
	const lower = join(tmp.path, "lower");
	const higher = join(tmp.path, "higher");
	for (const dir of [lower, higher])
		await mkdir(join(dir, "studio"), { recursive: true });
	await writeFile(
		join(lower, "studio", "domain.ts"),
		`export default {id:"studio",description:"Base",${flag}:true}`,
	);
	await writeFile(
		join(higher, "studio", "domain.ts"),
		'export default {id:"studio",description:"Override"}',
	);
	const sources = [
		{ domainsDir: lower, origin: "lower", precedence: 0 },
		{ domainsDir: higher, origin: "higher", precedence: 1 },
	];
	const loaded = await loadDomainsFromSources(sources);
	expect(loaded[0]?.manifest[flag]).toBeUndefined();
	expect(loaded[0]?.declarationDiagnostics).toContainEqual(
		expect.objectContaining({
			severity: "warning",
			domain: "studio",
			origin: "higher",
			file: join(higher, "studio", "domain.ts"),
			message: expect.stringContaining(`dropped ${flag}`),
		}),
	);
	const warning = vi.spyOn(console, "error").mockImplementation(() => {});
	await CosmonautsRuntime.create({
		projectRoot: tmp.path,
		builtinDomainsDir: lower,
		pluginDirs: [higher],
		includeUserSources: false,
	});
	expect(warning).toHaveBeenCalledWith(
		expect.stringContaining(`dropped ${flag}`),
	);
});
