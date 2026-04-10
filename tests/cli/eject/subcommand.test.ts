/**
 * Tests for cli/eject/subcommand.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

vi.mock("../../../lib/packages/eject.ts", () => ({
	ejectDomain: vi.fn(),
}));

import {
	createEjectProgram,
	ejectAction,
} from "../../../cli/eject/subcommand.ts";
import { ejectDomain } from "../../../lib/packages/eject.ts";

const mockEjectDomain = vi.mocked(ejectDomain);

// ============================================================================
// Setup
// ============================================================================

let stdoutOutput: string;
let stderrOutput: string;
let originalExitCode: number | undefined;

beforeEach(() => {
	stdoutOutput = "";
	stderrOutput = "";
	originalExitCode = process.exitCode as number | undefined;

	vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
		stdoutOutput += String(chunk);
		return true;
	});
	vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
		stderrOutput += String(chunk);
		return true;
	});
	vi.spyOn(console, "log").mockImplementation(
		(msg: unknown, ...rest: unknown[]) => {
			stdoutOutput += `${[msg, ...rest].map(String).join(" ")}\n`;
		},
	);

	process.exitCode = undefined;
});

afterEach(() => {
	vi.restoreAllMocks();
	process.exitCode = originalExitCode;
});

// ============================================================================
// ejectAction — success
// ============================================================================

describe("ejectAction — success", () => {
	it("prints ejected path including domain id", async () => {
		mockEjectDomain.mockResolvedValue({
			ejectedTo: "/project/.cosmonauts/domains/coding",
			sourcePackage: "coding",
			sourcePath: "/home/user/.cosmonauts/packages/coding/domains/coding",
		});

		await ejectAction("coding", { projectRoot: "/project" });

		expect(stdoutOutput).toContain(".cosmonauts/domains/coding/");
		expect(process.exitCode).toBeUndefined();
	});

	it("prints source package name and source path", async () => {
		mockEjectDomain.mockResolvedValue({
			ejectedTo: "/project/.cosmonauts/domains/coding",
			sourcePackage: "coding",
			sourcePath: "/home/user/.cosmonauts/packages/coding/domains/coding",
		});

		await ejectAction("coding", { projectRoot: "/project" });

		expect(stdoutOutput).toContain("coding");
		expect(stdoutOutput).toContain(
			"/home/user/.cosmonauts/packages/coding/domains/coding",
		);
	});

	it("prints uninstall guidance with source package name", async () => {
		mockEjectDomain.mockResolvedValue({
			ejectedTo: "/project/.cosmonauts/domains/coding",
			sourcePackage: "coding-minimal",
			sourcePath: "/store/coding-minimal/domains/coding",
		});

		await ejectAction("coding", { projectRoot: "/project" });

		expect(stdoutOutput).toContain("cosmonauts uninstall coding-minimal");
		expect(stdoutOutput).toContain("fallback");
	});

	it("prints IDE tip", async () => {
		mockEjectDomain.mockResolvedValue({
			ejectedTo: "/project/.cosmonauts/domains/coding",
			sourcePackage: "coding",
			sourcePath: "/store/coding/domains/coding",
		});

		await ejectAction("coding", { projectRoot: "/project" });

		expect(stdoutOutput).toContain("dev dependency");
		expect(stdoutOutput).toContain("cosmonauts");
	});
});

// ============================================================================
// ejectAction — errors
// ============================================================================

describe("ejectAction — errors", () => {
	it("writes to stderr with 'cosmonauts eject:' prefix on error", async () => {
		mockEjectDomain.mockRejectedValue(
			new Error('Domain "coding" not found in any installed package'),
		);

		await ejectAction("coding", { projectRoot: "/project" });

		expect(stderrOutput).toContain("cosmonauts eject:");
		expect(stderrOutput).toContain(
			'Domain "coding" not found in any installed package',
		);
	});

	it("sets exitCode = 1 on error", async () => {
		mockEjectDomain.mockRejectedValue(new Error("something went wrong"));

		await ejectAction("coding", { projectRoot: "/project" });

		expect(process.exitCode).toBe(1);
	});

	it("handles non-Error thrown values", async () => {
		mockEjectDomain.mockRejectedValue("plain string error");

		await ejectAction("coding", { projectRoot: "/project" });

		expect(stderrOutput).toContain("cosmonauts eject:");
		expect(stderrOutput).toContain("plain string error");
		expect(process.exitCode).toBe(1);
	});
});

// ============================================================================
// ejectAction — --force flag
// ============================================================================

describe("ejectAction — --force flag", () => {
	it("passes force: true to ejectDomain when --force is set", async () => {
		mockEjectDomain.mockResolvedValue({
			ejectedTo: "/project/.cosmonauts/domains/coding",
			sourcePackage: "coding",
			sourcePath: "/store/coding/domains/coding",
		});

		await ejectAction("coding", { force: true, projectRoot: "/project" });

		expect(mockEjectDomain).toHaveBeenCalledWith(
			expect.objectContaining({ force: true }),
		);
	});

	it("does not pass force when flag is absent", async () => {
		mockEjectDomain.mockResolvedValue({
			ejectedTo: "/project/.cosmonauts/domains/coding",
			sourcePackage: "coding",
			sourcePath: "/store/coding/domains/coding",
		});

		await ejectAction("coding", { projectRoot: "/project" });

		expect(mockEjectDomain).toHaveBeenCalledWith(
			expect.objectContaining({ force: undefined }),
		);
	});
});

// ============================================================================
// createEjectProgram — structure
// ============================================================================

describe("createEjectProgram", () => {
	it("returns a Commander program named 'cosmonauts eject'", () => {
		const program = createEjectProgram();
		expect(program.name()).toBe("cosmonauts eject");
	});

	it("has a <domain> argument", () => {
		const program = createEjectProgram();
		const args = program.registeredArguments;
		expect(args.length).toBeGreaterThan(0);
		expect(args[0]?.name()).toBe("domain");
	});

	it("has a --force option", () => {
		const program = createEjectProgram();
		const optionNames = program.options.map((o) => o.long);
		expect(optionNames).toContain("--force");
	});

	it("has the expected description", () => {
		const program = createEjectProgram();
		expect(program.description()).toContain(".cosmonauts/domains/");
	});
});
