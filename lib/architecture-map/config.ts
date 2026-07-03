import { access, realpath } from "node:fs/promises";
import {
	isAbsolute,
	join,
	normalize,
	relative,
	resolve,
	sep,
	win32,
} from "node:path";
import { loadProjectConfig } from "../config/index.ts";
import type { ProjectConfig } from "../config/types.ts";
import type { ArchitectureMapConfig } from "./types.ts";
import { ARCHITECTURE_MAP_OUTPUT_DIR } from "./types.ts";

interface Logger {
	error(message?: unknown, ...optionalParams: unknown[]): void;
}

export interface ResolveArchitectureMapConfigOptions {
	readonly projectRoot: string;
	readonly projectConfig?: ProjectConfig;
	readonly overrides?: Partial<ArchitectureMapConfig>;
	readonly logger?: Logger;
}

type MutableArchitectureMapConfig = {
	-readonly [K in keyof ArchitectureMapConfig]: ArchitectureMapConfig[K];
};

const DEFAULT_SOURCE_ROOTS = [
	"src",
	"lib",
	"cli",
	"domains",
	"bundled",
	"packages",
] as const;

const DEFAULT_EXCLUDE = [
	"node_modules",
	".git",
	"dist",
	"build",
	"coverage",
	"missions",
	"memory",
	".cosmonauts",
] as const;

const DEFAULT_INJECTION_MAX_BYTES = 24_000;
const DEFAULT_MAX_MODULES_PER_RUN = 20;

export async function loadArchitectureMapConfig(
	projectRoot: string,
): Promise<ArchitectureMapConfig> {
	const projectConfig = await loadProjectConfig(projectRoot);
	return resolveArchitectureMapConfig({ projectRoot, projectConfig });
}

export async function resolveArchitectureMapConfig(
	options: ResolveArchitectureMapConfigOptions,
): Promise<ArchitectureMapConfig> {
	const logger = options.logger ?? console;
	const projectConfig = options.projectConfig?.architectureMap;
	const overrideConfig = options.overrides;

	const defaultSourceRoots = await existingDefaultSourceRoots(
		options.projectRoot,
	);
	const configuredSourceRoots =
		overrideConfig?.sourceRoots ?? projectConfig?.sourceRoots;
	const configuredModuleRoots =
		overrideConfig?.moduleRoots ?? projectConfig?.moduleRoots;
	const configuredExclude = [
		...DEFAULT_EXCLUDE,
		...(projectConfig?.exclude ?? []),
		...(overrideConfig?.exclude ?? []),
	];

	const sourceRoots = configuredSourceRoots
		? await validateSafeRelativePaths({
				projectRoot: options.projectRoot,
				values: configuredSourceRoots,
				fieldName: "architectureMap.sourceRoots",
				logger,
			})
		: defaultSourceRoots;

	const moduleRoots = configuredModuleRoots
		? await validateSafeRelativePaths({
				projectRoot: options.projectRoot,
				values: configuredModuleRoots,
				fieldName: "architectureMap.moduleRoots",
				logger,
			})
		: undefined;

	const exclude = await validateSafeRelativePaths({
		projectRoot: options.projectRoot,
		values: configuredExclude,
		fieldName: "architectureMap.exclude",
		logger,
		allowMissing: true,
	});

	const config: MutableArchitectureMapConfig = {
		outputDir: ARCHITECTURE_MAP_OUTPUT_DIR,
		sourceRoots: sourceRoots.length > 0 ? sourceRoots : defaultSourceRoots,
		exclude,
		injectionMaxBytes: coercePositiveInteger(
			overrideConfig?.injectionMaxBytes ??
				projectConfig?.injectionMaxBytes ??
				DEFAULT_INJECTION_MAX_BYTES,
			DEFAULT_INJECTION_MAX_BYTES,
			"architectureMap.injectionMaxBytes",
			logger,
		),
		narrative: {
			enabled:
				overrideConfig?.narrative?.enabled ??
				projectConfig?.narrative?.enabled ??
				true,
			maxModulesPerRun: coercePositiveInteger(
				overrideConfig?.narrative?.maxModulesPerRun ??
					projectConfig?.narrative?.maxModulesPerRun ??
					DEFAULT_MAX_MODULES_PER_RUN,
				DEFAULT_MAX_MODULES_PER_RUN,
				"architectureMap.narrative.maxModulesPerRun",
				logger,
			),
		},
	};

	if (moduleRoots && moduleRoots.length > 0) {
		config.moduleRoots = moduleRoots;
	}

	return config;
}

