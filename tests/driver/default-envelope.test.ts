import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
	DEFAULT_DRIVE_ENVELOPE_RELATIVE_PATH,
	resolveDefaultDriveEnvelopePath,
} from "../../lib/driver/default-envelope.ts";

describe("default Drive envelope", () => {
	// @cosmo-behavior plan:coding-agnostic-framework#B-013
	test("missing framework default names the path and tells callers to pass an explicit envelope", () => {
		const missingRoot = "/tmp/cosmonauts-missing-framework-root";
		const missingPath = join(missingRoot, DEFAULT_DRIVE_ENVELOPE_RELATIVE_PATH);

		expect(() =>
			resolveDefaultDriveEnvelopePath({ frameworkRoot: missingRoot }),
		).toThrow(
			`Missing default Drive envelope at ${missingPath}. Pass --envelope <path> (CLI) or envelopePath (run_driver) to provide an explicit envelope.`,
		);
	});

	// @cosmo-behavior plan:coding-agnostic-framework#B-010
	test("resolves the framework default envelope outside bundled coding", () => {
		const resolvedPath = resolveDefaultDriveEnvelopePath({
			frameworkRoot: process.cwd(),
		});

		expect(resolvedPath).toBe(
			join(
				process.cwd(),
				"lib",
				"prompts",
				"framework",
				"drive",
				"envelope.md",
			),
		);
		expect(resolvedPath).not.toContain(join("bundled", "coding"));
	});

	test("keeps the bundled compatibility envelope unchanged", async () => {
		const bundledEnvelope = await readFile(
			"bundled/coding/drivers/templates/envelope.md",
			"utf-8",
		);

		expect(bundledEnvelope).toContain("# Coding Driver Envelope");
	});
});
