import { readFileSync, realpathSync } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";

const ANALYSIS_EXECUTION_CONSENT_FILE = "analysis-execution-consent.json";

interface AnalysisExecutionConsentOptions {
	readonly projectRoot: string;
	readonly providerId: string;
	readonly userStateRoot?: string;
}

interface AnalysisExecutionConsentState {
	readonly schemaVersion: 1;
	readonly projects: Readonly<
		Record<string, { readonly providers: readonly string[] }>
	>;
}

export interface AnalysisExecutionAuthorization {
	readonly canonicalProjectRoot: string;
	readonly consented: boolean;
}

/** A run-local capability. It is never serialized or installed in user state. */
export interface SnapshotAnalysisAuthorization {
	readonly snapshotRealPath: string;
	readonly runId: string;
	readonly consented: boolean;
	authorizationFor(options: {
		runId: string;
		snapshotRoot: string;
		providerId: string;
	}): AnalysisExecutionAuthorization;
	dispose(): void;
}

export async function createSnapshotAnalysisAuthorization(options: {
	sourceRoot: string;
	snapshotRoot: string;
	runId: string;
	providerId: string;
	userStateRoot?: string;
}): Promise<SnapshotAnalysisAuthorization> {
	const sourceRealPath = await realpath(options.sourceRoot);
	const snapshotRealPath = await realpath(options.snapshotRoot);
	if (
		sourceRealPath === snapshotRealPath ||
		isPathInside(sourceRealPath, snapshotRealPath)
	)
		throw new Error(
			"Snapshot analysis authorization requires a private checkout",
		);
	const existing = await readAnalysisExecutionAuthorization({
		projectRoot: sourceRealPath,
		providerId: options.providerId,
		userStateRoot: options.userStateRoot,
	});
	if (existing?.canonicalProjectRoot !== sourceRealPath)
		throw new Error("Source consent identity changed");
	let active = true;
	return {
		snapshotRealPath,
		runId: options.runId,
		consented: existing.consented,
		authorizationFor(request) {
			if (
				!active ||
				request.runId !== options.runId ||
				realpathSync(request.snapshotRoot) !== snapshotRealPath ||
				request.providerId !== options.providerId
			)
				throw new Error("Snapshot analysis authorization scope mismatch");
			return {
				canonicalProjectRoot: snapshotRealPath,
				consented: existing.consented,
			};
		},
		dispose() {
			active = false;
		},
	};
}

function defaultUserStateRoot(): string {
	return join(homedir(), ".cosmonauts");
}

function isPathInside(parent: string, candidate: string): boolean {
	const pathFromParent = relative(parent, candidate);
	return (
		pathFromParent === "" ||
		(!pathFromParent.startsWith("..") && !isAbsolute(pathFromParent))
	);
}

function parseConsentState(
	value: unknown,
): AnalysisExecutionConsentState | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return null;
	}
	const state = value as Record<string, unknown>;
	if (
		state.schemaVersion !== 1 ||
		typeof state.projects !== "object" ||
		state.projects === null ||
		Array.isArray(state.projects)
	) {
		return null;
	}
	return state as unknown as AnalysisExecutionConsentState;
}

function consentPaths(options: AnalysisExecutionConsentOptions): {
	projectRoot: string;
	userStateRoot: string;
	consentPath: string;
} {
	const projectRoot = resolve(options.projectRoot);
	const userStateRoot = resolve(
		options.userStateRoot ?? defaultUserStateRoot(),
	);
	if (isPathInside(projectRoot, userStateRoot)) {
		throw new Error(
			"Analysis execution consent state must be held outside the target project.",
		);
	}
	return {
		projectRoot,
		userStateRoot,
		consentPath: join(userStateRoot, ANALYSIS_EXECUTION_CONSENT_FILE),
	};
}

/**
 * Read an explicit, per-project provider execution decision from user state.
 *
 * Repository configuration is deliberately not consulted. A repository may
 * advertise a provider, but it cannot grant itself permission to execute one.
 */
export async function readAnalysisExecutionAuthorization(
	options: AnalysisExecutionConsentOptions,
): Promise<AnalysisExecutionAuthorization | null> {
	const { projectRoot, userStateRoot, consentPath } = consentPaths(options);
	let canonicalProjectRoot: string;
	try {
		canonicalProjectRoot = await realpath(projectRoot);
	} catch {
		return null;
	}
	if (isPathInside(canonicalProjectRoot, userStateRoot)) {
		throw new Error(
			"Analysis execution consent state must be held outside the target project.",
		);
	}

	let parsed: unknown;
	try {
		const [consentRealpath, contents] = await Promise.all([
			realpath(consentPath),
			readFile(consentPath, "utf8"),
		]);
		if (isPathInside(canonicalProjectRoot, consentRealpath)) {
			throw new Error(
				"Analysis execution consent state must be held outside the target project.",
			);
		}
		parsed = JSON.parse(contents);
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.includes("outside the target project")
		) {
			throw error;
		}
		return { canonicalProjectRoot, consented: false };
	}
	const state = parseConsentState(parsed);
	if (state === null) return { canonicalProjectRoot, consented: false };

	const projectConsent = state.projects[canonicalProjectRoot];
	return {
		canonicalProjectRoot,
		consented:
			Array.isArray(projectConsent?.providers) &&
			projectConsent.providers.includes(options.providerId),
	};
}

/**
 * Synchronous counterpart used by the final pre-spawn validation.
 *
 * Keeping the consent and executable checks in one event-loop turn prevents
 * either asynchronous precondition from becoming stale while the other waits.
 */
export function readAnalysisExecutionAuthorizationSync(
	options: AnalysisExecutionConsentOptions,
): AnalysisExecutionAuthorization | null {
	const { projectRoot, userStateRoot, consentPath } = consentPaths(options);
	let canonicalProjectRoot: string;
	try {
		canonicalProjectRoot = realpathSync(projectRoot);
	} catch {
		return null;
	}
	if (isPathInside(canonicalProjectRoot, userStateRoot)) {
		throw new Error(
			"Analysis execution consent state must be held outside the target project.",
		);
	}

	let parsed: unknown;
	try {
		const consentRealpath = realpathSync(consentPath);
		if (isPathInside(canonicalProjectRoot, consentRealpath)) {
			throw new Error(
				"Analysis execution consent state must be held outside the target project.",
			);
		}
		parsed = JSON.parse(readFileSync(consentPath, "utf8"));
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.includes("outside the target project")
		) {
			throw error;
		}
		return { canonicalProjectRoot, consented: false };
	}
	const state = parseConsentState(parsed);
	if (state === null) return { canonicalProjectRoot, consented: false };

	const projectConsent = state.projects[canonicalProjectRoot];
	return {
		canonicalProjectRoot,
		consented:
			Array.isArray(projectConsent?.providers) &&
			projectConsent.providers.includes(options.providerId),
	};
}

export async function hasAnalysisExecutionConsent(
	options: AnalysisExecutionConsentOptions,
): Promise<boolean> {
	return (
		(await readAnalysisExecutionAuthorization(options))?.consented === true
	);
}
