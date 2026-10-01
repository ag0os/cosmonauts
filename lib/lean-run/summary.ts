import type { DetachedProcess, PatchFailure, RunRecord } from "./types.ts";

/** How many detached candidates the summary names; the rest are counted. */
const NAMED_CANDIDATES = 3;
/** The command characters the summary keeps per candidate; run.json has more. */
const CANDIDATE_COMMAND_CHARS = 80;

/**
 * One line for the lead: status, reason or the last review's verdict, and
 * re-entries. A build that did not apply its change names the latest
 * builder patch, so a human can apply it, and says when the last attempt's
 * work is in no patch. Detached process candidates are named whatever the
 * status.
 */
export function summarizeRun(record: RunRecord): string {
	return `${outcomeLine(record)}${detachedNote(record.manifest.detachedCandidates)}`;
}

function outcomeLine(record: RunRecord): string {
	const { manifest } = record;
	const loops = reentryCounts(record);
	if (manifest.status !== "done")
		return `${manifest.status}: ${manifest.reason ?? "no reason recorded"}${unappliedPatch(record)} (${loops})`;
	const review = record.envelopes["reviewer-2"] ?? record.envelopes.reviewer;
	const findings = review?.findings ?? [];
	const high = findings.filter((finding) => finding.severity === "high").length;
	const verdict = review?.summary ? `${review.summary}; ` : "";
	return `done: ${verdict}${findings.length} finding(s), ${high} high (${loops})${cleanupNote(record)}`;
}

/** A done run has no reason, so the summary says when its processes were not confirmed gone. */
function cleanupNote(record: RunRecord): string {
	const pids = record.manifest.cleanupUnconfirmed ?? [];
	if (pids.length === 0) return "";
	return `; cleanup unconfirmed (pids ${pids.join(", ")}), the run lock stays until they exit`;
}

/** Processes not owned and never claimed gone that still name the builder clone. */
function detachedNote(
	candidates: readonly DetachedProcess[] | undefined,
): string {
	if (!candidates || candidates.length === 0) return "";
	const named = candidates
		.slice(0, NAMED_CANDIDATES)
		.map(({ pid, command }) => `${pid} (${truncated(command)})`)
		.join("; ");
	const more = candidates.length - NAMED_CANDIDATES;
	const rest = more > 0 ? `; and ${more} more` : "";
	return `; ${candidates.length} detached process candidate(s) still name the builder clone, not confirmed gone: pids ${named}${rest} (see run.json)`;
}

function truncated(command: string): string {
	return command.length > CANDIDATE_COMMAND_CHARS
		? `${command.slice(0, CANDIDATE_COMMAND_CHARS - 3)}...`
		: command;
}

/** Empty when the reason already names the patch, as a failed apply's does. */
function unappliedPatch(record: RunRecord): string {
	const { manifest } = record;
	const latest = manifest.patches?.at(-1);
	if (manifest.patchFailure) return uncaptured(manifest.patchFailure, latest);
	if (!latest || manifest.reason?.includes(latest)) return "";
	return `; builder patch not applied: ${latest}`;
}

function uncaptured(failure: PatchFailure, latest: string | undefined): string {
	const kept = failure.keptWorktree
		? `; its work is only in the kept builder clone ${failure.keptWorktree}`
		: "";
	const earlier = latest
		? `; latest builder patch written, without that work: ${latest}`
		: "";
	return `; the ${failure.stage} patch was not written, so its work was not captured${kept}${earlier}`;
}

function reentryCounts(record: RunRecord): string {
	const { reentries, findingsReentries } = record.manifest;
	const verification = `${reentries} re-entr${reentries === 1 ? "y" : "ies"}`;
	if (!findingsReentries) return verification;
	return `${verification}, ${findingsReentries} findings re-entry`;
}
