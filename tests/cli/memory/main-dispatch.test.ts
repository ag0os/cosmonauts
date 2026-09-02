import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";

const memoryProgramMocks = vi.hoisted(() => ({
	createMemoryProgram: vi.fn(),
	action: vi.fn(),
}));

const runtimeMocks = vi.hoisted(() => ({
	create: vi.fn(),
}));

vi.mock("../../../cli/memory/subcommand.ts", () => ({
	createMemoryProgram: memoryProgramMocks.createMemoryProgram,
}));

vi.mock("../../../lib/runtime.ts", () => ({
	CosmonautsRuntime: { create: runtimeMocks.create },
}));

describe("cli/main memory dispatch", () => {
	const originalArgv = process.argv;

	afterEach(() => {
		process.argv = originalArgv;
		process.exitCode = undefined;
		vi.clearAllMocks();
		vi.resetModules();
	});

	it("routes top-level memory commands without interactive fallthrough", async () => {
		memoryProgramMocks.createMemoryProgram.mockImplementation(() => {
			const program = new Command();
			program
				.exitOverride()
				.command("consolidate")
				.option("--json")
				.action((options) => memoryProgramMocks.action(options));
			return program;
		});
		runtimeMocks.create.mockRejectedValue(
			new Error("interactive runtime path used"),
		);
		process.argv = ["node", "cosmonauts", "memory", "consolidate", "--json"];

		await import("../../../cli/main.ts");
		await new Promise((resolve) => setImmediate(resolve));

		expect(memoryProgramMocks.createMemoryProgram).toHaveBeenCalledTimes(1);
		expect(memoryProgramMocks.action).toHaveBeenCalledWith(
			expect.objectContaining({ json: true }),
		);
		expect(runtimeMocks.create).not.toHaveBeenCalled();
	});
});
