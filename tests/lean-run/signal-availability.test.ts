import { describe, expect, test } from "vitest";
import {
	requiredSignalGap,
	unavailableData,
	unavailableReason,
} from "../../lib/lean-run/signal-availability.ts";
import type { Signal, SignalKind } from "../../lib/lean-run/types.ts";

function signal(kind: SignalKind, data: unknown = {}): Signal {
	return {
		kind,
		status: "info",
		summary: `${kind} summary`,
		data,
		reenter: false,
	};
}

describe("unavailableReason", () => {
	test("reads the reason of a signal marked unavailable", () => {
		expect(
			unavailableReason(signal("health", unavailableData("no fallow"))),
		).toBe("no fallow");
	});

	test("falls back to the summary when the mark has no reason", () => {
		expect(unavailableReason(signal("health", { unavailable: true }))).toBe(
			"health summary",
		);
	});

	test("is undefined for a signal that ran", () => {
		expect(unavailableReason(signal("health", { functions: [] }))).toBe(
			undefined,
		);
	});
});

describe("requiredSignalGap", () => {
	test("is undefined when every required kind ran and was available", () => {
		expect(
			requiredSignalGap({
				required: ["verify", "health"],
				signals: [signal("verify"), signal("health")],
				absentIsGap: true,
			}),
		).toBeUndefined();
	});

	test("ignores an unavailable kind that is not required", () => {
		expect(
			requiredSignalGap({
				required: ["verify"],
				signals: [signal("verify"), signal("dupes", unavailableData("x"))],
				absentIsGap: true,
			}),
		).toBeUndefined();
	});

	test("does not count an absent kind when absence is no gap", () => {
		expect(
			requiredSignalGap({
				required: ["verify", "mutation"],
				signals: [signal("verify")],
				absentIsGap: false,
			}),
		).toBeUndefined();
	});

	test("counts a required kind that skipped its check as a gap", () => {
		expect(
			requiredSignalGap({
				required: ["verify", "mutation"],
				signals: [
					signal("verify"),
					signal("mutation", {
						skipped: true,
						reason: "verification did not pass: 1 failed",
					}),
				],
				absentIsGap: false,
			}),
		).toBe(
			"unverified (mutation unavailable: skipped: verification did not pass: 1 failed)",
		);
	});

	test("does not prefix a skip reason that already says it was skipped", () => {
		expect(
			requiredSignalGap({
				required: ["blast-tests"],
				signals: [signal("blast-tests", { skipped: true })],
				absentIsGap: true,
			}),
		).toBe(
			"unverified (blast-tests unavailable: skipped: blast-tests summary)",
		);
		expect(
			requiredSignalGap({
				required: ["blast-tests"],
				signals: [
					signal("blast-tests", { skipped: true, reason: "skipped: stale" }),
				],
				absentIsGap: true,
			}),
		).toBe("unverified (blast-tests unavailable: skipped: stale)");
	});

	test("ignores a skipped kind that is not required", () => {
		expect(
			requiredSignalGap({
				required: ["verify"],
				signals: [signal("verify"), signal("mutation", { skipped: true })],
				absentIsGap: true,
			}),
		).toBeUndefined();
	});

	test("counts an absent kind as never ran when absence is a gap", () => {
		expect(
			requiredSignalGap({
				required: ["verify", "mutation"],
				signals: [signal("verify")],
				absentIsGap: true,
			}),
		).toBe("unverified (mutation unavailable: never ran)");
	});
});
