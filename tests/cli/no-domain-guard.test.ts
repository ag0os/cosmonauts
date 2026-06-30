import { describe, expect, test } from "vitest";
import { hasRunnableDefaultDomain, selectRunMode } from "../../cli/main.ts";
import type { CliOptions } from "../../cli/types.ts";
import type { CosmonautsRuntime } from "../../lib/runtime.ts";

function cliOptions(overrides: Partial<CliOptions> = {}): CliOptions {
	return {
		print: false,
		init: false,
		listAgents: false,
		listDomains: false,
		dumpPrompt: false,
		json: false,
		plain: false,
		piFlags: {},
		...overrides,
	};
}

function runtimeWithDomains(...ids: string[]): CosmonautsRuntime {
	return {
		domains: ids.map((id) => ({ manifest: { id } })),
	} as unknown as CosmonautsRuntime;
}

function runModeForDomains(...ids: string[]): ReturnType<typeof selectRunMode> {
	return selectRunMode(
		cliOptions(),
		hasRunnableDefaultDomain(runtimeWithDomains(...ids)),
	);
}

describe("no-domain guard", () => {
	test("shared and main built-ins are runnable without an additional domain", () => {
		// @cosmo-behavior plan:coding-agnostic-framework#B-022
		expect(hasRunnableDefaultDomain(runtimeWithDomains("shared", "main"))).toBe(
			true,
		);
		expect(runModeForDomains("shared", "main")).toBe("interactive");
		expect(
			selectRunMode(
				cliOptions({ print: true, prompt: "go" }),
				hasRunnableDefaultDomain(runtimeWithDomains("shared", "main")),
			),
		).toBe("print");
	});

	test("no-domain guard still fires when main is absent", () => {
		expect(hasRunnableDefaultDomain(runtimeWithDomains("shared"))).toBe(false);
		expect(runModeForDomains("shared")).toBe("no-domain-guard");
	});

	test("no-domain guard does not fire with coding domain present", () => {
		expect(
			hasRunnableDefaultDomain(runtimeWithDomains("shared", "main", "coding")),
		).toBe(true);
		expect(runModeForDomains("shared", "main", "coding")).toBe("interactive");
	});
});
