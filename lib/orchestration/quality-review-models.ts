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
	if (!implementerFamily || !reviewerFamily)
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
}): { findings: string[]; issues: string[] } {
	const issues: string[] = [];
	const unsupported = new Set<string>();
	for (const reviewer of options.reviewers) {
		for (const section of reviewer.text.split(/(?=^\s*- id:\s*)/m)) {
			const id = section.match(/^\s*- id:\s*([^\s]+)/m)?.[1];
			if (!id) continue;
			const reportedP1 = options.findings.some(
				(line) => line.includes(id) && /\bP1\b/.test(line),
			);
			if (
				reviewer.lens === "performance-reviewer" &&
				unsupportedP1(section, options.materials, reportedP1)
			) {
				unsupported.add(id);
				issues.push(
					`Performance ${id} lacked measured or reproduced cost cited from captured materials; capped at P2.`,
				);
			}
			if (
				/^\s*status:\s*(?:resolved|dismissed)\s*$/m.test(section) &&
				!independentlyClosed(
					id,
					reviewer.lens,
					options.reviewers,
					options.materials,
				)
			)
				issues.push(
					`Finding ${id} was closed or dismissed without independent cited evidence.`,
				);
		}
	}
	return {
		findings: options.findings.map((line) => {
			const id = [...unsupported].find((candidate) => line.includes(candidate));
			return id ? line.replace(/\bP1\b/g, "P2") : line;
		}),
		issues,
	};
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

function unsupportedP1(
	section: string,
	materials: string,
	reportedP1: boolean,
): boolean {
	if (!reportedP1 && !/^\s*priority:\s*P1\s*$/m.test(section)) return false;
	const citation = citedMaterial(section, "measuredCost", materials);
	return !citation || !/\d/.test(citation);
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
