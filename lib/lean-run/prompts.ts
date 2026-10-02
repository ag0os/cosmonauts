import {
	type Envelope,
	EVIDENCE_KINDS,
	EVIDENCE_RESULTS,
	FINDING_SEVERITIES,
	type Finding,
} from "../envelope/index.ts";
import type {
	LeanLens,
	ParsedPlan,
	RunFacts,
	RunTier,
	Signal,
} from "./types.ts";

/** The parser's rule, stated where the host asks for the envelope: anything else is rejected. */
const BARE_LINE =
	"The envelope must be the very last line, bare, with nothing after it: not fenced, quoted or prefixed.";

/** `"a", "b" or "c"`: an enumeration as the instruction states it. */
function oneOf(values: readonly string[]): string {
	const quoted = values.map((value) => `"${value}"`);
	return `${quoted.slice(0, -1).join(", ")} or ${quoted.at(-1)}`;
}

/**
 * The schema's enumerations, one clause each: agents that were told only the
 * field names invented kinds and wrote free-text results (live runs 1 to 3).
 */
const EVIDENCE_ENUMERATIONS = `Each evidence "kind" is one of ${oneOf(EVIDENCE_KINDS)}; each evidence "result" is one of ${oneOf(EVIDENCE_RESULTS)}.`;

const SEVERITY_ENUMERATION = `Each finding "severity" is one of ${oneOf(FINDING_SEVERITIES)}.`;

const BUILDER_ENVELOPE_INSTRUCTION = `End with the lean envelope: one JSON line as your last non-empty line, with "outcome" ("done", "blocked" or "failed"), a one-sentence "summary", your "evidence" (kind, ref, result), every file you changed in "touched", and a "reason" when you are not done. ${EVIDENCE_ENUMERATIONS} ${BARE_LINE}`;

const REVIEWER_ENVELOPE_INSTRUCTION = `End with the lean envelope: one JSON line as your last non-empty line, with "outcome" ("done", "blocked" or "failed"), a one-sentence "summary", your "findings" (id, severity, file, summary, fix), and a "reason" when you are not done. ${SEVERITY_ENUMERATION} ${BARE_LINE}`;

/** Inline diff cap for the reviewer prompt; the full diff is a file in the review workspace. */
export const REVIEW_DIFF_INLINE_BYTES = 60 * 1024;

/** The first line of every envelope repair prompt; the lean role guard keys on it. */
export const REPAIR_HEADING = "# Envelope repair";

/** How much of the rejected output the repair prompt quotes. */
const REPAIR_QUOTE_CHARS = 8_000;

/** How much of the user's own messages the builder and reviewer get, most recent first. */
export const USER_MESSAGES_CAP_BYTES = 32 * 1024;

/**
 * The user's messages from the calling session, each fenced verbatim, oldest
 * first, as one section beside the lead's plan or request. Older messages
 * past the cap are left out, and a latest message over it alone is cut,
 * each with a note. Undefined without a non-blank message.
 */
export function userMessagesSection(
	messages: readonly string[] | undefined,
): string | undefined {
	const said = (messages ?? []).filter((message) => message.trim() !== "");
	const kept = recentWithinCap(said);
	if (kept.messages.length === 0) return undefined;
	const left = said.length - kept.messages.length;
	return [
		"# User's messages (verbatim)",
		...(left > 0
			? [
					`(${left} earlier message${left === 1 ? "" : "s"} left out: over the ${USER_MESSAGES_CAP_BYTES}-byte cap)`,
				]
			: []),
		...(kept.cut
			? [`(the latest message is cut at ${USER_MESSAGES_CAP_BYTES} bytes)`]
			: []),
		...kept.messages.map((message) => {
			const fence = fenceFor(message);
			return [fence, message, fence].join("\n");
		}),
	].join("\n\n");
}

function recentWithinCap(messages: readonly string[]): {
	messages: string[];
	cut: boolean;
} {
	const latest = messages.at(-1);
	if (latest === undefined) return { messages: [], cut: false };
	if (Buffer.byteLength(latest) > USER_MESSAGES_CAP_BYTES)
		return { messages: [cutUtf8(latest, USER_MESSAGES_CAP_BYTES)], cut: true };
	const kept: string[] = [];
	let bytes = 0;
	for (const message of [...messages].reverse()) {
		bytes += Buffer.byteLength(message);
		if (bytes > USER_MESSAGES_CAP_BYTES) break;
		kept.unshift(message);
	}
	return { messages: kept, cut: false };
}

/**
 * The context pack verbatim, or the plan (or direct request) alone without
 * one, followed by the user's messages; the envelope instruction is always
 * the last paragraph (once, even when a supplied pack already ends with it).
 */
