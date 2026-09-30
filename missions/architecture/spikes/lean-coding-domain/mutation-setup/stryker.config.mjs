// Spike config; --mutate and --testFiles are passed on the command line.
export default {
	testRunner: "vitest",
	plugins: ["@stryker-mutator/vitest-runner"],
	vitest: { configFile: "vitest.config.ts", related: false },
	coverageAnalysis: "perTest",
	checkers: [],
	reporters: ["clear-text", "json", "progress-append-only"],
	jsonReporter: { fileName: ".spike/reports/mutation.json" },
	tempDirName: ".stryker-tmp",
	ignorePatterns: ["missions/sessions", ".spike/reports"],
	mutator: { excludedMutations: ["StringLiteral"] },
	timeoutMS: 10000,
	cleanTempDir: true,
};
