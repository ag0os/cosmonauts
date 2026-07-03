import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";

const architectureProgramMocks = vi.hoisted(() => ({
	createArchitectureProgram: vi.fn(),
	action: vi.fn(),
}));

const runtimeMocks = vi.hoisted(() => ({
	create: vi.fn(),
}));

vi.mock("../../../cli/architecture/subcommand.ts", () => ({
	createArchitectureProgram: architectureProgramMocks.createArchitectureProgram,
}));

vi.mock("../../../lib/runtime.ts", () => ({
	CosmonautsRuntime: { create: runtimeMocks.create },
}));

describe("cli/main architecture dispatch", () => {
	const originalArgv = process.argv;

	afterEach(() => {
		process.argv = originalArgv;
		process.exitCode = undefined;
		vi.clearAllMocks();
		vi.resetModules();
	});

	it("routes cosmonauts architecture generate to createArchitectureProgram", async () => {
		architectureProgramMocks.createArchitectureProgram.mockImplementation(
			() => {
				const program = new Command();
				program
					.exitOverride()
					.command("generate")
					.option("--no-narrative")
					.option("--json")
					.action((options) => architectureProgramMocks.action(options));
				return program;
			},
		);
		process.argv = [
			"node",
			"cosmonauts",
			"architecture",
			"generate",
			"--no-narrative",
			"--json",
		];

		await import("../../../cli/main.ts");
		await new Promise((resolve) => setImmediate(resolve));

		expect(
			architectureProgramMocks.createArchitectureProgram,
		).toHaveBeenCalledTimes(1);
		expect(architectureProgramMocks.action).toHaveBeenCalledWith(
			expect.objectContaining({
				narrative: false,
				json: true,
			}),
		);
	});

	it("routes cosmonauts arch generate through the same top-level command", async () => {
		architectureProgramMocks.createArchitectureProgram.mockImplementation(
			() => {
				const program = new Command();
				program
					.exitOverride()
					.command("generate")
					.option("--plain")
					.action((options) => architectureProgramMocks.action(options));
				return program;
			},
		);
		runtimeMocks.create.mockRejectedValue(
			new Error("normal runtime path used"),
		);
		process.argv = ["node", "cosmonauts", "arch", "generate", "--plain"];

		await import("../../../cli/main.ts");
		await new Promise((resolve) => setImmediate(resolve));

		expect(
			architectureProgramMocks.createArchitectureProgram,
		).toHaveBeenCalledTimes(1);
		expect(architectureProgramMocks.action).toHaveBeenCalledWith(
			expect.objectContaining({ plain: true }),
		);
		expect(runtimeMocks.create).not.toHaveBeenCalled();
	});
});
