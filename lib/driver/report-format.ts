import type { ParsedReport, Report } from "./types.ts";

export function formatPartialReport(report: ParsedReport): string {
	if (report.outcome !== "partial") {
		return "partial";
	}

	const notes = report.notes ? `: ${report.notes}` : "";
	return `partial${progressText(report)}${notes}`;
}

function progressText(report: Report): string {
	if (!report.progress) {
		return "";
	}

	const remaining = report.progress.remaining
		? `; remaining: ${report.progress.remaining}`
		: "";
	return `: phase ${report.progress.phase}/${report.progress.of}${remaining}`;
}
