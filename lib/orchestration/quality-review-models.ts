/** Model identities come from Pi sessions and reviewer artifact metadata, never prose. */
export interface ObservedModel {
	readonly provider: string;
	readonly id: string;
}

interface ReviewerModelEvidence {
	readonly lens: string;
	readonly model: ObservedModel;
}

/** The QM cannot choose a panel model through its spawn-tool arguments. */
export function qualityReviewPanelModel(
	role: string,
	configured?: string,
): string | undefined {
	return role === "coding/reviewer" ? configured : undefined;
}

export function reviewerEvidenceFromLines(
	lines: readonly string[],
): ReviewerModelEvidence[] {
	return lines.flatMap((line) => {
		const match = line.match(/^([^:]+): ([^/]+)\/(.+)$/);
		return match
			? [
					{
						lens: match[1] ?? "",
						model: { provider: match[2] ?? "", id: match[3] ?? "" },
					},
				]
			: [];
	});
}

const shippedFamilies: Readonly<Record<string, readonly string[]>> = {
	openai: ["openai", "openai-codex"],
	anthropic: ["anthropic"],
	google: ["google", "google-gemini"],
	azure: ["azure", "azure-openai"],
	aws: ["aws", "amazon-bedrock", "bedrock"],
};

export function modelFamily(
	provider: string,
	extensions: Readonly<Record<string, readonly string[]>> = {},
): string | undefined {
	for (const [family, aliases] of Object.entries({
		...shippedFamilies,
		...Object.fromEntries(
			Object.entries(extensions).map(([family, aliases]) => [
				family,
				[...(shippedFamilies[family] ?? []), ...aliases],
			]),
		),
	}))
		if (aliases.includes(provider)) return family;
	return undefined;
}

export function assessReviewerDiversity(options: {
	readonly implementer: ObservedModel;
	readonly configured?: string;
	readonly reviewers: readonly ReviewerModelEvidence[];
	readonly modelFamilies?: Readonly<Record<string, readonly string[]>>;
}): { issue?: string; humanItem?: string; lines: string[] } {
	const { implementer, configured, reviewers, modelFamilies } = options;
	const lines = [
		`Default implementer: ${implementer.provider}/${implementer.id} (family ${modelFamily(implementer.provider, modelFamilies) ?? "unresolvable"})`,
		...reviewers.map(
			({ lens, model }) =>
				`${lens}: ${model.provider}/${model.id} (family ${modelFamily(model.provider, modelFamilies) ?? "unresolvable"})`,
		),
	];
	if (!configured)
		return {
			lines: [
				...lines,
				"Diversity: not configured (qualityReview.diverseReviewerModel).",
			],
			humanItem:
				"Not configured: qualityReview.diverseReviewerModel; human decision required.",
		};
	const generalist = reviewers.find(({ lens }) => lens === "reviewer")?.model;
	const implementerFamily = modelFamily(implementer.provider, modelFamilies);
	const reviewerFamily =
		generalist && modelFamily(generalist.provider, modelFamilies);
	let issue: string | undefined;
	if (!generalist) issue = `Generalist model missing; configured ${configured}`;
	else if (!implementerFamily || !reviewerFamily)
		issue = "Reviewer model family unresolvable";
	else if (
		!generalist ||
		`${generalist.provider}/${generalist.id}` !== configured
	)
		issue = `Generalist model substituted; configured ${configured}, observed ${generalist ? `${generalist.provider}/${generalist.id}` : "missing"}`;
	else if (implementerFamily === reviewerFamily)
		issue = `Generalist and default implementer share family ${reviewerFamily}`;
	return { lines: [...lines, `Diversity: ${issue ?? "attested"}.`], issue };
}

/** Require citations that can be checked against the sealed review materials. */
export function calibrateReviewerFindings(options: {
	readonly materials: string;
	readonly reviewers: readonly { lens: string; text: string }[];
	readonly findings: readonly string[];
	readonly observations?: readonly string[];
}): { findings: string[]; issues: string[]; openFindings: boolean } {
	const state = {
		issues: [] as string[],
		unsupported: new Set<string>(),
		closed: new Set<string>(),
		findings: [...options.findings],
		reported: [...options.findings, ...(options.observations ?? [])],
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
		issues: [...new Set(state.issues)],
		openFindings: options.findings.some((entry) => {
			const id = leadingFindingId(entry);
			return !id || !state.closed.has(id);
		}),
	};
}

interface CalibrationState {
	issues: string[];
	unsupported: Set<string>;
	closed: Set<string>;
	findings: string[];
	reported: string[];
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
	const reported = state.reported.find(
		(entry) => leadingFindingId(entry) === id,
	);
	if (!reported) {
		state.findings.push(`${id} open: reviewer finding omitted from QM report.`);
		state.issues.push(
			`Finding ${id} was omitted from the QM report; carried forward as open.`,
		);
	}
	const independentlySupported = independentlyClosed(
		id,
		lens,
		options.reviewers,
		options.materials,
	);
	calibrateClosure(
		state,
		id,
		section,
		reported,
		independentlySupported,
		options.materials,
	);
	if (
		lens === "performance-reviewer" &&
		unsupportedHighPriority(
			section,
			options.materials,
			Boolean(reported && /\bP[01]\b/.test(reported)),
		)
	) {
		state.unsupported.add(id);
		state.issues.push(
			state.findings.some((entry) => leadingFindingId(entry) === id)
				? `Performance ${id} lacked measured or reproduced cost cited from captured materials; capped at P2.`
				: `Finding ${id} has unsupported performance priority above P2; human decision required.`,
		);
	}
}

function calibrateClosure(
	state: CalibrationState,
	id: string,
	section: string,
	reported: string | undefined,
	independentlySupported: boolean,
	materials: string,
): void {
	const dismissal =
		reported && /\b(?:resolved|dismissed|closed)\b/i.test(reported);
	if (dismissal) {
		if (independentlySupported || citedReportClosure(reported, materials))
			state.closed.add(id);
		else {
			state.issues.push(
				`Finding ${id} was closed or dismissed without independent cited evidence.`,
			);
			state.findings.push(
				`${id} open: QM dismissal lacked independent cited evidence.`,
			);
		}
	}
	if (
		/^\s*status:\s*(?:resolved|dismissed)\s*$/m.test(section) &&
		!independentlySupported
	)
		state.issues.push(
			`Finding ${id} was closed or dismissed without independent cited evidence.`,
		);
}

function leadingFindingId(entry: string): string | undefined {
	return entry.match(/^(?!TASK-)([A-Za-z]+-\d+)\b/)?.[1];
}

function citedReportClosure(line: string, materials: string): boolean {
	const citation = line.match(/closureEvidence:\s*(.+)$/i)?.[1]?.trim();
	return Boolean(
		citation && citation.length >= 12 && materials.includes(citation),
	);
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

function independentlyClosed(
	id: string,
	lens: string,
	reviewers: readonly { lens: string; text: string }[],
	materials: string,
): boolean {
	return reviewers.some(
		(other) =>
			other.lens !== lens &&
			other.text
				.split(/(?=^\s*- id:\s*)/m)
				.some(
					(section) =>
						section.match(/^\s*- id:\s*([^\s]+)/m)?.[1] === id &&
						Boolean(citedMaterial(section, "closureEvidence", materials)),
				),
	);
}
