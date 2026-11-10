import { describe, expect, test, vi } from "vitest";
import type { LoadedDomain } from "../../lib/domains/types.ts";
import {
	buildInitPrompt,
	default as initExtension,
} from "../../lib/extensions/init/index.ts";
import type { CosmonautsRuntime } from "../../lib/runtime.ts";
import { setRuntimeHost } from "../../lib/runtime-host.ts";

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

function hostWith(init: LoadedDomain["manifest"]["init"]) {
	const domain = {
		manifest: {
			id: "ops",
			description: "Ops",
			lead: "lead",
			default: true,
			init,
		},
	} as LoadedDomain;
	const runtime = {
		domains: [domain],
		domainContext: undefined,
		domainRegistry: {
			get: (id: string) => (id === "ops" ? domain : undefined),
		},
		agentRegistry: { resolve: () => ({ id: "lead", domain: "ops" }) },
	} as unknown as CosmonautsRuntime;
	const factory = vi.fn(async () => runtime);
	setRuntimeHost(factory);
	return factory;
}

function registerInit() {
	const commands = new Map<
		string,
		{ handler: (args: string, ctx: unknown) => Promise<void> }
	>();
	const sendUserMessage = vi.fn();
	initExtension({
		registerCommand: (name: string, def: never) => commands.set(name, def),
		sendUserMessage,
	} as never);
	const command = commands.get("init");
	if (!command) throw new Error("init command not registered");
	const ctx = { cwd: "/tmp/project", ui: { notify: vi.fn() } };
	return { command, ctx, sendUserMessage };
}

describe("init extension", () => {
	test("/init sends the bootstrap prompt with the domain's instructions", async () => {
		const factory = hostWith({ kind: "inline", content: "Consumer steps." });
		const { command, ctx, sendUserMessage } = registerInit();

		await command.handler("", ctx);

		expect(factory).toHaveBeenCalledWith(
			expect.objectContaining({ projectRoot: "/tmp/project" }),
		);
		expect(sendUserMessage).toHaveBeenCalledExactlyOnceWith(
			buildInitPrompt("/tmp/project", "Consumer steps."),
		);
		expect(ctx.ui.notify).not.toHaveBeenCalled();
	});

	test("/init reports a domain without init instructions and sends nothing", async () => {
		hostWith(undefined);
		const { command, ctx, sendUserMessage } = registerInit();

		await command.handler("", ctx);

		expect(ctx.ui.notify).toHaveBeenCalledExactlyOnceWith(
			expect.stringContaining('Domain "ops" declares no init instructions.'),
			"error",
		);
		expect(sendUserMessage).not.toHaveBeenCalled();
	});

	test("/init without a runtime host reports it and sends nothing", async () => {
		delete (globalThis as Record<symbol, unknown>)[
			Symbol.for("cosmonauts:runtime-host")
		];
		const { command, ctx, sendUserMessage } = registerInit();

		await command.handler("", ctx);

		expect(ctx.ui.notify).toHaveBeenCalledExactlyOnceWith(
			"/init needs a Cosmonauts runtime host to find the domain's init instructions.",
			"error",
		);
		expect(sendUserMessage).not.toHaveBeenCalled();
	});
});
