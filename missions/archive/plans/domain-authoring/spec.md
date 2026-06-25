## Purpose

Authoring a Cosmonauts domain should feel like Rails: **convention over
configuration**. You put a thing in the place it belongs and it works — no wiring,
no registration, no hunting for the magic file. Today the loader already works
this way under the hood, but the contract is undocumented and has rough edges that
make "where does X go?" ambiguous (a domain nested inside a same-named package
folder; one `prompts/` directory holding both agent personas and framework
prompts; an agent's persona living in a different directory from its definition,
linked only by filename). On top of that, two capabilities are missing that an
author needs in an experiment-heavy, many-domains world: a way for a domain to
say **which of its agents are public** vs. internal, and a way to **wire to —
and hot-swap — another domain** without editing every consumer.

This spec formalizes the domain authoring contract so an author (human or agent)
can confidently answer: where does each part go, what do I declare, what is
domain-intrinsic vs. a project choice, and how do domains see and use each other.

## Users

- **Domain author (human)** — someone building or customizing a domain (a coding
  variant, a product-strategy domain, an experimental fork). Wants a predictable
  layout and to declare agents/prompts/skills/chains without ceremony.
- **Domain author (agent)** — `cosmo` or a scaffolding agent generating a new
  domain's files. Benefits from a strict, conventional structure it can reproduce.
- **Operator / project owner** — configures which domains are active for a project
  and swaps a stable domain for an experimental one, in config or live in a
  session.
- **Consuming agent** — an agent (e.g. `cosmo`) that delegates to another domain's
  agents; should reach only what that domain chooses to expose.

## User Experience

### Declaring a domain (the happy path)

An author creates a domain by making a folder and dropping files in conventional
places. A **single-domain package's root folder _is_ the domain** — no nested
`coding/coding`. The canonical layout:

```
<domain>/
  domain.ts          # manifest: id, description, lead, defaultModel, internal?
  agents/<id>.ts     # one AgentDefinition per agent
  prompts/<id>.md    # the persona for agent <id> (parallel to agents/)
  capabilities/*.md  # always-on prompt layers, declared per agent
  skills/<name>/     # on-demand knowledge (SKILL.md)
  extensions/<name>/ # code: tools and lifecycle hooks
  chains.ts          # named chains
```

Rules the author can rely on:

- **Agents and personas are parallel directories** linked by name: `agents/cody.ts`
  declares the agent, `prompts/cody.md` is its system-prompt persona. Mirrors Rails'
  `app/models` ↔ `app/views`.
- **`prompts/` holds only agent personas.** Framework-level prompts (universal
  base, sub-agent runtime overlay) live in their own framework-owned location, not
  mixed into a domain's persona namespace.
- **Structured parts stay typed TS** (`domain.ts`, `agents/*.ts`, `chains.ts`);
  content stays markdown (`prompts/`, `capabilities/`, `skills/`). The author gets
  type-checking on definitions and plain markdown for everything an author writes
  in prose.
- Adding an agent = add `agents/<id>.ts` + `prompts/<id>.md`. Nothing else to
  register.

### Declaring a public surface (provider side)

By default, **everything a domain provides is public** — its agents, skills, and
chains are reachable from other domains. To hide something, the author declares an
`internal` list in the manifest naming the specific assets to keep private; those
named assets become unreachable from outside the domain, and **everything not
named stays public**. The declaration is a deny-list, not an allow-list: it filters
out only what is explicitly listed. This is deliberate — the failure mode of
forgetting to list an asset is that it stays *visible* (harmless), never that it
silently disappears from consumers. Omitting an asset-type list entirely (e.g.
listing only `internal.agents`) leaves that whole asset type — skills, chains —
public. Open by default, hidden only by explicit choice.

### Wiring to and swapping another domain (consumer side)

A consumer references another domain by a **role name that defaults to the
domain's own name** — referencing `ruby-coding` resolves to the `ruby-coding`
domain with zero configuration. To swap (e.g. point `ruby-coding` at an
experimental variant), the operator adds a single **binding override** in
configuration; absent an override, the role resolves to the same-named domain.

Switching happens at two levels:

- **Project config** — a persistent default for which domains are active and how
  roles are bound, in `.cosmonauts/config.json`.
- **Live, mid-session** — the operator can switch a binding during a session
  (e.g. `ruby-coding` → `ruby-experimental`) without restarting.

### Domain config vs. cosmonauts config

- **Intrinsic to a domain** (travels with the domain, in `domain.ts`): id,
  description, lead, default model, and its `internal` list (which assets are
  hidden from other domains).
- **A project/cosmonauts-level choice** (in `.cosmonauts/config.json`, never baked
  into a domain): which domains are active, role bindings/overrides, the default
  domain, skill filtering, and project-defined chains.

### Failure and edge flows

- **Missing persona** — an agent declared without a matching `prompts/<id>.md`
  surfaces a clear authoring error naming the agent and the expected file path
  (not a generic load failure).
- **Domain ID conflict** — two active domains claiming the same id are reported as
  a conflict the operator must resolve, not silently merged.
- **Role bound to a missing domain** — a binding override pointing at a domain that
  isn't installed/active fails with a message naming the unresolved role and target.
- **Reaching an internal agent** — a consumer referencing an agent the target
  domain marked `internal` is refused with a message that the agent is internal to
  its domain (distinct from "not found").
- **Live switch with no target** — switching a role to a domain that isn't
  available is rejected and leaves the current binding intact.
