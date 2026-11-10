import { describe, expect, test } from "vitest";
import { requireDriveEnvelope } from "../../lib/driver/require-envelope.ts";

describe("requireDriveEnvelope", () => {
	test("returns an explicit envelope path unchanged", () => {
		expect(requireDriveEnvelope("drive/envelope.md")).toBe("drive/envelope.md");
	});

	test.each([
		undefined,
		"",
	])("refuses a missing envelope (%j) and names both ways to pass one", (path) => {
		expect(() => requireDriveEnvelope(path)).toThrow(
			"Drive needs an envelope. Pass --envelope <path> (CLI) or envelopePath (run_driver).",
		);
	});
});
