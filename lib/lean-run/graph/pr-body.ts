import type { Finding } from "../../envelope/index.ts";
import type { Signal } from "../types.ts";
import type { BlastRadius } from "./blast-radius.ts";
import type { PlanVersusActual } from "./plan-vs-actual.ts";

export const FINDING_DISPOSITIONS = ["fixed", "accepted", "open"] as const;
export type FindingDisposition = (typeof FINDING_DISPOSITIONS)[number];

export interface DispositionedFinding extends Finding {
	readonly disposition: FindingDisposition;
}

export interface PrBodyOptions {
	readonly title: string;
	/** Mermaid source, unfenced (see renderChangeDiagram). */
	readonly diagram: string;
	readonly verification: readonly Signal[];
	/** Absent when no blast-radius signal ran: the section says so. */
	readonly blastRadius?: BlastRadius;
	readonly planVersusActual: PlanVersusActual;
	/** Said in place of the three lists when the change came with no plan. */
	readonly noPlan?: string;
	readonly findings: readonly DispositionedFinding[];
}

/** The pull-request body (brief section 4.9): every section is a view over host facts. */
export function renderPrBody(options: PrBodyOptions): string {
	const sections = [
		`# ${singleLine(options.title)}`,
		["## Change diagram", "```mermaid", options.diagram.trimEnd(), "```"].join(
			"\n",
		),
		verificationSection(options.verification),
		blastRadiusSection(options.blastRadius),
		options.noPlan === undefined
			? planVersusActualSection(options.planVersusActual)
			: `## Plan versus actual\n\n${singleLine(options.noPlan)}`,
		findingsSection(options.findings),
	];
	return `${sections.join("\n\n")}\n`;
}

function verificationSection(signals: readonly Signal[]): string {
	if (signals.length === 0)
		return "## Verification\n\nNo verification signals.";
	return [
		"## Verification",
		"",
		table(
			["Kind", "Status", "Summary"],
			signals.map((signal) => [signal.kind, signal.status, signal.summary]),
		),
	].join("\n");
}

function blastRadiusSection(radius: BlastRadius | undefined): string {
	if (radius === undefined)
		return "## Blast radius\n\nThe blast-radius signal did not run for this change.";
	const lines = [
		"## Blast radius",
		"",
		`${radius.changed.length} changed, ${radius.dependents.length} dependents, ${radius.tests.length} tests.`,
	];
	if (radius.truncated) {
		const hubs =
			radius.hubs.length > 0
				? ` Hubs not expanded transitively: ${codeList(radius.hubs)}.`
				: "";
		lines.push("", `Truncated.${hubs}`);
	}
	lines.push("", "Tests:", "", ...bulletList(radius.tests));
	return lines.join("\n");
}

function planVersusActualSection(result: PlanVersusActual): string {
	return [
		"## Plan versus actual",
		...namedList("Planned", result.planned),
		...namedList("Unplanned", result.unplanned),
		...namedList("Untouched", result.untouched),
	].join("\n");
}

function findingsSection(findings: readonly DispositionedFinding[]): string {
	if (findings.length === 0) return "## Findings\n\nNo findings.";
	return [
		"## Findings",
		"",
		table(
			["ID", "Severity", "Disposition", "File", "Summary"],
			findings.map((finding) => [
				finding.id,
				finding.severity,
				finding.disposition,
				`\`${finding.file}\``,
				finding.summary,
			]),
		),
	].join("\n");
}

function namedList(name: string, paths: readonly string[]): string[] {
	return ["", `**${name}** (${paths.length})`, "", ...bulletList(paths)];
}

function bulletList(paths: readonly string[]): string[] {
	return paths.length === 0 ? ["- none"] : paths.map((path) => `- \`${path}\``);
}

function codeList(paths: readonly string[]): string {
	return paths.map((path) => `\`${path}\``).join(", ");
}

function table(
	header: readonly string[],
	rows: readonly (readonly string[])[],
): string {
	return [header, header.map(() => "---"), ...rows]
		.map((row) => `| ${row.map(cell).join(" | ")} |`)
		.join("\n");
}

function cell(value: string): string {
	return singleLine(value).replaceAll("|", "\\|");
}

function singleLine(value: string): string {
	return value.replace(/\s*\n\s*/g, " ").trim();
}
