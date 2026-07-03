/**
 * Stable architecture-map contracts shared by analyzer, generator, CLI,
 * extension, and viewer work.
 */

export const ARCHITECTURE_MAP_OUTPUT_DIR = "memory/architecture" as const;

export const ARCHITECTURE_MAP_GENERATOR_VERSION =
	"code-structure-map-w1" as const;

export const OKF_RECORD_TYPES = {
	index: "code-structure-index",
	module: "code-structure-module",
} as const;

export type OkfRecordType =
	(typeof OKF_RECORD_TYPES)[keyof typeof OKF_RECORD_TYPES];

export const OKF_REQUIRED_FRONTMATTER_KEYS = [
	"type",
	"title",
	"description",
	"resource",
	"tags",
	"timestamp",
] as const;

export interface ArchitectureMapConfig {
	readonly outputDir: typeof ARCHITECTURE_MAP_OUTPUT_DIR;
	readonly sourceRoots: readonly string[];
	readonly moduleRoots?: readonly string[];
	readonly exclude: readonly string[];
	readonly injectionMaxBytes: number;
	readonly narrative: {
		readonly enabled: boolean;
		readonly maxModulesPerRun: number;
	};
}

export interface ProjectSnapshot {
	/** sha256 over resolved map config, analyzer config files, source paths, and source contents. */
	readonly hash: string;
	readonly files: readonly SourceFileSnapshot[];
	/** Existing repo-relative analyzer/config input files included in the snapshot hash. */
	readonly analyzerConfigFiles: readonly string[];
}

export interface SourceAnalyzer {
	getConfigInputs(
		projectRoot: string,
		config: ArchitectureMapConfig,
	): Promise<readonly string[]>;
	analyze(input: AnalysisInput): Promise<AnalysisResult>;
}

export interface ModuleSkeleton {
	/** Repo-relative module root, e.g. "lib/agents". */
	readonly resource: string;
	readonly rootDir: string;
	readonly files: readonly string[];
	readonly hasBarrel: boolean;
	readonly publicInterface: readonly PublicExport[];
	readonly dependencies: readonly ModuleDependency[];
	readonly externalDependencies: readonly string[];
	readonly sourceHash: string;
	readonly skeletonHash: string;
}

export interface ModuleRecord extends ModuleSkeleton {
	readonly dependents: readonly ModuleDependent[];
	readonly narrative: ModuleNarrative;
	/** Repo-relative to memory/architecture, e.g. "modules/lib/agents.md". */
	readonly shardPath: string;
}

export interface ArchitectureMapIndex {
	readonly generatedAt: string;
	readonly projectHash: string;
	readonly modules: readonly ModuleRecord[];
}

export interface NarrativeProvider {
	generate(
		input: NarrativeInput,
		signal?: AbortSignal,
	): Promise<GeneratedNarrative>;
}

export interface SourceFileSnapshot {
	/** Repo-relative path. */
	readonly path: string;
	readonly size: number;
	readonly mtimeMs: number;
	/** sha256 of contents. */
	readonly hash: string;
}

export interface AnalysisInput {
	readonly projectRoot: string;
	readonly config: ArchitectureMapConfig;
	readonly snapshot: ProjectSnapshot;
}

export interface AnalysisResult {
	readonly modules: readonly ModuleSkeleton[];
	readonly diagnostics: readonly string[];
}

export interface PublicExport {
	readonly name: string;
	readonly kind:
		| "function"
		| "class"
		| "interface"
		| "type"
		| "const"
		| "enum"
		| "other";
	readonly signature: string;
	/** Repo-relative source file. */
	readonly sourceFile: string;
}

export interface ModuleDependency {
	/** Target module resource. */
	readonly resource: string;
	/** Repo-relative importing files. */
	readonly importedBy: readonly string[];
}

export interface ModuleDependent {
	readonly resource: string;
}

export type NarrativeStatus = "generated" | "reused" | "pending";

export interface ModuleNarrative {
	readonly status: NarrativeStatus;
	readonly oneLiner?: string;
	readonly text?: string;
	/** Required when status is "pending". */
	readonly pendingReason?: string;
}

export interface NarrativeInput {
	readonly skeleton: ModuleSkeleton;
	readonly priorNarrative?: ModuleNarrative;
}

export interface GeneratedNarrative {
	readonly oneLiner: string;
	readonly text: string;
}

export type GenerateArchitectureMapResult =
	| {
			readonly kind: "written";
			readonly changedFiles: readonly string[];
			readonly pendingModules: readonly string[];
	  }
	| { readonly kind: "unchanged" }
	| { readonly kind: "unsupported"; readonly reason: string }
	| {
			readonly kind: "failed";
			readonly error: string;
			readonly previousMapIntact: boolean;
	  };

export interface GenerateArchitectureMapOptions {
	readonly projectRoot: string;
	readonly analyzer: SourceAnalyzer;
	/** Absent means --no-narrative semantics. */
	readonly narrativeProvider?: NarrativeProvider;
	readonly configOverrides?: Partial<ArchitectureMapConfig>;
}

export type ArchitectureMapFreshness =
	| {
			readonly kind: "current";
			readonly hash: string;
	  }
	| {
			readonly kind: "stale";
			readonly oldHash: string;
			readonly newHash: string;
	  }
	| { readonly kind: "missing" };

export interface StatFingerprint {
	readonly hash: string;
	readonly files: readonly StatFingerprintFile[];
}

export interface StatFingerprintFile {
	readonly path: string;
	readonly size: number;
	readonly mtimeMs: number;
}
