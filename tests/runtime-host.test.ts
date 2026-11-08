import { resolve } from "node:path";
import { expect, test, vi } from "vitest";
import type { CosmonautsRuntime } from "../lib/runtime.ts";
import {
	getHostRuntime,
	hasRuntimeHost,
	type RuntimeHostRequest,
	setRuntimeHost,
} from "../lib/runtime-host.ts";

test("concurrent entry points share one host-built runtime for the same effective request", async () => {
	const runtime = {} as CosmonautsRuntime;
	const factory = vi.fn(async (_request: RuntimeHostRequest) => runtime);
	setRuntimeHost(factory);
	const [first, second] = await Promise.all([
		getHostRuntime({ projectRoot: "." }),
		getHostRuntime({ projectRoot: resolve("."), pluginDirs: [] }),
	]);
	expect(first).toBe(runtime);
	expect(second).toBe(runtime);
	expect(factory).toHaveBeenCalledOnce();
	expect(factory).toHaveBeenCalledWith({
		projectRoot: resolve("."),
		domainOverride: undefined,
		pluginDirs: undefined,
	});
});

test("host requests separate domain/plugin scopes and do not retain a mutable caller array", async () => {
	const factory = vi.fn(
		async (_request: RuntimeHostRequest) => ({}) as CosmonautsRuntime,
	);
	setRuntimeHost(factory);
	const pluginDirs = ["/plugins/first"];
	const pending = getHostRuntime({
		projectRoot: "/consumer",
		domainOverride: "studio",
		pluginDirs,
	});
	pluginDirs.push("/plugins/later");
	await pending;
	expect(factory.mock.calls[0]?.[0]).toEqual({
		projectRoot: "/consumer",
		domainOverride: "studio",
		pluginDirs: ["/plugins/first"],
	});
	await getHostRuntime({
		projectRoot: "/consumer",
		domainOverride: "other",
		pluginDirs: ["/plugins/first"],
	});
	expect(factory).toHaveBeenCalledTimes(2);
});

test("a failed host construction can be retried after the caller repairs its input", async () => {
	const runtime = {} as CosmonautsRuntime;
	const factory = vi
		.fn()
		.mockRejectedValueOnce(new Error("bad declaration"))
		.mockResolvedValue(runtime);
	setRuntimeHost(factory);
	await expect(getHostRuntime({ projectRoot: "/consumer" })).rejects.toThrow(
		"bad declaration",
	);
	await expect(getHostRuntime({ projectRoot: "/consumer" })).resolves.toBe(
		runtime,
	);
	expect(factory).toHaveBeenCalledTimes(2);
});

test("module reloads share the registered host and pending runtime collection", async () => {
	const runtime = {} as CosmonautsRuntime;
	const factory = vi.fn(async (_request: RuntimeHostRequest) => runtime);
	setRuntimeHost(factory);
	await getHostRuntime({ projectRoot: "/consumer" });
	vi.resetModules();
	const reloaded = await import("../lib/runtime-host.ts");
	expect(reloaded.hasRuntimeHost()).toBe(true);
	expect(await reloaded.getHostRuntime({ projectRoot: "/consumer" })).toBe(
		runtime,
	);
	expect(factory).toHaveBeenCalledOnce();
});

test("unconfigured entry points fail rather than bootstrapping repository content", () => {
	delete (globalThis as Record<symbol, unknown>)[
		Symbol.for("cosmonauts:runtime-host")
	];
	expect(hasRuntimeHost()).toBe(false);
	expect(() => getHostRuntime({ projectRoot: "/consumer" })).toThrow(
		"No runtime host configured",
	);
});
