import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
	type EpochManifest,
	prepareProfileWorkQueue,
	readCurrentEpochManifest,
	validateEpochProvenance,
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
		| "baseline";
	confirmProbe?: string;
	unitId?: string;
	inputPath?: string;
} {
	if (argv[0] !== "--audit-root" || !argv[1])
		throw new Error(
			"usage: cli.ts --audit-root <path> <census|prepare-units|dispatch|publish-unit|carry-forward|validate|probe|baseline>",
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
	return true;
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
async function defaultBaseline(root: string): Promise<string> {
	const manifest = await readCurrentEpochManifest(root);
	await writeFile(
		join(root, "epochs", manifest.epochId, "baseline.md"),
		"# Test health baseline\n\nVerdict: not established\n",
		{ flag: "wx" },
	);
	return "not established";
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
