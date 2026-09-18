import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
	cp,
	lstat,
	mkdir,
	mkdtemp,
	readFile,
	realpath,
	rename,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { readCurrentEpochManifest } from "./artifacts.ts";
import {
	parsePortfolioEvidenceDocument,
	publishPortfolioEvidence,
} from "./portfolio.ts";
import {
	type AssessedValue,
	type EvidenceRef,
	type FaultSensitivityConclusion,
	type PortfolioContribution,
	type TestEvidenceProfile,
	validateTestEvidenceProfile,
} from "./schema.ts";

const execFileAsync = promisify(execFile);
const SHA256 = /^[a-f0-9]{64}$/u;
const FALSE_CONFIDENCE_CODES = new Set([
	"test-local assertion",
	"wrong-side expectation",
	"missing consumer seam",
	"missing composition root",
	"missing caller or alternate path",
	"realistic defect survived",
]);

export interface ProbeDefinition {
	readonly profileId: string;
	readonly targetPath: string;
	readonly declaredImportRoute: string;
	readonly resolvedImportPath: string;
	readonly configPath: string;
	readonly setupPath: string;
	readonly testPath: string;
	readonly testLine: number;
	readonly testDeclaration: string;
	readonly guardrail: string;
	readonly defect: string;
	readonly doubles: string;
	readonly mutation: { readonly find: string; readonly replace: string };
	readonly expectedFailurePattern: string;
	readonly untrackedAllowlist: readonly string[];
}

export interface ProbeQueueEntry {
	readonly id: string;
	readonly inventoryId: string;
	readonly profileIds: readonly string[];
	readonly triggers: readonly string[];
	readonly definition?: ProbeDefinition;
	readonly limitation?: string;
}

export interface ProbeQueue {
	readonly schemaVersion: 1;
	readonly epochId: string;
	readonly entries: readonly ProbeQueueEntry[];
}

interface ProbeRunObservation {
	readonly state: "green" | "red";
	readonly failedDeclarations: readonly string[];
	readonly expectedFailureObserved?: boolean;
}

export interface ExecutedProbeRecord {
	readonly schemaVersion: 1;
	readonly epochId: string;
	readonly probeId: string;
	readonly inventoryId: string;
	readonly profileId: string;
	readonly outcome: "probe-confirmed" | "probe-survived";
	readonly basis: "probe-confirmed" | "reasoned";
	readonly triggers: readonly string[];
	readonly guardrail: string;
	readonly defect: string;
	readonly mutation: string;
	readonly doubles: { readonly contributing: false; readonly detail: string };
	readonly sandbox: {
		readonly root: string;
		readonly cwd: string;
		readonly workingRepository: true;
		readonly trackedFiles: readonly string[];
		readonly untrackedAllowlist: readonly string[];
		readonly nodeModules: string;
		readonly cacheDir: string;
	};
	readonly paths: {
		readonly target: string;
		readonly importRoute: string;
		readonly config: string;
		readonly setup: string;
		readonly test: string;
	};
	readonly testSelection: {
		readonly file: string;
		readonly line: number;
		readonly declaration: string;
	};
	readonly runs: {
		readonly preMutation: ProbeRunObservation;
		readonly mutated: ProbeRunObservation & {
			readonly expectedFailureObserved: boolean;
		};
		readonly restored: ProbeRunObservation;
	};
	readonly targetIdentity: {
		readonly before: string;
		readonly afterRestore: string;
	};
	readonly sourceCheckout: {
		readonly statusBefore: string;
		readonly statusAfter: string;
		readonly targetDigestBefore: string;
		readonly targetDigestAfter: string;
	};
	readonly recordedAt: string;
}

export interface ProbeLimitationRecord {
	readonly schemaVersion: 1;
	readonly epochId: string;
	readonly probeId: string;
	readonly inventoryId: string;
	readonly profileIds: readonly string[];
	readonly outcome: "reasoned" | "unassessed";
	readonly basis: "reasoned" | "blocked";
	readonly triggers: readonly string[];
	readonly limitation: string;
	readonly recordedAt: string;
}

export type ProbeRecord = ExecutedProbeRecord | ProbeLimitationRecord;

