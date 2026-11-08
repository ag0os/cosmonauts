import { execFile } from "node:child_process";
import {
	cp,
	mkdir,
	readdir,
	readFile,
	realpath,
	symlink,
	writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { promisify } from "node:util";
import { AgentSession } from "@earendil-works/pi-coding-agent";
import { expect, test, vi } from "vitest";
import * as consumer from "./fixtures/library-consumer/consumer.ts";
import {
	createConsumerRuntime,
	exerciseConsumer,
	exerciseConsumerGrants,
} from "./fixtures/library-consumer/consumer.ts";
import { useTempDir } from "./helpers/fs.ts";

const tmp = useTempDir("library-consumer-");
const exec = promisify(execFile);
const root = new URL("../", import.meta.url);

test("the fixture declares independent qualified actors and a stages-form chain by package name", async () => {
	const runtime = await createConsumerRuntime(tmp.path);
	expect(runtime.domains).toEqual([]);
	expect(runtime.projectConfig.knowledgeSurface?.enabled).toBe(false);
	expect(runtime.domainsDir).toBeUndefined();
	expect(runtime.agentRegistry.resolve("visitor/explorer")).toMatchObject({
		id: "explorer",
		domain: "visitor",
		tools: "readonly",
		session: "ephemeral",
		memory: {},
		instructions: {
			kind: "inline",
			content: "Explore files and report facts.",
		},
		capabilities: [],
		extensions: ["orchestration"],
		skills: [],
		subagents: [],
		projectContext: false,
		loop: false,
		thinkingLevel: "low",
	});
	expect(runtime.agentRegistry.resolve("visitor/notebook")).toMatchObject({
		id: "notebook",
		domain: "visitor",
		tools: "none",
		session: "persistent",
		memory: { authored: true, episodes: true },
		instructions: { kind: "inline", content: "Remember useful facts." },
		capabilities: [],
		extensions: [],
		skills: [],
		subagents: [],
		projectContext: false,
		loop: false,
		thinkingLevel: "high",
	});
	expect(runtime.workerAgent).toBe("visitor/explorer");
	expect(runtime.chains).toEqual([
		expect.objectContaining({
			name: "inspect",
			episodes: true,
			stages: [
				{ name: "visitor/explorer", prompt: "Report the project facts." },
			],
		}),
	]);
});

test("the fixture's library imports resolve exclusively through the public export map", async () => {
	const source = await readFile(
		new URL("./fixtures/library-consumer/consumer.ts", import.meta.url),
		"utf8",
	);
	const policies = await readFile(
		new URL("./fixtures/library-consumer/policies.ts", import.meta.url),
		"utf8",
	);
	const grants = await readFile(
		new URL("./fixtures/library-consumer/grants.ts", import.meta.url),
		"utf8",
	);
	const imports = [
		...`${source}\n${policies}\n${grants}`.matchAll(/from\s+"([^"]+)"/g),
	].map((match) => match[1]);
	expect(
		imports.filter((specifier) => specifier?.startsWith("cosmonauts")),
	).toHaveLength(11);
	const require = createRequire(import.meta.url);
	const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
	for (const specifier of imports) {
		if (!specifier?.startsWith("cosmonauts")) continue;
		expect(specifier).toMatch(/^cosmonauts(?:\/|$)/);
		const entry = specifier === "cosmonauts" ? "." : `.${specifier?.slice(10)}`;
		expect(pkg.exports).toHaveProperty(entry);
		expect(require.resolve(specifier as string)).toContain("/lib/");
	}
});

test("an external consumer executes its chain and assembles granted memory tools with no framework content", async () => {
	const installed = join(tmp.path, "node_modules", "cosmonauts");
	await mkdir(installed, { recursive: true });
	await cp(new URL("lib", root), join(installed, "lib"), { recursive: true });
	await cp(new URL("package.json", root), join(installed, "package.json"));
	// Dependencies remain installed; the library package itself is a separate copy.
	await symlink(
		new URL("node_modules", root).pathname,
		join(installed, "node_modules"),
	);
	await cp(
		new URL("./fixtures/library-consumer/consumer.ts", import.meta.url),
		join(tmp.path, "consumer.ts"),
	);
	await cp(
		new URL("./fixtures/library-consumer/policies.ts", import.meta.url),
		join(tmp.path, "policies.ts"),
	);

	await cp(
		new URL("./fixtures/library-consumer/grants.ts", import.meta.url),
		join(tmp.path, "grants.ts"),
	);
	expect((await readdir(installed)).sort()).toEqual([
		"lib",
		"node_modules",
		"package.json",
	]);
	const externalRequire = createRequire(join(tmp.path, "run.ts"));
	expect(externalRequire.resolve("cosmonauts")).toBe(
		await realpath(join(installed, "lib", "index.ts")),
	);
	expect(() =>
		externalRequire.resolve("cosmonauts/lib/runtime-declarations.ts"),
	).toThrow(/not defined by "exports"/);
	await mkdir(join(tmp.path, "home"));
	await writeFile(
		join(tmp.path, "run.ts"),
		`globalThis.fetch = () => { throw new Error("NETWORK_FORBIDDEN"); };
const { exerciseConsumer, exerciseConsumerGrants } = await import("./consumer.ts");
console.log(JSON.stringify([await exerciseConsumer(process.cwd()), await exerciseConsumer(process.cwd(),true), await exerciseConsumerGrants(process.cwd())]));
`,
	);
	const { stdout, stderr } = await exec("bun", ["run.ts"], {
		cwd: tmp.path,
		env: {
			...process.env,
			HOME: join(tmp.path, "home"),
			PI_CODING_AGENT_DIR: join(tmp.path, "home", ".pi", "agent"),
		},
		timeout: 30_000,
	});
	expect(stderr).toBe("");
	const result = JSON.parse(stdout);
	assertConsumerResult(result[0]);
	assertConsumerResult(result[1], true);
	assertConsumerGrants(result[2]);
}, 40_000);

