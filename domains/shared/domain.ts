import type { DomainManifest } from "../../lib/domains/types.ts";

/** Shared domain — cross-cutting capabilities, extensions, and skills available to all domains. */
export const manifest: DomainManifest = {
	id: "shared",
	description:
		"Shared capabilities, extensions, and skills available to all domains. Provides common capability packs and runtime integrations.",
};