interface PortfolioInput {
	readonly entries: ReadonlyArray<{
		readonly inventoryId: string;
		readonly criticality: string;
		readonly probe: {
			readonly required: boolean;
			readonly requirementId: string;
			readonly profileIds: readonly string[];
		};
	}>;
}

export function deriveProbeQueue(options: {
	readonly epochId: string;
	readonly portfolio: PortfolioInput;
	readonly profiles: readonly TestEvidenceProfile[];
	readonly definitions?: Readonly<Record<string, ProbeDefinition>>;
}): ProbeQueue {
	const profilesById = new Map(
		options.profiles.map((profile) => [profile.id, profile]),
	);
	const entries = options.portfolio.entries.flatMap((entry) => {
		const profiles = entry.probe.profileIds.flatMap((id) => {
			const profile = profilesById.get(id);
			return profile ? [profile] : [];
		});
		const triggers = unique([
			...(entry.criticality === "critical"
				? ["critical behavior or risk"]
				: []),
			...(profiles.some((profile) =>
				profile.reasonCodes.value.some((code) =>
					FALSE_CONFIDENCE_CODES.has(code),
				),
			)
				? ["known historical false-confidence class"]
				: []),
			...(profiles.some((profile) =>
				profile.portfolioContributions.value.some((contribution) =>
					/(consumer|adapter|alternate|persist|composition|event)/iu.test(
						contribution.boundary,
					),
				),
			)
				? [
						"consumer adapter alternate-path persistence or composition-root claim",
					]
				: []),
			...(profiles.some((profile) =>
				profile.reasonCodes.value.includes("mock-supplied outcome"),
			)
				? ["mock or fixture maskable outcome"]
				: []),
			...(profiles.some((profile) =>
				["reasoned", "unassessed"].includes(
					profile.dimensions.faultSensitivity.value,
				),
			)
				? ["intended-fault detection not established by inspection"]
				: []),
		]);
		if (!entry.probe.required && triggers.length === 0) return [];
		const definition = options.definitions?.[entry.probe.requirementId];
		return [
			{
				id: entry.probe.requirementId,
				inventoryId: entry.inventoryId,
				profileIds: entry.probe.profileIds,
				triggers,
				...(definition
					? { definition }
					: {
							limitation:
								"No explicit graph-identified single-defect probe definition was supplied; copy containment and causal isolation are therefore unprovable.",
						}),
			},
		];
	});
	return { schemaVersion: 1, epochId: options.epochId, entries };
}

