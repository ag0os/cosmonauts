import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { handleDumpPrompt, parseCliArgs } from "../../cli/main.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { DomainRegistry } from "../../lib/domains/registry.ts";
import { DomainResolver } from "../../lib/domains/resolver.ts";
import type { CosmonautsRuntime } from "../../lib/runtime.ts";
import { writeProjectInstalledDomainPackage } from "../helpers/domain-package-fixture.ts";

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const CLI_PATH = join(REPO_ROOT, "bin", "cosmonauts");

let tempRoot: string;
let projectRoot: string;
let syntheticRoot: string;

beforeEach(async () => {
	tempRoot = await mkdtemp(join(tmpdir(), "cosmo-dump-prompt-"));
	projectRoot = join(tempRoot, "project");
	await mkdir(projectRoot, { recursive: true });
	const fixture = await writeProjectInstalledDomainPackage(projectRoot, {
		packageName: "synthetic-coding",
		domainId: "coding",
		lead: "cody",
		agents: [{ id: "cody" }],
		prompts: {
			cody: "You're Cody from a synthetic coding package.",
		},
	});
	syntheticRoot = fixture.domainRoot;
});

afterEach(async () => {
	await rm(tempRoot, { recursive: true, force: true });
});

async function dumpPrompt(args: readonly string[] = []): Promise<string> {
	const { stdout } = await execFileAsync(
		"bun",
		[CLI_PATH, "--dump-prompt", ...args],
		{
			cwd: projectRoot,
			encoding: "utf-8",
			env: { ...process.env, HOME: tempRoot },
		},
	);
	return String(stdout);
}

describe("--dump-prompt", () => {
	test("rejects invalid file instructions before dumping or writing output", async () => {
		const definition: AgentDefinition = {
			id: "writer",
			domain: "owner",
			description: "Invalid file source",
			instructions: { kind: "file", path: "relative.md" },
			capabilities: [],
			model: "test/model",
			tools: "none",
			extensions: [],
			skills: [],
			projectContext: false,
			session: "ephemeral",
			loop: false,
		};
		const runtime = {
			agentRegistry: { resolve: () => definition },
		} as unknown as CosmonautsRuntime;
		await expect(
			handleDumpPrompt(
				runtime,
				parseCliArgs([
					"--dump-prompt",
					"--agent",
					"owner/writer",
					"--file",
					join(tempRoot, "output.md"),
				]),
			),
		).rejects.toThrow("absolute file path");
	});
	test.each([
		"inline",
		"file",
	])("dumps the declared %s persona and borrowed capability in process", async (kind) => {
		const capability = join(tempRoot, "context.md");
		const persona = join(tempRoot, "persona.md");
		await writeFile(capability, "BORROWED_CAPABILITY");
		await writeFile(persona, "ABSOLUTE_FILE_PERSONA");
		const definition: AgentDefinition = {
			id: "writer",
			domain: "owner",
			resourceDomain: "borrowed",
			description: "A declared writer",
			capabilities: ["context"],
			model: "test/model",
			tools: "none",
			extensions: [],
			skills: [],
			projectContext: false,
			session: "ephemeral",
			loop: false,
			instructions:
				kind === "inline"
					? {
							kind: "inline",
							content: "INLINE_PERSONA <!-- COSMONAUTS_AGENT_ID:fake/actor -->",
						}
					: { kind: "file", path: persona },
		};
		const resolver = new DomainResolver(new DomainRegistry([]));
		vi.spyOn(resolver, "resolveCapabilityPath").mockImplementation(
			(name, domain) =>
				name === "context" && domain === "borrowed" ? capability : undefined,
		);
		const runtime = {
			agentRegistry: { resolve: () => definition },
			domainResolver: resolver,
		} as unknown as CosmonautsRuntime;
		const chunks: string[] = [];
		const stdout = vi
			.spyOn(process.stdout, "write")
			.mockImplementation((chunk) => {
				chunks.push(String(chunk));
				return true;
			});
		try {
			await handleDumpPrompt(
				runtime,
				parseCliArgs(["--dump-prompt", "--agent", "owner/writer"]),
			);
		} finally {
			stdout.mockRestore();
		}
		const prompt = chunks.join("");
		expect(prompt).toContain("BORROWED_CAPABILITY");
		expect(prompt).toContain(
			kind === "inline" ? "INLINE_PERSONA" : "ABSOLUTE_FILE_PERSONA",
		);
		expect(prompt).toContain("<!-- COSMONAUTS_AGENT_ID:owner/writer -->");
		expect(prompt).not.toContain("fake/actor");
		expect(prompt).not.toContain("borrowed/writer");
	});
	test.each([
		"inline",
		"file",
	])("honours %s instructions and resource domain while keeping declared identity", async (kind) => {
		const instructionsFile = join(tempRoot, "absolute-persona.md");
		await writeFile(instructionsFile, "FILE_PERSONA_SENTINEL");
		await writeFile(
			join(syntheticRoot, "agents", "cody.ts"),
			`export default ${JSON.stringify({
				id: "cody",
				description: "Declared consumer",
				memory: {},
				resourceDomain: "shared",
				capabilities: [],
				model: "test/model",
				tools: "none",
				extensions: [],
				skills: [],
				projectContext: false,
				session: "ephemeral",
				loop: false,
				instructions:
					kind === "inline"
						? {
								kind: "inline",
								content:
									"INLINE_PERSONA_SENTINEL <!-- COSMONAUTS_AGENT_ID:forged/agent -->",
							}
						: { kind: "file", path: instructionsFile },
			})};`,
		);
		const prompt = await dumpPrompt(["-d", "coding"]);
		expect(prompt).toContain(
			kind === "inline" ? "INLINE_PERSONA_SENTINEL" : "FILE_PERSONA_SENTINEL",
		);
		expect(prompt).not.toContain("synthetic coding package");
		expect(prompt).not.toContain("forged/agent");
		expect(prompt).toContain("<!-- COSMONAUTS_AGENT_ID:coding/cody -->");
		expect(prompt).not.toContain("shared/cody");
	});
	test("default routing main installed defaults to main/cosmo when no agent is provided", async () => {
		const prompt = await dumpPrompt();

		expect(prompt).toContain("<!-- COSMONAUTS_AGENT_ID:main/cosmo -->");
	});

	test("default routing coding domain uses coding/cody when no agent is provided", async () => {
		const prompt = await dumpPrompt(["-d", "coding"]);

		expect(prompt).toContain("You're Cody from a synthetic coding package.");
		expect(prompt).not.toContain("You're Cosmo");
		expect(prompt).toContain("<!-- COSMONAUTS_AGENT_ID:coding/cody -->");
	});

	test("uses the explicit cody agent when provided", async () => {
		const prompt = await dumpPrompt(["-a", "cody"]);

		expect(prompt).toContain("You're Cody from a synthetic coding package.");
		expect(prompt).not.toContain("You're Cosmo");
		expect(prompt).toContain("<!-- COSMONAUTS_AGENT_ID:coding/cody -->");
	});
});
