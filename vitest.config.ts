import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		setupFiles: ["./tests/setup.ts"],
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
