import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import {
	createArchitectureProgram,
	executeArchitectureGenerate,
	renderArchitectureGenerateResult,
} from "../../../cli/architecture/subcommand.ts";
import type {
	GenerateArchitectureMapOptions,
	GenerateArchitectureMapResult,
	NarrativeProvider,
} from "../../../lib/architecture-map/index.ts";
import { captureCliOutput } from "../../helpers/cli.ts";
import { useTempDir } from "../../helpers/fs.ts";

const tmp = useTempDir("architecture-cli-");
type GenerateArchitectureMapFn = (
	options: GenerateArchitectureMapOptions,
) => Promise<GenerateArchitectureMapResult>;

function fakeProvider(): NarrativeProvider {
	return {
		generate: vi.fn(async () => ({
			oneLiner: "Module summary.",
			text: "Module narrative.",
		})),
	};
}

describe("architecture generate CLI rendering", () => {
	test.each<{
		name: string;
		result: GenerateArchitectureMapResult;
		exitCode: number;
		human: readonly string[];
		plain: readonly string[];
	}>([
		{
			name: "written",
			result: {
				kind: "written",
				changedFiles: ["memory/architecture/index.md"],
				pendingModules: ["src/domain"],
			},
			exitCode: 0,
			human: [
				"Architecture map written.",
				"Changed files:",
				"  memory/architecture/index.md",
				"Pending narratives:",
				"  src/domain",
			],
			plain: [
				"kind=written",
				"changedFiles=memory/architecture/index.md",
				"pendingModules=src/domain",
			],
		},
		{
			name: "unchanged",
			result: { kind: "unchanged" },
			exitCode: 0,
			human: ["Architecture map unchanged."],
			plain: ["kind=unchanged"],
		},
		{
			name: "unsupported",
			result: {
				kind: "unsupported",
				reason: "W1 supports TypeScript projects only.",
			},
			exitCode: 1,
			human: [
				"Architecture map unsupported-project: W1 supports TypeScript projects only.",
			],
			plain: [
				"kind=unsupported",
				"reason=W1 supports TypeScript projects only.",
			],
		},
		{
			name: "failed",
			result: {
				kind: "failed",
				error: "disk full",
				previousMapIntact: true,
			},
			exitCode: 1,
			human: ["Architecture map failed: disk full", "Previous map intact: yes"],
			plain: ["kind=failed", "error=disk full", "previousMapIntact=true"],
		},
	])("renders $name result from the generator union", (scenario) => {
		expect(renderArchitectureGenerateResult(scenario.result, "human")).toEqual({
			exitCode: scenario.exitCode,
			rendered: { kind: "lines", lines: scenario.human },
		});
		expect(renderArchitectureGenerateResult(scenario.result, "plain")).toEqual({
			exitCode: scenario.exitCode,
			rendered: { kind: "lines", lines: scenario.plain },
		});
		expect(renderArchitectureGenerateResult(scenario.result, "json")).toEqual({
			exitCode: scenario.exitCode,
			rendered: { kind: "json", value: scenario.result },
		});
	});
});

describe("architecture generate command", () => {
	test("dispatches generate with --no-narrative, --json, and --plain surfaces", async () => {
		const generate = vi.fn<GenerateArchitectureMapFn>(async (options) => {
			await options.narrativeProvider?.generate({
				skeleton: {
					resource: "lib",
					rootDir: "lib",
					files: [],
					hasBarrel: false,
					publicInterface: [],
					dependencies: [],
					externalDependencies: [],
					sourceHash: "source",
					skeletonHash: "skeleton",
				},
			});
			return { kind: "unchanged" };
		});
		const createNarrativeProvider = vi.fn(fakeProvider);
		const program = createArchitectureProgram({
			generateArchitectureMap: generate,
			createNarrativeProvider,
		});
		const output = captureCliOutput();

		try {
			await program.parseAsync(["generate", "--no-narrative", "--json"], {
				from: "user",
			});
			await program.parseAsync(["generate", "--plain"], { from: "user" });
		} finally {
			output.restore();
		}

		expect(generate).toHaveBeenCalledTimes(2);
		expect(generate.mock.calls[0]?.[0]).not.toHaveProperty("narrativeProvider");
		expect(generate.mock.calls[1]?.[0]).toHaveProperty("narrativeProvider");
		expect(createNarrativeProvider).toHaveBeenCalledTimes(1);
		expect(output.stderr()).toBe(
			[
				"Generating architecture map...",
				"Generating architecture narratives...",
				"",
			].join("\n"),
		);
	});

	test("keeps JSON stdout clean and does not emit progress", async () => {
		const generate = vi.fn<GenerateArchitectureMapFn>(async () => ({
			kind: "unchanged",
		}));
		const program = createArchitectureProgram({
			generateArchitectureMap: generate,
			createNarrativeProvider: vi.fn(fakeProvider),
		});
		const output = captureCliOutput();

		try {
			await program.parseAsync(["generate", "--json"], { from: "user" });
		} finally {
			output.restore();
		}

		expect(output.stderr()).toBe("");
		expect(JSON.parse(output.stdout())).toEqual({ kind: "unchanged" });
	});

	test("honors --no-narrative by omitting the provider from generator options", async () => {
		const generate = vi.fn<GenerateArchitectureMapFn>(async () => ({
			kind: "unchanged",
		}));
		const createNarrativeProvider = vi.fn(fakeProvider);

		const result = await executeArchitectureGenerate({
			projectRoot: tmp.path,
			noNarrative: true,
			outputMode: "plain",
			generateArchitectureMap: generate,
			createNarrativeProvider,
		});

		expect(result.result).toEqual({ kind: "unchanged" });
		expect(generate).toHaveBeenCalledWith(
			expect.not.objectContaining({ narrativeProvider: expect.anything() }),
		);
		expect(createNarrativeProvider).not.toHaveBeenCalled();
	});

	test("reports unsupported non TypeScript projects without writing a map @cosmo-behavior plan:code-structure-map#B-009", async () => {
		await writeFile(join(tmp.path, "package.json"), '{"type":"module"}\n');
		const createNarrativeProvider = vi.fn(fakeProvider);

		const result = await executeArchitectureGenerate({
			projectRoot: tmp.path,
			noNarrative: false,
			outputMode: "plain",
			createNarrativeProvider,
		});

		expect(result.exitCode).toBe(1);
		expect(result.result).toMatchObject({
			kind: "unsupported",
			reason: expect.stringContaining("TypeScript"),
		});
		expect(result.rendered).toEqual({
			kind: "lines",
			lines: ["kind=unsupported", expect.stringContaining("TypeScript")],
		});
		await expect(
			access(join(tmp.path, "memory", "architecture")),
		).rejects.toMatchObject({ code: "ENOENT" });
	});
});
