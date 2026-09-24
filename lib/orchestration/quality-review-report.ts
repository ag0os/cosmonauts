export type QualityReviewVerdict = "ready" | "not-ready" | "refused" | "failed";

export interface QualityReviewReport {
	verdict: QualityReviewVerdict;
	reason: string;
	checks?: readonly string[];
	gates?: readonly string[];
	findings?: readonly string[];
	humanItems?: readonly string[];
	observations?: readonly string[];
	reviewed?: readonly string[];
	reviewerModels?: readonly string[];
}

const sections = [
	"Checks",
	"Gates",
	"Findings",
	"Human decisions",
	"Out-of-range observations",
	"Reviewed",
	"Reviewer models",
] as const;

export function renderQualityReviewReport(report: QualityReviewReport): string {
	const values = [
		report.checks,
		report.gates,
		report.findings,
		report.humanItems,
		report.observations,
		report.reviewed,
		report.reviewerModels,
	];
	const body = sections
		.map(
			(section, index) =>
				`## ${section}\n\n${values[index]?.length ? values[index]?.map((item) => `- ${item}`).join("\n") : "- None recorded."}`,
		)
		.join("\n\n");
	return `# Quality review\n\nVerdict: ${report.verdict}\n\nReason: ${report.reason}\n\n${body}\n\n<!-- COSMO_QM_REPORT ${JSON.stringify({ verdict: report.verdict, checks: report.checks ?? [], gates: report.gates ?? [], findings: report.findings ?? [], humanItems: report.humanItems ?? [], observations: report.observations ?? [], reviewed: report.reviewed ?? [], reviewerModels: report.reviewerModels ?? [] })} -->\n`;
}

export function assessQualityReviewReport(markdown: string): {
	verdict: QualityReviewVerdict;
	indexAvailable: boolean;
	reason?: string;
} {
	if (
		sections.some(
			(section) =>
				!new RegExp(
					`^## ${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`,
					"m",
				).test(markdown),
		)
	) {
		return {
			verdict: "failed",
			indexAvailable: false,
			reason: "Missing required report section",
		};
	}
	const match = markdown.match(
		/^Verdict:\s*(ready|not-ready|refused|failed)\s*$/m,
	);
	if (!match)
		return {
			verdict: "failed",
			indexAvailable: false,
			reason: "Missing report verdict",
		};
	const verdict = match[1] as QualityReviewVerdict;
	const indexes = [
		...markdown.matchAll(/<!-- COSMO_QM_REPORT ([\s\S]*?) -->/g),
	];
	if (indexes.length !== 1) return { verdict, indexAvailable: false };
	try {
		const parsed: unknown = JSON.parse(indexes[0]?.[1] ?? "");
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			"verdict" in parsed &&
			parsed.verdict === verdict &&
			[
				"checks",
				"gates",
				"findings",
				"humanItems",
				"observations",
				"reviewed",
				"reviewerModels",
			].every(
				(key) =>
					key in parsed &&
					Array.isArray((parsed as Record<string, unknown>)[key]) &&
					(parsed as Record<string, unknown[]>)[key]?.every(
						(item) => typeof item === "string",
					),
			)
		) {
			return { verdict, indexAvailable: true };
		}
	} catch {
		// A broken index is visible without changing a valid section-based verdict.
	}
	return { verdict, indexAvailable: false };
}
