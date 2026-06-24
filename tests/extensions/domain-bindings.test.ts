import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, test, vi } from "vitest";
import domainBindingsExtension from "../../domains/shared/extensions/domain-bindings/index.ts";
import { isSubagentAllowed } from "../../domains/shared/extensions/orchestration/authorization.ts";
import {
	clearSharedDomainBindings,
	setSharedDomainBindings,
} from "../../lib/interactive/domain-bindings.ts";
import { parseChain } from "../../lib/orchestration/chain-parser.ts";
import { compileChainToGraph } from "../../lib/orchestration/durable-chain-compiler.ts";
import { CosmonautsRuntime } from "../../lib/runtime.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("domain-bindings-extension-");

interface RegisteredCommand {
	description: string;
	handler: (args: string, ctx: CommandContext) => Promise<void>;
	getArgumentCompletions?: (
		prefix: string,
	) => { value: string; label: string }[] | null;
}

interface CommandContext {
	cwd: string;
	ui: {
		notify: (message: string, level: string) => void;
	};
}

function createMockPi() {
	const commands = new Map<string, RegisteredCommand>();
	const entries: { customType: string; data: unknown }[] = [];

	return {
		entries,
		registerCommand(name: string, command: RegisteredCommand) {
			commands.set(name, command);
		},
		appendEntry(customType: string, data: unknown) {
			entries.push({ customType, data });
		},
		getCommand(name: string) {
			return commands.get(name);
		},
	};
}

function createCommandContext(): CommandContext {
	return {
		cwd: tmp.path,
		ui: {
			notify: vi.fn(),
		},
	};
}

function getCommand(pi: ReturnType<typeof createMockPi>, name: string) {
	const command = pi.getCommand(name);
	if (!command) throw new Error(`${name} command not registered`);
	return command;
}

async function writeDomainManifest(
	dir: string,
	id: string,
	extras = "",
): Promise<void> {
	await writeFile(
		join(dir, "domain.ts"),
		`export const manifest = { id: "${id}", description: "Test domain ${id}" ${extras} };\n`,
	);
}

async function writeAgentDef(
	agentsDir: string,
	id: string,
	overrides: Record<string, unknown> = {},
): Promise<void> {
	const merged = {
		id,
		description: `Agent ${id}`,
		capabilities: [],
		model: "test/model",
		tools: "none",
		extensions: [],
		projectContext: false,
		session: "ephemeral",
		loop: false,
		...overrides,
	};
	await writeFile(
		join(agentsDir, `${id}.ts`),
		`const definition = ${JSON.stringify(merged)};\nexport default definition;\n`,
	);
}

async function writeProjectConfig(
	projectRoot: string,
	config: Record<string, unknown>,
): Promise<void> {
	const configDir = join(projectRoot, ".cosmonauts");
	await mkdir(configDir, { recursive: true });
	await writeFile(join(configDir, "config.json"), JSON.stringify(config));
}

async function setupSharedDomain(domainsDir: string): Promise<void> {
	const sharedDir = join(domainsDir, "shared");
	await mkdir(join(sharedDir, "capabilities"), { recursive: true });
	await writeDomainManifest(sharedDir, "shared");
	await writeFile(join(sharedDir, "capabilities", "core.md"), "# core");
}

async function setupNamedDomain(
	domainsDir: string,
	id: string,
	agents: Array<{ id: string; overrides?: Record<string, unknown> }>,
	opts: {
		chains?: Array<{ name: string; description: string; chain: string }>;
	} = {},
): Promise<void> {
	const domainDir = join(domainsDir, id);
	await mkdir(domainDir, { recursive: true });
	await writeDomainManifest(domainDir, id);
	if (opts.chains) {
		await writeFile(
			join(domainDir, "chains.ts"),
			`export default ${JSON.stringify(opts.chains)};`,
		);
	}

	const agentsDir = join(domainDir, "agents");
	const promptsDir = join(domainDir, "prompts");
	await mkdir(agentsDir, { recursive: true });
	await mkdir(promptsDir, { recursive: true });

	for (const agent of agents) {
		await writeAgentDef(agentsDir, agent.id, agent.overrides);
		await writeFile(join(promptsDir, `${agent.id}.md`), `# ${agent.id}`);
	}
}

