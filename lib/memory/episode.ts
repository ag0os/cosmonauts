import { join } from "node:path";
import {
	loadProjectConfig,
	resolveEpisodicLogConfig,
} from "../config/loader.ts";
import type { ProjectConfig } from "../config/types.ts";
import { createEpisodeRecord, type EpisodeEvent } from "./episodic-records.ts";
import { createMarkdownMemoryStore } from "./markdown-store.ts";
import type { MemoryStore, MemoryWarning } from "./types.ts";

const MAX_WARNING_MESSAGE_LENGTH = 500;
const MAX_WARNING_PATH_LENGTH = 500;

export type EpisodeCaptureResult =
	| { readonly kind: "disabled" }
	| { readonly kind: "recorded"; readonly path: string }
	| { readonly kind: "warning"; readonly warning: MemoryWarning };

export type EpisodeWarningReporter = (
	warning: MemoryWarning,
) => void | Promise<void>;

export interface EpisodeStoreFactoryOptions {
	readonly projectRoot: string;
	readonly userCosmonautsRoot?: string;
	readonly episodeWarningThreshold: number;
}

export interface EpisodeCaptureDependencies {
	readonly loadConfig: (projectRoot: string) => Promise<ProjectConfig>;
	readonly createStore: (options: EpisodeStoreFactoryOptions) => MemoryStore;
	readonly now: () => Date;
	readonly writeStderr: (message: string) => void;
}

export interface RecordEpisodeOptions {
	readonly projectRoot: string;
	readonly event: EpisodeEvent;
	readonly userCosmonautsRoot?: string;
	readonly reportWarning?: EpisodeWarningReporter;
	readonly dependencies?: Partial<EpisodeCaptureDependencies>;
}

const DEFAULT_DEPENDENCIES: EpisodeCaptureDependencies = {
	loadConfig: loadProjectConfig,
	createStore: (options) => createMarkdownMemoryStore(options),
	now: () => new Date(),
	writeStderr: (message) => {
		process.stderr.write(`${message}\n`);
	},
};

export async function recordEpisode(
	options: RecordEpisodeOptions,
): Promise<EpisodeCaptureResult> {
	const dependencies = { ...DEFAULT_DEPENDENCIES, ...options.dependencies };

	let config: ProjectConfig;
	try {
		config = await dependencies.loadConfig(options.projectRoot);
	} catch (error: unknown) {
		return reportCaptureWarning({
			options,
			dependencies,
			path: join(options.projectRoot, ".cosmonauts", "config.json"),
			reason: errorReason(error),
		});
	}

	const settings = resolveEpisodicLogConfig(config);
	if (!settings.enabled) return { kind: "disabled" };

	let store: MemoryStore;
	try {
		store = dependencies.createStore({
			projectRoot: options.projectRoot,
			userCosmonautsRoot: options.userCosmonautsRoot,
			episodeWarningThreshold: settings.warningThreshold,
		});
	} catch (error: unknown) {
		return reportCaptureWarning({
			options,
			dependencies,
			reason: errorReason(error),
		});
	}

	try {
		const timestamp =
			options.event.timestamp ?? dependencies.now().toISOString();
		const result = await store.write(
			createEpisodeRecord(options.event, timestamp),
		);
		if (result.kind === "written") {
			return { kind: "recorded", path: result.path };
		}
		return reportCaptureWarning({
			options,
			dependencies,
			...(result.kind === "failed" && result.path ? { path: result.path } : {}),
			reason: result.reason,
		});
	} catch (error: unknown) {
		return reportCaptureWarning({
			options,
			dependencies,
			reason: errorReason(error),
		});
	}
}

async function reportCaptureWarning(options: {
	readonly options: RecordEpisodeOptions;
	readonly dependencies: EpisodeCaptureDependencies;
	readonly path?: string;
	readonly reason: string;
}): Promise<EpisodeCaptureResult> {
	const warning: MemoryWarning = {
		...(options.path
			? { path: clamp(options.path, MAX_WARNING_PATH_LENGTH) }
			: {}),
		message: clamp(
			`Episode capture skipped: ${options.reason || "Unknown failure."}`,
			MAX_WARNING_MESSAGE_LENGTH,
		),
	};

	if (options.options.reportWarning) {
		try {
			await options.options.reportWarning(warning);
			return { kind: "warning", warning };
		} catch {
			// The primary warning still falls through to stderr.
		}
	}

	const location = warning.path ? `${warning.path}: ` : "";
	try {
		options.dependencies.writeStderr(`[warning] ${location}${warning.message}`);
	} catch {
		// Capture and warning delivery are both non-load-bearing.
	}
	return { kind: "warning", warning };
}

function errorReason(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

function clamp(value: string, maxLength: number): string {
	if (value.length <= maxLength) return value;
	return `${value.slice(0, maxLength - 1)}…`;
}
