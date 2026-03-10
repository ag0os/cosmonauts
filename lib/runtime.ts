/**
 * CosmonautsRuntime — centralized bootstrap sequence.
 *
 * Replaces the duplicated bootstrap logic scattered across cli/main.ts,
 * orchestration/index.ts, and agent-spawner.ts. Loads config, discovers
 * domains, validates them, and builds all registries in a single factory call.
 */

import type { AgentRegistry } from "./agents/index.ts";
import { createRegistryFromDomains } from "./agents/index.ts";
import type { ProjectConfig } from "./config/index.ts";
import { loadProjectConfig } from "./config/index.ts";
import type { LoadedDomain } from "./domains/index.ts";
import { DomainRegistry, loadDomains } from "./domains/index.ts";
import { DomainValidationError, validateDomains } from "./domains/validator.ts";
import { selectDomainWorkflows } from "./workflows/loader.ts";
import type { WorkflowDefinition } from "./workflows/types.ts";

/** Options for creating a CosmonautsRuntime instance. */
export interface CosmonautsRuntimeOptions {
	/** Absolute path to the domains directory. */
	domainsDir: string;
	/** Absolute path to the project root (where .cosmonauts/ lives). */
	projectRoot: string;
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
	readonly domainsDir: string;
	readonly workflows: readonly WorkflowDefinition[];
	readonly projectSkills: readonly string[] | undefined;

	private constructor(fields: {
		projectConfig: ProjectConfig;
		domains: readonly LoadedDomain[];
		domainRegistry: DomainRegistry;
		agentRegistry: AgentRegistry;
		domainContext: string | undefined;
		domainsDir: string;
		workflows: readonly WorkflowDefinition[];
		projectSkills: readonly string[] | undefined;
	}) {
		this.projectConfig = fields.projectConfig;
		this.domains = fields.domains;
		this.domainRegistry = fields.domainRegistry;
		this.agentRegistry = fields.agentRegistry;
		this.domainContext = fields.domainContext;
		this.domainsDir = fields.domainsDir;
		this.workflows = fields.workflows;
		this.projectSkills = fields.projectSkills;
	}

	/**
	 * Bootstrap the runtime: load config, discover domains, validate,
	 * build registries, compute domain context and workflows.
	 *
	 * Throws `DomainValidationError` if any error-severity diagnostics
	 * are found. Logs warnings to stderr without halting.
	 */
	static async create(
		options: CosmonautsRuntimeOptions,
	): Promise<CosmonautsRuntime> {
		// 1. Load project config
		const projectConfig = await loadProjectConfig(options.projectRoot);

		// 2. Load domains
		const domains = await loadDomains(options.domainsDir);

		// 3. Validate domains
		const diagnostics = validateDomains(domains);

		// Emit warnings to stderr
		const warnings = diagnostics.filter((d) => d.severity === "warning");
		for (const w of warnings) {
			const loc = w.agent ? `${w.domain}/${w.agent}` : w.domain;
			const wfTag = w.workflow ? ` workflow:${w.workflow}` : "";
			console.error(`[warning] [${loc}${wfTag}] ${w.message}`);
		}

		// Throw on errors
		const errors = diagnostics.filter((d) => d.severity === "error");
		if (errors.length > 0) {
			throw new DomainValidationError(diagnostics);
		}

		// 4. Build registries
		const domainRegistry = new DomainRegistry(domains as LoadedDomain[]);
		const agentRegistry = createRegistryFromDomains(domains);

		// 5. Compute effective domain context
		const domainContext = options.domainOverride ?? projectConfig.domain;

		// 6. Compute effective workflows
		const workflows = selectDomainWorkflows(domains, domainContext);

		// 7. Return frozen immutable runtime
		const runtime = new CosmonautsRuntime({
			projectConfig,
			domains,
			domainRegistry,
			agentRegistry,
			domainContext,
			domainsDir: options.domainsDir,
			workflows,
			projectSkills: projectConfig.skills,
		});

		return Object.freeze(runtime);
	}
}
