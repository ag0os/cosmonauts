export type QualityReviewVerdict = "ready" | "not-ready" | "refused" | "failed";

interface QualityReviewReport {
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

/** Reflect host calibration in the visible report and its optional index. */
export function applyReviewerCalibration(
	markdown: string,
	findings: readonly string[],
	issues: readonly string[],
	observations?: readonly string[],
	unreplaced: string[] = [],
): string {
	if (issues.length === 0 && !observations) return markdown;
	const indexed = indexedQualityReviewReport(markdown);
	if (
		indexed &&
		!hasUnexpectedQualityReviewSectionContent(markdown) &&
		!["Findings", "Out-of-range observations"].some((heading) =>
			/(?:^|\n)-[ \t]{2,}\S/.test(visibleSectionBody(markdown, heading) ?? ""),
		)
	)
		return renderQualityReviewReport({
			...indexed,
			findings,
			observations: observations ?? indexed.observations,
		});
	const withFindings = replaceSectionEntries(
		markdown,
		"Findings",
		findings,
		unreplaced,
	);
	return observations
		? replaceSectionEntries(
				withFindings,
				"Out-of-range observations",
				observations,
				unreplaced,
			)
		: withFindings;
}

function replaceSectionEntries(
	markdown: string,
	heading: string,
	replacements: readonly string[],
	unreplaced: string[],
): string {
	const body = visibleSectionBody(markdown, heading);
	if (body === undefined) return markdown;
	const originals = qualityReviewSectionEntries(markdown, heading);
	let updated = body;
	for (const [index, original] of originals.entries()) {
		const replacement = replacements[index];
		if (!replacement || replacement === original) continue;
		const token = `- ${original}`;
		if (!updated.includes(token)) unreplaced.push(original);
		else updated = updated.replace(token, () => `- ${replacement}`);
	}
	if (replacements.length > originals.length)
		updated = `${updated}\n${replacements
			.slice(originals.length)
			.map((entry) => `- ${entry}`)
			.join("\n")}`;
	const start = sectionBodyStart(markdown, heading);
	if (start === undefined) return markdown;
	const bodyStart = markdown.indexOf(body, start);
	return `${markdown.slice(0, bodyStart)}${updated}${markdown.slice(bodyStart + body.length)}`;
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
			) &&
			!hasUnexpectedQualityReviewSectionContent(markdown) &&
			indexMatchesVisibleSections(markdown, parsed as Record<string, unknown>)
		) {
			return { verdict, indexAvailable: true };
		}
	} catch {
		// A broken index is visible without changing a valid section-based verdict.
	}
	return { verdict, indexAvailable: false };
}

/** Read only an index whose sections and verdict passed the report validator. */
export function indexedQualityReviewReport(
	markdown: string,
): QualityReviewReport | undefined {
	if (!assessQualityReviewReport(markdown).indexAvailable) return undefined;
	const match = markdown.match(/<!-- COSMO_QM_REPORT ([\s\S]*?) -->/);
	if (!match?.[1]) return undefined;
	const parsed: unknown = JSON.parse(match[1]);
	if (typeof parsed !== "object" || parsed === null) return undefined;
	const report = parsed as Record<string, unknown>;
	return {
		verdict: report.verdict as QualityReviewVerdict,
		reason: typeof report.reason === "string" ? report.reason : "",
		checks: report.checks as string[],
		gates: report.gates as string[],
		findings: report.findings as string[],
		humanItems: report.humanItems as string[],
		observations: report.observations as string[],
		reviewed: report.reviewed as string[],
		reviewerModels: report.reviewerModels as string[],
	};
}

function indexMatchesVisibleSections(
	markdown: string,
	report: Record<string, unknown>,
): boolean {
	const indexedSections = [
		report.checks,
		report.gates,
		report.findings,
		report.humanItems,
		report.observations,
		report.reviewed,
		report.reviewerModels,
	] as string[][];
	for (const [index, heading] of sections.entries()) {
		const visible = visibleSectionBody(markdown, heading);
		if (visible === undefined) return false;
		const items = indexedSections[index] ?? [];
		const expected = items.length
			? items.map((item) => `- ${item}`).join("\n")
			: "- None recorded.";
		if (visible !== expected) return false;
	}
	return true;
}

