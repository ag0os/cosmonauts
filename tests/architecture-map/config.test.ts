import { mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { resolveArchitectureMapConfig } from "../../lib/architecture-map/index.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("architecture-map-config-");

describe("resolveArchitectureMapConfig", () => {
	test("ignores architecture map roots that escape the project root @cosmo-behavior plan:code-structure-map#B-018", async () => {
		const projectRoot = join(tmp.path, "project");
		const outsideRoot = join(tmp.path, "outside");
		await mkdir(join(projectRoot, "lib", "safe"), { recursive: true });
		await mkdir(join(projectRoot, "src"), { recursive: true });
		await mkdir(outsideRoot, { recursive: true });
		await symlink(outsideRoot, join(projectRoot, "outside-link"));
		const warn = vi.spyOn(console, "error").mockImplementation(() => {});

		const config = await resolveArchitectureMapConfig({
			projectRoot,
			projectConfig: {
				architectureMap: {
					sourceRoots: [
						"lib",
						join(projectRoot, "src"),
						"../outside",
						"outside-link",
					],
					moduleRoots: ["lib/safe", "/tmp/outside-module", "lib/../escape"],
				},
			},
		});

		expect(config.sourceRoots).toEqual(["lib"]);
		expect(config.moduleRoots).toEqual(["lib/safe"]);
		expect(warn).toHaveBeenCalledTimes(5);
		const warnings = warn.mock.calls.map((call) => String(call[0])).join("\n");
		expect(warnings).toContain("architectureMap.sourceRoots");
		expect(warnings).toContain("architectureMap.moduleRoots");
		expect(warnings).toContain("absolute paths and traversal");
		expect(warnings).toContain("resolved path is outside the project root");
		warn.mockRestore();
	});
});
