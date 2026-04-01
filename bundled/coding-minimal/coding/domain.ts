import type { DomainManifest } from "../../../lib/domains/types.ts";

/** Minimal coding domain — essential agents for getting started with software development. */
export const manifest: DomainManifest = {
	id: "coding",
	description:
		"Minimal coding domain. Provides core agents (cosmo, planner, task-manager, coordinator, worker, quality-manager) for designing, implementing, and reviewing code.",
	lead: "cosmo",
	portable: true,
};
