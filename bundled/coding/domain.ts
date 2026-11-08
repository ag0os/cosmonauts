import type { DomainManifest } from "../../lib/domains/types.ts";
import { qualityReviewSessionPolicies } from "../../lib/orchestration/quality-review-session-provider.ts";

/** Coding domain — agents, skills, and named chains for software development. */
export const manifest: DomainManifest = {
	id: "coding",
	description:
		"Software development domain. Provides coding-focused agents, capabilities, skills, and named chains for designing, implementing, and reviewing code.",
	lead: "cody",
	sessionPolicies: qualityReviewSessionPolicies,
};
