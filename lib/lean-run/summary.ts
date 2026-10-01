import type { RunRecord } from "./types.ts";

/** One line for the lead: status, reason or the last review's verdict, and re-entries. */
export function summarizeRun(record: RunRecord): string {
	const { manifest } = record;
	const loops = reentryCounts(record);
	if (manifest.status !== "done")
		return `${manifest.status}: ${manifest.reason ?? "no reason recorded"} (${loops})`;
	const review = record.envelopes["reviewer-2"] ?? record.envelopes.reviewer;
	const findings = review?.findings ?? [];
	const high = findings.filter((finding) => finding.severity === "high").length;
	const verdict = review?.summary ? `${review.summary}; ` : "";
	return `done: ${verdict}${findings.length} finding(s), ${high} high (${loops})`;
}

function reentryCounts(record: RunRecord): string {
	const { reentries, findingsReentries } = record.manifest;
	const verification = `${reentries} re-entr${reentries === 1 ? "y" : "ies"}`;
	if (!findingsReentries) return verification;
	return `${verification}, ${findingsReentries} findings re-entry`;
}