export function validateProbeRecord(input: unknown): {
	readonly valid: boolean;
	readonly issues: readonly string[];
} {
	const issues: string[] = [];
	if (!isRecord(input)) return invalid("probe record must be an object");
	if (input.schemaVersion !== 1) issues.push("schemaVersion must equal 1");
	for (const field of ["epochId", "probeId", "inventoryId"])
		if (!nonEmpty(input[field])) issues.push(`${field} is required`);
	if (input.outcome === "reasoned" || input.outcome === "unassessed") {
		if (!nonEmpty(input.limitation)) issues.push("limitation is required");
		if (!stringArray(input.profileIds))
			issues.push("profileIds must be strings");
		return result(issues);
	}
	if (input.outcome !== "probe-confirmed" && input.outcome !== "probe-survived")
		issues.push("outcome is invalid");
	if (!nonEmpty(input.profileId)) issues.push("profileId is required");
	if (!isRecord(input.sandbox)) issues.push("sandbox is required");
	if (!isRecord(input.paths)) issues.push("paths are required");
	if (!isRecord(input.testSelection)) issues.push("testSelection is required");
	if (!isRecord(input.runs)) issues.push("runs are required");
	if (!isRecord(input.targetIdentity))
		issues.push("targetIdentity is required");
	if (!isRecord(input.sourceCheckout))
		issues.push("sourceCheckout is required");
	if (issues.length > 0) return result(issues);
	const sandbox = input.sandbox as Record<string, unknown>;
	const paths = input.paths as Record<string, unknown>;
	const selection = input.testSelection as Record<string, unknown>;
	const runs = input.runs as Record<string, unknown>;
	const identity = input.targetIdentity as Record<string, unknown>;
	const source = input.sourceCheckout as Record<string, unknown>;
	if (!nonEmpty(sandbox.root) || !isAbsolute(sandbox.root))
		issues.push("sandbox.root must be absolute");
	for (const field of ["cwd", "nodeModules", "cacheDir"])
		if (!containedPath(sandbox.root, sandbox[field]))
			issues.push(`sandbox.${field} must remain beneath sandbox.root`);
	if (sandbox.workingRepository !== true)
		issues.push("sandbox must be a working repository");
	for (const field of ["target", "importRoute", "config", "setup", "test"])
		if (!containedPath(sandbox.root, paths[field]))
			issues.push(`paths.${field} must remain beneath sandbox.root`);
	if (paths.target !== paths.importRoute)
		issues.push(
			"copied import route must resolve to the copied mutation target",
		);
	if (!nonEmpty(selection.declaration))
		issues.push("testSelection.declaration is required");
	const pre = isRecord(runs.preMutation) ? runs.preMutation : {};
	const mutated = isRecord(runs.mutated) ? runs.mutated : {};
	const restored = isRecord(runs.restored) ? runs.restored : {};
	if (pre.state !== "green") issues.push("pre-mutation run must be green");
	if (restored.state !== "green") issues.push("restored run must be green");
	const failures = stringArray(mutated.failedDeclarations) ?? [];
	const claimed = String(selection.declaration ?? "");
	if (input.outcome === "probe-confirmed") {
		if (mutated.state !== "red") issues.push("confirmed mutation must be red");
		if (!failures.includes(claimed))
			issues.push("the claimed declaration must turn red");
		if (mutated.expectedFailureObserved !== true)
			issues.push("the expected red reason must be observed");
	} else if (failures.includes(claimed)) {
		issues.push("probe-survived cannot name the claimed declaration as red");
	}
	if (!SHA256.test(String(identity.before)))
		issues.push("targetIdentity.before must be a sha256 digest");
	if (identity.before !== identity.afterRestore)
		issues.push("sandbox target identity must be restored");
	if (source.statusBefore !== source.statusAfter)
		issues.push("source checkout status changed");
	if (source.targetDigestBefore !== source.targetDigestAfter)
		issues.push("source checkout target digest changed");
	return result(issues);
}

export async function prepareProbeQueue(options: {
	readonly auditRoot: string;
	readonly projectRoot: string;
}): Promise<ProbeQueue> {
	void options.projectRoot;
	const manifest = await readCurrentEpochManifest(options.auditRoot);
	const epochDirectory = join(options.auditRoot, "epochs", manifest.epochId);
	const [matrix, profiles, definitions] = await Promise.all([
		readFile(join(epochDirectory, "behavior-risk-matrix.md"), "utf8"),
		readProfiles(epochDirectory),
		readDefinitions(epochDirectory),
	]);
	const queue = deriveProbeQueue({
		epochId: manifest.epochId,
		portfolio: parsePortfolioEvidenceDocument(matrix),
		profiles,
		definitions,
	});
	await writeJsonAtomic(join(epochDirectory, "probe-queue.json"), queue);
	const existing = await readProbeRecords(epochDirectory);
	for (const entry of queue.entries) {
		if (
			entry.definition ||
			existing.some((record) => record.probeId === entry.id)
		)
			continue;
		existing.push({
			schemaVersion: 1,
			epochId: manifest.epochId,
			probeId: entry.id,
			inventoryId: entry.inventoryId,
			profileIds: entry.profileIds,
			outcome: "unassessed",
			basis: "blocked",
			triggers: entry.triggers,
			limitation: entry.limitation ?? "probe definition is unavailable",
			recordedAt: new Date().toISOString(),
		});
	}
	await writeProbeRecords(epochDirectory, existing);
	return queue;
}