- **Malformed binding config** — a malformed role-binding entry in project config
  does not silently take effect or silently vanish; it surfaces an actionable
  warning naming the offending entry, and the rest of the config still loads. (A
  binding is execution identity, so a typo must not quietly revert a role to its
  same-named default and then mislead the operator with a later not-found.)
- **Invalid package layout** — declaring a domain at the package root (`path: "."`)
  alongside other domains is rejected as a package-authoring error; a root domain
  must be the only domain in its package (multi-domain packages use subfolders).

## Acceptance Criteria

- An author can create a new domain by adding a folder with `domain.ts` and the
  convention subdirectories, and the domain loads with no separate registration
  step.
- For a single-domain package, the package root folder is the domain (no
  same-named nested subfolder is required).
- Adding an agent requires exactly two files — `agents/<id>.ts` and
  `prompts/<id>.md` — and the persona is picked up automatically by name.
- `prompts/` in a domain contains only agent personas; framework base/runtime
  prompts are not present in any domain's `prompts/` directory.
- With no `internal` declared, every agent/skill/chain in a domain is reachable from
  another domain.
- Declaring `internal` hides only the named assets from other domains; assets not
  named — and entire asset-type lists left out — remain reachable from outside.
- A consumer referencing role `ruby-coding` with no binding override resolves to
  the `ruby-coding` domain.
- Adding one binding override in project config redirects role `ruby-coding` to a
  different domain without editing any consumer agent.
- The project's default `domain` is itself a bindable role: binding it redirects all
  default-domain flows (default lead, that domain's chains, model/thinking lookup),
  not only explicit `role/agent` references.
- The same binding can be changed live during a session and takes effect without
  restarting the session.
- Documentation exists that states, for each part of a domain (manifest, agent,
  persona, capability, skill, extension, chain), where it goes and how it is
  declared — sufficient for an author to build a domain from the doc alone.
- Each failure flow above produces a specific, actionable message (missing persona,
  ID conflict, role bound to missing domain, reaching an internal agent, live
  switch with no target, malformed binding config, root domain alongside other
  domains).

## Scope

Included:
- Canonical, documented per-domain folder structure and the declaration rule for
  each part.
- Fixing two clarity rough edges: single-domain package root = the domain (collapse
  the `coding/coding` nesting); separate persona prompts from framework prompts.
- Keeping structured definitions as typed TS and content as markdown.
- Provider-declared visibility via an `internal` deny-list, default-public, covering
  agents, skills, and chains.
- Consumer role-binding where role defaults to the same-named domain, with a single
  override to swap.
- Domain-config vs. cosmonauts-config split, made explicit and documented.
- Switching active domains / bindings at both project-config and live-session level.
- The authoring-contract documentation itself.

Excluded:
- Implementation architecture: loader/registry/prompt-assembly internals, how live
  switching reloads or rebinds running sessions, package install/eject/update
  plumbing.
- Domain **routing** (`cosmo` automatically choosing the right domain for a task) —
  a separate slice of the `domains` track.
- Declarative-format **migration** (manifest/agents/chains → JSON/YAML) — explicitly
  deferred; this spec keeps TS objects.
- Domain composition / inheritance.
- Authoring the actual content (agents, skills) of any specific domain (e.g.
  `coding`, `product`), and the physical extraction of `coding` to its own repo.
- Remote catalog / marketplace discovery.

## Assumptions

- The existing loader convention (scan `domain.ts`, `agents/*.ts`,
  `capabilities/*.md`, `prompts/*.md`, `skills/<name>/`, `extensions/<name>/`,
  `chains.ts`) is the baseline; this work formalizes and documents it rather than
  replacing it.
- Multi-domain packages (a `cosmonauts.json` listing several domains) still place
  each domain in its own subfolder; the "root = domain" simplification applies to
  the single-domain case, which is the common one.
- Role bindings and the active-domain set belong in the existing project config
  (`.cosmonauts/config.json`), extending it rather than introducing a new config
  file.
- The `internal` deny-list is primarily about agents (the immediate pain — `cosmo`
  hand-listing many `coding/*` sub-agents); the default-public rule and the
  hide-by-naming mechanism apply uniformly to skills and chains too.
- "Live mid-session switch" means an operator-initiated action within a running
  session (exact surface — slash command, CLI, etc. — is a planner/UX detail), not
  automatic switching by an agent.
- Fixing the package nesting and prompt-location rough edges implies a migration of
  the existing `coding` (and any other) domain layout; that migration is in scope as
  a consequence, but its mechanics are planner work.

## Open Questions

- RESOLVED — visibility is a per-asset-type `internal` deny-list
  (`{ agents?, skills?, chains? }`). Default-public; naming an asset under its type
  hides it from other domains; unnamed assets and omitted type lists stay public.
  (Was: allow-list `exports`; inverted to a deny-list so human error fails toward
  visible, not hidden.)
- What is the surface for the live mid-session switch (slash command in the session,
  a CLI subcommand, both)? And what happens to in-flight work using the old binding
  at switch time?
- When swapping role `ruby-coding` from `ruby` to `ruby-experimental`, must the two
  domains satisfy a compatible "shape" (same publicly reachable agent names), or is
  any domain a valid target and broken references just surface as errors?
- Does the framework need a typed notion of a "role" distinct from a domain id, or
  is a role simply "a domain id, optionally redirected by a binding"? (Current lean:
  the latter — keep it simple.)
- Where exactly do the relocated framework prompts (universal base, sub-agent
  runtime overlay) live once removed from any domain's `prompts/`? (Framework-owned
  location — precise path is a planner decision.)
- For backward compatibility during the package-nesting migration, must the loader
  keep accepting the old nested layout for a transition period, or is it a hard cut?
