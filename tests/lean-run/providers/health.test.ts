import { describe, expect, test, vi } from "vitest";
import type {
	ChangedFunction,
	ChangedFunctionsReport,
	ResolveChangedFunctionsOptions,
} from "../../../lib/code-health/changed-functions.ts";
import { createHealthProvider } from "../../../lib/lean-run/providers/health.ts";
import type { SignalContext } from "../../../lib/lean-run/types.ts";

function context(overrides: Partial<SignalContext> = {}): SignalContext {
	return {
		worktree: "/work/tree",
		baseSha: "base123",
		plan: {
			title: "Plan",
			approach: "",
			touches: [],
			reuses: [],
			behaviors: [],
			risks: [],
			raw: "",
		},
		envelope: {} as SignalContext["envelope"],
		changedFiles: [],
		budget: { tokens: 0, timeMs: 60_000 },
		runDir: "/work/run",
		...overrides,
	};
}

function changedFunction(name: string, regressed: boolean): ChangedFunction {
	return {
		file: "src/a.ts",
		name,
		startLine: 1,
		endLine: 3,
		cyclomatic: regressed ? 3 : 1,
		cognitive: 0,
		crap: null,
		base: { cyclomatic: 1, cognitive: 0, crap: null },
		regressed,
	};
}

function report(functions: ChangedFunction[]): ChangedFunctionsReport {
	return { base: "base123", baseCommit: "f".repeat(40), functions };
}

describe("health provider", () => {
	test("reports the whole diff against the run base as info", async () => {
		const data = report([
			changedFunction("a", true),
			changedFunction("b", false),
			changedFunction("c", false),
		]);
		const resolve = vi.fn(
			async (_options: ResolveChangedFunctionsOptions) => data,
		);

		const signal = await createHealthProvider({ resolve }).run(context());

		expect(resolve).toHaveBeenCalledWith({
			cwd: "/work/tree",
			base: "base123",
		});
		expect(signal).toEqual({
			kind: "health",
			status: "info",
			summary: "3 changed functions, 1 regressed",
			data,
			reenter: false,
		});
	});

	test("passes the run's abort signal to the resolver", async () => {
		const controller = new AbortController();
		const resolve = vi.fn(async (_options: ResolveChangedFunctionsOptions) =>
			report([]),
		);

		await createHealthProvider({ resolve }).run(
			context({ signal: controller.signal }),
		);

		expect(resolve.mock.calls[0]?.[0].signal).toBe(controller.signal);
	});

	test("turns an analysis failure into info with the reason", async () => {
		const resolve = vi.fn(async () => {
			throw new Error("unknown base revision: base123");
		});

		const signal = await createHealthProvider({ resolve }).run(context());

		expect(signal).toEqual({
			kind: "health",
			status: "info",
			summary: "health unavailable: unknown base revision: base123",
			data: { error: "unknown base revision: base123" },
			reenter: false,
		});
	});
});
