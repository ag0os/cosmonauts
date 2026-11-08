import { expect, test, vi } from "vitest";
import {
	createCliRuntimeContext,
	getCliExecutionRuntime,
} from "../../cli/runtime-bootstrap.ts";
import type { CosmonautsRuntime } from "../../lib/runtime.ts";
import { setRuntimeHost } from "../../lib/runtime-host.ts";

test("CLI bootstrap forwards effective options and returns the exact host runtime", async () => {
	const runtime = {} as CosmonautsRuntime;
	const factory = vi.fn(async () => runtime);
	setRuntimeHost(factory);
	const context = await createCliRuntimeContext({
		piFlags: {},
		domain: "studio",
		pluginDirs: ["/plugins/first", "/plugins/second"],
	});
	expect(context).toEqual({ cwd: process.cwd(), runtime });
	expect(context.runtime).toBe(runtime);
	expect(factory).toHaveBeenCalledWith({
		projectRoot: process.cwd(),
		domainOverride: "studio",
		pluginDirs: ["/plugins/first", "/plugins/second"],
	});
});

test("CLI execution asks only for the base project runtime without plugin or domain additions", async () => {
	const base = {} as CosmonautsRuntime;
	const factory = vi.fn(async () => base);
	setRuntimeHost(factory);
	expect(await getCliExecutionRuntime(process.cwd())).toBe(base);
	expect(factory).toHaveBeenCalledExactlyOnceWith({
		projectRoot: process.cwd(),
	});
});