async function setupRuntime(): Promise<CosmonautsRuntime> {
	const domainsDir = join(tmp.path, "domains");
	await mkdir(domainsDir, { recursive: true });
	await setupSharedDomain(domainsDir);
	await setupNamedDomain(
		domainsDir,
		"ruby-coding",
		[
			{
				id: "worker",
				overrides: {
					description: "Original worker",
					capabilities: ["core"],
					model: "test/original-worker",
				},
			},
		],
		{
			chains: [
				{
					name: "original-build",
					description: "Original build",
					chain: "worker",
				},
			],
		},
	);
	await setupNamedDomain(
		domainsDir,
		"ruby-experimental",
		[
			{
				id: "worker",
				overrides: {
					description: "Experimental worker",
					capabilities: ["core"],
					model: "test/experimental-worker",
				},
			},
		],
		{
			chains: [
				{
					name: "experimental-build",
					description: "Experimental build",
					chain: "worker",
				},
			],
		},
	);
	await setupNamedDomain(domainsDir, "consumer", [
		{
			id: "leader",
			overrides: {
				capabilities: ["core"],
				subagents: ["ruby-coding/worker"],
			},
		},
	]);
	await writeProjectConfig(tmp.path, {
		activeDomains: ["ruby-coding", "ruby-experimental", "consumer"],
		domain: "ruby-coding",
	});

	const runtime = await CosmonautsRuntime.create({
		builtinDomainsDir: domainsDir,
		projectRoot: tmp.path,
	});
	setSharedDomainBindings({
		domainRegistry: runtime.domainRegistry,
		bindingResolver: runtime.bindingResolver,
		liveBindings: runtime.liveDomainBindings,
	});
	return runtime;
}