export async function runConfirmedProbe(options: {
	readonly auditRoot: string;
	readonly projectRoot: string;
	readonly confirmation: string;
	readonly printPlan?: (message: string) => void;
}): Promise<ProbeRecord> {
	const queue = await prepareProbeQueue(options);
	const entry = queue.entries.find(
		(candidate) => candidate.id === options.confirmation,
	);
	if (!entry) throw new Error(`unknown probe ID ${options.confirmation}`);
	printProbePlan(entry, options.printPlan ?? console.log);
	if (!entry.definition) {
		const records = await readProbeRecords(
			join(options.auditRoot, "epochs", queue.epochId),
		);
		const limitation = records.find((record) => record.probeId === entry.id);
		if (!limitation)
			throw new Error(`probe ${entry.id} has no limitation record`);
		return limitation;
	}
	const record = await executeProbe({
		projectRoot: options.projectRoot,
		epochId: queue.epochId,
		entry: entry as ProbeQueueEntry & { readonly definition: ProbeDefinition },
	});
	const validation = validateProbeRecord(record);
	if (!validation.valid)
		throw new Error(`invalid probe record: ${validation.issues.join("; ")}`);
	const epochDirectory = join(options.auditRoot, "epochs", queue.epochId);
	const records = (await readProbeRecords(epochDirectory)).filter(
		(candidate) => candidate.probeId !== record.probeId,
	);
	records.push(record);
	await writeProbeRecords(epochDirectory, records);
	await writeBackProbeResult(epochDirectory, record);
	await publishPortfolioEvidence(options.auditRoot);
	return record;
}

async function executeProbe(options: {
	readonly projectRoot: string;
	readonly epochId: string;
	readonly entry: ProbeQueueEntry & { readonly definition: ProbeDefinition };
}): Promise<ExecutedProbeRecord> {
	const definition = options.entry.definition;
	const sourceTarget = resolveProjectPath(
		options.projectRoot,
		definition.targetPath,
	);
	const statusBefore = await gitStatus(options.projectRoot);
	const sourceDigestBefore = await digestFile(sourceTarget);
	const trackedFiles = await gitTrackedFiles(options.projectRoot);
	const sandbox = await realpath(
		await mkdtemp(join(tmpdir(), `cosmonauts-${options.entry.id}-`)),
	);
	try {
		await seedSandbox({
			projectRoot: options.projectRoot,
			sandbox,
			trackedFiles,
			untrackedAllowlist: definition.untrackedAllowlist,
		});
		await execFileAsync("git", ["init", "--quiet"], { cwd: sandbox });
		const repositoryRoot = (
			await execFileAsync("git", ["rev-parse", "--show-toplevel"], {
				cwd: sandbox,
			})
		).stdout.trim();
		if ((await realpath(repositoryRoot)) !== (await realpath(sandbox)))
			throw new Error("sandbox repository root identity is unproven");
		const sourceNodeModules = await realpath(
			join(options.projectRoot, "node_modules"),
		);
		const sandboxNodeModules = join(sandbox, "node_modules");
		await symlink(sourceNodeModules, sandboxNodeModules, "dir");
		const configWrapper = join(
			sandbox,
			".cosmonauts-probe",
			"vitest.config.ts",
		);
		const cacheDir = join(sandbox, ".cosmonauts-probe", "cache", "vitest");
		await mkdir(dirname(configWrapper), { recursive: true });
		const configImport = relative(
			dirname(configWrapper),
			join(sandbox, definition.configPath),
		);
		await writeFile(
			configWrapper,
			`import base from ${JSON.stringify(configImport.startsWith(".") ? configImport : `./${configImport}`)};\nexport default { ...base, cacheDir: ${JSON.stringify(cacheDir)} };\n`,
		);
		const target = await containedRealpath(
			sandbox,
			join(sandbox, definition.targetPath),
		);
		const resolvedImport = await containedRealpath(
			sandbox,
			join(sandbox, definition.resolvedImportPath),
		);
		const test = await containedRealpath(
			sandbox,
			join(sandbox, definition.testPath),
		);
		const config = await containedRealpath(sandbox, configWrapper);
		const setup = await containedRealpath(
			sandbox,
			join(sandbox, definition.setupPath),
		);
		const cwd = await containedRealpath(sandbox, sandbox);
		if (target !== resolvedImport)
			throw new Error(
				"declared import route does not resolve to mutation target",
			);
		if (
			!(await readFile(test, "utf8")).includes(definition.declaredImportRoute)
		)
			throw new Error(
				"declared import route is absent from selected test module",
			);
		const originalTarget = await readFile(target, "utf8");
		const mutatedTarget = replaceExactlyOnce(
			originalTarget,
			definition.mutation.find,
			definition.mutation.replace,
		);
		const targetDigestBefore = digest(originalTarget);
		const preMutation = await runVitestSelection({
			sandbox,
			config,
			definition,
		});
		if (preMutation.state !== "green")
			throw new Error(
				`pre-mutation selected declaration was not green: ${preMutation.output.slice(-4_000)}`,
			);
		let mutated: ProbeRunObservation & { readonly output: string };
		try {
			await writeFile(target, mutatedTarget);
			mutated = await runVitestSelection({ sandbox, config, definition });
		} finally {
			await writeFile(target, originalTarget);
		}
		const restored = await runVitestSelection({ sandbox, config, definition });
		const expectedFailureObserved =
			mutated.failedDeclarations.includes(definition.testDeclaration) &&
			new RegExp(definition.expectedFailurePattern, "u").test(mutated.output);
		const targetDigestAfter = await digestFile(target);
		const statusAfter = await gitStatus(options.projectRoot);
		const sourceDigestAfter = await digestFile(sourceTarget);
		if (
			statusAfter !== statusBefore ||
			sourceDigestAfter !== sourceDigestBefore
		)
			throw new Error("source checkout changed during copied probe");
		const outcome =
			mutated.state === "red" &&
			expectedFailureObserved &&
			restored.state === "green"
				? "probe-confirmed"
				: "probe-survived";
		return {
			schemaVersion: 1,
			epochId: options.epochId,
			probeId: options.entry.id,
			inventoryId: options.entry.inventoryId,
			profileId: definition.profileId,
			outcome,
			basis: outcome === "probe-confirmed" ? "probe-confirmed" : "reasoned",
			triggers: options.entry.triggers,
			guardrail: definition.guardrail,
			defect: definition.defect,
			mutation: `${definition.mutation.find} => ${definition.mutation.replace}`,
			doubles: { contributing: false, detail: definition.doubles },
			sandbox: {
				root: sandbox,
				cwd,
				workingRepository: true,
				trackedFiles,
				untrackedAllowlist: definition.untrackedAllowlist,
				nodeModules: sandboxNodeModules,
				cacheDir,
			},
			paths: { target, importRoute: resolvedImport, config, setup, test },
			testSelection: {
				file: definition.testPath,
				line: definition.testLine,
				declaration: definition.testDeclaration,
			},
			runs: {
				preMutation: stripOutput(preMutation),
				mutated: { ...stripOutput(mutated), expectedFailureObserved },
				restored: stripOutput(restored),
			},
			targetIdentity: {
				before: targetDigestBefore,
				afterRestore: targetDigestAfter,
			},
			sourceCheckout: {
				statusBefore,
				statusAfter,
				targetDigestBefore: sourceDigestBefore,
				targetDigestAfter: sourceDigestAfter,
			},
			recordedAt: new Date().toISOString(),
		};
	} finally {
		await rm(sandbox, { recursive: true, force: true });
	}
}

