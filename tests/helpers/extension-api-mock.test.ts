import { describe, expect, test } from "vitest";
import { createMockPi } from "./mocks/index.ts";

describe("extension API mock", () => {
	test("forwards an optional AbortSignal to registered tools", async () => {
		const pi = createMockPi();
		let receivedSignal: unknown;
		pi.registerTool({
			name: "signal_probe",
			execute: async (...args: unknown[]) => {
				receivedSignal = args[2];
				return {};
			},
		});
		const controller = new AbortController();

		await pi.callTool("signal_probe", {}, controller.signal);

		expect(receivedSignal).toBe(controller.signal);
	});
});
