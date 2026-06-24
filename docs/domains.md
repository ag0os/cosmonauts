# Domain Authoring

Domains are the packaging unit for Cosmonauts agents. A domain owns the typed declarations, markdown prompt assets, skills, extensions, and named chains needed for one area of work. The loader discovers those assets by convention; authors should not add a separate registration file.

The current contract keeps declarations and configuration separate:

- Domain package files declare what the domain provides.
- `.cosmonauts/config.json` selects which domains are active for a project and how domain roles bind to target domains.
- Live `/domain-bind` commands change future resolution inside the current session without rewriting project config.

## Package Layouts

A single-domain package uses the package root as the domain root:

```text
alpha/
  cosmonauts.json
  domain.ts
  agents/
    coach.ts
  prompts/
    coach.md
  capabilities/
    coaching.md
  skills/
    playbook/
      SKILL.md
  extensions/
    notes/
      index.ts
  chains.ts
```

`cosmonauts.json` declares the root-domain package with `path: "."`:

```json
{
  "name": "alpha",
  "version": "0.1.0",
  "description": "Alpha coaching domain",
  "domains": [{ "name": "alpha", "path": "." }]
}
```

`path: "."` is valid only when it is the only domain entry in the package. Multi-domain packages put each domain in its own subdirectory and declare those subdirectory paths:

```json
{
  "name": "workbench",
  "version": "0.1.0",
  "description": "Multiple related domains",
  "domains": [
    { "name": "alpha", "path": "alpha" },
    { "name": "beta", "path": "beta" }
  ]
}
```

## Authoring Assets

| Asset | Path | Format | Declared by | Runtime use |
| --- | --- | --- | --- | --- |
| Manifest | `domain.ts` | TypeScript exporting `manifest` or default | `DomainManifest` | Domain identity, lead, portability, default model, and public surface |
| Agent | `agents/<id>.ts` | TypeScript default export | `AgentDefinition` | Session model, tools, capabilities, extensions, skills, subagents, persistence |
| Persona | `prompts/<id>.md` | Markdown | File name matches agent id | Layer 2 of the system prompt |
| Capability | `capabilities/<name>.md` | Markdown | Agent `capabilities` array | Layer 1 prompt pack, resolved domain -> portable -> shared |
| Skill | `skills/<name>/SKILL.md` | Markdown skill package | Agent `skills` array or wildcard | On-demand skill content exposed to Pi |
| Extension | `extensions/<name>/index.ts` | Pi extension module | Agent `extensions` array | Commands, tools, hooks, and session events |
| Chain | `chains.ts` | TypeScript exporting `chains` or default | `NamedChain[]` | Named multi-agent pipelines |

`domain.ts`, `agents/*.ts`, and `chains.ts` are typed declarations. Markdown files contain author-facing model instructions. Project-specific activation and binding belongs in `.cosmonauts/config.json`, not in the domain package.

### Manifest

`domain.ts` declares the domain id and optional public-surface settings:

```ts
import type { DomainManifest } from "../../lib/domains/types.ts";

export const manifest: DomainManifest = {
  id: "alpha",
  description: "Coaching domain for planning and review.",
  lead: "coach",
  portable: true,
  internal: {
    agents: ["scratchpad"],
    skills: ["private-rubric"],
    chains: ["internal-review"]
  }
};
```

`lead` must name an agent in the same domain. `portable: true` lets the domain participate in portable fallback resolution for capabilities and extensions. `internal` is a deny-list: omitted means public-all, omitted asset-type lists stay public, and only named agents, skills, or chains are hidden from other domains. Same-domain consumers can still use their own internal assets.

### Agents And Personas

Every non-shared agent needs two files:

- `agents/<id>.ts` exports an `AgentDefinition`.
- `prompts/<id>.md` contains that agent's persona.

The loader fills `definition.domain` from the manifest id. The prompt assembler uses the agent id to load the matching persona, so `agents/coach.ts` pairs with `prompts/coach.md`.

```ts
import type { AgentDefinition } from "../../lib/agents/types.ts";

const definition: AgentDefinition = {
  id: "coach",
  description: "Interactive planning coach.",
  capabilities: ["coaching", "tasks"],
  model: "openai/gpt-5.5",
  tools: "readonly",
  extensions: ["tasks"],
  skills: ["playbook"],
  subagents: ["reviewer"],
  projectContext: true,
  session: "persistent",
  loop: false
};

export default definition;
```

