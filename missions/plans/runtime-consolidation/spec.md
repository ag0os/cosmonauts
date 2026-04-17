## Qualified-Role Utility API

```typescript
// lib/agents/qualified-role.ts

/** "coding" + "worker" → "coding/worker"; undefined + "worker" → "worker" */
function qualifyRole(id: string, domain?: string): string;

/** "coding/worker" → "worker"; "worker" → "worker" */
function unqualifyRole(qualified: string): string;

/** "coding/worker" → { domain: "coding", id: "worker" }; "worker" → { domain: undefined, id: "worker" } */
function splitRole(qualified: string): { domain: string | undefined; id: string };

/** "coding/task-manager" → "taskManager"; unknown roles → undefined */
function roleToConfigKey(role: string): string | undefined;
```

## CosmonautsRuntime API

```typescript
// lib/runtime.ts

interface CosmonautsRuntimeOptions {
  /** Absolute path to the domains/ directory */
  domainsDir: string;
  /** Project root (for config loading) */
  projectRoot: string;
  /** CLI domain override (takes precedence over project config) */
  domainOverride?: string;
}

class CosmonautsRuntime {
  readonly projectConfig: ProjectConfig;
  readonly domains: readonly LoadedDomain[];
  readonly domainRegistry: DomainRegistry;
  readonly agentRegistry: AgentRegistry;
  readonly domainContext: string | undefined;
  readonly domainsDir: string;
  readonly workflows: readonly WorkflowDefinition[];
  readonly projectSkills: readonly string[] | undefined;

  static async create(options: CosmonautsRuntimeOptions): Promise<CosmonautsRuntime>;
}
```

## Domain Validation API

```typescript
// lib/domains/validator.ts

interface DomainValidationDiagnostic {
  domain: string;
  agent?: string;
  workflow?: string;
  message: string;
  severity: 'error' | 'warning';
}

class DomainValidationError extends Error {
  readonly diagnostics: readonly DomainValidationDiagnostic[];
}

/** Validate loaded domains. Returns diagnostics (empty = all good). */
function validateDomains(domains: readonly LoadedDomain[]): DomainValidationDiagnostic[];
```

### Validation Rules

1. **Persona prompt exists**: For each agent in a non-shared domain, `domain.prompts` must contain the agent's `id`.
   - Severity: error
   - Message: `Agent "coding/worker" has no persona prompt (expected prompts/worker.md in domain "coding")`

2. **Capabilities resolve**: For each capability in `agent.capabilities`, either the agent's domain or "shared" must have it in their `capabilities` set.
   - Severity: error
   - Message: `Agent "coding/worker" references capability "foo" not found in domain "coding" or "shared"`

3. **Extensions resolve**: For each extension in `agent.extensions`, either the agent's domain or "shared" must have it in their `extensions` set.
   - Severity: error
   - Message: `Agent "coding/worker" references extension "bar" not found in domain "coding" or "shared"`

4. **Subagent entries resolve**: For each entry in `agent.subagents`, there must be a matching agent definition in some loaded domain (check both qualified and unqualified).
   - Severity: warning (subagent might be from a not-yet-loaded domain)
   - Message: `Agent "coding/cosmo" references subagent "future-agent" which does not resolve to any loaded agent`

5. **Domain lead resolves**: If `manifest.lead` is set, it must be a key in that domain's `agents` map.
   - Severity: error
   - Message: `Domain "coding" declares lead "nonexistent" but no such agent exists in the domain`

6. **Workflow agents resolve**: For each workflow in a domain, parse the chain expression and verify each stage name resolves to an agent definition.
   - Severity: warning (workflow might reference agents from another domain)
   - Message: `Workflow "plan-and-build" in domain "coding" references unknown agent "nonexistent"`

### Validation Integration

`CosmonautsRuntime.create()` calls `validateDomains()` after loading. If any diagnostic has `severity: 'error'`, it throws `DomainValidationError`. Warnings are emitted to stderr.

`validateDomains()` is also exported independently so tests and tools can call it without constructing a full runtime.