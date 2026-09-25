/** The QM cannot choose a panel model through its spawn-tool arguments. */
export function qualityReviewPanelModel(
	role: string,
	reviewerModel?: string,
): string | undefined {
	return role === "coding/reviewer" ? reviewerModel : undefined;
}

/** Require citations that can be checked against the sealed review materials. */
export function calibrateReviewerFindings(options: {
	readonly materials: string;
	readonly reviewers: readonly { lens: string; text: string }[];
	readonly findings: readonly string[];
	readonly observations?: readonly string[];
}): {
	findings: string[];
	observations: string[];
	issues: string[];
	openFindings: boolean;
} {
	const state = {
		issues: [] as string[],
		unsupported: new Set<string>(),
		findings: [...options.findings],
		reported: [...options.findings, ...(options.observations ?? [])],
		observations: [...(options.observations ?? [])],
		reviewerIds: new Set<string>(),
	};
	for (const reviewer of options.reviewers) {
		for (const section of reviewer.text.split(/(?=^\s*- id:\s*)/m))
			calibrateSection(options, state, reviewer.lens, section);
	}
	for (const entry of state.reported) {
		const id = leadingFindingId(entry);
		if (id && /\bP[01]\b/.test(entry) && !state.reviewerIds.has(id))
			state.issues.push(
				`Finding ${id} has an unmapped ${/\bP0\b/.test(entry) ? "P0" : "P1"}; human decision required.`,
			);
	}
	return {
		findings: state.findings.map((entry) => {
			const id = leadingFindingId(entry);
			return id && state.unsupported.has(id)
				? entry.replace(/\bP[01]\b/g, "P2")
				: entry;
		}),
		observations: state.observations.map((entry) => {
			const id = leadingFindingId(entry);
			return id && state.unsupported.has(id)
				? entry.replace(/\bP[01]\b/g, "P2")
				: entry;
		}),
		issues: [...new Set(state.issues)],
		openFindings: options.findings.length > 0,
	};
}

interface CalibrationState {
	issues: string[];
	unsupported: Set<string>;
	findings: string[];
	reported: string[];
	observations: string[];
	reviewerIds: Set<string>;
}

function calibrateSection(
	options: {
		materials: string;
		reviewers: readonly { lens: string; text: string }[];
	},
	state: CalibrationState,
	lens: string,
	section: string,
): void {
	const id = section.match(/^\s*- id:\s*([^\s]+)/m)?.[1];
	if (!id) return;
	state.reviewerIds.add(id);
	const reported = state.reported.filter(
		(entry) => leadingFindingId(entry) === id,
	);
	if (reported.length === 0) {
		state.findings.push(`${id} open: reviewer finding omitted from QM report.`);
		state.issues.push(
			`Finding ${id} was omitted from the QM report; carried forward as open.`,
		);
	}
	calibrateObservationClosures(options, state, id);
	recordUnsupportedPerformance(
		state,
		id,
		lens,
		section,
		reported,
		options.materials,
	);
}

function calibrateObservationClosures(
	options: {
		materials: string;
		reviewers: readonly { lens: string; text: string }[];
	},
	state: CalibrationState,
	id: string,
): void {
	for (const entry of state.observations.filter(
		(entry) => leadingFindingId(entry) === id,
	)) {
		if (!dismissalAfterId(entry, id)) {
			if (/\b(?:dismissed|resolved|closed)\b/i.test(entry))
				state.issues.push(
					`Finding ${id} has an unverified dismissal in observations; human decision required.`,
				);
			continue;
		}
		const raisingLenses = options.reviewers
			.filter((reviewer) =>
				reviewer.text
					.split(/(?=^\s*- id:\s*)/m)
					.some(
						(part) =>
							part.match(/^\s*- id:\s*([^\s]+)/m)?.[1] === id &&
							(/\bpriority:\s*P[0-3]\b/i.test(part) ||
								!citedMaterial(part, "closureEvidence", options.materials)),
					),
			)
			.map((reviewer) => reviewer.lens);
		const cited = citedReportClosure(entry, options.materials);
		const independent =
			raisingLenses.length > 0 &&
			options.reviewers.some(
				(reviewer) =>
					!raisingLenses.includes(reviewer.lens) &&
					reviewer.text
						.split(/(?=^\s*- id:\s*)/m)
						.some(
							(part) =>
								part.match(/^\s*- id:\s*([^\s]+)/m)?.[1] === id &&
								citedMaterial(part, "closureEvidence", options.materials) ===
									cited,
						),
			);
		if (!cited || !independent)
			state.issues.push(
				`Finding ${id} was closed or dismissed without independent cited evidence.`,
			);
	}
}

