import { describe, expect, test, vi } from "vitest";
import { bindSessionExtensions } from "../../lib/agents/extension-assembly.ts";
import type { LoadedDomain } from "../../lib/domains/types.ts";
import {
	buildInitPrompt,
	default as initExtension,
} from "../../lib/extensions/init/index.ts";
import type { CosmonautsRuntime } from "../../lib/runtime.ts";
import { getHostRuntime, setRuntimeHost } from "../../lib/runtime-host.ts";

describe("buildInitPrompt", () => {
	test("includes the project directory and the consumer's instructions", () => {
		const prompt = buildInitPrompt("/home/user/my-project", "Consumer steps.");

		expect(prompt).toContain("/home/user/my-project");
		expect(prompt).toContain("Consumer steps.");
		expect(prompt).not.toContain("/skill:");
	});

	test("does not embed the old workflow checklist", () => {
		const prompt = buildInitPrompt("/tmp/project", "Consumer steps.");

		expect(prompt).not.toContain("Follow these steps:");
		expect(prompt).not.toContain("AGENTS.md already exists");
		expect(prompt).not.toContain("CLAUDE.md exists in the project root");
	});
});

describe("init extension loaded by path", () => {
	test("/init without session context reports it and sends nothing", async () => {
		const commands = new Map<
			string,
			{ handler: (args: string, ctx: unknown) => Promise<void> }
		>();
		const sendUserMessage = vi.fn();
		initExtension({
			registerCommand: (name: string, def: never) => commands.set(name, def),
			sendUserMessage,
		} as never);
		const ctx = { cwd: "/tmp/project", ui: { notify: vi.fn() } };

		await commands.get("init")?.handler("", ctx);

		expect(ctx.ui.notify).toHaveBeenCalledExactlyOnceWith(
			"/init needs a Cosmonauts runtime to find the active agent's init instructions.",
			"error",
		);
		expect(sendUserMessage).not.toHaveBeenCalled();
	});
});

describe("/init in a session whose agent is outside the default domain", () => {
	const NO_MEMORY = {
		knowledge: false,
		authored: false,
		proposals: false,
		architecture: false,
		episodes: false,
	};
	function twoDomainRuntime(domainContext: string | undefined) {
		const domain = (id: string, lead: string, content: string) =>
			({
				manifest: {
					id,
					description: id,
					lead,
					default: id === "a",
					init: { kind: "inline", content },
				},
			}) as LoadedDomain;
		const domains = [
			domain("a", "lead", "A steps."),
			domain("b", "helper", "B steps."),
		];
		return {
			domains,
			domainContext,
			domainRegistry: {
				get: (id: string) => domains.find((d) => d.manifest.id === id),
			},
			agentRegistry: {
				resolve: (id: string) => ({
					id: id.split("/").at(-1),
					domain: id.endsWith("helper") ? "b" : "a",
				}),
			},
		} as unknown as CosmonautsRuntime;
	}

	async function runInit(
		agentId: string,
		runtime: CosmonautsRuntime | undefined,
	) {
		const { factories } = await bindSessionExtensions({
			names: ["init"],
			context: { agentId, memory: NO_MEMORY, runtime },
		});
		const commands = new Map<
			string,
			{ handler: (args: string, ctx: unknown) => Promise<void> }
		>();
		const sendUserMessage = vi.fn();
		const pi = {
			registerCommand: (name: string, def: never) => commands.set(name, def),
			sendUserMessage,
		};
		for (const extension of factories)
			await (typeof extension === "function"
				? extension(pi as never)
				: extension.factory(pi as never));
		const ctx = { cwd: "/tmp/project", ui: { notify: vi.fn() } };
		await commands.get("init")?.handler("", ctx);
		return { sendUserMessage, notify: ctx.ui.notify };
	}

	test.each([
		["-d b", { projectRoot: "/tmp/project", domainOverride: "b" }],
		["-a b/helper", { projectRoot: "/tmp/project" }],
	])("%s: sends the active agent's domain instructions", async (_label, request) => {
		setRuntimeHost(async (req) => twoDomainRuntime(req.domainOverride));
		const runtime = await getHostRuntime(request);

		const { sendUserMessage, notify } = await runInit("b/helper", runtime);

		expect(notify).not.toHaveBeenCalled();
		expect(sendUserMessage).toHaveBeenCalledExactlyOnceWith(
			buildInitPrompt("/tmp/project", "B steps."),
		);
	});

	test("an agent whose domain the session runtime lacks fails loudly", async () => {
		const { sendUserMessage, notify } = await runInit(
			"plugin/helper",
			twoDomainRuntime(undefined),
		);

		expect(notify).toHaveBeenCalledExactlyOnceWith(
			'/init: the active agent "plugin/helper" belongs to domain "plugin", which this session\'s runtime does not have.',
			"error",
		);
		expect(sendUserMessage).not.toHaveBeenCalled();
	});

	test("an agent whose domain declares no init fails loudly", async () => {
		const runtime = {
			domainRegistry: { get: () => ({ manifest: { id: "b" } }) },
		} as unknown as CosmonautsRuntime;
		const { sendUserMessage, notify } = await runInit("b/helper", runtime);

		expect(notify).toHaveBeenCalledExactlyOnceWith(
			expect.stringContaining('Domain "b" declares no init instructions.'),
			"error",
		);
		expect(sendUserMessage).not.toHaveBeenCalled();
	});

	test("an agent with no domain fails loudly", async () => {
		const { sendUserMessage, notify } = await runInit(
			"solo",
			twoDomainRuntime(undefined),
		);

		expect(notify).toHaveBeenCalledExactlyOnceWith(
			'/init: the active agent "solo" belongs to no domain, so it has no init instructions.',
			"error",
		);
		expect(sendUserMessage).not.toHaveBeenCalled();
	});

	test("a session without a runtime fails loudly", async () => {
		const { sendUserMessage, notify } = await runInit("b/helper", undefined);

		expect(notify).toHaveBeenCalledExactlyOnceWith(
			"/init needs a Cosmonauts runtime to find the active agent's init instructions.",
			"error",
		);
		expect(sendUserMessage).not.toHaveBeenCalled();
	});
});
