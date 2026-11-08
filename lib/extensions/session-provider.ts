import type { InlineExtension } from "@earendil-works/pi-coding-agent";
import type { SessionProviderContext } from "../agents/resource-providers.ts";

export type { SessionProviderContext } from "../agents/resource-providers.ts";
export type SessionExtensionProvider = (
	context: SessionProviderContext,
) => InlineExtension | undefined | Promise<InlineExtension | undefined>;