function recordUnsupportedPerformance(
	state: CalibrationState,
	id: string,
	lens: string,
	section: string,
	reported: string[],
	materials: string,
): void {
	if (
		lens === "performance-reviewer" &&
		unsupportedHighPriority(
			section,
			materials,
			reported.some((entry) => /\bP[01]\b/.test(entry)),
		)
	) {
		state.unsupported.add(id);
		state.issues.push(
			state.observations.some(
				(entry) => leadingFindingId(entry) === id && /\bP[01]\b/.test(entry),
			)
				? `Finding ${id} has unsupported performance priority above P2 in observations; human decision required.`
				: `Performance ${id} lacked measured or reproduced cost cited from captured materials; capped at P2.`,
		);
		if (
			state.observations.some((entry) => leadingFindingId(entry) === id) &&
			!state.observations.includes(
				`${id} unsupported performance priority capped at P2.`,
			)
		)
			state.observations.push(
				`${id} unsupported performance priority capped at P2.`,
			);
	}
}

function dismissalAfterId(entry: string, id: string): boolean {
	return new RegExp(
		`^(?:\\[P[0-3]\\]\\s*)?(?:\\*\\*|\`)?${id}(?:\\*\\*|\`)?\\s+(?:dismissed|resolved|closed)\\b`,
		"i",
	).test(entry);
}

export function leadingFindingId(entry: string): string | undefined {
	return entry.match(
		/^(?:\[P[0-3]\]\s*)?(?:\*\*|`)?(?!(?:TASK|AC|D|INV|B)-)([A-Za-z]+-\d+)\b/,
	)?.[1];
}

function citedReportClosure(
	line: string,
	materials: string,
): string | undefined {
	const citation = line.match(/closureEvidence:\s*([^\n]+)/i)?.[1]?.trim();
	return citation && citation.length >= 12 && materials.includes(citation)
		? citation
		: undefined;
}

function citedMaterial(
	section: string,
	field: string,
	materials: string,
): string | undefined {
	const citation = section
		.match(new RegExp(`^\\s*${field}:\\s*(.+)$`, "m"))?.[1]
		?.trim();
	return citation && citation.length >= 12 && materials.includes(citation)
		? citation
		: undefined;
}

function unsupportedHighPriority(
	section: string,
	materials: string,
	reportedHighPriority: boolean,
): boolean {
	if (!reportedHighPriority && !/^\s*priority:\s*P[01]\s*$/m.test(section))
		return false;
	const citation = citedMaterial(section, "measuredCost", materials);
	return !citation || !hasMeasuredCost(citation);
}

function hasMeasuredCost(citation: string): boolean {
	return (
		/\b\d+(?:\.\d+)?\s*(?:ns|µs|us|ms|s|seconds?|minutes?|hours?|bytes?|kb|mb|gb|kib|mib|gib|ops\/s|requests?\/s|items?\/s|bytes?\/s|allocations?\/op)\b/i.test(
			citation,
		) &&
		/\b(?:measured|benchmark(?:ed)?|reproduced|observed|took|uses?|consumes?|per operation|per request)\b/i.test(
			citation,
		)
	);
}
