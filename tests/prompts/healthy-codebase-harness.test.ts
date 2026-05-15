import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const CAPABILITY_PATH = new URL(
	"../../bundled/coding/coding/capabilities/healthy-codebase-harness.md",
	import.meta.url,
);

async function readCapability() {
	return readFile(CAPABILITY_PATH, "utf-8");
}

describe("healthy-codebase-harness capability", () => {
	it("states that syntax delegation does not remove structural responsibility", async () => {
		const content = await readCapability();

		expect(content).toContain(
			"Syntax may be delegated to tools and models; structure remains the shared responsibility of every role.",
		);
		expect(content).toContain("Form and function are coupled.");
	});

	it("defines both program structure and procedure structure", async () => {
		const content = await readCapability();

		expect(content).toContain("**Program structure**");
		expect(content).toContain("**Procedure structure**");
		expect(content).toContain("specified, planned, decomposed, implemented");
	});

	it("connects each coding role to the behavior harness", async () => {
		const content = await readCapability();

		expect(content).toContain("**Spec work** defines behavior");
		expect(content).toContain(
			"**Planning work** couples structure to behavior",
		);
		expect(content).toContain("**Task decomposition** preserves the harness");
		expect(content).toContain(
			"**Implementation work** follows the behavior loop",
		);
		expect(content).toContain(
			"**Review and verification** test both structures",
		);
	});

	it("requires mutation-style thinking for critical behavior tests", async () => {
		const content = await readCapability();

		expect(content).toContain("Use mutation-style thinking when judging tests");
		expect(content).toContain("would the tests fail?");
	});
});
