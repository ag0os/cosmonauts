## Package Manifest Format

### `cosmonauts.json`

```json
{
  "name": "@cosmonauts/coding",
  "version": "0.1.0",
  "description": "Software development domain for Cosmonauts",
  "domains": ["coding"]
}
```

**Fields:**
- `name` (required, string): Unique package identifier. Lowercase, hyphens, optional `@scope/`.
- `version` (required, string): SemVer version string.
- `description` (required, string): Shown in `cosmonauts packages list`.
- `domains` (required, string[]): Domain IDs provided. Each must have a matching subdirectory with `domain.ts`.

### Domain Manifest Extension

```typescript
// domain.ts
export const manifest: DomainManifest = {
  id: "review-tools",
  description: "Code review skills and capabilities",
  portable: true,   // Resources available to agents in ALL domains
};
```

`portable` defaults to `false`. When `true`:
- Capabilities are available to any agent (not just agents in this domain)
- Skills are discoverable by all agents
- Extensions are resolvable by any agent
- Agents can be referenced in any workflow

The `shared` domain is implicitly portable and always resolves last.

### Package Directory Layout

```
my-package/
├── cosmonauts.json
├── my-domain/
│   ├── domain.ts              # { id: "my-domain", portable: false }
│   ├── agents/
│   │   └── my-agent.ts
│   ├── prompts/
│   │   └── my-agent.md
│   ├── capabilities/
│   │   └── my-capability.md
│   ├── skills/
│   │   └── my-skill/
│   │       └── SKILL.md
│   ├── extensions/
│   └── workflows.ts
└── README.md
```

### Portable Domain Package

A package providing skills/capabilities usable from any domain:

```
code-review-pack/
├── cosmonauts.json              # { domains: ["review-tools"] }
└── review-tools/
    ├── domain.ts                # { id: "review-tools", portable: true }
    ├── skills/
    │   ├── code-review/
    │   │   └── SKILL.md
    │   └── security-audit/
    │       └── SKILL.md
    └── capabilities/
        └── review-discipline.md
```

### Multi-Domain Package

A package can provide multiple domains:

```
devops-toolkit/
├── cosmonauts.json              # { domains: ["devops", "infra-tools"] }
├── devops/
│   ├── domain.ts                # { id: "devops", portable: false }
│   ├── agents/
│   └── workflows.ts
└── infra-tools/
    ├── domain.ts                # { id: "infra-tools", portable: true }
    └── skills/
```

## Install Locations

### Global Store

```
~/.cosmonauts/packages/<package-name>/
```

Default install location. Shared across all projects.

### Project-Local Store

```
<project-root>/.cosmonauts/packages/<package-name>/
```

Per-project overrides. Takes precedence over global.

### Precedence (lowest to highest)

1. Framework built-in (`<framework>/domains/`)
2. Global packages (`~/.cosmonauts/packages/*/`)
3. Local packages (`.cosmonauts/packages/*/`)
4. `--plugin-dir` (CLI flag, session-only)

Within the same scope, duplicate domain IDs from different packages trigger the merge strategy.

## Resource Resolution

### Three-Tier Resolution Order

When an agent in domain `coding` references capability `"code-review"`:

1. `coding/capabilities/code-review.md` (agent's own domain)
2. Each portable domain's `capabilities/code-review.md` (in discovery order)
3. `shared/capabilities/code-review.md` (always last)

First match wins. Same order applies to extensions, persona prompts (for portable agent reuse), and skill discovery.

### DomainResolver

Replaces the single `domainsDir: string` threaded through the system:

```typescript
class DomainResolver {
  // Three-tier resolution for file resources
  resolveCapabilityPath(capName: string, agentDomain: string): string;
  resolvePersonaPath(agentId: string, agentDomain: string): string;
  resolveExtensionPath(extName: string, agentDomain: string): string;

  // Fixed paths (always from shared)
  resolveBasePath(): string;
  resolveRuntimeTemplatePath(): string;

  // Aggregate accessors
  allSkillDirs(): string[];  // For skill path composition

  // Backward compatibility
  static fromSingleDir(dir: string, domains: LoadedDomain[]): DomainResolver;
}
```

## Domain Merge Strategy

When two sources provide the same domain ID:

### Merge (default)

Union of all resources. On filename conflict within a resource type (e.g., both have `agents/worker.ts`), later source wins (higher precedence).

### Replace

Remove existing domain entirely, use new source's version.

### Skip

Keep existing, ignore new source's domain.

### Interactive CLI

```
Domain "coding" already exists (source: built-in).
Package "my-extras" also provides "coding".

  Overlapping: agents: [worker, reviewer], skills: [testing]

  (m) Merge   (r) Replace   (s) Skip   (c) Cancel
>
```

Non-interactive mode (e.g., `--yes` flag) defaults to merge.

## Bundled Domain Catalog

Official domains shipped with the framework:

```json
{
  "coding": {
    "description": "Full coding domain — agents, skills, workflows for software development",
    "source": "./bundled/coding"
  },
  "coding-minimal": {
    "description": "Minimal coding domain — cosmo, planner, worker, coordinator",
    "source": "./bundled/coding-minimal"
  }
}
```

### Resolution Priority

```bash
cosmonauts install coding                    # 1. Check catalog → bundled/coding
cosmonauts install github:user/my-domain     # 2. Git clone
cosmonauts install ./local-path              # 3. Local path
```

## CLI Commands

### `cosmonauts install <source> [options]`

```bash
cosmonauts install coding                       # From catalog
cosmonauts install github:user/my-domain         # From git
cosmonauts install ./path/to/package             # From local path
cosmonauts install --link ./path/to/package      # Symlink (dev mode)
cosmonauts install --local ./path/to/package     # Project-local scope
cosmonauts install --branch v2.0 github:user/x   # Git branch/tag
```

### `cosmonauts uninstall <name> [options]`

```bash
cosmonauts uninstall @cosmonauts/coding
cosmonauts uninstall my-domain --local
```

### `cosmonauts packages [list]`

```
Global packages:
  @cosmonauts/coding  0.1.0  domains: coding        "Full coding domain..."
  review-pack          0.2.0  domains: review-tools●  "Code review skills..."

Local packages:
  my-extras            0.1.0  domains: coding (merged) "Extra agents for coding"

● = portable domain
```

### `cosmonauts create domain <name>`

```bash
cosmonauts create domain my-domain
```

Generates:
```
my-domain/
├── cosmonauts.json
└── my-domain/
    ├── domain.ts
    ├── agents/
    ├── prompts/
    ├── capabilities/
    ├── skills/
    └── workflows.ts
```

### `cosmonauts --plugin-dir <path>`

Load a package for the current session only, without installing:

```bash
cosmonauts --plugin-dir ./my-dev-package
cosmonauts --plugin-dir ./pkg-a --plugin-dir ./pkg-b   # Multiple
```