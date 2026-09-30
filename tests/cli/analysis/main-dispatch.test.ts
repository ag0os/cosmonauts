import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";

const analysisProgramMocks = vi.hoisted(() => ({
	createAnalysisProgram: vi.fn(),
	action: vi.fn(),
}));

const runtimeMocks = vi.hoisted(() => ({
	create: vi.fn(),
}));

vi.mock("../../../cli/analysis/subcommand.ts", () => ({
	createAnalysisProgram: analysisProgramMocks.createAnalysisProgram,
}));

vi.mock("../../../lib/runtime.ts", () => ({
	CosmonautsRuntime: { create: runtimeMocks.create },
}));

describe("cli/main analysis dispatch", () => {
	const originalArgv = process.argv;

	afterEach(() => {
		process.argv = originalArgv;
		process.exitCode = undefined;
		vi.clearAllMocks();
		vi.resetModules();
	});

	it("routes cosmonauts analysis changed-functions to createAnalysisProgram", async () => {
		analysisProgramMocks.createAnalysisProgram.mockImplementation(() => {
			const program = new Command();
			program
				.exitOverride()
				.command("changed-functions")
				.option("--base <rev>")
				.action((options) => analysisProgramMocks.action(options));
			return program;
		});
		runtimeMocks.create.mockRejectedValue(
			new Error("normal runtime path used"),
		);
		process.argv = [
			"node",
			"cosmonauts",
			"analysis",
			"changed-functions",
			"--base",
			"main",
		];

		await import("../../../cli/main.ts");
		await new Promise((resolve) => setImmediate(resolve));

		expect(analysisProgramMocks.action).toHaveBeenCalledWith(
			expect.objectContaining({ base: "main" }),
		);
		expect(runtimeMocks.create).not.toHaveBeenCalled();
	});
});
