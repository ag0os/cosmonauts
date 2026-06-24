/**
 * CosmonautsRuntime — centralized bootstrap sequence.
 *
 * Loads config, discovers
 * domains from all sources, validates them, and builds all registries in
 * a single factory call.
 */

import type { AgentRegistry } from "./agents/index.ts";
import { createRegistryFromDomains } from "./agents/index.ts";
import { selectDomainChains } from "./chains/loader.ts";
import type { NamedChain } from "./chains/types.ts";
import type { ProjectConfig } from "./config/index.ts";
import { loadProjectConfig } from "./config/index.ts";
import {
	DomainBindingResolver,
	DomainBindingTargetError,
	getLiveDomainBindingStore,
} from "./domains/bindings.ts";
import type { LoadedDomain } from "./domains/index.ts";
import { DomainRegistry, loadDomainsFromSources } from "./domains/index.ts";
import { DomainResolver } from "./domains/resolver.ts";
import { DomainValidationError, validateDomains } from "./domains/validator.ts";
import { scanDomainSources } from "./packages/scanner.ts";

export { DomainBindingTargetError };

/** Options for creating a CosmonautsRuntime instance. */
export interface CosmonautsRuntimeOptions {
	/** Absolute path to the framework's built-in domains directory. */
	builtinDomainsDir: string;
	/** Absolute path to the project root (where .cosmonauts/ lives). */
	projectRoot: string;
	/**
	 * Bundled package directories for framework dev-mode auto-include.
	 * Added at the lowest precedence — global packages override bundled,
	 * local packages override global.
	 */
	bundledDirs?: string[];
	/** Optional extra domain source directories (e.g. from --plugin-dir flag). */
	pluginDirs?: string[];
	/** CLI-level domain override (takes priority over project config). */
	domainOverride?: string;
}

/**
 * Immutable runtime object produced by the bootstrap sequence.
 *
 * Centralizes domain discovery, validation, registry construction,
 * domain context resolution, and workflow selection.
 */
export class CosmonautsRuntime {
	readonly projectConfig: ProjectConfig;
	readonly domains: readonly LoadedDomain[];
	readonly domainRegistry: DomainRegistry;
	readonly agentRegistry: AgentRegistry;
	readonly domainContext: string | undefined;
	/**
	 * Domain resolver for prompt and extension path resolution.
	 * Replaces the raw domainsDir — use this for all downstream domain lookups.
	 */
	readonly domainResolver: DomainResolver;
	readonly bindingResolver: DomainBindingResolver;
	readonly chains: readonly NamedChain[];
	readonly projectSkills: readonly string[] | undefined;
	/**
	 * Complete list of skill directories Cosmonauts should discover from.
	 * Combines domain skill directories from all sources with user-configured
	 * `skillPaths` from `.cosmonauts/config.json`.
	 * Used with `noSkills: true` to fully control Pi's skill discovery.
	 */
	readonly skillPaths: readonly string[];
	/**
	 * Absolute path to the built-in domains directory.
	 * Used as fallback for prompt assembly and extension resolution when
	 * no DomainResolver-based lookup is available.
	 */
	readonly domainsDir: string;

	private constructor(fields: {
		projectConfig: ProjectConfig;
		domains: readonly LoadedDomain[];
		domainRegistry: DomainRegistry;
		agentRegistry: AgentRegistry;
		domainContext: string | undefined;
		domainResolver: DomainResolver;
		bindingResolver: DomainBindingResolver;
		chains: readonly NamedChain[];
		projectSkills: readonly string[] | undefined;
		skillPaths: readonly string[];
		domainsDir: string;
	}) {
		this.projectConfig = fields.projectConfig;
		this.domains = fields.domains;
		this.domainRegistry = fields.domainRegistry;
		this.agentRegistry = fields.agentRegistry;
		this.domainContext = fields.domainContext;
		this.domainResolver = fields.domainResolver;
		this.bindingResolver = fields.bindingResolver;
		this.chains = fields.chains;
		this.projectSkills = fields.projectSkills;
		this.skillPaths = fields.skillPaths;
		this.domainsDir = fields.domainsDir;
	}

