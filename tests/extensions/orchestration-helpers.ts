import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { vi } from "vitest";
import type { AgentRegistry } from "../../lib/agents/index.ts";
import { createRegistryFromDomains } from "../../lib/agents/index.ts";
import { loadDomainsFromSources } from "../../lib/domains/index.ts";
import { DomainRegistry } from "../../lib/domains/registry.ts";
import { writeSyntheticInstallableDomainPackage } from "../helpers/packages.ts";

export const testDomainsDir = resolve(
	fileURLToPath(import.meta.url),
	"..",
	"..",
	"..",
	"domains",
);

export const testBundledAlphaDir = "/framework/bundled/alpha";

interface OrchestrationDomainFixtures {
	agentRegistry: AgentRegistry;
	domainRegistry: DomainRegistry;
}

interface LoadOrchestrationDomainFixtureOptions {
	domainId?: string;
}

export async function loadOrchestrationDomainFixtures(
	options: LoadOrchestrationDomainFixtureOptions = {},
): Promise<OrchestrationDomainFixtures> {
	const domainId = options.domainId ?? "coding";
	const packageRoot = await mkdtemp(
		join(tmpdir(), `orchestration-${domainId}-`),
	);
	await writeSyntheticInstallableDomainPackage(packageRoot, {
		packageName: `${domainId}-pkg`,
		domainId,
		lead: "coordinator",
		agents: [
			{
				id: "cody",
				subagents: ["worker", "explorer", "quality-manager", "verifier"],
			},
			{ id: "coordinator", loop: true },
			{ id: "explorer" },
			{ id: "planner" },
			{ id: "verifier" },
			{ id: "worker" },
			{ id: "quality-manager", subagents: ["verifier"] },
		],
		prompts: {
			cody: `Synthetic ${domainId} cody persona.`,
			coordinator: `Synthetic ${domainId} coordinator persona.`,
			explorer: `Synthetic ${domainId} explorer persona.`,
			planner: `Synthetic ${domainId} planner persona.`,
			verifier: `Synthetic ${domainId} verifier persona.`,
			worker: `Synthetic ${domainId} worker persona.`,
			"quality-manager": `Synthetic ${domainId} quality manager persona.`,
		},
	});
	const domains = await loadDomainsFromSources([
		{ domainsDir: testDomainsDir, origin: "framework", precedence: 1 },
		{
			// @cosmo-behavior plan:coding-agnostic-framework#B-017
			domainsDir: packageRoot,
			sourceType: "domain-root",
			origin: "synthetic",
			precedence: 2,
		},
	]);

	return {
		agentRegistry: createRegistryFromDomains(domains),
		domainRegistry: new DomainRegistry(domains),
	};
}

interface RegisteredTool {
	name: string;
	execute: (...args: unknown[]) => Promise<unknown>;
	renderResult?: (...args: unknown[]) => unknown;
}

interface MockPiOptions {
	systemPrompt?: string;
	defaultSystemPrompt?: string;
	sessionId?: string;
}

export function createMockPi(cwd: string, options?: MockPiOptions) {
	const tools = new Map<string, RegisteredTool>();
	const sessionId = options?.sessionId ?? `test-session-${Math.random()}`;
	const sendUserMessage = vi.fn();
	return {
		registerTool(def: RegisteredTool) {
			tools.set(def.name, def);
		},
		registerMessageRenderer: vi.fn(),
		sendMessage: vi.fn(),
		on: vi.fn(),
		sendUserMessage,
		getTool(name: string) {
			return tools.get(name);
		},
		async callTool(name: string, params: unknown) {
			const tool = tools.get(name);
			if (!tool) throw new Error(`Tool not found: ${name}`);
			const context = {
				cwd,
				getSystemPrompt: () =>
					options?.systemPrompt ?? options?.defaultSystemPrompt ?? "",
				sessionManager: { getSessionId: () => sessionId },
			};
			return Reflect.apply(tool.execute, undefined, [
				"call-id",
				params,
				undefined,
				undefined,
				context,
			]);
		},
	};
}

export async function flushAsync(delayMs = 0): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, delayMs));
}
