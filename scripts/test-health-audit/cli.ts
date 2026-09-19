import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
	CANDIDATE_BUNDLES,
	canonicalCandidateDigest,
	deriveBaselineConditions,
	type EpochManifest,
	evaluateBaseline,
	parseBaselineDocument,
	parseCalibrationDocument,
	parseGateRecommendationsDocument,
	parseRemediationLedgerDocument,
	prepareProfileWorkQueue,
	publishProfileIndex,
	readCurrentEpochManifest,
	readEpochProfiles,
	safeProjectPath,
	validateBaselineDocument,
	validateCalibrationRecord,
	validateCandidateBundles,
	validateEpochProvenance,
	validateGateRecommendations,
	validateRemediationLedger,
} from "./artifacts.ts";
import { carryForwardProfileUnits } from "./carry-forward.ts";
import {
	type CensusResult,
	commandCensusDigest,
	type FindingDisposition,
	reconcileCensus,
	runAuditCommand,
	sourceCensusDigest,
} from "./census.ts";
import { dispatchProfileUnits } from "./dispatch.ts";
import {
	derivePortfolioEvidence,
	parsePortfolioEvidenceDocument,
	validatePortfolioEvidenceDocuments,
} from "./portfolio.ts";
import { runConfirmedProbe } from "./probe.ts";
import type { RuntimeEvidence } from "./runtime-reporter.ts";
import { collectSourceTree, type SourceCensus } from "./source-census.ts";

export interface CliDependencies {
	readonly census?: (root: string) => Promise<unknown>;
	readonly prepareUnits?: (root: string) => Promise<unknown>;
	readonly dispatch?: (root: string) => Promise<unknown>;
	readonly publishUnit?: (
		root: string,
		unitId: string,
		inputPath: string,
	) => Promise<unknown>;
	readonly carryForward?: (root: string) => Promise<unknown>;
	readonly validate?: (root: string) => Promise<unknown>;
	readonly probe?: (root: string, id: string) => Promise<unknown>;
	readonly baseline?: (root: string) => Promise<unknown>;
	readonly assemble?: (root: string) => Promise<unknown>;
}
export async function runCli(
	argv: readonly string[],
	dependencies: CliDependencies = {},
): Promise<number> {
	try {
		const parsed = parseArguments(argv);
		if (parsed.command === "census") {
			await (dependencies.census ?? defaultCensus)(parsed.root);
			return 0;
		}
		if (parsed.command === "prepare-units") {
			await (dependencies.prepareUnits ?? defaultPrepareUnits)(parsed.root);
			return 0;
		}
		if (parsed.command === "dispatch") {
			await (dependencies.dispatch ?? defaultDispatch)(parsed.root);
			return 0;
		}
		if (parsed.command === "publish-unit") {
			if (!parsed.unitId || !parsed.inputPath)
				throw new Error("publish-unit requires --unit <id> --input <path>");
			await (dependencies.publishUnit ?? defaultPublishUnit)(
				parsed.root,
				parsed.unitId,
				parsed.inputPath,
			);
			return 0;
		}
		if (parsed.command === "carry-forward") {
			await (dependencies.carryForward ?? defaultCarryForward)(parsed.root);
			return 0;
		}
		if (parsed.command === "validate") {
			await (dependencies.validate ?? defaultValidate)(parsed.root);
			return 0;
		}
		if (parsed.command === "baseline") {
			await (dependencies.baseline ?? defaultBaseline)(parsed.root);
			return 0;
		}
		if (parsed.command === "assemble") {
			await (dependencies.assemble ?? defaultAssemble)(parsed.root);
			return 0;
		}
		if (!parsed.confirmProbe)
			throw new Error("probe requires --confirm-probe <id>");
		await (dependencies.probe ?? defaultProbe)(
			parsed.root,
			parsed.confirmProbe,
		);
		return 0;
	} catch (error) {
		if (import.meta.main)
			console.error(error instanceof Error ? error.message : String(error));
		return 1;
	}
}
function parseArguments(argv: readonly string[]): {
	root: string;
	command:
		| "census"
		| "prepare-units"
		| "dispatch"
		| "publish-unit"
		| "carry-forward"
		| "validate"
		| "probe"
		| "baseline"
		| "assemble";
	confirmProbe?: string;
	unitId?: string;
	inputPath?: string;
} {
	if (argv[0] !== "--audit-root" || !argv[1])
		throw new Error(
			"usage: cli.ts --audit-root <path> <census|prepare-units|dispatch|publish-unit|carry-forward|assemble|validate|probe|baseline>",
		);
	const command = argv[2];
	if (
		!command ||
		![
			"census",
			"prepare-units",
			"dispatch",
			"publish-unit",
			"carry-forward",
			"validate",
			"probe",
			"baseline",
			"assemble",
		].includes(command)
	)
		throw new Error(`unsupported audit command ${command ?? "<missing>"}`);
	const confirmationIndex = argv.indexOf("--confirm-probe");
	const confirmProbe =
		confirmationIndex >= 0 ? argv[confirmationIndex + 1] : undefined;
	const unitIndex = argv.indexOf("--unit");
	const unitId = unitIndex >= 0 ? argv[unitIndex + 1] : undefined;
	const inputIndex = argv.indexOf("--input");
	const inputPath = inputIndex >= 0 ? argv[inputIndex + 1] : undefined;
	return {
		root: argv[1],
		command: command as
			| "census"
			| "prepare-units"
			| "dispatch"
			| "publish-unit"
			| "carry-forward"
			| "assemble"
			| "validate"
			| "probe"
			| "baseline",
		...(confirmProbe ? { confirmProbe } : {}),
		...(unitId ? { unitId } : {}),
		...(inputPath ? { inputPath } : {}),
	};
}
async function defaultCensus(root: string): Promise<void> {
	const manifest = await readCurrentEpochManifest(root);
	const epochDirectory = join(root, "epochs", manifest.epochId);
	const projectRoot = process.cwd();
	const sources = await collectSourceTree(projectRoot);
	const sourceDigest = sourceCensusDigest(sources);
	if (sourceDigest !== manifest.sourceCensusDigest)
		throw new Error("source census does not match the frozen manifest digest");
	const runs = [];
	for (const command of manifest.commandDefinitions) {
		const rawPath = join(epochDirectory, "raw", `${command.id}.json`);
		const run = await readRuntimeEvidence(rawPath, command).catch(
			async (error: unknown) => {
				if (!isMissingFile(error)) throw error;
				const observed = await runAuditCommand({
					projectRoot,
					rawDirectory: join(epochDirectory, "raw"),
					command,
				});
				await writeJsonAtomic(rawPath, observed);
				return observed;
			},
		);
		runs.push(run);
	}
	const result = reconcileCensus({
		sources,
		runs,
		expectedCommands: manifest.commandDefinitions,
		dispositions: await readFindingDispositions(epochDirectory),
	});
	await persistCensusArtifacts(
		epochDirectory,
		sources,
		result,
		sourceDigest,
		commandCensusDigest(runs),
	);
}

