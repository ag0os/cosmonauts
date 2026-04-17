# Domain Configuration Architecture — Implementation Spec

## Domain Manifest Type

```typescript
// lib/domains/types.ts
interface DomainManifest {
  id: string;
  description: string;
  lead?: string;
  defaultModel?: string;
}

interface LoadedDomain {
  manifest: DomainManifest;
  agents: Map<string, AgentDefinition>;       // unqualified ID → definition
  capabilities: Set<string>;                   // available capability names
  prompts: Set<string>;                        // available persona prompt names
  skills: Set<string>;                         // available skill names
  extensions: Set<string>;                     // available extension names
  workflows: WorkflowDefinition[];
  rootDir: string;                             // absolute path to domain dir
}
```

## AgentDefinition Type (Updated)

```typescript
// lib/agents/types.ts
interface AgentDefinition {
  readonly id: string;
  readonly description: string;
  readonly capabilities: readonly string[];     // was: prompts
  readonly model: string;
  readonly tools: AgentToolSet;
  readonly extensions: readonly string[];
  readonly skills?: readonly string[];
  readonly subagents?: readonly string[];        // now qualified IDs: "coding/worker"
  readonly projectContext: boolean;
  readonly session: AgentSessionMode;
  readonly loop: boolean;
  readonly thinkingLevel?: ThinkingLevel;
  // Set at runtime by domain loader, not in definition files:
  domain?: string;
}
```

## Prompt Assembly Order

```
Layer 0: domains/shared/prompts/base.md                         (always)
Layer 1: domains/{domain}/capabilities/{cap}.md                 (per capability, domain-first)
         → fallback: domains/shared/capabilities/{cap}.md
Layer 2: domains/{domain}/prompts/{agent-id}.md                 (auto-loaded persona)
Layer 3: domains/shared/prompts/runtime/sub-agent.md            (if sub-agent mode)
```

## Resolution Rules (Capabilities, Skills, Extensions)

1. Check `domains/{agent's-domain}/{resource-type}/{name}`
2. Fall back to `domains/shared/{resource-type}/{name}`
3. Error if not found (for capabilities) or skip (for extensions)

## Agent ID Format

Qualified: `{domain}/{agent}` (e.g. `coding/worker`)
Unqualified: `{agent}` (e.g. `worker`) — resolved via domain context

## Registry API

```typescript
class AgentRegistry {
  resolve(id: string, domainContext?: string): AgentDefinition;
  get(id: string, domainContext?: string): AgentDefinition | undefined;
  has(id: string, domainContext?: string): boolean;
  resolveInDomain(domain: string): AgentDefinition[];
  listIds(): string[];           // returns qualified IDs
  listAll(): AgentDefinition[];
  register(def: AgentDefinition): void;
}
```

## Domain Discovery Sequence

1. `readdir(domainsDir)` → filter to dirs with `domain.ts`
2. Sort: `shared` first, then alphabetical
3. For each domain:
   a. `import(domain.ts)` → manifest
   b. Walk `agents/*.ts` → `import()` each, stamp `domain` field
   c. Index `capabilities/*.md`, `prompts/*.md`, `skills/`, `extensions/`
   d. `import(workflows.ts)` if present
4. Build `DomainRegistry` from loaded domains
5. Build `AgentRegistry` from domain registry

## CLI Additions

```
--domain, -d <id>     Set domain context for this invocation
--list-domains        List all discovered domains and exit
```

## Project Config Addition

```typescript
interface ProjectConfig {
  domain?: string;                             // default domain ID
  skills?: readonly string[];
  workflows?: Record<string, ProjectWorkflowConfig>;
}
```
