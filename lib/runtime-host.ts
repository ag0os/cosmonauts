import { resolve } from "node:path";
import type { CosmonautsRuntime } from "./runtime.ts";

/** Hosts own discovery and consumer defaults; library entry paths request this shared instance. */
export interface RuntimeHostRequest {
	readonly projectRoot: string;
	readonly domainOverride?: string;
	readonly pluginDirs?: readonly string[];
}
export type RuntimeHostFactory = (
	request: RuntimeHostRequest,
) => Promise<CosmonautsRuntime>;
interface RuntimeHostSlot {
	factory: RuntimeHostFactory;
	runtimes: Map<string, Promise<CosmonautsRuntime>>;
}
const HOST_KEY = Symbol.for("cosmonauts:runtime-host");
const globals = globalThis as Record<symbol, unknown>;

export function setRuntimeHost(factory: RuntimeHostFactory): void {
	globals[HOST_KEY] = {
		factory,
		runtimes: new Map(),
	} satisfies RuntimeHostSlot;
}
export function hasRuntimeHost(): boolean {
	return globals[HOST_KEY] !== undefined;
}
export function getHostRuntime(
	request: RuntimeHostRequest,
): Promise<CosmonautsRuntime> {
	const host = globals[HOST_KEY] as RuntimeHostSlot | undefined;
	if (!host)
		throw new Error(
			"No runtime host configured. Supply a consumer runtime or call setRuntimeHost before starting CLI or extension entry points.",
		);
	const normalized = {
		projectRoot: resolve(request.projectRoot),
		domainOverride: request.domainOverride,
		pluginDirs: request.pluginDirs?.length
			? [...request.pluginDirs]
			: undefined,
	};
	const key = JSON.stringify(normalized);
	let pending = host.runtimes.get(key);
	if (!pending) {
		pending = Promise.resolve()
			.then(() => host.factory(normalized))
			.catch((error: unknown) => {
				host.runtimes.delete(key);
				throw error;
			});
		host.runtimes.set(key, pending);
	}
	return pending;
}
