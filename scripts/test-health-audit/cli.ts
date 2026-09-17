import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { readCurrentEpochManifest } from "./artifacts.ts";
import {
	type CensusResult,
	censusDigest,
	reconcileCensus,
	runAuditCommand,
} from "./census.ts";
import { collectSourceTree, type SourceCensus } from "./source-census.ts";

export interface CliDependencies {
	readonly census?: (root: string) => Promise<unknown>;
	readonly prepareUnits?: (root: string) => Promise<unknown>;
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
	command: "census" | "prepare-units" | "validate" | "probe" | "baseline";
	confirmProbe?: string;
} {
	if (argv[0] !== "--audit-root" || !argv[1])
		throw new Error(
			"usage: cli.ts --audit-root <path> <census|prepare-units|validate|probe|baseline>",
		);
	const command = argv[2];
	if (
		!command ||
		!["census", "prepare-units", "validate", "probe", "baseline"].includes(
			command,
		)
	)
		throw new Error(`unsupported audit command ${command ?? "<missing>"}`);
	const confirmationIndex = argv.indexOf("--confirm-probe");
	const confirmProbe =
		confirmationIndex >= 0 ? argv[confirmationIndex + 1] : undefined;
	return {
		root: argv[1],
		command: command as
			| "census"
			| "prepare-units"
			| "validate"
			| "probe"
			| "baseline",
		...(confirmProbe ? { confirmProbe } : {}),
	};
}
async function defaultCensus(root: string): Promise<void> {
	const manifest = await readCurrentEpochManifest(root);
	const epochDirectory = join(root, "epochs", manifest.epochId);
	const projectRoot = process.cwd();
	const sources = await collectSourceTree(projectRoot);
	const runs = [];
	for (const command of manifest.commandDefinitions) {
		const run = await runAuditCommand({
			projectRoot,
			rawDirectory: join(epochDirectory, "raw"),
			command,
		});
		runs.push(run);
		await writeJsonAtomic(
			join(epochDirectory, "raw", `${command.id}.json`),
			run,
		);
	}
	const result = reconcileCensus({
		sources,
		runs,
		expectedCommands: manifest.commandDefinitions,
	});
	const digest = censusDigest(sources, runs);
	await persistCensusArtifacts(epochDirectory, sources, result, digest);
}
export async function persistCensusArtifacts(
	epochDirectory: string,
	sources: readonly SourceCensus[],
	result: CensusResult,
	digest: string,
): Promise<void> {
	await writeJsonAtomic(join(epochDirectory, "source-census.json"), sources);
	await writeJsonAtomic(join(epochDirectory, "suite-integrity.json"), {
		...result,
		censusDigest: digest,
	});
	await writeTextAtomic(
		join(epochDirectory, "suite-integrity.md"),
		renderSuiteIntegrity(result, digest),
	);
}

function renderSuiteIntegrity(result: CensusResult, digest: string): string {
	const lines = [
		"# Suite integrity",
		"",
		`State: **${result.state}**`,
		`Clean: **${String(result.clean)}**`,
		`Census digest: \`${digest}\``,
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
	const census = JSON.parse(
		await readFile(
			join(root, "epochs", manifest.epochId, "suite-integrity.json"),
			"utf8",
		),
	) as { censusDigest?: string };
	if (census.censusDigest !== manifest.censusDigest)
		throw new Error("stale or missing census digest");
	await writeFile(
		join(root, "epochs", manifest.epochId, "work-units.json"),
		"[]\n",
		{ flag: "wx" },
	);
}
async function defaultValidate(root: string): Promise<boolean> {
	const manifest = await readCurrentEpochManifest(root);
	const census = JSON.parse(
		await readFile(
			join(root, "epochs", manifest.epochId, "suite-integrity.json"),
			"utf8",
		),
	) as { censusDigest?: string };
	if (census.censusDigest !== manifest.censusDigest)
		throw new Error("stale or missing census digest");
	return true;
}
async function defaultProbe(_root: string, id: string): Promise<never> {
	throw new Error(
		`probe ${id} cannot run until copied-sandbox containment is available`,
	);
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