Domain `prompts/` contains personas only. Framework base and runtime overlays are loaded from `lib/prompts/framework/`; do not put universal base prompts or sub-agent runtime templates in a domain's persona directory.

### Capabilities, Skills, And Extensions

Capabilities are markdown prompt packs listed by agent definitions. Resolution checks the agent's domain first, then portable domains, then `shared`. Missing capabilities are validation errors because they affect prompt assembly.

Skills are directories with `SKILL.md`. Agents can use an explicit allowlist, `[]` for none, or `["*"]` for all visible skills. `internal.skills` hides named skills from cross-domain agents while preserving same-domain access.

Extensions are Pi modules under `extensions/<name>/index.ts`, loaded by names in an agent definition. Use extensions for commands, tools, lifecycle hooks, and session event handling. They are runtime dependencies rather than public assets, so `internal` does not apply to extension names.

### Chains

`chains.ts` exports named chain definitions. Chain stages use role references such as `planner` or qualified role references such as `coding/worker`. Qualified references use a domain role, not necessarily the final target domain id; bindings may redirect them.

`internal.chains` hides named chains from other domains and from outside callers while keeping them usable inside the owning domain. Unknown-chain and internal-chain failures should remain distinguishable.

## Project Configuration

`.cosmonauts/config.json` controls project selection:

```json
{
  "domain": "coding",
  "activeDomains": ["main", "coding", "ruby-coding", "ruby-experimental"],
  "domainBindings": {
    "ruby-coding": "ruby-experimental"
  },
  "skills": ["plan", "task"],
  "chains": {
    "review": {
      "description": "Project review flow",
      "chain": "reviewer -> fixer"
    }
  }
}
```

`activeDomains` names non-shared domains that participate in runtime loading. `shared` is kept active automatically. Inactive providers are filtered before validation, same-precedence conflict checks, registries, prompt assembly, and binding validation. If `activeDomains` is absent, all loaded providers are active.

`domain` is the default domain role. It can be redirected through `domainBindings` just like an explicit qualified reference. `domainBindings` maps a role to an active target domain. A role without a binding resolves to the same-named active domain.

Bindings preserve requested-vs-resolved identity: a consumer may keep asking for `ruby-coding/worker` while the runtime resolves that request to `ruby-experimental/worker`. Subagent allowlists can continue to contain the requested reference.

## Live Domain Bindings

Use `/domain-bind <role> <target-domain>` inside an interactive session to redirect a role without restarting:

```text
/domain-bind ruby-coding ruby-experimental
```

The command validates the target against the same active-domain registry used by future resolution, writes the switch to the project-scoped live binding store, and appends a `cosmonauts.domain-binding` custom session entry. Later agent, spawn, and chain resolutions use the new target.

In-flight behavior is intentionally conservative: already-running top-level sessions, chain stages, and spawned children keep the agent definition, prompt, tools, model, and skills they started with. A live switch affects future resolution only; it does not cancel work or mutate existing prompts.

On session resume, fork, or replacement, the domain-binding extension replays the latest valid `cosmonauts.domain-binding` entry per role into the project-scoped live store before future resolutions. Invalid or stale entries are skipped with a warning. If the process restarts without resuming a session, only `.cosmonauts/config.json` bindings apply.

## Failure Fixes

Use the error text as an authoring checklist:

- Missing `domain.ts` for a root package: add `domain.ts` at the package root or change `cosmonauts.json` to point at the directory that contains it.
- `path: "."` appears with other domain entries: move each domain into its own subdirectory, or make the package a single-domain root package.
- Missing persona prompt: add `prompts/<agent-id>.md` next to `agents/<agent-id>.ts`; validation names the expected path.
- Capability or extension not found: add the file/directory to the agent's domain, a portable domain, or `shared`, or remove the name from the agent definition.
- Same-precedence active providers share one manifest id: rename one domain, deactivate one provider, or install one at a different precedence so merge/replace rules can apply.
- Binding target is missing or inactive: install the target domain or add it to `activeDomains`; the error names both the role and target domain.
- Malformed `domainBindings` entry: use a non-empty string key and non-empty string target. Malformed entries warn and are skipped so valid entries can still apply.
- Live `/domain-bind` target is unavailable: install or activate the target and rerun the command. The previous effective binding is left unchanged.
- Internal asset refused: call a public agent/skill/chain, run from the owning domain, or remove the asset name from the provider's `internal` deny-list.
- Stale session replay entry is invalid: inspect the session branch, install or activate the referenced target if it is still intended, or issue a fresh `/domain-bind`.