	/**
	 * Bootstrap the runtime: load config, scan all domain sources, load and
	 * merge domains, validate, build registries, compute domain context and chains.
	 *
	 * Domain sources are scanned in precedence order:
	 *   0 — built-in domains directory
	 *   1 — globally installed packages
	 *   2 — locally installed packages (project scope)
	 *   3 — plugin directories (session-only, highest precedence)
	 *
	 * Throws `DomainValidationError` if any error-severity diagnostics
	 * are found. Logs warnings to stderr without halting.
	 */
	static async create(
		options: CosmonautsRuntimeOptions,
	): Promise<CosmonautsRuntime> {
		// 1. Load project config
		const projectConfig = await loadProjectConfig(options.projectRoot);

		// 2. Scan all domain sources (built-in, bundled, global packages, local packages, plugins)
		const sources = await scanDomainSources({
			builtinDomainsDir: options.builtinDomainsDir,
			projectRoot: options.projectRoot,
			bundledDirs: options.bundledDirs,
			pluginDirs: options.pluginDirs,
		});

		// 3. Load and merge domains from all sources
		const activeDomainIds = activeDomainIdSet(projectConfig.activeDomains);
		const domains = await loadDomainsFromSources(sources, undefined, {
			activeDomainIds,
		});

		// 4. Build the domain registry and validate active binding targets/domains
		const domainRegistry = new DomainRegistry(domains as LoadedDomain[]);
		const bindingResolver = new DomainBindingResolver({
			registry: domainRegistry,
			projectBindings: projectConfig.domainBindings,
			liveBindings: getLiveDomainBindingStore(options.projectRoot),
		});
		bindingResolver.validateProjectBindings();
		const diagnostics = validateDomains(domains, { bindingResolver });

		// Emit warnings to stderr
		const warnings = diagnostics.filter((d) => d.severity === "warning");
		for (const w of warnings) {
			const loc = w.agent ? `${w.domain}/${w.agent}` : w.domain;
			const chainTag = w.chain ? ` chain:${w.chain}` : "";
			console.error(`[warning] [${loc}${chainTag}] ${w.message}`);
		}

		// Throw on errors
		const errors = diagnostics.filter((d) => d.severity === "error");
		if (errors.length > 0) {
			throw new DomainValidationError(diagnostics);
		}

		// 5. Build registries
		const agentRegistry = createRegistryFromDomains(domains, {
			bindingResolver,
		});

		// 6. Build domain resolver from registry
		const domainResolver = new DomainResolver(domainRegistry);

		// 7. Compute effective domain context
		const domainContext = options.domainOverride ?? projectConfig.domain;
		const resolvedDomainContext = domainContext
			? (bindingResolver.resolveKnownRole(domainContext)?.domainId ??
				domainContext)
			: undefined;

		// 8. Compute effective chains
		const chains = selectDomainChains(domains, resolvedDomainContext);

		// 9. Compose skill paths from all domain sources + user config
		const domainSkillDirs = domainResolver.allSkillDirs();
		const skillPaths = [
			...domainSkillDirs,
			...(projectConfig.skillPaths ?? []),
		];

		// 10. Return frozen immutable runtime
		const runtime = new CosmonautsRuntime({
			projectConfig,
			domains,
			domainRegistry,
			agentRegistry,
			domainContext,
			domainResolver,
			bindingResolver,
			chains,
			projectSkills: projectConfig.skills,
			skillPaths,
			domainsDir: options.builtinDomainsDir,
		});

		return Object.freeze(runtime);
	}
}

function activeDomainIdSet(
	activeDomains: ProjectConfig["activeDomains"],
): ReadonlySet<string> | undefined {
	if (activeDomains === undefined) return undefined;
	return new Set(["shared", ...activeDomains]);
}
