import type { ParsedPlan, RunFacts, Signal } from "./types.ts";

const BUILDER_ENVELOPE_INSTRUCTION =
	'End with the lean envelope: one JSON line as your last non-empty line, with "outcome" ("done", "blocked" or "failed"), a one-sentence "summary", your "evidence", every file you changed in "touched", and a "reason" when you are not done.';

const REVIEWER_ENVELOPE_INSTRUCTION =
	'End with the lean envelope: one JSON line as your last non-empty line, with "outcome" ("done", "blocked" or "failed"), a one-sentence "summary", your "findings" (id, severity, file, summary, fix), and a "reason" when you are not done.';

/**
 * The context pack verbatim, or the plan alone without one, with the
 * envelope instruction always the last paragraph (once, even when a
 * supplied pack already ends with it).
 */
export function builderPrompt(options: {
	plan: ParsedPlan;
	contextPack?: string;
}): string {
	const body =
		options.contextPack?.trimEnd() ??
		["Implement this plan.", options.plan.raw.trim()].join("\n\n");
	if (body.endsWith(BUILDER_ENVELOPE_INSTRUCTION)) return body;
	return [body, BUILDER_ENVELOPE_INSTRUCTION].filter(Boolean).join("\n\n");
}

export function reentryPrompt(
	basePrompt: string,
	signals: readonly Signal[],
): string {
	return [
		basePrompt,
		"## Host verification",
		"The host checked your change after you returned and these signals failed. Fix them in the worktree and hand back a new envelope.",
		...signals.map(renderSignal),
	].join("\n\n");
}

export function renderSignal(signal: Signal): string {
	return [
		`### ${signal.kind} (${signal.status})`,
		signal.summary,
		"```json",
		JSON.stringify(signal.data ?? null, null, 2),
		"```",
	].join("\n");
}

export function reviewerPrompt(options: {
	plan: ParsedPlan;
	facts: RunFacts;
	diff: string;
	changedFiles: readonly string[];
}): string {
	return [
		"Review this change against its plan. The host's verification facts are below; you have the checkout read-only.",
		"# Plan",
		options.plan.raw.trim(),
		"# Verification facts",
		renderFacts(options.facts),
		"# Changed files",
		options.changedFiles.join("\n") || "(none)",
		"# Diff",
		["```diff", options.diff.trimEnd(), "```"].join("\n"),
		REVIEWER_ENVELOPE_INSTRUCTION,
	].join("\n\n");
}

function renderFacts(facts: RunFacts): string {
	if (facts.passes.length === 0) return "(no checks ran)";
	return facts.passes
		.map((pass) =>
			[
				`## Pass ${pass.pass}`,
				...(pass.signals.length > 0
					? pass.signals.map(renderSignal)
					: ["(no signals)"]),
			].join("\n\n"),
		)
		.join("\n\n");
}
