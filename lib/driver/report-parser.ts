import type { ParsedReport, Report, ReportOutcome } from "./types.ts";

const JSON_FENCE_PATTERN = /```json\s*([\s\S]*?)```/gi;
const OUTCOME_LINE_PATTERN =
	/^\s*outcome:\s*(success|failure|partial|completed|blocked)\s*$/im;

export function parseReport(stdout: string): ParsedReport {
	const fencedReports = parseFencedReports(stdout);
	const outcome = parseOutcomeLine(stdout);
	const outcomes = [
		...fencedReports.map((report) => report.outcome),
		...(outcome ? [outcome] : []),
	];
	if (new Set(outcomes).size > 1) {
		if (outcomes.includes("blocked")) {
			const notes = fencedReports
				.filter((report) => report.outcome === "blocked")
				.at(-1)?.notes;
			return {
				outcome: "blocked",
				files: [],
				verification: [],
				raw: stdout,
				...(notes ? { notes } : {}),
			};
		}
		return { outcome: "unknown", raw: stdout };
	}
	const fencedReport =
		outcomes[0] === "blocked" ? fencedReports.at(-1) : fencedReports[0];
	if (fencedReport) {
		return fencedReport.outcome === "blocked"
			? { ...fencedReport, raw: stdout }
			: fencedReport;
	}

	if (outcome) {
		return outcome === "blocked"
			? { outcome, files: [], verification: [], raw: stdout }
			: { outcome, files: [], verification: [] };
	}

	return { outcome: "unknown", raw: stdout };
}

function parseFencedReports(
	stdout: string,
): Array<Report | Omit<Extract<ParsedReport, { outcome: "blocked" }>, "raw">> {
	const reports: Array<
		Report | Omit<Extract<ParsedReport, { outcome: "blocked" }>, "raw">
	> = [];
	for (const match of stdout.matchAll(JSON_FENCE_PATTERN)) {
		const json = match[1];
		if (!json) {
			continue;
		}

		const report = parseJsonReport(json);
		if (report) reports.push(report);
	}

	return reports;
}

function parseJsonReport(
	json: string,
):
	| Report
	| Omit<Extract<ParsedReport, { outcome: "blocked" }>, "raw">
	| undefined {
	try {
		return toReport(JSON.parse(json));
	} catch {
		return undefined;
	}
}

function parseOutcomeLine(
	stdout: string,
): ReportOutcome | "blocked" | undefined {
	const matches = [
		...stdout.matchAll(new RegExp(OUTCOME_LINE_PATTERN.source, "gim")),
	];
	const value = matches.at(-1)?.[1]?.toLowerCase();
	return toReportOutcome(value);
}

function toReport(
	value: unknown,
):
	| Report
	| Omit<Extract<ParsedReport, { outcome: "blocked" }>, "raw">
	| undefined {
	if (!isRecord(value)) {
		return undefined;
	}

	const outcome = toReportOutcome(value.outcome);
	if (!outcome) {
		return undefined;
	}

	const files = value.files === undefined ? [] : toFiles(value.files);
	const verification =
		value.verification === undefined ? [] : toVerification(value.verification);
	if (!files || !verification) {
		return undefined;
	}

	const report:
		| Report
		| Omit<Extract<ParsedReport, { outcome: "blocked" }>, "raw"> = {
		outcome,
		files,
		verification,
	};

	if (value.notes !== undefined) {
		if (typeof value.notes !== "string") {
			return undefined;
		}
		report.notes = value.notes;
	}

	if (value.progress !== undefined) {
		const progress = toProgress(value.progress);
		if (!progress) {
			return undefined;
		}
		report.progress = progress;
	}

	return report;
}

function toFiles(value: unknown): Report["files"] | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}

	const files: Report["files"] = [];
	for (const item of value) {
		if (
			!isRecord(item) ||
			typeof item.path !== "string" ||
			!isFileChange(item.change)
		) {
			return undefined;
		}

		files.push({ path: item.path, change: item.change });
	}

	return files;
}

function toVerification(value: unknown): Report["verification"] | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}

	const verification: Report["verification"] = [];
	for (const item of value) {
		if (
			!isRecord(item) ||
			typeof item.command !== "string" ||
			!isVerificationStatus(item.status)
		) {
			return undefined;
		}

		verification.push({ command: item.command, status: item.status });
	}

	return verification;
}

function toProgress(value: unknown): Report["progress"] | undefined {
	if (
		!isRecord(value) ||
		!isFiniteNumber(value.phase) ||
		!isFiniteNumber(value.of)
	) {
		return undefined;
	}

	const progress: Report["progress"] = { phase: value.phase, of: value.of };
	if (value.remaining !== undefined) {
		if (typeof value.remaining !== "string") {
			return undefined;
		}
		progress.remaining = value.remaining;
	}

	return progress;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toReportOutcome(
	value: unknown,
): ReportOutcome | "blocked" | undefined {
	if (value === "completed") {
		return "success";
	}
	return value === "success" ||
		value === "failure" ||
		value === "partial" ||
		value === "blocked"
		? value
		: undefined;
}

function isFileChange(
	value: unknown,
): value is Report["files"][number]["change"] {
	return value === "created" || value === "modified" || value === "deleted";
}

function isVerificationStatus(
	value: unknown,
): value is Report["verification"][number]["status"] {
	return value === "pass" || value === "fail" || value === "not_run";
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}
