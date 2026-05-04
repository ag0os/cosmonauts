import type { ParsedReport, Report, ReportOutcome } from "./types.ts";

const JSON_FENCE_PATTERN = /```json\s*([\s\S]*?)```/gi;
const OUTCOME_LINE_PATTERN = /^\s*OUTCOME:\s*(success|failure|partial)\s*$/im;

export function parseReport(stdout: string): ParsedReport {
	const fencedReport = parseFencedReport(stdout);
	if (fencedReport) {
		return fencedReport;
	}

	const outcome = parseOutcomeLine(stdout);
	if (outcome) {
		return { outcome, files: [], verification: [] };
	}

	return { outcome: "unknown", raw: stdout };
}

function parseFencedReport(stdout: string): Report | undefined {
	for (const match of stdout.matchAll(JSON_FENCE_PATTERN)) {
		const json = match[1];
		if (!json) {
			continue;
		}

		const report = parseJsonReport(json);
		if (report) {
			return report;
		}
	}

	return undefined;
}

function parseJsonReport(json: string): Report | undefined {
	try {
		return toReport(JSON.parse(json));
	} catch {
		return undefined;
	}
}

function parseOutcomeLine(stdout: string): ReportOutcome | undefined {
	const value = stdout.match(OUTCOME_LINE_PATTERN)?.[1]?.toLowerCase();
	return isReportOutcome(value) ? value : undefined;
}

function toReport(value: unknown): Report | undefined {
	if (!isRecord(value) || !isReportOutcome(value.outcome)) {
		return undefined;
	}

	const files = toFiles(value.files);
	const verification = toVerification(value.verification);
	if (!files || !verification) {
		return undefined;
	}

	const report: Report = {
		outcome: value.outcome,
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

function isReportOutcome(value: unknown): value is ReportOutcome {
	return value === "success" || value === "failure" || value === "partial";
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
