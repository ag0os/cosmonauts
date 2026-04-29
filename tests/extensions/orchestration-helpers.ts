import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { vi } from "vitest";
import type { AgentRegistry } from "../../lib/agents/index.ts";
import { createRegistryFromDomains } from "../../lib/agents/index.ts";
import { loadDomainsFromSources } from "../../lib/domains/index.ts";
import { DomainRegistry } from "../../lib/domains/registry.ts";

export const testDomainsDir = resolve(
	fileURLToPath(import.meta.url),
	"..",
	"..",
	"..",
	"domains",
);

export const testBundledCodingDir = resolve(
	fileURLToPath(import.meta.url),
	"..",
	"..",
	"..",
	"bundled",
	"coding",
);

interface OrchestrationDomainFixtures {
	agentRegistry: AgentRegistry;
	domainRegistry: DomainRegistry;
}

export async function loadOrchestrationDomainFixtures(): Promise<OrchestrationDomainFixtures> {
	const domains = await loadDomainsFromSources([
		{ domainsDir: testDomainsDir, origin: "framework", precedence: 1 },
		{ domainsDir: testBundledCodingDir, origin: "bundled", precedence: 2 },
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