async function runVitestSelection(options: {
	readonly sandbox: string;
	readonly config: string;
	readonly definition: ProbeDefinition;
}): Promise<ProbeRunObservation & { readonly output: string }> {
	const outputFile = join(
		options.sandbox,
		".cosmonauts-probe",
		`result-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
	);
	let output = "";
	try {
		const executed = await execFileAsync(
			"node",
			[
				"node_modules/vitest/vitest.mjs",
				"run",
				options.definition.testPath,
				"--testNamePattern",
				`^${escapeRegularExpression(options.definition.testDeclaration)}$`,
				"--config",
				options.config,
				"--reporter=json",
				`--outputFile=${outputFile}`,
				"--no-cache",
			],
			{ cwd: options.sandbox, maxBuffer: 16 * 1024 * 1024 },
		);
		output = `${executed.stdout}\n${executed.stderr}`;
	} catch (error) {
		const failed = error as { stdout?: string; stderr?: string };
		output = `${failed.stdout ?? ""}\n${failed.stderr ?? ""}`;
	}
	let report: unknown;
	try {
		report = JSON.parse(await readFile(outputFile, "utf8")) as unknown;
	} catch {
		return { state: "red", failedDeclarations: [], output };
	}
	const exactlyOneDeclarationRan =
		isRecord(report) &&
		Number(report.numPassedTests ?? 0) + Number(report.numFailedTests ?? 0) ===
			1;
	return {
		state:
			isRecord(report) && report.success === true && exactlyOneDeclarationRan
				? "green"
				: "red",
		failedDeclarations: collectFailedDeclarations(report),
		output: `${output}\n${JSON.stringify(report)}`,
	};
}

async function writeBackProbeResult(
	epochDirectory: string,
	record: ExecutedProbeRecord,
): Promise<void> {
	const queue = JSON.parse(
		await readFile(join(epochDirectory, "work-units.json"), "utf8"),
	) as { units: Array<{ id: string }> };
	for (const unit of queue.units) {
		const path = join(epochDirectory, "profiles", `${unit.id}.ndjson`);
		const records = (await readFile(path, "utf8"))
			.trim()
			.split(/\r?\n/u)
			.map((line) => JSON.parse(line) as unknown);
		const index = records.findIndex(
			(value) => isRecord(value) && value.id === record.profileId,
		);
		if (index < 0) continue;
		const profile = records[index] as TestEvidenceProfile;
		const evidence: EvidenceRef = {
			kind: "probe-record",
			path: relative(process.cwd(), join(epochDirectory, "probes.jsonl")),
			locator: record.probeId,
		};
		const priorAssessor = profile.dimensions.faultSensitivity.assessor;
		const assessor = {
			kind: "agent" as const,
			id: "codex-drive-task-TASK-699",
			model: "openai-codex",
			modelVersion: "gpt-5.6",
			assessedAt: record.recordedAt,
			consultedAuthorities:
				priorAssessor.kind === "agent"
					? priorAssessor.consultedAuthorities
					: [],
		};
		const conclusion: FaultSensitivityConclusion = record.outcome;
		const previousFault = profile.dimensions.faultSensitivity;
		const faultSensitivity: AssessedValue<FaultSensitivityConclusion> = {
			value: conclusion,
			lane: "agent-assessed-judgment",
			basis:
				record.outcome === "probe-confirmed" ? "probe-confirmed" : "reasoned",
			assessor,
			evidence: [evidence],
			counterevidence: [],
			uncertainty:
				record.outcome === "probe-confirmed"
					? []
					: [
							"The realistic copied-sandbox defect survived the claimed guardrail.",
						],
			overrides: [
				...previousFault.overrides,
				{
					previousDigest: digest(JSON.stringify(previousFault)),
					reason: `Targeted copied-sandbox probe ${record.probeId} completed.`,
					assessor: assessor.id,
					at: record.recordedAt,
				},
			],
		};
		const previousContributions = profile.portfolioContributions;
		const contributions: AssessedValue<readonly PortfolioContribution[]> = {
			...previousContributions,
			basis:
				record.outcome === "probe-confirmed" ? "probe-confirmed" : "reasoned",
			assessor,
			evidence: uniqueEvidence([...previousContributions.evidence, evidence]),
			uncertainty:
				record.outcome === "probe-confirmed"
					? previousContributions.uncertainty.filter(
							(item) => !/probe/iu.test(item),
						)
					: unique([
							...previousContributions.uncertainty,
							"The targeted defect survived and cannot contribute protection.",
						]),
			overrides: [
				...previousContributions.overrides,
				{
					previousDigest: digest(JSON.stringify(previousContributions)),
					reason: `Portfolio contribution revalidated from ${record.probeId}.`,
					assessor: assessor.id,
					at: record.recordedAt,
				},
			],
		};
		const updated: TestEvidenceProfile = {
			...profile,
			dimensions: { ...profile.dimensions, faultSensitivity },
			portfolioContributions: contributions,
		};
		const validation = validateTestEvidenceProfile(updated);
		if (!validation.valid)
			throw new Error(
				`probe write-back invalidated ${record.profileId}: ${validation.issues.join("; ")}`,
			);
		records[index] = updated;
		await writeTextAtomic(
			path,
			`${records.map((value) => JSON.stringify(value)).join("\n")}\n`,
		);
		if (record.outcome === "probe-survived")
			await appendRemediationRow(epochDirectory, record);
		return;
	}
	throw new Error(
		`probe profile ${record.profileId} is absent from current epoch`,
	);
}

async function appendRemediationRow(
	epochDirectory: string,
	record: ExecutedProbeRecord,
): Promise<void> {
	const path = join(epochDirectory, "remediation-ledger.md");
	let current = "# Remediation ledger\n\n";
	try {
		current = await readFile(path, "utf8");
	} catch {}
	if (current.includes(record.probeId)) return;
	await writeTextAtomic(
		path,
		`${current.trimEnd()}\n\n- Open: ${record.probeId} survived ${record.defect}; affected profile ${record.profileId}.\n`,
	);
}

async function seedSandbox(options: {
	readonly projectRoot: string;
	readonly sandbox: string;
	readonly trackedFiles: readonly string[];
	readonly untrackedAllowlist: readonly string[];
}): Promise<void> {
	for (const path of [...options.trackedFiles, ...options.untrackedAllowlist]) {
		const source = resolveProjectPath(options.projectRoot, path);
		const target = resolveProjectPath(options.sandbox, path);
		await mkdir(dirname(target), { recursive: true });
		const stats = await lstat(source);
		if (stats.isDirectory()) await cp(source, target, { recursive: true });
		else await cp(source, target);
	}
}

async function readDefinitions(
	epochDirectory: string,
): Promise<Readonly<Record<string, ProbeDefinition>>> {
	try {
		const input = JSON.parse(
			await readFile(join(epochDirectory, "probe-definitions.json"), "utf8"),
		) as { definitions?: Record<string, ProbeDefinition> };
		return input.definitions ?? {};
	} catch (error) {
		if (isMissing(error)) return {};
		throw error;
	}
}

async function readProfiles(
	epochDirectory: string,
): Promise<TestEvidenceProfile[]> {
	const queue = JSON.parse(
		await readFile(join(epochDirectory, "work-units.json"), "utf8"),
	) as { units: Array<{ id: string }> };
	const profiles: TestEvidenceProfile[] = [];
	for (const unit of queue.units) {
		const lines = (
			await readFile(
				join(epochDirectory, "profiles", `${unit.id}.ndjson`),
				"utf8",
			)
		)
			.trim()
			.split(/\r?\n/u)
			.slice(1);
		profiles.push(
			...lines.map((line) => JSON.parse(line) as TestEvidenceProfile),
		);
	}
	return profiles;
}

async function readProbeRecords(
	epochDirectory: string,
): Promise<ProbeRecord[]> {
	try {
		return (await readFile(join(epochDirectory, "probes.jsonl"), "utf8"))
			.trim()
			.split(/\r?\n/u)
			.filter(Boolean)
			.map((line) => JSON.parse(line) as ProbeRecord);
	} catch (error) {
		if (isMissing(error)) return [];
		throw error;
	}
}

async function writeProbeRecords(
	epochDirectory: string,
	records: readonly ProbeRecord[],
): Promise<void> {
	const ordered = [...records].sort((left, right) =>
		left.probeId.localeCompare(right.probeId),
	);
	for (const record of ordered) {
		const validation = validateProbeRecord(record);
		if (!validation.valid)
			throw new Error(`${record.probeId}: ${validation.issues.join("; ")}`);
	}
	await writeTextAtomic(
		join(epochDirectory, "probes.jsonl"),
		`${ordered.map((record) => JSON.stringify(record)).join("\n")}\n`,
	);
	const rows = ordered.map((record) =>
		"limitation" in record
			? `| ${record.probeId} | ${record.inventoryId} | ${record.outcome} | ${markdown(record.limitation)} |`
			: `| ${record.probeId} | ${record.inventoryId} | ${record.outcome} | ${markdown(record.guardrail)} |`,
	);
	await writeTextAtomic(
		join(epochDirectory, "probes.md"),
		`# Targeted probes\n\n| Probe | Inventory | Outcome | Evidence or limitation |\n|---|---|---|---|\n${rows.join("\n")}\n`,
	);
}

