import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { createDefaultProjectConfig } from "../../lib/config/defaults.ts";
import type { DomainManifest, LoadedDomain } from "../../lib/domains/types.ts";
import {
	buildInitBootstrapPrompt,
	resolveInitInstructions,
} from "../../lib/init/prompt.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("init-prompt-");

describe("buildInitBootstrapPrompt", () => {
	const cwd = "/tmp/project";
	const defaultConfig = createDefaultProjectConfig();
	const prompt = buildInitBootstrapPrompt({
		cwd,
		defaultConfig,
		instructions: "Scan the project and propose AGENTS.md.",
	});

	test("embeds the consumer's init instructions", () => {
		expect(prompt).toContain(
			"Follow these init instructions from your domain:\n\nScan the project and propose AGENTS.md.\n",
		);
	});

	test("names no skill", () => {
		expect(prompt).not.toContain("/skill:");
	});

	test("includes the working directory", () => {
		expect(prompt).toContain(`You are running Cosmonauts init for ${cwd}.`);
	});

	test("embeds the serialized default config", () => {
		expect(prompt).toContain(JSON.stringify(defaultConfig, null, 2));
	});

	test("requires confirmation before writing files", () => {
		expect(prompt).toContain("Do not write or overwrite any files");
		expect(prompt).toContain("explicitly confirms");
	});
});

function runtimeWith(manifest: Partial<DomainManifest>, leadDomain?: string) {
	const domain = {
		manifest: {
			id: "ops",
			description: "Ops",
			lead: "lead",
			default: true,
			...manifest,
		},
	} as LoadedDomain;
	const lead = { id: "lead", domain: leadDomain } as AgentDefinition;
	return {
		domains: [domain],
		domainContext: undefined,
		bindingResolver: undefined as never,
		domainRegistry: {
			get: (id: string) => (id === domain.manifest.id ? domain : undefined),
		} as never,
		agentRegistry: { resolve: () => lead } as never,
	};
}

describe("resolveInitInstructions", () => {
	test("reads inline instructions from the lead domain's manifest", async () => {
		const runtime = runtimeWith(
			{ init: { kind: "inline", content: "Inline init." } },
			"ops",
		);
		await expect(resolveInitInstructions(runtime)).resolves.toEqual({
			ok: true,
			instructions: "Inline init.",
		});
	});

	test("reads file instructions from an absolute path", async () => {
		const path = join(tmp.path, "init.md");
		await writeFile(path, "File init.\n");
		const runtime = runtimeWith({ init: { kind: "file", path } }, "ops");
		await expect(resolveInitInstructions(runtime)).resolves.toEqual({
			ok: true,
			instructions: "File init.\n",
		});
	});

	test("reads the file, not a stray content field, for a file source", async () => {
		const path = join(tmp.path, "init.md");
		await writeFile(path, "From the file.");
		const runtime = runtimeWith(
			{ init: { kind: "file", path, content: "Stray." } as never },
			"ops",
		);
		await expect(resolveInitInstructions(runtime)).resolves.toEqual({
			ok: true,
			instructions: "From the file.",
		});
	});

	test("names a lead domain that is not in the registry", async () => {
		await expect(
			resolveInitInstructions(
				runtimeWith({ init: { kind: "inline", content: "x" } }, "elsewhere"),
			),
		).resolves.toEqual({
			ok: false,
			message:
				'Domain "elsewhere" declares no init instructions. Add init: { kind: "inline", content } or { kind: "file", path } to its domain.ts manifest, then run init again.',
		});
	});

	test("refuses a relative file path", async () => {
		const runtime = runtimeWith(
			{ init: { kind: "file", path: "init.md" } },
			"ops",
		);
		await expect(resolveInitInstructions(runtime)).rejects.toThrow(
			"Domain init instructions require inline content or an absolute file path",
		);
	});

	test("refuses an inline source without string content", async () => {
		const runtime = runtimeWith(
			{ init: { kind: "inline", content: 1 } as never },
			"ops",
		);
		await expect(resolveInitInstructions(runtime)).rejects.toThrow(
			"Domain init instructions require inline content or an absolute file path",
		);
	});

	test("names the domain that declares no init instructions", async () => {
		await expect(
			resolveInitInstructions(runtimeWith({}, "ops")),
		).resolves.toEqual({
			ok: false,
			message:
				'Domain "ops" declares no init instructions. Add init: { kind: "inline", content } or { kind: "file", path } to its domain.ts manifest, then run init again.',
		});
	});

	test("names a lead that belongs to no domain", async () => {
		await expect(
			resolveInitInstructions(
				runtimeWith({ init: { kind: "inline", content: "x" } }),
			),
		).resolves.toEqual({
			ok: false,
			message:
				'The init lead "lead" belongs to no domain, so it has no init instructions.',
		});
	});
});
