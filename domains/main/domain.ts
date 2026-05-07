import type { DomainManifest } from "../../lib/domains/types.ts";

/** Main domain — top-level cross-domain executive assistant. */
export const manifest: DomainManifest = {
	id: "main",
	description:
		"Cross-domain orchestration domain. Houses Cosmo, the top-level executive assistant that delegates directly to specialists across installed domains.",
	lead: "cosmo",
};