function printProbePlan(
	entry: ProbeQueueEntry,
	print: (message: string) => void,
): void {
	const definition = entry.definition;
	print(
		[
			`Probe: ${entry.id}`,
			`Sandbox: fresh copy seeded from tracked files plus [${definition?.untrackedAllowlist.join(", ") ?? ""}]`,
			`Target/import route: ${definition ? `${definition.targetPath} via ${definition.declaredImportRoute}` : "unprovable"}`,
			`Config/setup: ${definition ? `${definition.configPath}; ${definition.setupPath}` : "unprovable"}`,
			`Test selection: ${definition ? `${definition.testPath}:${definition.testLine} (${definition.testDeclaration})` : "none"}`,
			`Guardrail: ${definition?.guardrail ?? "unassessed"}`,
			`Mutation: ${definition?.defect ?? entry.limitation ?? "unassessed"}`,
		].join("\n"),
	);
}

function collectFailedDeclarations(input: unknown): string[] {
	if (!isRecord(input) || !Array.isArray(input.testResults)) return [];
	return input.testResults.flatMap((file) => {
		if (!isRecord(file) || !Array.isArray(file.assertionResults)) return [];
		return file.assertionResults.flatMap((assertion) =>
			isRecord(assertion) &&
			assertion.status === "failed" &&
			nonEmpty(assertion.fullName)
				? [assertion.fullName]
				: [],
		);
	});
}

