import { describe, expect, test } from "vitest";
import { moduleOfPath } from "../../lib/architecture-map/modules.ts";

describe("moduleOfPath", () => {
	const roots = { sourceRoots: ["lib", "cli"] };

	test("places a nested file in its source root's first directory", () => {
		expect(moduleOfPath(roots, "cli/plans/commands/list.ts")).toBe("cli/plans");
	});

	test("places a file directly in a source root in the root itself", () => {
		expect(moduleOfPath(roots, "lib/index.ts")).toBe("lib");
	});

	test("places a path outside every source root in no module", () => {
		expect(moduleOfPath(roots, "tests/cli/list.test.ts")).toBeUndefined();
		expect(moduleOfPath(roots, "ROADMAP.md")).toBeUndefined();
	});

	test("uses the longest configured module root that contains the path", () => {
		const config = { ...roots, moduleRoots: ["cli", "cli/plans/commands"] };

		expect(moduleOfPath(config, "cli/plans/commands/list.ts")).toBe(
			"cli/plans/commands",
		);
		expect(moduleOfPath(config, "cli/tasks/shared.ts")).toBe("cli");
		expect(moduleOfPath(config, "lib/x/y.ts")).toBeUndefined();
	});
});
