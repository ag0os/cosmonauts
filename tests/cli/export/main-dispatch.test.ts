import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";

const exportProgramMocks = vi.hoisted(() => ({
	createExportProgram: vi.fn(),
	action: vi.fn(),
}));

const runtimeMocks = vi.hoisted(() => ({
	create: vi.fn(),
}));

vi.mock("../../../cli/export/subcommand.ts", () => ({
	createExportProgram: exportProgramMocks.createExportProgram,
}));

vi.mock("../../../lib/runtime.ts", () => ({
	CosmonautsRuntime: { create: runtimeMocks.create },
}));

describe("cli/main export dispatch", () => {
	const originalArgv = process.argv;

	afterEach(() => {
		process.argv = originalArgv;
		process.exitCode = undefined;
		vi.clearAllMocks();
		vi.resetModules();
	});

	it("routes cosmonauts export to createExportProgram", async () => {
		exportProgramMocks.createExportProgram.mockImplementation(() => {
			const program = new Command();
			program
				.exitOverride()
				.option("--definition <path>")
				.option("--out <path>")
				.action((options) => exportProgramMocks.action(options));
			return program;
		});
		process.argv = [
			"node",
			"cosmonauts",
			"export",
			"--definition",
			"package.json",
			"--out",
			"bin/agent",
		];

		await import("../../../cli/main.ts");
		await new Promise((resolve) => setImmediate(resolve));

		expect(exportProgramMocks.createExportProgram).toHaveBeenCalledTimes(1);
		expect(exportProgramMocks.action).toHaveBeenCalledWith(
			expect.objectContaining({
				definition: "package.json",
				out: "bin/agent",
			}),
		);
	});

	it("does not fall through to normal prompt runtime parsing", async () => {
		exportProgramMocks.createExportProgram.mockImplementation(() => {
			const program = new Command();
			program.exitOverride().argument("[agent-id]").option("--out <path>");
			return program;
		});
		runtimeMocks.create.mockRejectedValue(
			new Error("normal runtime path used"),
		);
		process.argv = [
			"node",
			"cosmonauts",
			"export",
			"coding/explorer",
			"--out",
			"bin/agent",
		];

		await import("../../../cli/main.ts");
		await new Promise((resolve) => setImmediate(resolve));

		expect(exportProgramMocks.createExportProgram).toHaveBeenCalledTimes(1);
		expect(runtimeMocks.create).not.toHaveBeenCalled();
	});
});
