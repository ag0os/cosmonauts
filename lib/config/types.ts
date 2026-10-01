/**
 * Type definitions for project-level configuration.
 *
 * Projects declare their configuration in `.cosmonauts/config.json`.
 */

import type { SignalKind } from "../lean-run/types.ts";

/** Named-chain entry in project config. */
export interface ProjectChainConfig {
	readonly description?: string;
	readonly chain: string;
}

/** Optional architecture-map configuration from `.cosmonauts/config.json`. */
interface ProjectArchitectureMapConfig {
	readonly sourceRoots?: readonly string[];
	readonly moduleRoots?: readonly string[];
	readonly exclude?: readonly string[];
	readonly injectionMaxBytes?: number;
	readonly narrative?: {
		readonly enabled?: boolean;
		readonly maxModulesPerRun?: number;
	};
}

/** Optional episodic-log capture settings from `.cosmonauts/config.json`. */
export interface ProjectEpisodicLogConfig {
	readonly enabled?: boolean;
	readonly warningThreshold?: number;
}

/** Optional structural-analysis provider preference. */
export interface ProjectAnalysisConfig {
	readonly provider?: string;
}

/** Optional lean-domain settings from `.cosmonauts/config.json`. */
export interface ProjectLeanConfig {
	/** Token budget for the builder context pack's repo-map slice (default 1,500). */
	readonly repoMapBudgetTokens?: number;
	/** Per-run limits for `lean_build`; a tool parameter overrides each field. */
	readonly budget?: ProjectLeanBudgetConfig;
	/**
	 * Signal kinds a lean run must get from an available provider to be
	 * `done` (default verify, mutation, health); a tool parameter overrides it.
	 */
	readonly requiredSignals?: readonly SignalKind[];
	/** `lean.requiredSignals` entries that are not signal kinds, as written. */
	readonly unknownRequiredSignals?: readonly string[];
	/** The most bytes of gitignored files a lean run copies into the builder clone (default 50 MB). */
	readonly ignoredInputsCapBytes?: number;
}

/** Lean run limits. Tokens count input + output only, never cache reads or writes. */
export interface ProjectLeanBudgetConfig {
	readonly tokens?: number;
	readonly timeMs?: number;
}

/** Project-only, off-by-default knowledge-surface gate. */
export interface ProjectKnowledgeSurfaceConfig {
	readonly enabled?: boolean;
}

export interface QualityReviewCommand {
	readonly id: string;
	readonly command: string;
	readonly args: readonly string[];
	readonly timeoutMs?: number;
}

interface ProjectQualityReviewConfig {
	readonly analysisPrepare?: readonly QualityReviewCommand[];
	readonly prepare?: readonly QualityReviewCommand[];
	readonly checks?: readonly QualityReviewCommand[];
	readonly gateOwnedPaths?: readonly string[];
	readonly reviewerModel?: string;
	readonly assessmentTimeoutMs?: number;
	readonly panelTimeoutMs?: number;
	readonly qmSettleGraceMs?: number;
	readonly workspaceRemovalTimeoutMs?: number;
}

/** Project-level configuration loaded from `.cosmonauts/config.json`. */
export interface ProjectConfig {
	/** Default domain for this project (e.g. "coding"). */
	readonly domain?: string;
	/** Active non-shared domain IDs for this project. Shared is always active. */
	readonly activeDomains?: readonly string[];
	/** Domain role → target domain overrides. */
	readonly domainBindings?: Readonly<Record<string, string>>;
	/** Skills relevant to this project. Filters agent skill indices to this set. */
	readonly skills?: readonly string[];
	/** Additional skill directories (e.g. "~/.claude/skills", ".agents/skills"). */
	readonly skillPaths?: readonly string[];
	/** Custom named-chain definitions (name → config). */
	readonly chains?: Readonly<Record<string, ProjectChainConfig>>;
	/** Optional generated architecture-map settings. */
	readonly architectureMap?: ProjectArchitectureMapConfig;
	/** Project-only, off-by-default episodic-log capture settings. */
	readonly episodicLog?: ProjectEpisodicLogConfig;
	/** Optional provider preference; absence uses automatic detection. */
	readonly analysis?: ProjectAnalysisConfig;
	/** Project-only knowledge surface. Only literal true enables it. */
	readonly knowledgeSurface?: ProjectKnowledgeSurfaceConfig;
	readonly qualityReview?: ProjectQualityReviewConfig;
	/** Optional lean-domain settings. */
	readonly lean?: ProjectLeanConfig;
}
