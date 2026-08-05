import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		setupFiles: ["./tests/setup.ts"],
		// Vitest's 5s default is not a meaningful budget for this suite. Many
		// driver/extension tests spawn real compiled binaries and capability
		// providers, and measured spawn cost rises ~5-6x under parallel suite
		// load. The passing suite's median test is ~2ms and its p99 ~1.8s, so
		// 15s still fails a genuine hang promptly while leaving load-sensitive
		// process tests real headroom. Tests that need more declare their own
		// budget (see tests/driver/*) — that convention stays authoritative.
		testTimeout: 15_000,
		coverage: {
			provider: "v8",
			include: ["lib/**"],
			thresholds: {
				statements: 65,
				branches: 85,
				functions: 55,
				lines: 65,
			},
		},
	},
});
