import type { RunRecord } from "./types.ts";

/**
 * One line for the lead: status, reason or the last review's verdict, and
 * re-entries. A build that did not apply its change names the latest
 * builder patch, so a human can apply it.
 */
export function summarizeRun(record: RunRecord): string {
	const { manifest } = record;
	const loops = reentryCounts(record);
	if (manifest.status !== "done")
		return `${manifest.status}: ${manifest.reason ?? "no reason recorded"}${unappliedPatch(record)} (${loops})`;
	const review = record.envelopes["reviewer-2"] ?? record.envelopes.reviewer;
	const findings = review?.findings ?? [];
	const high = findings.filter((finding) => finding.severity === "high").length;
	const verdict = review?.summary ? `${review.summary}; ` : "";
	return `done: ${verdict}${findings.length} finding(s), ${high} high (${loops})`;
}

/** Empty when the reason already names the patch, as a failed apply's does. */
function unappliedPatch(record: RunRecord): string {
	const { manifest } = record;
	const latest = manifest.patches?.at(-1);
	if (!latest || manifest.reason?.includes(latest)) return "";
	return `; builder patch not applied: ${latest}`;
}

function reentryCounts(record: RunRecord): string {
	const { reentries, findingsReentries } = record.manifest;
	const verification = `${reentries} re-entr${reentries === 1 ? "y" : "ies"}`;
	if (!findingsReentries) return verification;
	return `${verification}, ${findingsReentries} findings re-entry`;
}