function assertConsumerResult(
	result: Awaited<ReturnType<typeof exerciseConsumer>>,
	knowledgeEnabled = false,
) {
	expect(result.domains).toEqual([]);
	expect(result.workerAgent).toBe("visitor/explorer");
	expect(result.domainsDir).toBeNull();
	expect(result.agentIds).toEqual(["explorer", "notebook"]);
	expect(result.episodes).toBe(true);
	expect(result.normalized).toEqual({
		adapterAbsent: true,
		declarationId: "visitor/explorer",
		loop: false,
	});
	expect(result.chain).toEqual({ success: true, iterations: 1 });
	expect(result.spawns).toEqual([
		{
			role: "visitor/explorer",
			prompt: "Report the project facts.",
			model: "openai-codex/gpt-5.6-sol",
			sameRuntime: true,
		},
	]);
	expect(result.tools["visitor/explorer"]).toEqual(
		[
			"find",
			"grep",
			"ls",
			"read",
			...(knowledgeEnabled ? ["recall"] : []),
			"spawn_agent",
			"chain_run",
			"run_driver",
			"watch_events",
			"run_status",
			"run_watch",
		].sort(),
	);
	expect(result.tools["visitor/notebook"]).toEqual(["recall", "remember"]);
	expect(result.policies).toEqual({
		purposes: ["default", "plan-review", "plan-revision", "default"],
		requiresTarget: [false, false, false, true],
		loop: { success: true, iterations: 2 },
		terminalAfterOne: {
			success: false,
			iterations: 1,
			error: "Consumer scope became terminal",
		},
		terminalSpawns: 1,
		terminal: {
			success: false,
			iterations: 0,
			error: "Consumer scope exhausted",
		},
		checkpoint: { success: true, summary: "Consumer checkpoint accepted" },
		refused: {
			success: false,
			error: 'Consumer refused: Unknown terminal gate "missing".',
		},
		spawns: 2,
		tools: ["read"],
		denial: {
			status: "denied",
			text: "spawn_agent denied: Consumer delegation denied",
		},
	});
}

test("the same fixture exercises the public seams in process for mutation coverage", async () => {
	const home = join(tmp.path, "home");
	await mkdir(home);
	vi.stubEnv("HOME", home);
	vi.stubEnv("PI_CODING_AGENT_DIR", join(home, ".pi", "agent"));
	vi.stubGlobal("fetch", () => {
		throw new Error("NETWORK_FORBIDDEN");
	});
	const dispose = vi.spyOn(AgentSession.prototype, "dispose");
	try {
		assertConsumerResult(await exerciseConsumer(tmp.path));
		assertConsumerResult(await exerciseConsumer(tmp.path, true), true);
		expect(dispose).toHaveBeenCalledTimes(6);
	} finally {
		dispose.mockRestore();
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	}
});

test("the consumer declares chain classification, terminal and session policies independently of content", () => {
	expect(consumer).toHaveProperty(
		"consumerChainAdapter.classifyStage",
		expect.any(Function),
	);
	expect(consumer).toHaveProperty(
		"consumerChainAdapter.terminalGates.fixture",
		expect.any(Function),
	);
	expect(consumer).toHaveProperty(
		"consumerChainAdapter.refuse",
		expect.any(Function),
	);
	expect(consumer).toHaveProperty(
		"consumerSessionPolicies.forAgent",
		expect.any(Function),
	);
});

test("the consumer owns memory-grant scenarios without shipped agents or raw shims", async () => {
	const home = join(tmp.path, "home");
	await mkdir(home);
	vi.stubEnv("HOME", home);
	vi.stubEnv("PI_CODING_AGENT_DIR", join(home, ".pi", "agent"));
	try {
		assertConsumerGrants(await exerciseConsumerGrants(tmp.path));
	} finally {
		vi.unstubAllEnvs();
	}
});

function assertConsumerGrants(
	result: Awaited<ReturnType<typeof exerciseConsumerGrants>>,
) {
	expect(result).toEqual({
		offTools: ["architecture_map_read", "recall", "remember"],
		onTools: [
			"architecture_map_read",
			"propose_knowledge",
			"recall",
			"remember",
		],
		revokedTools: ["recall"],
		offAgainTools: [],
		writes: {
			beforeTurn: "unauthorized",
			first: "created",
			pending: "confirmation_required",
			confirmed: "updated",
			unchanged: true,
			persisted: true,
			wrongIdentity: "unauthorized",
			switched: "unauthorized",
		},
		proposal: {
			status: "written",
			writer: "visitor/archivist",
			persisted: true,
			promoted: false,
		},
		architecture: { eligible: true, ineligible: "scope-ineligible" },
		recall: true,
		injected: true,
		transcripts: { a: true, b: true, memoryIsolated: true },
	});
}
