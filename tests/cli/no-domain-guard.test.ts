import { describe, expect, test } from "vitest";
import { hasInstalledDomain, selectRunMode } from "../../cli/main.ts";
import type { CliOptions } from "../../cli/types.ts";
import type { CosmonautsRuntime } from "../../lib/runtime.ts";

function cliOptions(overrides: Partial<CliOptions> = {}): CliOptions {
	return {
		print: false,
		init: false,
		listWorkflows: false,
		listAgents: false,
		listDomains: false,
		dumpPrompt: false,
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
		hasInstalledDomain(runtimeWithDomains(...ids)),
	);
}

describe("no-domain guard", () => {
	test("no-domain guard fires after main built-in", () => {
		expect(hasInstalledDomain(runtimeWithDomains("shared", "main"))).toBe(
			false,
		);
		expect(runModeForDomains("shared", "main")).toBe("no-domain-guard");
	});

	test("no-domain guard does not fire with coding domain present", () => {
		expect(
			hasInstalledDomain(runtimeWithDomains("shared", "main", "coding")),
		).toBe(true);
		expect(runModeForDomains("shared", "main", "coding")).toBe("interactive");
	});
});
