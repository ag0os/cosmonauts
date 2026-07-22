import {
	loadProjectConfig,
	resolveEpisodicLogConfig,
} from "../config/loader.ts";
import {
	type EntityFileLockOptions,
	withEntityFileLock as runWithEntityFileLock,
} from "../entity-file-lock.ts";
import type { EpisodeWarningReporter } from "./episode.ts";
import type { MemoryWarning } from "./types.ts";

const DEFAULT_LOCK_RETRY_DELAY_MS = 25;
const DEFAULT_LOCK_WAIT_TIMEOUT_MS = 1_000;
const MAX_WARNING_MESSAGE_LENGTH = 500;
const MAX_WARNING_PATH_LENGTH = 500;

export interface EpisodeTransitionLockDependencies {
	readonly loadConfig: typeof loadProjectConfig;
	readonly withEntityFileLock: typeof runWithEntityFileLock;
	readonly lockRetryDelayMs: number;
	readonly lockWaitTimeoutMs: number;
	readonly writeStderr: (message: string) => void;
}

export interface EpisodeTransitionLockOptions<T> {
	readonly projectRoot: string;
	readonly lockPath: string;
	readonly hasEpisodeContext: boolean;
	readonly action: () => Promise<T>;
	readonly reportEpisodeWarning?: EpisodeWarningReporter;
	readonly dependencies?: Partial<EpisodeTransitionLockDependencies>;
}

const DEFAULT_DEPENDENCIES: EpisodeTransitionLockDependencies = {
	loadConfig: loadProjectConfig,
	withEntityFileLock: runWithEntityFileLock,
	lockRetryDelayMs: DEFAULT_LOCK_RETRY_DELAY_MS,
	lockWaitTimeoutMs: DEFAULT_LOCK_WAIT_TIMEOUT_MS,
	writeStderr: (message) => {
		process.stderr.write(`${message}\n`);
	},
};

type ActionState = "not-started" | "running" | "resolved" | "rejected";

interface ActionExecution<T> {
	state: ActionState;
	result?: T;
	error?: unknown;
}

/**
 * Select enabled episode-transition serialization without making the lock
 * protocol load-bearing for the primary plan/task update.
 */
export async function withEpisodeTransitionLock<T>(
	options: EpisodeTransitionLockOptions<T>,
): Promise<T> {
	if (!options.hasEpisodeContext) {
		return options.action();
	}

	const dependencies = { ...DEFAULT_DEPENDENCIES, ...options.dependencies };
	try {
		const config = await dependencies.loadConfig(options.projectRoot);
		if (!resolveEpisodicLogConfig(config).enabled) {
			return options.action();
		}
	} catch {
		// Episode capture remains the established warning owner for config errors.
		return options.action();
	}

	const execution: ActionExecution<T> = { state: "not-started" };
	const lockOptions: EntityFileLockOptions = {
		retryDelayMs: dependencies.lockRetryDelayMs,
		waitTimeoutMs: dependencies.lockWaitTimeoutMs,
	};

	try {
		return await dependencies.withEntityFileLock(
			options.lockPath,
			async () => {
				execution.state = "running";
				try {
					const result = await options.action();
					execution.result = result;
					execution.state = "resolved";
					return result;
				} catch (error: unknown) {
					execution.error = error;
					execution.state = "rejected";
					throw error;
				}
			},
			lockOptions,
		);
	} catch (error: unknown) {
		if (execution.state === "rejected") {
			if (error !== execution.error) {
				await reportTransitionLockWarning(options, dependencies, error);
			}
			throw execution.error;
		}

		if (execution.state === "resolved") {
			await reportTransitionLockWarning(options, dependencies, error);
			return execution.result as T;
		}

		if (execution.state === "running") {
			// The production primitive cannot reject while its action is still running.
			// Preserve single-execution semantics if a substituted dependency does.
			throw error;
		}

		void reportTransitionLockWarning(options, dependencies, error);
		return options.action();
	}
}

async function reportTransitionLockWarning<T>(
	options: EpisodeTransitionLockOptions<T>,
	dependencies: EpisodeTransitionLockDependencies,
	error: unknown,
): Promise<void> {
	const warning: MemoryWarning = {
		path: clamp(options.lockPath, MAX_WARNING_PATH_LENGTH),
		message: clamp(
			`Episode transition lock unavailable: ${errorReason(error)} Continuing unlocked.`,
			MAX_WARNING_MESSAGE_LENGTH,
		),
	};

	if (options.reportEpisodeWarning) {
		try {
			await options.reportEpisodeWarning(warning);
			return;
		} catch {
			// The primary warning still falls through to stderr.
		}
	}

	try {
		dependencies.writeStderr(`[warning] ${warning.path}: ${warning.message}`);
	} catch {
		// Episode warning delivery is non-load-bearing.
	}
}

function errorReason(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

function clamp(value: string, maxLength: number): string {
	if (value.length <= maxLength) return value;
	return `${value.slice(0, maxLength - 1)}…`;
}
