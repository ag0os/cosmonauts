// Independent scoped mutation tooling. Always supply --mutate and --testFiles.
// Use STRYKER_VITEST_POOL=forks for process.chdir() tests (patches/README.md).
import { createRequire } from "node:module";
import { availableParallelism } from "node:os";

const require = createRequire(import.meta.url);

export default {
	testRunner: "vitest",
	plugins: [require.resolve("@stryker-mutator/vitest-runner")],
	// No configFile: vitest finds the target project's own vitest/vite config.
	vitest: { related: false },
	coverageAnalysis: "perTest",
	// Every covering test runs, so `killedBy` names every killer and a test
	// file that killed nothing really killed nothing. Costs time per mutant.
	disableBail: true,
	checkers: [],
	reporters: ["clear-text", "json", "progress-append-only"],
	jsonReporter: {
		fileName:
			process.env.STRYKER_JSON_REPORT ?? "reports/mutation/mutation.json",
	},
	tempDirName: ".stryker-tmp",
	cleanTempDir: "always",
	ignorePatterns: [
		"missions/sessions",
		"missions/archive/sessions",
		"coverage",
		"reports",
		".fallow",
	],
	// String-literal mutants are almost all message text: noise, not signal.
	mutator: { excludedMutations: ["StringLiteral"] },
	timeoutMS: 3000,
	// Each runner holds a vitest fork; half the cores keeps memory bounded.
	concurrency: Math.max(1, Math.floor(availableParallelism() / 2)),
};
