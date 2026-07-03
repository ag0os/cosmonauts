import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";

const serveProgramMocks = vi.hoisted(() => ({
	createServeProgram: vi.fn(),
	action: vi.fn(),
}));

const runtimeMocks = vi.hoisted(() => ({
	create: vi.fn(),
}));

vi.mock("../../../cli/serve/subcommand.ts", () => ({
	createServeProgram: serveProgramMocks.createServeProgram,
}));

vi.mock("../../../lib/runtime.ts", () => ({
	CosmonautsRuntime: { create: runtimeMocks.create },
}));

describe("cli/main serve dispatch", () => {
	const originalArgv = process.argv;

	afterEach(() => {
		process.argv = originalArgv;
		process.exitCode = undefined;
		vi.clearAllMocks();
		vi.resetModules();
	});

	it("routes cosmonauts serve to createServeProgram with host port open options", async () => {
		serveProgramMocks.createServeProgram.mockImplementation(() => {
			const program = new Command();
			program
				.exitOverride()
				.option("--host <host>")
				.option("--port <port>", "Port to bind", (value) => Number(value))
				.option("--open")
				.option("--no-open")
				.action((options) => serveProgramMocks.action(options));
			return program;
		});
		process.argv = [
			"node",
			"cosmonauts",
			"serve",
			"--host",
			"127.0.0.1",
			"--port",
			"0",
			"--open",
		];

		await import("../../../cli/main.ts");
		await new Promise((resolve) => setImmediate(resolve));

		expect(serveProgramMocks.createServeProgram).toHaveBeenCalledTimes(1);
		expect(serveProgramMocks.action).toHaveBeenCalledWith(
			expect.objectContaining({
				host: "127.0.0.1",
				port: 0,
				open: true,
			}),
		);
	});

	it("does not fall through to normal prompt runtime parsing", async () => {
		serveProgramMocks.createServeProgram.mockImplementation(() => {
			const program = new Command();
			program.exitOverride().option("--no-open");
			return program;
		});
		runtimeMocks.create.mockRejectedValue(
			new Error("normal runtime path used"),
		);
		process.argv = ["node", "cosmonauts", "serve", "--no-open"];

		await import("../../../cli/main.ts");
		await new Promise((resolve) => setImmediate(resolve));

		expect(serveProgramMocks.createServeProgram).toHaveBeenCalledTimes(1);
		expect(runtimeMocks.create).not.toHaveBeenCalled();
	});
});
