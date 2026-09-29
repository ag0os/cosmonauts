import type {
	AnalysisBinding,
	AnalysisLocation,
	AnalysisRequestResolution,
	AnalysisResult,
} from "../../../../lib/analysis/index.ts";

const TEXT_BUDGET = 32_768;
const FIELD_BUDGET = 512;
const encoder = new TextEncoder();

function bytes(value: string): number {
	return encoder.encode(value).length;
}

function clipped(value: string, limit = FIELD_BUDGET): string {
	if (bytes(value) <= limit) return value;
	const suffix = "… [truncated; complete details available]";
	let result = "";
	let used = bytes(suffix);
	for (const character of value) {
		const size = bytes(character);
		if (used + size > limit) break;
		result += character;
		used += size;
	}
	return `${result}${suffix}`;
}

export function boundedAnalysisMessage(value: string): string {
	return clipped(value, TEXT_BUDGET);
}

function field(value: string): string {
	return clipped(value.replaceAll(/[\r\n\t]+/gu, " "));
}

function location(value: AnalysisLocation): string {
	return `${field(value.path)}${value.line === undefined ? "" : `:${value.line}${value.column === undefined ? "" : `:${value.column}`}`}`;
}

function scopeLabel(scope: AnalysisResult["scope"]): string {
	switch (scope.kind) {
		case "project":
			return "project";
		case "paths":
			return `paths (${scope.paths.length}): ${scope.paths.map(field).join(", ")}`;
		case "changed":
			return `changed base=${field(scope.base)}`;
		case "target":
			return `target ${scope.target.kind}: ${field(JSON.stringify(scope.target))}`;
	}
}

/** Keep the header even when a caller supplies thousands of paths. */
export function boundedAnalysisText(
	header: {
		readonly capability: string;
		readonly provider: string;
		readonly scope: string;
		readonly verdict: string;
		readonly coverage: string;
		readonly metric: string;
	},
	rows: readonly string[],
): string {
	const fixed = [
		`capability: ${field(header.capability)}`,
		`provider: ${field(header.provider)}`,
		`scope: ${field(header.scope)}`,
		`verdict: ${field(header.verdict)}`,
		`coverage: ${field(header.coverage)}`,
		`metric: ${field(header.metric)}`,
	].join("\n");
	let output = fixed;
	for (const [index, row] of rows.entries()) {
		const remaining = rows.length - index;
		const omitted = (count: number) =>
			`\n… ${count} row(s) omitted; complete details available.`;
		const remainingLine = remaining > 1 ? omitted(remaining - 1) : "";
		if (bytes(`${output}\n${row}${remainingLine}`) <= TEXT_BUDGET) {
			output += `\n${row}`;
			continue;
		}
		const available = TEXT_BUDGET - bytes(`${output}\n${remainingLine}`);
		if (available > bytes("… [truncated; complete details available]")) {
			return `${output}\n${clipped(row, available)}${remainingLine}`;
		}
		return output + omitted(remaining);
	}
	return output;
}

export function presentAnalysisResult(result: AnalysisResult): string {
	const rows: string[] = [];
	if (result.kind === "findings") {
		for (const finding of result.findings) {
			const metrics = Object.entries(finding.metricValues ?? {})
				.map(([key, value]) => `${key}=${value}`)
				.join(", ");
			rows.push(
				`finding ${field(finding.id)} | ${finding.locations.length ? finding.locations.map(location).join(", ") : "no location"} | ${finding.severity} | ${metrics || "no metric values"} | ${field(finding.message)}`,
			);
		}
		if (!rows.length) rows.push("no findings remain");
	} else if (result.kind === "trace") {
		rows.push(...result.trace.nodes.map((node) => `node ${field(node)}`));
		rows.push(
			...result.trace.edges.map(
				(edge) => `edge ${field(edge.from)} -> ${field(edge.to)}`,
			),
		);
		rows.push(
			...result.trace.evidence.map(
				(evidence) =>
					`evidence ${evidence.locations.map(location).join(", ") || "no location"} | ${field(evidence.message)}`,
			),
		);
		if (!rows.length) rows.push("no trace evidence");
	} else {
		rows.push(
			...result.proposals.map(
				(proposal) =>
					`action ${field(proposal.description)} | ${proposal.locations.map(location).join(", ") || "no location"}`,
			),
		);
		if (!rows.length) rows.push("no proposed changes");
	}
	return boundedAnalysisText(
		{
			capability: result.capability,
			provider: `${result.provider.id}@${result.provider.version}`,
			scope: scopeLabel(result.scope),
			verdict: result.verdict,
			coverage:
				"coverage" in result ? result.coverage.join(", ") : "not-applicable",
			metric: "metric" in result ? result.metric : "not-applicable",
		},
		rows,
	);
}

export function presentAnalysisResolution(
	resolution: Exclude<AnalysisRequestResolution, { kind: "ready" }>,
): string {
	const rows = Object.entries(resolution)
		.filter(([key]) => key !== "capability")
		.map(([key, value]) => `${key}: ${field(JSON.stringify(value))}`);
	return boundedAnalysisText(
		{
			capability: resolution.capability,
			provider:
				"providerId" in resolution
					? (resolution.providerId ?? "unknown")
					: "unknown",
			scope: "not-executed",
			verdict: resolution.kind,
			coverage: "not-applicable",
			metric:
				"requestedMetric" in resolution
					? resolution.requestedMetric
					: "not-applicable",
		},
		rows,
	);
}

export function presentAnalysisStatus(
	bindings: readonly AnalysisBinding[],
	resolutionProvenance?: string,
): string {
	const rows = bindings.map(
		(binding) =>
			`binding ${binding.capability} | ${binding.state} | provider ${binding.state === "bound" ? `${binding.provider.id}@${binding.provider.version}` : (binding.providerId ?? "unknown")} | ${binding.state === "bound" ? `scopes ${binding.scopes.join(", ")}; metrics ${binding.metrics?.join(", ") ?? "none"}` : binding.state === "unbound" ? `reason ${binding.reason}` : `failure ${binding.failure.kind}: ${field(binding.failure.message)}`}`,
	);
	if (resolutionProvenance)
		rows.unshift(`resolution provenance: ${field(resolutionProvenance)}`);
	return boundedAnalysisText(
		{
			capability: "status",
			provider: "per-binding",
			scope: "all-capabilities",
			verdict: "per-binding",
			coverage: "per-binding",
			metric: "per-binding",
		},
		rows,
	);
}
