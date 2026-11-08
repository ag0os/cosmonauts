/** SDK-free declaration and runtime surface. Session creation is a separate entry point. */
export * from "./agents/index.ts";
export type {
	HostExtensionProvider,
	SessionProviderContext,
} from "./agents/resource-providers.ts";
export type { NamedChain } from "./chains/types.ts";
export type { CosmonautsRuntimeOptions } from "./runtime.ts";
export {
	CosmonautsRuntime,
	RuntimeDeclarationCollisionError,
} from "./runtime.ts";
export type { RuntimeHostFactory, RuntimeHostRequest } from "./runtime-host.ts";
export {
	getHostRuntime,
	hasRuntimeHost,
	setRuntimeHost,
} from "./runtime-host.ts";
