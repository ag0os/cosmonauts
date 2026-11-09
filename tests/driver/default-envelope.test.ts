import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
	DEFAULT_DRIVE_ENVELOPE_RELATIVE_PATH,
	resolveDefaultDriveEnvelopePath,
} from "../../lib/driver/default-envelope.ts";

describe("default Drive envelope", () => {
	test("missing framework default names the path and tells callers to pass an explicit envelope", () => {
		const missingRoot = "/tmp/cosmonauts-missing-framework-root";
		const missingPath = join(missingRoot, DEFAULT_DRIVE_ENVELOPE_RELATIVE_PATH);

		expect(() =>
			resolveDefaultDriveEnvelopePath({ frameworkRoot: missingRoot }),
		).toThrow(
			`Missing default Drive envelope at ${missingPath}. Pass --envelope <path> (CLI) or envelopePath (run_driver) to provide an explicit envelope.`,
		);
	});
});
