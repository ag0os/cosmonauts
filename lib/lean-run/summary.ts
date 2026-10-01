import type { RunRecord } from "./types.ts";

/** One line for the lead: status, reason or the reviewer's verdict, and re-entries. */
export function summarizeRun(record: RunRecord): string {
	const { manifest } = record;
	const reentries = `${manifest.reentries} re-entr${manifest.reentries === 1 ? "y" : "ies"}`;
	if (manifest.status !== "done")
		return `${manifest.status}: ${manifest.reason ?? "no reason recorded"} (${reentries})`;
	const review = record.envelopes.reviewer;
	const findings = review?.findings ?? [];
	const high = findings.filter((finding) => finding.severity === "high").length;
	const verdict = review?.summary ? `${review.summary}; ` : "";
	return `done: ${verdict}${findings.length} finding(s), ${high} high (${reentries})`;
}