async function readRuntimeEvidence(
	path: string,
	command: EpochManifest["commandDefinitions"][number],
): Promise<RuntimeEvidence> {
	const parsed = JSON.parse(await readFile(path, "utf8")) as RuntimeEvidence;
	if (
		parsed.reporterVersion !== 1 ||
		parsed.command.id !== command.id ||
		parsed.command.surface !== command.surface ||
		JSON.stringify(parsed.command.argv) !== JSON.stringify(command.argv)
	)
		throw new Error(`reporter incompatibility for command ${command.id}`);
	return parsed;
}
export async function persistCensusArtifacts(
	epochDirectory: string,
	sources: readonly SourceCensus[],
	result: CensusResult,
	sourceDigest: string,
	commandDigest: string,
): Promise<void> {
	await writeJsonAtomic(join(epochDirectory, "source-census.json"), sources);
	await writeJsonAtomic(join(epochDirectory, "suite-integrity.json"), {
		...result,
		sourceCensusDigest: sourceDigest,
		commandCensusDigest: commandDigest,
	});
	await writeTextAtomic(
		join(epochDirectory, "suite-integrity.md"),
		renderSuiteIntegrity(result, sourceDigest, commandDigest),
	);
}

function renderSuiteIntegrity(
	result: CensusResult,
	sourceDigest: string,
	commandDigest: string,
): string {
	const lines = [
		"# Suite integrity",
		"",
		`State: **${result.state}**`,
		`Clean: **${String(result.clean)}**`,
		`Source census digest: \`${sourceDigest}\``,
		`Command census digest: \`${commandDigest}\``,
		"",
		"## Command evidence",
		"",
		"| Command | Surface | Exit | Classification | Timing | Watcher |",
		"|---|---|---:|---|---|---|",
	];
	for (const command of result.commandEvidence) {
		lines.push(
			`| ${markdownCell(command.commandId)} | ${command.surface} | ${command.exitCode} | ${command.classification} | ${command.timing ? `${command.timing.durationMs} ms (${command.timing.startedAt} to ${command.timing.endedAt})` : "not recorded"} | ${command.watcherStart ? `watcher start observed at ${command.watcherStart.observedAt}; ${command.watcherStart.scheduledFileCount} files scheduled` : "not applicable"} |`,
		);
	}
	lines.push("", "## Findings", "");
	if (result.findings.length === 0) lines.push("None.");
	else
		for (const finding of result.findings)
			lines.push(
				`- \`${finding.kind}\` (${finding.basis})${finding.commandId ? ` [${finding.commandId}]` : ""}: ${finding.detail}`,
			);
	if (result.repairRequired.length > 0) {
		lines.push("", "## Repair required", "");
		lines.push(
			"These findings were answered `repair-required-*` by an assessor. The census is",
			"`clean` when every finding has an answer; these still name open work and are",
			"the stage-8 remediation ledger's input.",
			"",
			"| Finding | Kind | Disposition | Command | Detail | Assessor |",
			"|---|---|---|---|---|---|",
		);
		for (const row of result.repairRequired)
			lines.push(
				`| \`${row.findingId.slice(0, 12)}\` | ${row.kind} | ${row.disposition} | ${row.commandId ?? "not applicable"} | ${markdownCell(row.detail)} | ${markdownCell(row.assessor?.id ?? "unrecorded")} |`,
			);
		for (const row of result.repairRequired)
			lines.push(
				"",
				`\`${row.findingId.slice(0, 12)}\` reasoning: ${row.reasoning}`,
			);
	}
	if (result.residualUncertainty.length > 0) {
		lines.push("", "## Residual uncertainty", "");
		for (const uncertainty of result.residualUncertainty)
			lines.push(`- ${uncertainty}`);
	}
	return `${lines.join("\n")}\n`;
}

