/**
 * Type definitions for project-level configuration.
 *
 * Projects declare their configuration in `.cosmonauts/config.json`.
 */

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
	/** Additional skill directories (e.g. "~/.claude/skills", ".codex/skills"). */
	readonly skillPaths?: readonly string[];
	/** Custom named-chain definitions (name → config). */
	readonly chains?: Readonly<Record<string, ProjectChainConfig>>;
	/** Optional generated architecture-map settings. */
	readonly architectureMap?: ProjectArchitectureMapConfig;
}
