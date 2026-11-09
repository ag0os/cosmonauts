import { expect, test } from "vitest";
import { createSessionExtension } from "../../lib/extensions/orchestration/index.ts";
import { runtimeDouble } from "../helpers/runtime-double.ts";
import { createMockPi } from "./orchestration-helpers.ts";

const context = {
	agentId: "studio/lead",
	memory: {
		knowledge: false,
		authored: false,
		proposals: false,
		architecture: false,
		episodes: false,
	},
};

test("the session provider refuses to assemble orchestration without a runtime", () => {
	expect(() => createSessionExtension(context)).toThrow(
		"Orchestration requires the host runtime in session assembly",
	);
});

test("the session provider registers run_driver with a supplied runtime", async () => {
	const factory = createSessionExtension({
		...context,
		runtime: runtimeDouble(),
	});
	const pi = createMockPi("/tmp");

	await (typeof factory === "function" ? factory : factory.factory)(
		pi as never,
	);

	expect(pi.getTool("run_driver")).toBeDefined();
});