describe("domain-bindings extension", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearSharedDomainBindings();
	});

	test("/domain-bind records a live switch and future resolutions use the bound target", async () => {
		// @cosmo-behavior plan:domain-authoring#B-010
		const runtime = await setupRuntime();
		const pi = createMockPi();
		domainBindingsExtension(pi as never);
		const ctx = createCommandContext();

		const alreadyRunningAgent =
			runtime.agentRegistry.resolveReference("ruby-coding/worker");
		expect(alreadyRunningAgent?.definition.description).toBe("Original worker");
		const alreadySpawnedSteps = parseChain(
			"worker",
			runtime.agentRegistry,
			runtime.domainContext,
		);
		const alreadySpawnedGraph = compileChainToGraph({
			runId: "pre-switch-spawn",
			steps: alreadySpawnedSteps,
			projectRoot: tmp.path,
			registry: runtime.agentRegistry,
			domainContext: runtime.domainContext,
		});

		await getCommand(pi, "domain-bind").handler(
			"ruby-coding ruby-experimental",
			ctx,
		);

		expect(pi.entries).toHaveLength(1);
		expect(pi.entries[0]).toMatchObject({
			customType: "domain-binding",
			data: {
				role: "ruby-coding",
				targetDomain: "ruby-experimental",
				previousTargetDomain: "ruby-coding",
			},
		});
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			"Bound domain role `ruby-coding` to `ruby-experimental`.",
			"info",
		);
		expect(runtime.liveDomainBindings.snapshot()).toEqual({
			"ruby-coding": "ruby-experimental",
		});

		const futureAgent =
			runtime.agentRegistry.resolveReference("ruby-coding/worker");
		expect(futureAgent?.definition.domain).toBe("ruby-experimental");
		expect(futureAgent?.definition.description).toBe("Experimental worker");
		expect(futureAgent?.reference.binding).toEqual({
			role: "ruby-coding",
			domainId: "ruby-experimental",
			source: "live",
		});

		const consumer = runtime.agentRegistry.resolve("consumer/leader");
		if (!futureAgent || !alreadyRunningAgent) {
			expect.unreachable("Expected bound and unbound workers to resolve");
		}
		expect(
			isSubagentAllowed(
				consumer,
				futureAgent.definition,
				futureAgent.reference,
			),
		).toBe(true);

		const chainSteps = parseChain(
			"worker",
			runtime.agentRegistry,
			runtime.domainContext,
		);
		const stage = chainSteps[0];
		if (!stage || "kind" in stage) {
			expect.unreachable("Expected a single chain stage");
		}
		expect(stage.agentReference?.resolved.qualifiedId).toBe(
			"ruby-experimental/worker",
		);

		const compiled = compileChainToGraph({
			runId: "live-binding-chain",
			steps: chainSteps,
			projectRoot: tmp.path,
			registry: runtime.agentRegistry,
			domainContext: runtime.domainContext,
		});
		const backendOptions = compiled.graph.steps[0]?.backend.options as
			| {
					stage: { agentReference?: typeof stage.agentReference };
					spawn: {
						agentReference?: typeof stage.agentReference;
						model: string;
					};
			  }
			| undefined;
		expect(backendOptions?.stage.agentReference?.resolved.qualifiedId).toBe(
			"ruby-experimental/worker",
		);
		expect(backendOptions?.spawn.agentReference?.resolved.qualifiedId).toBe(
			"ruby-experimental/worker",
		);
		expect(backendOptions?.spawn.model).toBe("test/experimental-worker");

		expect(alreadyRunningAgent.definition.domain).toBe("ruby-coding");
		expect(alreadyRunningAgent.definition.description).toBe("Original worker");
		const alreadySpawnedOptions = alreadySpawnedGraph.graph.steps[0]?.backend
			.options as
			| {
					spawn: {
						agentReference?: typeof stage.agentReference;
						model: string;
					};
			  }
			| undefined;
		expect(
			alreadySpawnedOptions?.spawn.agentReference?.resolved.qualifiedId,
		).toBe("ruby-coding/worker");
		expect(alreadySpawnedOptions?.spawn.model).toBe("test/original-worker");
	});

	test("/domain-bind reports unavailable targets without changing the effective binding", async () => {
		// @cosmo-behavior plan:domain-authoring#B-011
		const runtime = await setupRuntime();
		const pi = createMockPi();
		domainBindingsExtension(pi as never);
		const ctx = createCommandContext();

		await getCommand(pi, "domain-bind").handler(
			"ruby-coding ruby-experimental",
			ctx,
		);
		const beforeRejectedSwitch =
			runtime.agentRegistry.resolveReference("ruby-coding/worker");

		await getCommand(pi, "domain-bind").handler(
			"ruby-coding ghost-domain",
			ctx,
		);

		expect(ctx.ui.notify).toHaveBeenLastCalledWith(
			'Domain binding target "ghost-domain" for role "ruby-coding" is not active or installed. Install or activate "ghost-domain" before binding "ruby-coding" to it.',
			"error",
		);
		expect(pi.entries).toHaveLength(1);
		expect(runtime.liveDomainBindings.snapshot()).toEqual({
			"ruby-coding": "ruby-experimental",
		});
		const afterRejectedSwitch =
			runtime.agentRegistry.resolveReference("ruby-coding/worker");
		expect(beforeRejectedSwitch?.reference.binding).toEqual({
			role: "ruby-coding",
			domainId: "ruby-experimental",
			source: "live",
		});
		expect(afterRejectedSwitch?.reference.binding).toEqual(
			beforeRejectedSwitch?.reference.binding,
		);
		expect(afterRejectedSwitch?.definition.description).toBe(
			"Experimental worker",
		);
	});
});
