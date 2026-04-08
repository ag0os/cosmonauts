import { afterEach, describe, expect, it } from "vitest";
import {
	clearPendingSwitch,
	consumePendingSwitch,
	setPendingSwitch,
} from "../../lib/interactive/agent-switch.ts";

afterEach(() => {
	clearPendingSwitch();
});

describe("consumePendingSwitch", () => {
	it("returns undefined when no switch is pending", () => {
		expect(consumePendingSwitch()).toBeUndefined();
	});

	it("returns the agent ID after set", () => {
		setPendingSwitch("planner");
		expect(consumePendingSwitch()).toBe("planner");
	});

	it("clears the slot after consuming", () => {
		setPendingSwitch("worker");
		consumePendingSwitch();
		expect(consumePendingSwitch()).toBeUndefined();
	});

	it("returns the last set value when set twice", () => {
		setPendingSwitch("planner");
		setPendingSwitch("coordinator");
		expect(consumePendingSwitch()).toBe("coordinator");
	});
});

describe("clearPendingSwitch", () => {
	it("yields undefined on next consume after clear", () => {
		setPendingSwitch("planner");
		clearPendingSwitch();
		expect(consumePendingSwitch()).toBeUndefined();
	});
});
