import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
	checkArchitectureMapFreshness,
	checkArchitectureMapStatFreshness,
	computeArchitectureMapStatFingerprint,
	createProjectSnapshot,
	resolveArchitectureMapConfig,
} from "../../lib/architecture-map/index.ts";
import { loadProjectConfig } from "../../lib/config/index.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("architecture-map-freshness-");

const analyzer = {
	getConfigInputs: async () => ["tsconfig.json"],
};

describe("architecture map freshness", () => {
	test("reports missing current and stale from persisted frontmatter and disk state @cosmo-behavior plan:code-structure-map#B-007", async () => {
		await writeFixtureProject(tmp.path);
		const config = await resolveArchitectureMapConfig({
			projectRoot: tmp.path,
			projectConfig: { architectureMap: { sourceRoots: ["lib"] } },
		});

		await expect(
			checkArchitectureMapFreshness({
				projectRoot: tmp.path,
				config,
				analyzer,
			}),
		).resolves.toEqual({ kind: "missing" });

		const snapshot = await createProjectSnapshot({
			projectRoot: tmp.path,
			config,
			analyzer,
		});
		const statFingerprint = await computeArchitectureMapStatFingerprint({
			projectRoot: tmp.path,
			config,
			analyzer,
		});
		await writeIndexFrontmatter(tmp.path, {
			projectHash: snapshot.hash,
			statFingerprint: statFingerprint.hash,
		});

		await expect(
			checkArchitectureMapFreshness({
				projectRoot: tmp.path,
				config,
				analyzer,
			}),
		).resolves.toEqual({ kind: "current", hash: snapshot.hash });

		await writeFile(
			join(tmp.path, "lib", "alpha.ts"),
			"export const alpha = 12345;\n",
			"utf-8",
		);

		const stale = await checkArchitectureMapFreshness({
			projectRoot: tmp.path,
			config,
			analyzer,
		});

		expect(stale.kind).toBe("stale");
		expect(stale).toMatchObject({ oldHash: snapshot.hash });
		if (stale.kind === "stale") {
			expect(stale.newHash).not.toBe(snapshot.hash);
		}
	});

	test("reports stale when analyzer configuration changes but unrelated project config changes stay current @cosmo-behavior plan:code-structure-map#B-007", async () => {
		await writeFixtureProject(tmp.path);
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				domainBindings: { main: "alternate-main" },
				architectureMap: { sourceRoots: ["lib"] },
			}),
			"utf-8",
		);
		const firstProjectConfig = await loadProjectConfig(tmp.path);
		const firstConfig = await resolveArchitectureMapConfig({
			projectRoot: tmp.path,
			projectConfig: firstProjectConfig,
		});
		const snapshot = await createProjectSnapshot({
			projectRoot: tmp.path,
			config: firstConfig,
			analyzer,
		});
		await writeIndexFrontmatter(tmp.path, { projectHash: snapshot.hash });

		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				domainBindings: { main: "other-main" },
				architectureMap: { sourceRoots: ["lib"] },
			}),
			"utf-8",
		);
		const unrelatedProjectConfig = await loadProjectConfig(tmp.path);
		const unchangedMapConfig = await resolveArchitectureMapConfig({
			projectRoot: tmp.path,
			projectConfig: unrelatedProjectConfig,
		});

		await expect(
			checkArchitectureMapFreshness({
				projectRoot: tmp.path,
				config: unchangedMapConfig,
				analyzer,
			}),
		).resolves.toEqual({ kind: "current", hash: snapshot.hash });

		await writeFile(
			join(tmp.path, "tsconfig.json"),
			'{ "compilerOptions": { "module": "NodeNext", "strict": true } }\n',
			"utf-8",
		);

		const stale = await checkArchitectureMapFreshness({
			projectRoot: tmp.path,
			config: unchangedMapConfig,
			analyzer,
		});
		expect(stale.kind).toBe("stale");
		expect(stale).toMatchObject({ oldHash: snapshot.hash });
	});

	test("computes the turn-time stat fingerprint from included source analyzer config files and architecture-map config", async () => {
		await writeFixtureProject(tmp.path);
		const config = await resolveArchitectureMapConfig({
			projectRoot: tmp.path,
			projectConfig: { architectureMap: { sourceRoots: ["lib"] } },
		});
		const fingerprint = await computeArchitectureMapStatFingerprint({
			projectRoot: tmp.path,
			config,
			analyzer,
		});

		expect(fingerprint.hash).toMatch(/^[a-f0-9]{64}$/u);
		expect(fingerprint.files.map((file) => file.path)).toEqual([
			"lib/alpha.ts",
			"tsconfig.json",
		]);
		await writeIndexFrontmatter(tmp.path, {
			statFingerprint: fingerprint.hash,
		});

		await expect(
			checkArchitectureMapStatFreshness({
				projectRoot: tmp.path,
				config,
				analyzer,
			}),
		).resolves.toEqual({ kind: "current", hash: fingerprint.hash });

		const moduleRootConfig = await resolveArchitectureMapConfig({
			projectRoot: tmp.path,
			projectConfig: {
				architectureMap: { sourceRoots: ["lib"], moduleRoots: ["lib"] },
			},
		});
		const configStale = await checkArchitectureMapStatFreshness({
			projectRoot: tmp.path,
			config: moduleRootConfig,
			analyzer,
		});
		expect(configStale.kind).toBe("stale");
		expect(configStale).toMatchObject({ oldHash: fingerprint.hash });

		await writeFile(
			join(tmp.path, "lib", "alpha.ts"),
			"export const alpha = 12345;\n",
			"utf-8",
		);

		const stale = await checkArchitectureMapStatFreshness({
			projectRoot: tmp.path,
			config,
			analyzer,
		});
		expect(stale.kind).toBe("stale");
		expect(stale).toMatchObject({ oldHash: fingerprint.hash });
	});
});

async function writeFixtureProject(projectRoot: string): Promise<void> {
	await mkdir(join(projectRoot, "lib"), { recursive: true });
	await writeFile(
		join(projectRoot, "lib", "alpha.ts"),
		"export const alpha = 1;\n",
		"utf-8",
	);
	await writeFile(
		join(projectRoot, "tsconfig.json"),
		'{ "compilerOptions": { "module": "NodeNext" } }\n',
		"utf-8",
	);
}

async function writeIndexFrontmatter(
	projectRoot: string,
	values: { projectHash?: string; statFingerprint?: string },
): Promise<void> {
	await mkdir(join(projectRoot, "memory", "architecture"), { recursive: true });
	const lines = ["---"];
	if (values.projectHash) lines.push(`projectHash: ${values.projectHash}`);
	if (values.statFingerprint) {
		lines.push(`statFingerprint: ${values.statFingerprint}`);
	}
	lines.push("---", "", "# Architecture Map", "");
	await writeFile(
		join(projectRoot, "memory", "architecture", "index.md"),
		lines.join("\n"),
		"utf-8",
	);
}
