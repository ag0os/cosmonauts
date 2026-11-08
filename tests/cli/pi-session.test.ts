import { beforeEach, expect, test, vi } from "vitest";
import { createToollessPiSession } from "../../cli/pi-session.ts";
import type { CosmonautsRuntime } from "../../lib/runtime.ts";
import { setRuntimeHost } from "../../lib/runtime-host.ts";

const mocks = vi.hoisted(() => ({
	create: vi.fn(),
	runtime: vi.fn(async () => ({})),
	reload: vi.fn(async () => {}),
}));
vi.mock("@earendil-works/pi-coding-agent", () => ({
	createAgentSession: mocks.create,
	ModelRuntime: { create: mocks.runtime },
	ModelRegistry: class {
		find(provider: string, id: string) {
			return { provider, id };
		}
	},
	getAgentDir: () => "/fixture/agent",
	SessionManager: { inMemory: () => ({}) },
	DefaultResourceLoader: class {
		reload = mocks.reload;
	},
}));
beforeEach(() => {
	mocks.create.mockResolvedValue({ session: { sessionId: "bounded" } });
});

test.each([
	{ model: undefined, expected: "host", hostCalls: 1 },
	{ model: "test/override", expected: "override", hostCalls: 0 },
])("tool-less sessions use explicit or consumer models ($expected)", async ({
	model,
	expected,
	hostCalls,
}) => {
	const host = vi.fn(
		async () => ({ defaultModel: "test/host" }) as CosmonautsRuntime,
	);
	setRuntimeHost(host);
	await expect(
		createToollessPiSession({
			projectRoot: "/consumer",
			systemPrompt: "Bounded",
			model,
		}),
	).resolves.toEqual({ sessionId: "bounded" });
	expect(host).toHaveBeenCalledTimes(hostCalls);
	expect(mocks.create).toHaveBeenCalledWith(
		expect.objectContaining({
			model: { provider: "test", id: expected },
			noTools: "all",
		}),
	);
});

test("tool-less sessions fail before Pi setup when no model is supplied", async () => {
	setRuntimeHost(async () => ({}) as CosmonautsRuntime);
	await expect(
		createToollessPiSession({
			projectRoot: "/consumer",
			systemPrompt: "Bounded",
		}),
	).rejects.toThrow("No model configured");
	expect(mocks.runtime).not.toHaveBeenCalled();
});