function markdownCell(value: string): string {
	return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}
async function defaultPrepareUnits(root: string): Promise<void> {
	const manifest = await readCurrentEpochManifest(root);
	await validateCensusDigests(root, manifest);
	const censusPath = join(
		root,
		"epochs",
		manifest.epochId,
		"source-census.json",
	);
	const census = JSON.parse(
		await readFile(censusPath, "utf8"),
	) as SourceCensus[];
	await prepareProfileWorkQueue(root, census);
}
async function defaultDispatch(root: string): Promise<void> {
	const manifest = await readCurrentEpochManifest(root);
	await validateCensusDigests(root, manifest);
	await dispatchProfileUnits({
		auditRoot: root,
		projectRoot: process.cwd(),
	});
}

async function defaultPublishUnit(
	root: string,
	unitId: string,
	inputPath: string,
): Promise<void> {
	void root;
	void unitId;
	void inputPath;
	throw new Error(
		"publish-unit is dispatcher-owned; run dispatch so process cost is measured externally",
	);
}
async function defaultCarryForward(root: string): Promise<void> {
	const report = await carryForwardProfileUnits({
		auditRoot: root,
		projectRoot: process.cwd(),
	});
	process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

async function defaultValidate(root: string): Promise<boolean> {
	const manifest = await readCurrentEpochManifest(root);
	await validateCensusDigests(root, manifest);
	const provenance = await validateEpochProvenance(root, manifest);
	if (provenance.length > 0)
		throw new Error(
			`epoch provenance is falsified:\n${provenance.map((issue) => `  - ${issue}`).join("\n")}`,
		);
	const stale = await staleMaterialInputIssues(manifest, process.cwd());
	if (stale.length > 0)
		throw new Error(
			`current epoch manifest is stale:\n${stale.map((issue) => `  - ${issue}`).join("\n")}`,
		);
	const deliverables = await validateEpochDeliverables(root, manifest);
	if (deliverables.length > 0)
		throw new Error(
			`current epoch deliverables are invalid:\n${deliverables.map((issue) => `  - ${issue}`).join("\n")}`,
		);
	return true;
}

/**
 * The manifest freezes the digest of every material input the epoch was opened
 * against, and nothing else rehashes them: the per-profile digests cover a
 * profile's own inputs, and the census digests cover declarations and command
 * output. So the method document, the plan, the schema and the runner config
 * could all move under an open epoch while every other check stayed green.
 * `E1` names a stale digest as something that blocks eligibility; this is where
 * the manifest's own digests are held to that.
 */
export async function staleMaterialInputIssues(
	manifest: {
		readonly materialInputs: readonly {
			readonly path: string;
			readonly sha256: string;
		}[];
	},
	projectRoot: string,
): Promise<string[]> {
	const issues: string[] = [];
	for (const input of manifest.materialInputs) {
		let current: Buffer;
		try {
			current = await readFile(safeProjectPath(projectRoot, input.path));
		} catch (error) {
			if (!isMissingFile(error)) {
				issues.push(
					`material input ${input.path} is not readable inside the project: ${error instanceof Error ? error.message : String(error)}`,
				);
				continue;
			}
			issues.push(`material input ${input.path} is missing from this revision`);
			continue;
		}
		if (createHash("sha256").update(current).digest("hex") !== input.sha256)
			issues.push(
				`material input ${input.path} has changed since this epoch froze it`,
			);
	}
	return issues;
}

async function readIfPresent(path: string): Promise<string | undefined> {
	try {
		return await readFile(path, "utf8");
	} catch (error) {
		if (isMissingFile(error)) return undefined;
		throw error;
	}
}

/**
 * Checks the live epoch's deliverables against their contracts. This is the
 * audit's own gate rather than the repository's test suite, so that suite truth
 * never depends on which epoch is current. A document absent from a mid-flight
 * epoch is skipped; the portfolio trio is checked only when all three are
 * present, so a partial set is not reported either way.
 */
async function validateEpochDeliverables(
	root: string,
	manifest: EpochManifest,
): Promise<string[]> {
	const epoch = join(root, "epochs", manifest.epochId);
	const issues: string[] = [];

	const [matrix, gapRegister, inventoryText, baselineDocument] =
		await Promise.all([
			readIfPresent(join(epoch, "behavior-risk-matrix.md")),
			readIfPresent(join(epoch, "gap-register.md")),
			readIfPresent(join(epoch, "behavior-risk-inventory.json")),
			readIfPresent(join(epoch, "baseline.md")),
		]);
	if (
		matrix !== undefined &&
		gapRegister !== undefined &&
		inventoryText !== undefined
	) {
		const portfolio = validatePortfolioEvidenceDocuments({
			matrix,
			gapRegister,
			inventory: JSON.parse(inventoryText) as unknown,
			currentEpochId: manifest.epochId,
		});
		issues.push(...portfolio.issues.map((issue) => `portfolio: ${issue}`));
		// A successor epoch inherits these two documents from its predecessor as a
		// seed, restamped with its own epoch id. Every structural check above
		// passes on that copy, so re-deriving from this epoch's own profiles is
		// what catches a seed that describes different evidence. Demanded only
		// once the epoch has reached baseline.md, because a mid-flight epoch has
		// no complete profile set to derive from.
		if (baselineDocument !== undefined)
			issues.push(
				...(await derivedPortfolioIssues(root, { matrix, gapRegister })),
			);
	}

	const calibration = await readIfPresent(join(epoch, "calibration.md"));
	if (calibration !== undefined) {
		const record = validateCalibrationRecord(
			parseCalibrationDocument(calibration),
			manifest.epochId,
		);
		issues.push(...record.issues.map((issue) => `calibration: ${issue}`));
	}

	const ledgerDocument = await readIfPresent(
		join(epoch, "remediation-ledger.md"),
	);
	if (ledgerDocument !== undefined && baselineDocument !== undefined) {
		const integrity = JSON.parse(
			(await readIfPresent(join(epoch, "suite-integrity.json"))) ?? "{}",
		) as { repairRequired?: { findingId: string }[] };
		const repairIds = (integrity.repairRequired ?? []).map(
			(row) => row.findingId,
		);
		const ledger = parseRemediationLedgerDocument(ledgerDocument) as {
			successorEpoch?: {
				rehashedMaterialInputs?: {
					path: string;
					inputKind: string;
					sha256: string;
				}[];
			};
		};
		const result = validateRemediationLedger(ledger, manifest.epochId, {
			requiredRepairInputIds: repairIds,
			requiredWeaknessInputIds: repairIds,
			requiredMaterialInputs: (
				ledger.successorEpoch?.rehashedMaterialInputs ?? []
			).filter((input) =>
				manifest.materialInputs.some((item) => item.path === input.path),
			),
			baselineDocument,
		});
		issues.push(
			...result.issues.map((issue) => `remediation-ledger: ${issue}`),
		);
	}

	issues.push(...(await staleProbeIssues(epoch, process.cwd())));

	const recommendations = await readIfPresent(
		join(epoch, "gate-recommendations.md"),
	);
	if (recommendations !== undefined) {
		const result = validateGateRecommendations(
			parseGateRecommendationsDocument(recommendations),
			manifest.epochId,
		);
		issues.push(
			...result.issues.map((issue) => `gate-recommendations: ${issue}`),
		);
	}

	// A candidate is an epoch that has reached `baseline.md`. Before that the
	// bundle set is legitimately partial, so completeness is only demanded here.
	if (baselineDocument !== undefined) {
		const bundles = await readCandidateBundleState(root, manifest);
		issues.push(...bundles.issues.map((issue) => `bundles: ${issue}`));
		const evidence = await readBaselineEvidence(root, manifest);
		const conditions = deriveBaselineConditions(evidence);
		const digest = await computeCandidateDigest(root, manifest, conditions);
		const result = validateBaselineDocument(
			baselineDocument,
			parseBaselineDocument(baselineDocument),
			{
				epochId: manifest.epochId,
				evaluatedRevision: manifest.evaluatedRevision,
				candidateEvidenceDigest: digest,
				packetQuestionIds: evidence.ledgerRows.flatMap((row) =>
					row.outcome === "unresolved" && row.packetQuestion?.id
						? [String(row.packetQuestion.id)]
						: [],
				),
			},
		);
		issues.push(...result.issues.map((issue) => `baseline: ${issue}`));
	}
	return issues;
}

/**
 * A probe record is a measurement of one file: what happened to the guardrail
 * while that exact text was mutated. `probes.jsonl` is inherited by every
 * successor epoch and restamped with its id, so a record can outlive the code
 * it measured -- going on crediting baseline condition 6 for a mutation that no
 * longer applies, or opening a remediation row against code that is gone. The
 * record carries the target's digest at run time, so either claim is checkable
 * rather than assumed. Outcome does not enter it: a measurement of text this
 * revision does not have describes this revision either way.
 */
export async function staleProbeIssues(
	epochDirectory: string,
	projectRoot: string,
): Promise<string[]> {
	const text = await readIfPresent(join(epochDirectory, "probes.jsonl"));
	if (text === undefined) return [];
	const issues: string[] = [];
	for (const line of text.split(/\r?\n/u).filter(Boolean)) {
		const record = JSON.parse(line) as {
			probeId?: string;
			outcome?: string;
			sandbox?: { root?: string };
			paths?: { target?: string };
			sourceCheckout?: { targetDigestBefore?: string };
		};
		const target = record.paths?.target;
		const recorded = record.sourceCheckout?.targetDigestBefore;
		// A limitation record measured nothing, so it legitimately has neither
		// field. An executed record that has lost them is a different thing and
		// must not borrow the limitation record's exemption: it still credits or
		// opens a baseline row, so it has to name what it measured.
		const executed =
			record.outcome === "probe-confirmed" ||
			record.outcome === "probe-survived";
		if (!executed && !target && !recorded) continue;
		// A probe copies the repository into a throwaway sandbox and records
		// absolute paths inside it, so the file it measured is named relative to
		// that sandbox root rather than to the project.
		const root = record.sandbox?.root;
		const relativeTarget =
			target && root && target.startsWith(`${root}/`)
				? target.slice(root.length + 1)
				: undefined;
		if (!relativeTarget || !recorded) {
			issues.push(
				`probes: ${record.probeId} does not name the file it measured relative to its sandbox`,
			);
			continue;
		}
		let current: string | undefined;
		try {
			current = await readIfPresent(
				safeProjectPath(projectRoot, relativeTarget),
			);
		} catch {
			issues.push(
				`probes: ${record.probeId} measured ${relativeTarget}, which is outside the project`,
			);
			continue;
		}
		if (current === undefined) {
			issues.push(
				`probes: ${record.probeId} measured ${relativeTarget}, which this revision does not have`,
			);
			continue;
		}
		if (createHash("sha256").update(current).digest("hex") !== recorded)
			issues.push(
				`probes: ${record.probeId} measured a version of ${relativeTarget} that this revision does not have`,
			);
	}
	return issues;
}

/**
 * Re-joins the current epoch's inventory, profiles and probe records and
 * compares the result with what the epoch published. A document that differs is
 * describing evidence other than this epoch's. It proves equal rendering, not
 * that a publish happened: where every profile and probe carried unchanged, an
 * inherited document is byte-identical to the derivation and is then correct
 * for this epoch anyway.
 */
export async function derivedPortfolioIssues(
	root: string,
	published: { readonly matrix: string; readonly gapRegister: string },
): Promise<string[]> {
	let derived: Awaited<ReturnType<typeof derivePortfolioEvidence>>;
	try {
		derived = await derivePortfolioEvidence(root);
	} catch (error) {
		return [
			`portfolio: cannot re-derive this epoch's evidence: ${error instanceof Error ? error.message : String(error)}`,
		];
	}
	const issues: string[] = [];
	if (derived.matrix !== published.matrix)
		issues.push(
			"portfolio: behavior-risk-matrix.md is not what this epoch's profiles produce",
		);
	if (derived.gapRegister !== published.gapRegister)
		issues.push(
			"portfolio: gap-register.md is not what this epoch's profiles produce",
		);
	return issues;
}

async function validateCensusDigests(
	root: string,
	manifest: Awaited<ReturnType<typeof readCurrentEpochManifest>>,
): Promise<void> {
	const epochDirectory = join(root, "epochs", manifest.epochId);
	const sourcePath = join(epochDirectory, "source-census.json");
	const sources = await readJsonInput(sourcePath);
	if (!isSourceCensus(sources)) throw new Error(`${sourcePath} is malformed`);
	if (sourceCensusDigest(sources) !== manifest.sourceCensusDigest)
		throw new Error(`${sourcePath} has a stale source census digest`);
	const integrityPath = join(epochDirectory, "suite-integrity.json");
	const integrity = await readJsonInput(integrityPath);
	if (
		typeof integrity !== "object" ||
		integrity === null ||
		Array.isArray(integrity)
	)
		throw new Error(`${integrityPath} is malformed`);
	const integrityRecord = integrity as {
		sourceCensusDigest?: string;
		commandCensusDigest?: string;
	};
	if (integrityRecord.sourceCensusDigest !== manifest.sourceCensusDigest)
		throw new Error(`${integrityPath} has a stale source census digest`);
	const runs = await Promise.all(
		manifest.commandDefinitions.map(async (command) =>
			readRuntimeEvidence(
				join(epochDirectory, "raw", `${command.id}.json`),
				command,
			),
		),
	);
	if (commandCensusDigest(runs) !== integrityRecord.commandCensusDigest)
		throw new Error(`${integrityPath} has a stale command census digest`);
}

async function readJsonInput(path: string): Promise<unknown> {
	try {
		return JSON.parse(await readFile(path, "utf8")) as unknown;
	} catch (error) {
		throw new Error(
			`${path} is missing or malformed: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

function isSourceCensus(value: unknown): value is SourceCensus[] {
	return (
		Array.isArray(value) &&
		value.every(
			(file) =>
				typeof file === "object" &&
				file !== null &&
				!Array.isArray(file) &&
				typeof (file as { path?: unknown }).path === "string" &&
				Array.isArray((file as { declarations?: unknown }).declarations) &&
				Array.isArray((file as { limitations?: unknown }).limitations),
		)
	);
}

export async function readFindingDispositions(
	epochDirectory: string,
): Promise<FindingDisposition[]> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(
			await readFile(join(epochDirectory, "dispositions.json"), "utf8"),
		);
	} catch (error) {
		if (isMissingFile(error)) return [];
		throw error;
	}
	if (!Array.isArray(parsed) || !parsed.every(isFindingDisposition))
		throw new Error("invalid dispositions.json");
	return parsed;
}

function isFindingDisposition(value: unknown): value is FindingDisposition {
	if (typeof value !== "object" || value === null || Array.isArray(value))
		return false;
	const record = value as Record<string, unknown>;
	const assessor = record.assessor;
	const agent =
		typeof assessor === "object" &&
		assessor !== null &&
		!Array.isArray(assessor)
			? (assessor as Record<string, unknown>)
			: undefined;
	const disposition = String(record.disposition);
	const consultedAuthorities = agent?.consultedAuthorities;
	return (
		typeof record.findingId === "string" &&
		record.findingId.length > 0 &&
		[
			"accounted-for",
			"limitation-accepted",
			"repair-required-tooling",
			"repair-required-suite",
		].includes(disposition) &&
		typeof record.reasoning === "string" &&
		record.reasoning.length > 0 &&
		agent?.kind === "agent" &&
		nonEmptyString(agent.id) &&
		nonEmptyString(agent.model) &&
		nonEmptyString(agent.modelVersion) &&
		nonEmptyString(agent.assessedAt) &&
		Array.isArray(consultedAuthorities) &&
		(disposition !== "limitation-accepted" || consultedAuthorities.length > 0)
	);
}

function nonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
}

function isMissingFile(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === "ENOENT"
	);
}
async function defaultProbe(root: string, id: string): Promise<void> {
	await runConfirmedProbe({
		auditRoot: root,
		projectRoot: process.cwd(),
		confirmation: id,
	});
}

/**
 * Bundle 3's index is derived from the shards, so it is regenerated rather than
 * maintained. Running this after a dispatch or carry keeps the candidate's
 * profile bundle addressable without any agent writing an index by hand.
 */
async function defaultAssemble(root: string): Promise<void> {
	const manifest = await readCurrentEpochManifest(root);
	const index = await publishProfileIndex(root, manifest.epochId);
	const bundles = await readCandidateBundleState(root, manifest);
	process.stdout.write(
		`${JSON.stringify(
			{
				epochId: manifest.epochId,
				profileCount: index.profileCount,
				unitCount: index.units.length,
				bundles,
			},
			null,
			2,
		)}\n`,
	);
}

async function readCandidateBundleState(
	root: string,
	manifest: EpochManifest,
): Promise<{
	valid: boolean;
	issues: readonly string[];
	missingBundleIds: readonly number[];
}> {
	const epoch = join(root, "epochs", manifest.epochId);
	const present: string[] = [];
	const profileUnitFiles: string[] = [];
	for (const bundle of CANDIDATE_BUNDLES)
		for (const file of bundle.files)
			if ((await readIfPresent(join(epoch, file))) !== undefined)
				present.push(file);
	let shardNames: string[] = [];
	try {
		shardNames = await readdir(join(epoch, "profiles"));
	} catch (error) {
		if (!isMissingFile(error)) throw error;
	}
	for (const name of shardNames.filter((candidate) =>
		candidate.endsWith(".ndjson"),
	)) {
		const file = `profiles/${name}`;
		present.push(file);
		profileUnitFiles.push(file);
	}
	const method = manifest.materialInputs.find(
		(input) => input.path === "docs/test-health-audit.md",
	);
	return validateCandidateBundles({
		epochId: manifest.epochId,
		files: present,
		profileUnitFiles,
		...(method ? { method: { path: method.path, sha256: method.sha256 } } : {}),
	});
}

/**
 * Recomputes the value the owner ratifies. It is derived from evidence on every
 * call rather than read back from `baseline.md`, so a document claiming a
 * digest its own evidence no longer produces fails instead of confirming
 * itself.
 */
async function computeCandidateDigest(
	root: string,
	manifest: EpochManifest,
	conditions: readonly { id: number; status: string }[],
): Promise<string> {
	const epoch = join(root, "epochs", manifest.epochId);
	const bundleDigests: {
		bundleId: number;
		file: string;
		sha256: string;
	}[] = [];
	for (const bundle of CANDIDATE_BUNDLES) {
		if (bundle.id === 10) continue;
		for (const file of bundle.files) {
			const text = await readIfPresent(join(epoch, file));
			if (text === undefined) continue;
			bundleDigests.push({
				bundleId: bundle.id,
				file,
				sha256: createHash("sha256").update(text).digest("hex"),
			});
		}
	}
	return canonicalCandidateDigest({
		evaluatedRevision: manifest.evaluatedRevision,
		materialInputs: manifest.materialInputs.map((input) => ({
			path: input.path,
			inputKind: "material",
			sha256: input.sha256,
		})),
		bundleDigests,
		baselineConditions: conditions.map((row) => ({
			id: row.id,
			status: row.status,
		})),
	});
}

async function readBaselineEvidence(root: string, manifest: EpochManifest) {
	const epoch = join(root, "epochs", manifest.epochId);
	const integrity = JSON.parse(
		(await readIfPresent(join(epoch, "suite-integrity.json"))) ?? "{}",
	) as {
		state?: string;
		findings?: {
			id: string;
			kind: string;
			basis: string;
			accountedFor: boolean;
		}[];
	};
	const matrixText = await readIfPresent(
		join(epoch, "behavior-risk-matrix.md"),
	);
	const portfolio = matrixText
		? parsePortfolioEvidenceDocument(matrixText)
		: { entries: [] };
	const ledgerText = await readIfPresent(join(epoch, "remediation-ledger.md"));
	const ledger = ledgerText
		? (parseRemediationLedgerDocument(ledgerText) as {
				rows?: {
					id: string;
					outcome: string;
					packetQuestion?: { id?: unknown };
				}[];
			})
		: { rows: [] };
	const probesText = await readIfPresent(join(epoch, "probes.jsonl"));
	const probeRecords = (probesText ?? "")
		.split(/\r?\n/)
		.filter(Boolean)
		.map((line) => JSON.parse(line) as Record<string, unknown>);
	const uncertaintyText = await readIfPresent(
		join(epoch, "residual-uncertainty.md"),
	);
	const residualUncertainty = uncertaintyText
		? (parseResidualUncertaintyDocument(uncertaintyText).entries ?? [])
		: [];
	const profiles = [
		...(await readEpochProfiles(root, manifest.epochId)).values(),
	];
	const countedProfileIds = countedGuardrailProfileIds(portfolio);
	return {
		censusState: integrity.state ?? "incomplete",
		findings: integrity.findings ?? [],
		profiles,
		countedProfileIds,
		portfolioEntries:
			(
				portfolio as {
					entries?: {
						inventoryId: string;
						criticality: string;
						conclusion: string;
						probe: {
							required: boolean;
							requirementId: string;
							status: string;
						};
					}[];
				}
			).entries ?? [],
		ledgerRows: ledger.rows ?? [],
		probeRecords: probeRecords as {
			probeId?: string;
			outcome?: string;
			runs?: {
				preMutation?: { state?: string };
				mutated?: { state?: string; expectedFailureObserved?: boolean };
				restored?: { state?: string };
			};
		}[],
		residualUncertainty,
	};
}

/** A profile counts as guardrail evidence where a portfolio cell relies on it. */
function countedGuardrailProfileIds(portfolio: unknown): string[] {
	const entries =
		(portfolio as { entries?: Record<string, unknown>[] }).entries ?? [];
	const counted = new Set<string>();
	for (const entry of entries) {
		const axes = (entry.axes ?? {}) as Record<string, unknown>;
		for (const cells of Object.values(axes))
			for (const cell of (cells ?? []) as {
				state?: string;
				profileIds?: string[];
			}[])
				if (cell.state === "protected" || cell.state === "contributing")
					for (const id of cell.profileIds ?? []) counted.add(id);
	}
	return [...counted];
}

export function parseResidualUncertaintyDocument(document: string): {
	entries?: {
		id: string;
		criticality: string;
		bounded: boolean;
		documented: boolean;
	}[];
} {
	const match = document.match(
		/```json residual-uncertainty\n([\s\S]*?)\n```/u,
	);
	if (!match?.[1])
		throw new Error("residual uncertainty JSON block is missing");
	return JSON.parse(match[1]) as {
		entries?: {
			id: string;
			criticality: string;
			bounded: boolean;
			documented: boolean;
		}[];
	};
}

const OWNER_SECTION = "## Owner ratification";

/**
 * The owner appends their decision in a later commit. Automation reads that
 * block and must never author one, so this only ever parses.
 */
function readOwnerBlock(document: string): unknown {
	const match = document.match(/```json owner-ratification\n([\s\S]*?)\n```/u);
	if (!match?.[1]) return undefined;
	try {
		return JSON.parse(match[1]) as unknown;
	} catch {
		return { malformed: true };
	}
}

/** Everything from the owner's heading onward, preserved byte for byte. */
function existingOwnerSection(document: string | undefined): string {
	if (!document) return "";
	const index = document.indexOf(`\n${OWNER_SECTION}`);
	return index < 0 ? "" : document.slice(index);
}

function renderBaselineDocument(options: {
	manifest: EpochManifest;
	candidateEvidenceDigest: string;
	evaluation: ReturnType<typeof evaluateBaseline>;
	evidence: Awaited<ReturnType<typeof readBaselineEvidence>>;
	packetQuestionIds: readonly string[];
	existing: string | undefined;
}): string {
	const { evaluation, evidence, manifest } = options;
	const record = {
		schemaVersion: 1,
		epochId: manifest.epochId,
		evaluatedRevision: manifest.evaluatedRevision,
		candidateEvidenceDigest: options.candidateEvidenceDigest,
		verdict: evaluation.verdict,
		eligibility: evaluation.eligibility,
		conditions: evaluation.rows,
	};
	const criticalPortfolios = evidence.portfolioEntries.filter(
		(entry) => entry.criticality === "critical",
	);
	const unresolvedRows = evidence.ledgerRows.filter(
		(row) => row.outcome === "unresolved",
	);
	const lines = [
		"# Test health baseline",
		"",
		`Epoch \`${manifest.epochId}\` at revision \`${manifest.evaluatedRevision}\`.`,
		"",
		"```json baseline",
		JSON.stringify(record, null, 2),
		"```",
		"",
		"## Ratification packet",
		"",
		`Evaluated revision: \`${manifest.evaluatedRevision}\``,
		`Candidate evidence digest: \`${options.candidateEvidenceDigest}\``,
		`Verdict: **${evaluation.verdict}** (${evaluation.eligibility})`,
		"",
		"### Baseline conditions",
		"",
		"| # | Condition | Status | Reasons |",
		"|---:|---|---|---|",
		...evaluation.rows.map(
			(row) =>
				`| ${row.id} | ${row.name} | ${row.status} | ${
					row.reasons.length === 0
						? "—"
						: row.reasons.map(markdownCell).join("<br>")
				} |`,
		),
		"",
		"### Critical portfolios",
		"",
		criticalPortfolios.length === 0
			? "No portfolio is classified critical in this epoch."
			: [
					"| Inventory | Conclusion | Probe |",
					"|---|---|---|",
					...criticalPortfolios.map(
						(entry) =>
							`| ${entry.inventoryId} | ${entry.conclusion} | ${entry.probe.status} |`,
					),
				].join("\n"),
		"",
		"### Remediation outcomes",
		"",
		evidence.ledgerRows.length === 0
			? "No remediation ledger row is recorded for this epoch."
			: [
					"| Row | Outcome |",
					"|---|---|",
					...evidence.ledgerRows.map((row) => `| ${row.id} | ${row.outcome} |`),
				].join("\n"),
		"",
		"### Residual uncertainty",
		"",
		evidence.residualUncertainty.length === 0
			? "No residual uncertainty is registered for this epoch."
			: [
					"| ID | Criticality | Bounded | Documented |",
					"|---|---|---|---|",
					...evidence.residualUncertainty.map(
						(entry) =>
							`| ${entry.id} | ${entry.criticality} | ${entry.bounded} | ${entry.documented} |`,
					),
				].join("\n"),
		"",
		"### Questions for the project owner",
		"",
		unresolvedRows.length === 0
			? "No confirmed weakness lacks a ratified authority, so the packet asks no contract question."
			: unresolvedRows
					.map((row) => {
						const question = row.packetQuestion as
							| {
									id?: unknown;
									question?: unknown;
									options?: unknown[];
									recommendation?: unknown;
							  }
							| undefined;
						return [
							`- **${String(question?.id ?? row.id)}** — ${String(question?.question ?? "")}`,
							...((question?.options ?? []) as unknown[]).map(
								(option) => `  - Option: ${String(option)}`,
							),
							`  - Recommendation: ${String(question?.recommendation ?? "")}`,
						].join("\n");
					})
					.join("\n"),
		"",
		"### The decision asked of the owner",
		"",
		"1. Accept or decline the baseline for the evaluated revision and digest above.",
		"2. Accept, by exact ID, the residual uncertainty listed above.",
		"3. Answer every contract question listed above.",
		"",
		"To ratify, append an `## Owner ratification` section containing a",
		"`json owner-ratification` block with `decision`, `ratifiedBy`,",
		"`evaluatedRevision`, `candidateEvidenceDigest`, and `acceptedUncertaintyIds`.",
		"Automation cannot write that block.",
		"",
		...(evaluation.failingConditionIds.some((id) => id !== 8)
			? [
					"Conditions " +
						evaluation.failingConditionIds.filter((id) => id !== 8).join(", ") +
						" are not met. To establish the baseline while accepting them, set",
					"`decision` to `established-with-limitations` and add",
					"`acceptedConditionLimitations` naming exactly those condition ids. Each",
					"keeps its definition and stays recorded as not-met with its reasons; the",
					"list is checked against the conditions that actually fail, so it goes",
					"stale if they change.",
				]
			: []),
	];
	return `${lines.join("\n")}\n${existingOwnerSection(options.existing)}`;
}

/**
 * Stage 10. Derives conditions 1-7 from the epoch's own evidence, recomputes
 * the candidate digest, and renders the record. Any owner ratification block
 * already in the document is preserved verbatim and re-read as input — this
 * command never writes one, which is the whole of the automation boundary.
 */
async function defaultBaseline(root: string): Promise<string> {
	const manifest = await readCurrentEpochManifest(root);
	const path = join(root, "epochs", manifest.epochId, "baseline.md");
	const evidence = await readBaselineEvidence(root, manifest);
	const conditions = deriveBaselineConditions(evidence);
	const candidateEvidenceDigest = await computeCandidateDigest(
		root,
		manifest,
		conditions,
	);
	const existing = await readIfPresent(path);
	const ownerRatification = existing ? readOwnerBlock(existing) : undefined;
	const evaluation = evaluateBaseline({
		epochId: manifest.epochId,
		evaluatedRevision: manifest.evaluatedRevision,
		candidateEvidenceDigest,
		conditions,
		residualUncertaintyIds: evidence.residualUncertainty.map(
			(entry) => entry.id,
		),
		...(ownerRatification ? { ownerRatification } : {}),
	});
	const packetQuestionIds = evidence.ledgerRows.flatMap((row) =>
		row.outcome === "unresolved" && row.packetQuestion?.id
			? [String(row.packetQuestion.id)]
			: [],
	);
	await writeTextAtomic(
		path,
		renderBaselineDocument({
			manifest,
			candidateEvidenceDigest,
			evaluation,
			evidence,
			packetQuestionIds,
			existing,
		}),
	);
	process.stdout.write(
		`${JSON.stringify(
			{
				epochId: manifest.epochId,
				verdict: evaluation.verdict,
				eligibility: evaluation.eligibility,
				failingConditionIds: evaluation.failingConditionIds,
				candidateEvidenceDigest,
			},
			null,
			2,
		)}\n`,
	);
	return evaluation.verdict;
}
async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
	await writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}
async function writeTextAtomic(path: string, value: string): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const temporary = `${path}.${process.pid}.tmp`;
	await writeFile(temporary, value, {
		flag: "wx",
	});
	await rename(temporary, path);
}
if (import.meta.main) process.exitCode = await runCli(process.argv.slice(2));
