import type { DomainManifest } from "../../lib/domains/types.ts";

/** Lean coding domain — four roles, two optional contract documents, one envelope. */
export const manifest: DomainManifest = {
	id: "lean",
	description:
		"Lean software development domain. A lead, a builder, a code reviewer and a checker with short prompts, optional spec and plan documents, and one JSON envelope per agent.",
	lead: "lead",
};
