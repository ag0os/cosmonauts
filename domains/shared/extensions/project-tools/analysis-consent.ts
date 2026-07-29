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

/**
 * Read an explicit, per-project provider execution decision from user state.
 *
 * Repository configuration is deliberately not consulted. A repository may
 * advertise a provider, but it cannot grant itself permission to execute one.
 */
export async function readAnalysisExecutionAuthorization(
	options: AnalysisExecutionConsentOptions,
): Promise<AnalysisExecutionAuthorization | null> {
	const projectRoot = resolve(options.projectRoot);
	const userStateRoot = resolve(
		options.userStateRoot ?? defaultUserStateRoot(),
	);
	if (isPathInside(projectRoot, userStateRoot)) {
		throw new Error(
			"Analysis execution consent state must be held outside the target project.",
		);
	}

	const consentPath = join(userStateRoot, ANALYSIS_EXECUTION_CONSENT_FILE);
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

export async function hasAnalysisExecutionConsent(
	options: AnalysisExecutionConsentOptions,
): Promise<boolean> {
	return (
		(await readAnalysisExecutionAuthorization(options))?.consented === true
	);
}
