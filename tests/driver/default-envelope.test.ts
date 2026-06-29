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
			`Missing default Drive envelope at ${missingPath}. Pass --envelope <path> to provide an explicit envelope.`,
		);
	});

	test("keeps the framework copy aligned with the bundled compatibility envelope", async () => {
		const frameworkEnvelope = await readFile(
			DEFAULT_DRIVE_ENVELOPE_RELATIVE_PATH,
			"utf-8",
		);
		const bundledEnvelope = await readFile(
			"bundled/coding/drivers/templates/envelope.md",
			"utf-8",
		);

		expect(frameworkEnvelope).toBe(bundledEnvelope);
	});
});
