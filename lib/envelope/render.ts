import type { Envelope, Evidence, Finding } from "./schema.ts";

/** Compact text for humans; sections appear only when they have content. */
export function renderEnvelope(envelope: Envelope): string {
	return [
		renderHeadline(envelope),
		...renderSection("Evidence", envelope.evidence, renderEvidence),
		...renderSection("Findings", envelope.findings, renderFinding),
		...renderSection("Touched", envelope.touched, (path) => path),
		...renderReason(envelope.reason),
	].join("\n");
}

function renderHeadline(envelope: Envelope): string {
	const outcome = envelope.outcome.toUpperCase();
	if (!envelope.summary) return outcome;
	return indentContinuation(`${outcome}: ${envelope.summary}`, "  ");
}

function renderSection<T>(
	title: string,
	items: readonly T[] | undefined,
	renderItem: (item: T) => string,
): string[] {
	if (!items?.length) return [];
	return [
		`${title}:`,
		...items.map(
			(item) => `  - ${indentContinuation(renderItem(item), "    ")}`,
		),
	];
}

function renderEvidence(evidence: Evidence): string {
	const line = `[${evidence.result}] ${evidence.kind} ${evidence.ref}`;
	return evidence.note ? `${line} (${evidence.note})` : line;
}

function renderFinding(finding: Finding): string {
	const headline = `${finding.id} [${finding.severity}] ${finding.file}: ${finding.summary}`;
	return `${headline}\nfix: ${indentContinuation(finding.fix, "  ")}`;
}

function renderReason(reason: string | undefined): string[] {
	return reason ? [indentContinuation(`Reason: ${reason}`, "  ")] : [];
}

function indentContinuation(text: string, indent: string): string {
	return text.replace(/\r?\n/g, `\n${indent}`);
}
