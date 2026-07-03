import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
	createProjectSnapshot,
	resolveArchitectureMapConfig,
	typescriptSourceAnalyzer,
} from "../../lib/architecture-map/index.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("architecture-map-analyzer-");

describe("typescriptSourceAnalyzer", () => {
	test("records public interfaces internal dependencies and external imports @cosmo-behavior plan:code-structure-map#B-003", async () => {
		await writeAnalyzerFixture(tmp.path);
		const config = await resolveArchitectureMapConfig({
			projectRoot: tmp.path,
			projectConfig: {
				architectureMap: {
					sourceRoots: ["src"],
					moduleRoots: ["src/barrel", "src/features", "src/shared"],
				},
			},
		});
		const snapshot = await createProjectSnapshot({
			projectRoot: tmp.path,
			config,
			analyzer: typescriptSourceAnalyzer,
		});

		const result = await typescriptSourceAnalyzer.analyze({
			projectRoot: tmp.path,
			config,
			snapshot,
		});

		expect(result.diagnostics).toEqual([]);
		const modules = new Map(
			result.modules.map((module) => [module.resource, module]),
		);
		expect([...modules.keys()]).toEqual([
			"src/barrel",
			"src/features",
			"src/shared",
		]);

		const barrel = modules.get("src/barrel");
		expect(barrel?.hasBarrel).toBe(true);
		expect(barrel?.publicInterface.map((item) => item.name).sort()).toEqual([
			"PublicBarrel",
			"createBarrel",
		]);
		expect(
			barrel?.publicInterface.some((item) => item.name === "HiddenBarrel"),
		).toBe(false);

		const features = modules.get("src/features");
		expect(features?.hasBarrel).toBe(false);
		expect(features?.publicInterface.map((item) => item.name).sort()).toEqual([
			"ConsumerApi",
			"consumer",
		]);
		expect(features?.dependencies).toEqual([
			{
				resource: "src/barrel",
				importedBy: ["src/features/consumer.ts"],
			},
			{
				resource: "src/shared",
				importedBy: ["src/features/consumer.ts"],
			},
		]);
		expect(features?.externalDependencies).toEqual([
			"react",
			"unresolved-side-effect",
		]);
	});
});

async function writeAnalyzerFixture(projectRoot: string): Promise<void> {
	await mkdir(join(projectRoot, "src", "barrel"), { recursive: true });
	await mkdir(join(projectRoot, "src", "features"), { recursive: true });
	await mkdir(join(projectRoot, "src", "shared"), { recursive: true });
	await writeFile(
		join(projectRoot, "package.json"),
		JSON.stringify({ type: "module" }),
		"utf-8",
	);
	await writeFile(
		join(projectRoot, "tsconfig.json"),
		JSON.stringify({
			compilerOptions: {
				target: "ES2023",
				module: "ESNext",
				moduleResolution: "Bundler",
				baseUrl: ".",
				paths: {
					"@shared/*": ["src/shared/*"],
				},
				allowImportingTsExtensions: true,
				strict: true,
			},
			include: ["src/**/*.ts"],
		}),
		"utf-8",
	);
	await writeFile(
		join(projectRoot, "src", "barrel", "index.ts"),
		[
			'export type { PublicBarrel } from "./public.ts";',
			'export { createBarrel } from "./public.ts";',
			"",
		].join("\n"),
		"utf-8",
	);
	await writeFile(
		join(projectRoot, "src", "barrel", "public.ts"),
		[
			"export interface PublicBarrel {",
			"\tid: string;",
			"}",
			"export function createBarrel(): PublicBarrel {",
			'\treturn { id: "barrel" };',
			"}",
			"",
		].join("\n"),
		"utf-8",
	);
	await writeFile(
		join(projectRoot, "src", "barrel", "private.ts"),
		["export interface HiddenBarrel {", "\tsecret: string;", "}", ""].join(
			"\n",
		),
		"utf-8",
	);
	await writeFile(
		join(projectRoot, "src", "shared", "models.ts"),
		["export interface SharedThing {", "\tlabel: string;", "}", ""].join("\n"),
		"utf-8",
	);
	await writeFile(
		join(projectRoot, "src", "features", "consumer.ts"),
		[
			'import React from "react";',
			'import "unresolved-side-effect";',
			'import { createBarrel } from "../barrel/index.ts";',
			'import type { SharedThing } from "@shared/models";',
			"export interface ConsumerApi {",
			"\tshared: SharedThing;",
			"}",
			"export const consumer = createBarrel;",
			"void React;",
			"",
		].join("\n"),
		"utf-8",
	);
}
