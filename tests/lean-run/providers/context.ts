import type { SignalContext } from "../../../lib/lean-run/types.ts";

/** A minimal SignalContext; tests override only what the provider reads. */
export function stubContext(
	overrides: Partial<SignalContext> = {},
): SignalContext {
	return {
		worktree: "/nonexistent-worktree",
		baseSha: "0000000",
		plan: {
			title: "Plan",
			approach: "",
			touches: [],
			reuses: [],
			behaviors: [],
			risks: [],
			raw: "",
		},
		envelope: { outcome: "done" },
		changedFiles: [],
		budget: { tokens: 0, timeMs: 0 },
		runDir: "/nonexistent-run",
		...overrides,
	};
}