export function canonicalizeArchitectureMapConfig(
	config: ArchitectureMapConfig,
): string {
	const canonical = {
		outputDir: config.outputDir,
		sourceRoots: [...config.sourceRoots].sort(),
		moduleRoots: config.moduleRoots
			? [...config.moduleRoots].sort()
			: undefined,
		exclude: [...config.exclude].sort(),
		injectionMaxBytes: config.injectionMaxBytes,
		narrative: {
			enabled: config.narrative.enabled,
			maxModulesPerRun: config.narrative.maxModulesPerRun,
		},
	};
	return JSON.stringify(canonical);
}

async function existingDefaultSourceRoots(
	projectRoot: string,
): Promise<readonly string[]> {
	const existing: string[] = [];
	for (const root of DEFAULT_SOURCE_ROOTS) {
		try {
			await access(join(projectRoot, root));
			existing.push(root);
		} catch {
			// Missing default roots are normal.
		}
	}
	return existing.length > 0 ? existing : ["."];
}

async function validateSafeRelativePaths(options: {
	readonly projectRoot: string;
	readonly values: readonly string[];
	readonly fieldName: string;
	readonly logger: Logger;
	readonly allowMissing?: boolean;
}): Promise<readonly string[]> {
	const safe: string[] = [];
	const realProjectRoot = await realpath(options.projectRoot).catch(() =>
		resolve(options.projectRoot),
	);

	for (const rawValue of options.values) {
		const normalized = normalizeRelativePath(rawValue);
		if (!normalized) {
			options.logger.error(
				`[warning] Skipping unsafe ${options.fieldName} entry ${JSON.stringify(rawValue)}: expected a non-empty relative path inside the project root.`,
			);
			continue;
		}
		if (isUnsafeRelativePath(rawValue)) {
			options.logger.error(
				`[warning] Skipping unsafe ${options.fieldName} entry ${JSON.stringify(rawValue)}: absolute paths and traversal are not allowed.`,
			);
			continue;
		}

		const resolved = resolve(realProjectRoot, normalized);
		const realResolved = await realpath(resolved).catch(() =>
			options.allowMissing ? resolved : resolved,
		);
		if (!isInsideOrEqual(realProjectRoot, realResolved)) {
			options.logger.error(
				`[warning] Skipping unsafe ${options.fieldName} entry ${JSON.stringify(rawValue)}: resolved path is outside the project root.`,
			);
			continue;
		}

		if (!safe.includes(normalized)) {
			safe.push(normalized);
		}
	}

	return safe;
}

function normalizeRelativePath(value: string): string | undefined {
	const trimmed = value.trim();
	if (trimmed.length === 0) return undefined;
	const normalized = normalize(trimmed).split(sep).join("/");
	if (normalized === ".") return ".";
	return normalized.replace(/\/+$/u, "");
}

function isUnsafeRelativePath(value: string): boolean {
	if (isAbsolute(value) || win32.isAbsolute(value)) return true;
	const parts = value.split(/[\\/]+/u);
	return parts.includes("..");
}

function isInsideOrEqual(root: string, candidate: string): boolean {
	const rel = relative(root, candidate);
	return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function coercePositiveInteger(
	value: number,
	fallback: number,
	fieldName: string,
	logger: Logger,
): number {
	if (Number.isInteger(value) && value > 0) return value;
	logger.error(
		`[warning] Skipping unsafe ${fieldName}: expected a positive integer, got ${JSON.stringify(value)}.`,
	);
	return fallback;
}