function stripOutput(
	observation: ProbeRunObservation & { readonly output?: string },
): ProbeRunObservation {
	return {
		state: observation.state,
		failedDeclarations: observation.failedDeclarations,
		...(observation.expectedFailureObserved === undefined
			? {}
			: { expectedFailureObserved: observation.expectedFailureObserved }),
	};
}

function replaceExactlyOnce(
	source: string,
	find: string,
	replacement: string,
): string {
	const first = source.indexOf(find);
	if (first < 0 || source.indexOf(find, first + find.length) >= 0)
		throw new Error("probe mutation target must occur exactly once");
	return `${source.slice(0, first)}${replacement}${source.slice(first + find.length)}`;
}

function escapeRegularExpression(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

async function gitTrackedFiles(root: string): Promise<string[]> {
	const { stdout } = await execFileAsync("git", ["ls-files", "-z"], {
		cwd: root,
		encoding: "buffer",
		maxBuffer: 16 * 1024 * 1024,
	});
	return stdout.toString("utf8").split("\0").filter(Boolean).sort();
}

async function gitStatus(root: string): Promise<string> {
	return (
		await execFileAsync(
			"git",
			["status", "--porcelain=v1", "--untracked-files=all"],
			{ cwd: root, maxBuffer: 32 * 1024 * 1024 },
		)
	).stdout;
}

async function containedRealpath(root: string, path: string): Promise<string> {
	const [realRoot, realPath] = await Promise.all([
		realpath(root),
		realpath(path),
	]);
	if (!containedPath(realRoot, realPath))
		throw new Error(`${path} resolves outside copied probe sandbox`);
	return realPath;
}

function containedPath(root: unknown, path: unknown): boolean {
	if (
		!nonEmpty(root) ||
		!nonEmpty(path) ||
		!isAbsolute(root) ||
		!isAbsolute(path)
	)
		return false;
	const relation = relative(resolve(root), resolve(path));
	return (
		relation === "" || (!relation.startsWith(`..${sep}`) && relation !== "..")
	);
}

function resolveProjectPath(root: string, path: string): string {
	const resolved = resolve(root, path);
	if (!containedPath(resolve(root), resolved))
		throw new Error(`path escapes project root: ${path}`);
	return resolved;
}

async function digestFile(path: string): Promise<string> {
	return digest(await readFile(path));
}

function digest(value: string | Buffer): string {
	return createHash("sha256").update(value).digest("hex");
}

function unique<T>(values: readonly T[]): T[] {
	return [...new Set(values)];
}

function uniqueEvidence<T extends { kind: string; path: string }>(
	values: readonly T[],
): T[] {
	const seen = new Set<string>();
	return values.filter((value) => {
		const key = JSON.stringify(value);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function stringArray(value: unknown): string[] | undefined {
	return Array.isArray(value) && value.every(nonEmpty) ? value : undefined;
}

function nonEmpty(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissing(error: unknown): boolean {
	return isRecord(error) && error.code === "ENOENT";
}

function result(issues: readonly string[]) {
	return { valid: issues.length === 0, issues };
}

function invalid(issue: string) {
	return { valid: false, issues: [issue] };
}

function markdown(value: string): string {
	return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
	await writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeTextAtomic(path: string, value: string): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const temporary = `${path}.${process.pid}.tmp`;
	await writeFile(temporary, value, { flag: "wx" });
	await rename(temporary, path);
}
