import type { DomainManifest } from "../../lib/domains/types.ts";

/** Shared domain — cross-cutting capabilities, prompts, and skills available to all domains. */
export const manifest: DomainManifest = {
	id: "shared",
	description:
		"Shared capabilities, prompts, and skills available to all domains. Provides base system prompts, common capability packs, and runtime overlays.",
};