function sectionBodyStart(
	markdown: string,
	heading: string,
): number | undefined {
	const match = markdown.match(new RegExp(`^## ${heading}[ \\t]*$`, "m"));
	if (match?.index === undefined) return undefined;
	const end = match.index + match[0].length;
	return end + (markdown[end] === "\n" ? 1 : 0);
}

function visibleSectionBody(
	markdown: string,
	heading: string,
): string | undefined {
	const start = sectionBodyStart(markdown, heading);
	if (start === undefined) return undefined;
	const tail = markdown.slice(start);
	const end = tail.search(/^## |^<!-- COSMO_QM_REPORT/m);
	return (end < 0 ? tail : tail.slice(0, end)).trim();
}

export function hasQualityReviewSectionContent(
	markdown: string,
	heading: "Gates" | "Findings" | "Human decisions",
): boolean {
	const body = visibleSectionBody(markdown, heading);
	return (
		body !== undefined &&
		body !== "" &&
		!/^(?:-\s*)?None recorded\.$/i.test(body)
	);
}

/** Read visible finding bullets even when the optional machine index is absent. */
export function qualityReviewFindingLines(markdown: string): string[] {
	return qualityReviewSectionEntries(markdown, "Findings");
}

export function hasUnexpectedQualityReviewSectionContent(
	markdown: string,
): boolean {
	const seen = new Set<string>();
	for (const match of markdown.matchAll(/^## ([^\n]+)\n/gm)) {
		if (sections.includes(match[1] as (typeof sections)[number])) {
			if (seen.has(match[1] ?? "")) return true;
			seen.add(match[1] ?? "");
			continue;
		}
		const tail = markdown.slice((match.index ?? 0) + match[0].length);
		const end = tail.search(/^## |^<!-- COSMO_QM_REPORT/m);
		if ((end < 0 ? tail : tail.slice(0, end)).trim()) return true;
	}
	return false;
}

export function qualityReviewObservationLines(markdown: string): string[] {
	return qualityReviewSectionEntries(markdown, "Out-of-range observations");
}

function qualityReviewSectionEntries(
	markdown: string,
	heading: string,
): string[] {
	const body = visibleSectionBody(markdown, heading);
	if (!body || body === "- None recorded.") return [];
	const entries: string[] = [];
	for (const line of body.split("\n")) {
		if (/^-\s+/.test(line)) entries.push(line.replace(/^-\s+/, ""));
		else if (entries.length > 0) entries[entries.length - 1] += `\n${line}`;
	}
	return entries;
}

/** Keep section prose intact when the optional machine index is unavailable. */
export function amendUnindexedQualityReviewReport(
	markdown: string,
	options: {
		verdict: QualityReviewVerdict;
		reason: string;
		checks: readonly string[];
		gates?: readonly string[];
		replaceGates?: boolean;
		findings?: readonly string[];
		humanItems: readonly string[];
		reviewed: readonly string[];
		reviewerModels: readonly string[];
	},
): string {
	let amended = markdown.replace(
		/^Verdict:\s*.*$/m,
		`Verdict: ${options.verdict}`,
	);
	amended = amended.replace(/^Reason:\s*.*$/m, `Reason: ${options.reason}`);
	for (const [heading, items, replace] of [
		["Checks", options.checks, false],
		["Gates", options.gates ?? [], options.replaceGates ?? false],
		["Findings", options.findings ?? [], false],
		["Human decisions", options.humanItems, false],
		["Reviewed", options.reviewed, false],
		["Reviewer models", options.reviewerModels, true],
	] as const) {
		if (items.length === 0) continue;
		const bodyStart = sectionBodyStart(amended, heading);
		if (bodyStart === undefined) continue;
		const rest = amended.slice(bodyStart);
		const next = rest.search(/^## |^<!-- COSMO_QM_REPORT/m);
		const bodyEnd = next < 0 ? amended.length : bodyStart + next;
		const body = amended.slice(bodyStart, bodyEnd).trim();
		const existing = replace || body === "- None recorded." ? "" : `${body}\n`;
		amended = `${amended.slice(0, bodyStart)}\n${existing}${items.map((item) => `- ${item}`).join("\n")}\n\n${amended.slice(bodyEnd)}`;
	}
	return amended.includes("Index unavailable.")
		? amended
		: `${amended.trimEnd()}\n\nIndex unavailable.\n`;
}
