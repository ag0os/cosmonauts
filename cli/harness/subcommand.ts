/** CLI subcommand: `cosmonauts harness sync`. */

import { homedir } from "node:os";
import { Command, Option } from "commander";
import {
	createCosmonautsInventoryGeneratedNode,
	prepareSkillExportAssets,
} from "../../lib/harness-adapters/inventory.ts";
import {
	listImplementedHarnessTargetIds,
	listStaticHarnessAssets,
} from "../../lib/harness-adapters/registry.ts";
import type {
	HarnessScope,
	HarnessTargetId,
	MaterializedAssetKind,
	SyncMode,
	SyncRequest,
} from "../../lib/harness-adapters/types.ts";
import {
	type HarnessSyncOptions,
	type HarnessSyncReport,
	type HarnessSyncReportRow,
	runHarnessSync,
} from "../../lib/skills/exporter.ts";
import { getOutputMode, printJson, printLines } from "../shared/output.ts";
import {
	discoverRuntimeSkillExports,
	type RuntimeSkillExportDiscovery,
} from "../skills/subcommand.ts";

interface HarnessProgramDependencies {
	readonly projectRoot?: string;
	readonly homeRoot?: string;
	readonly discover?: (
		projectRoot: string,
	) => Promise<RuntimeSkillExportDiscovery>;
	readonly sync?: (options: HarnessSyncOptions) => Promise<HarnessSyncReport>;
}

interface HarnessSyncCliOptions {
	readonly target: readonly string[];
	readonly scope: readonly string[];
	readonly kind: readonly string[];
	readonly asset: readonly string[];
	readonly copy?: boolean;
	readonly link?: boolean;
	readonly check?: boolean;
	readonly forgetRemoved: readonly string[];
	readonly transferOwner?: string;
}

export function createHarnessProgram(
	dependencies: HarnessProgramDependencies = {},
): Command {
	const program = new Command();
	program
		.name("cosmonauts harness")
		.description("Synchronize external harness assets")
		.option("--json", "Output the complete sync report as JSON")
		.option("--plain", "Output tab-separated sync report rows");

	const sync = program
		.command("sync")
		.description("Synchronize skills and commands through the harness registry")
		.option(
			"--target <id>",
			"Target harness (repeatable: claude, codex)",
			collect,
			[],
		)
		.option(
			"--scope <scope>",
			"Scope override (repeatable: project, personal)",
			collect,
			[],
		)
		.option(
			"--kind <kind>",
			"Asset kind (repeatable: skill, command)",
			collect,
			[],
		)
		.option("--asset <assetId>", "Asset ID (repeatable)", collect, [])
		.addOption(new Option("--copy", "Request copy mode").conflicts("link"))
		.addOption(
			new Option("--link", "Request local-link mode").conflicts("copy"),
		)
		.option("--check", "Report drift without materializing or transacting")
		.option(
			"--forget-removed <assetId>",
			"Forget a removed managed asset without changing its target (repeatable)",
			collect,
			[],
		)
		.option(
			"--transfer-owner <ownerId>",
			"Transfer explicitly selected project-owned manifest entries",
		);

	sync.action(async (raw: HarnessSyncCliOptions) => {
		try {
			const request = parseSyncRequest(raw);
			const projectRoot = dependencies.projectRoot ?? process.cwd();
			const homeRoot = dependencies.homeRoot ?? homedir();
			const discovery = await (
				dependencies.discover ??
				((root: string) => discoverRuntimeSkillExports({}, root))
			)(projectRoot);
			const staticAssets = listStaticHarnessAssets();
			const prepared = prepareSkillExportAssets({
				...discovery,
				staticAssets,
			});
			const selectedAssetIds = new Set(request.assetIds ?? []);
			const relevantCollisions = prepared.collisions.filter((collision) =>
				collision.claims.some(
					(claim) =>
						selectedAssetIds.size === 0 || selectedAssetIds.has(claim.assetId),
				),
			);
			if (relevantCollisions.length > 0) {
				throw new Error(
					`Skill output collisions: ${relevantCollisions
						.map((collision) => collision.outputIdentity)
						.join(", ")}.`,
				);
			}
			const assets = [
				...prepared.assets,
				...staticAssets.filter((asset) => asset.kind === "command"),
			];
			if (request.assetIds) {
				const known = new Set(assets.map((asset) => asset.assetId));
				const unknown = request.assetIds.filter(
					(assetId) => !known.has(assetId),
				);
				if (unknown.length > 0) {
					throw new Error(`Unknown harness assets: ${unknown.join(", ")}.`);
				}
			}
			const sourceHealth = [
				...discovery.sourceHealth,
				{
					sourceRootId: "cosmonauts:package",
					sourceRoot: process.cwd(),
					domain: "cosmonauts",
					status: "complete" as const,
					issues: [],
				},
			];
			const report = await (dependencies.sync ?? runHarnessSync)({
				projectRoot,
				homeRoot,
				assets,
				sourceHealth,
				request,
				...(discovery.runtimeInventory
					? {
							generatedNodesByAssetId: {
								"external-skill:cosmonauts": [
									createCosmonautsInventoryGeneratedNode(
										discovery.runtimeInventory,
									),
								],
							},
						}
					: {}),
			});
			renderHarnessReport(report, getOutputMode(program.opts()));
			if (report.exitCode !== 0) process.exitCode = 1;
		} catch (error) {
			console.error(`Error syncing harness assets: ${errorMessage(error)}`);
			process.exitCode = 1;
		}
	});

	return program;
}