export function builderPrompt(options: {
	plan: ParsedPlan;
	contextPack?: string;
	tier?: RunTier;
	/** `userMessagesSection`; a context pack carries its own. */
	userSection?: string | undefined;
}): string {
	const lead =
		options.tier === "direct" ? "Make this change." : "Implement this plan.";
	const body =
		options.contextPack?.trimEnd() ??
		[
			lead,
			options.plan.raw.trim(),
			...(options.userSection ? [options.userSection] : []),
		].join("\n\n");
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

/** The one remediation turn (principle 6): the reviewer's findings, and any verification still failing. */
export function findingsPrompt(options: {
	basePrompt: string;
	findings: readonly Finding[];
	failing: readonly Signal[];
}): string {
	return [
		options.basePrompt,
		"## Review findings",
		"A reviewer read your change and reported these findings. Address each one in the worktree, or say in your summary why not, and hand back a new envelope.",
		...options.findings.map(renderFinding),
		...(options.failing.length > 0
			? [
					"## Host verification still failing",
					...options.failing.map(renderSignal),
				]
			: []),
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

function renderFinding(finding: Finding): string {
	return [
		`### ${finding.id} (${finding.severity}) ${finding.file}`,
		finding.summary,
		`Fix: ${finding.fix}`,
	].join("\n");
}

interface ReviewerPromptOptions {
	plan: ParsedPlan;
	/**
	 * A direct request is reviewed against the request, not a plan; `review`
	 * means neither came with the change, so the prompt has no plan section.
	 */
	tier?: RunTier;
	/** `userMessagesSection`, shown after the plan or request. */
	userSection?: string | undefined;
	facts: RunFacts;
	diff: string;
	changedFiles: readonly string[];
	lenses: readonly LeanLens[];
	/** Where the full diff is; named when the inline diff is truncated. */
	fullDiffPath: string;
	/** For the re-review: the first review and the builder's answer to it. */
	earlier?: { review: Envelope; builder: Envelope };
}

export function reviewerPrompt(options: ReviewerPromptOptions): string {
	return [
		...reviewSubject(options),
		"# Verification facts",
		renderFacts(options.facts),
		...(options.earlier ? renderEarlierReview(options.earlier) : []),
		"# Changed files",
		options.changedFiles.join("\n") || "(none)",
		"# Diff",
		renderDiff(options.diff, options.fullDiffPath),
		REVIEWER_ENVELOPE_INSTRUCTION,
	].join("\n\n");
}

/** The opening line and lenses, then the plan or request the change answers and the user's messages, when there are. */
function reviewSubject(options: ReviewerPromptOptions): string[] {
	const facts =
		"The host's verification facts are below; you have the checkout read-only.";
	const lenses = ["# Lenses", options.lenses.join(", ")];
	if (options.tier === "review")
		return [
			`Review this change on its own merits; no plan or request came with it. ${facts}`,
			...lenses,
		];
	const against = options.tier === "direct" ? "Request" : "Plan";
	return [
		`Review this change against its ${against.toLowerCase()}. ${facts}`,
		...lenses,
		`# ${against}`,
		options.plan.raw.trim(),
		...(options.userSection ? [options.userSection] : []),
	];
}

function renderEarlierReview(earlier: {
	review: Envelope;
	builder: Envelope;
}): string[] {
	return [
		"# Earlier review",
		"This is the re-review. The first review reported these findings and the builder was sent back once to address them; check each one against the change as it is now.",
		...(earlier.review.findings ?? []).map(renderFinding),
		`Builder's answer: ${earlier.builder.summary ?? "(no summary)"}`,
	];
}

/** At most `REVIEW_DIFF_INLINE_BYTES`, cut at a line end, with a note naming the full diff. */
function renderDiff(diff: string, fullDiffPath: string): string {
	const { text, truncated } = boundDiff(diff);
	const fenced = ["```diff", text.trimEnd(), "```"].join("\n");
	if (!truncated) return fenced;
	return [
		fenced,
		`(truncated at ${REVIEW_DIFF_INLINE_BYTES} bytes; full diff at ${fullDiffPath})`,
	].join("\n\n");
}

export function boundDiff(diff: string): { text: string; truncated: boolean } {
	const bytes = Buffer.from(diff, "utf8");
	if (bytes.length <= REVIEW_DIFF_INLINE_BYTES)
		return { text: diff, truncated: false };
	const head = cutUtf8(diff, REVIEW_DIFF_INLINE_BYTES);
	const lineEnd = head.lastIndexOf("\n");
	return {
		text: lineEnd > 0 ? head.slice(0, lineEnd + 1) : head,
		truncated: true,
	};
}

/** The first `maxBytes` bytes of `text` or fewer, never splitting a character. */
function cutUtf8(text: string, maxBytes: number): string {
	const bytes = Buffer.from(text, "utf8");
	let cut = maxBytes;
	while (cut > 0 && isContinuationByte(bytes[cut])) cut--;
	return bytes.subarray(0, cut).toString("utf8");
}

/** A UTF-8 byte that continues a character: cutting before it would split one. */
function isContinuationByte(byte: number | undefined): boolean {
	return byte !== undefined && (byte & 0xc0) === 0x80;
}

/**
 * Asks the same role, in a fresh read-only session, to re-emit only its
 * envelope: the parse error, the role's field list and the end of what it said.
 */
export function repairPrompt(options: {
	reviewer: boolean;
	reason: string;
	output: string;
}): string {
	const instruction = options.reviewer
		? REVIEWER_ENVELOPE_INSTRUCTION
		: BUILDER_ENVELOPE_INSTRUCTION;
	const quoted = options.output.slice(-REPAIR_QUOTE_CHARS).trimEnd();
	const fence = fenceFor(quoted);
	return [
		REPAIR_HEADING,
		`Your last session ended without a valid lean envelope: ${options.reason}. Do not change anything and do not call tools; this turn only re-emits the envelope for the work already done.`,
		"## The end of your last reply",
		[`${fence}text`, quoted, fence].join("\n"),
		"## The envelope",
		instruction,
		"Reply with only the envelope line, nothing else.",
	].join("\n\n");
}

/** A backtick fence longer than any backtick run in `text`, so the quote cannot close it. */
function fenceFor(text: string): string {
	const runs = text.match(/`+/g) ?? [];
	const longest = Math.max(0, ...runs.map((run) => run.length));
	return "`".repeat(Math.max(3, longest + 1));
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
