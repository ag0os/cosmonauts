import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		setupFiles: ["./tests/setup.ts"],
		coverage: {
			provider: "v8",
			include: ["lib/**"],
		},
	},
});