export function parseSyncRequest(options: HarnessSyncCliOptions): SyncRequest {
	const targetIds = parseValues(
		options.target,
		listImplementedHarnessTargetIds(),
		"target",
	) as HarnessTargetId[];
	const scopes = parseValues(
		options.scope,
		["project", "personal"],
		"scope",
	) as HarnessScope[];
	const kinds = parseValues(
		options.kind,
		["skill", "command"],
		"kind",
	) as MaterializedAssetKind[];
	const assetIds = deduplicate(options.asset);
	const forgetIds = deduplicate(options.forgetRemoved);
	const requestedMode: SyncMode | undefined = options.copy
		? "copy"
		: options.link
			? "link"
			: undefined;
	if (
		forgetIds.length > 0 &&
		(options.check ||
			requestedMode ||
			assetIds.length > 0 ||
			options.transferOwner)
	) {
		throw new Error(
			"--forget-removed cannot combine with --check, --copy, --link, --asset, or --transfer-owner.",
		);
	}
	if (
		options.transferOwner &&
		(options.check || requestedMode || forgetIds.length > 0)
	) {
		throw new Error(
			"--transfer-owner cannot combine with --check, --copy, --link, or --forget-removed.",
		);
	}
	if (options.transferOwner && assetIds.length === 0) {
		throw new Error("--transfer-owner requires at least one explicit --asset.");
	}
	return {
		...(targetIds.length ? { targetIds } : {}),
		...(scopes.length ? { scopes } : {}),
		...(kinds.length ? { kinds } : {}),
		...(assetIds.length ? { assetIds } : {}),
		...(requestedMode ? { requestedMode } : {}),
		reconciliation: assetIds.length > 0 ? "partial" : "complete",
		check: options.check ?? false,
		...(forgetIds.length ? { forgetRemovedAssetIds: forgetIds } : {}),
		...(options.transferOwner
			? {
					transferOwner: {
						oldOwnerId: options.transferOwner,
						assetIds,
					},
				}
			: {}),
	};
}

export function renderHarnessReport(
	report: HarnessSyncReport,
	mode: "json" | "plain" | "human",
): void {
	if (mode === "json") {
		printJson(report);
		return;
	}
	if (mode === "plain") {
		printLines(report.rows.map(renderPlainRow));
		return;
	}
	if (report.rows.length === 0) {
		printLines(["No harness assets selected."]);
		return;
	}
	printLines(
		report.rows.flatMap((row) => [
			`${row.target}/${row.scope} ${row.kind} ${row.asset}: ${row.before} (${row.reason}) → ${row.action} → ${row.final}`,
			`  owner=${row.owner.kind}:${row.owner.ownerId} source=${row.source} target=${row.targetPath} mode=${row.recordedMode ?? "unmanaged"}/${row.requestedMode}`,
			...(row.recovery ? [`  recovery=${JSON.stringify(row.recovery)}`] : []),
			...(row.evidence ? [`  evidence=${row.evidence}`] : []),
			...(row.discovery.length
				? [`  discovery=${row.discovery.join(" | ")}`]
				: []),
			...(row.releaseWarning ? [`  warning=${row.releaseWarning}`] : []),
		]),
	);
}

function renderPlainRow(row: HarnessSyncReportRow): string {
	return [
		`${row.owner.kind}:${row.owner.ownerId}`,
		row.ownerDiagnostics.join("|"),
		row.target,
		row.scope,
		row.kind,
		row.asset,
		row.source,
		row.targetPath,
		row.recordedMode ?? "",
		row.requestedMode,
		row.before,
		row.reason,
		row.action,
		row.final,
		row.recovery ? JSON.stringify(row.recovery) : "",
		row.evidence ?? "",
		row.discovery.join("|"),
		row.releaseWarning ?? "",
	].join("\t");
}

function collect(value: string, previous: readonly string[]): string[] {
	return [...previous, value];
}

function parseValues(
	values: readonly string[],
	allowed: readonly string[],
	label: string,
): string[] {
	const unique = deduplicate(values);
	const invalid = unique.filter((value) => !allowed.includes(value));
	if (invalid.length > 0) {
		throw new Error(
			`Invalid harness ${label}: ${invalid.join(", ")}. Must be one of: ${allowed.join(", ")}.`,
		);
	}
	return unique;
}

function deduplicate<T>(values: readonly T[]): T[] {
	return [...new Set(values)];
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
