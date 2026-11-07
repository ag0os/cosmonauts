import type { DomainManifest } from "../../lib/domains/types.ts";

import { codingChainAdapter } from "./chain-adapter.ts";

/** Coding domain — agents, skills, and named chains for software development. */
export const manifest: DomainManifest = {
	id: "coding",
	chainAdapter: codingChainAdapter,
	workerAgent: "coding/worker",
	description:
		"Software development domain. Provides coding-focused agents, capabilities, skills, and named chains for designing, implementing, and reviewing code.",
	lead: "cody",
};
