# Domain System — Forward Architecture & Roadmap

**Status:** Forward source of truth for cosmonauts' domain system — extraction,
the framework/domain boundary, the customization model, and domain routing.
Companion to the `domains` roadmap entry. **Absorbs** `domain-plugins`,
`domain-aware-skills`, `skill-routing`. Last updated 2026-06-15.

## The vision

Domains are **composable agentic bundles** that extend Cosmonauts — the unit of
capability and the space for experimentation. In experimental times the value is
**many specialized and experimental domains** (agentic help for everything, not
just coding), including **multiple specialized coding variants** — not one
canonical coding domain. A domain carries the **full agentic stack**: agents,
prompts, capabilities, skills, tools, chains, and whatever orchestration
mechanisms the framework grows (swarms, memory, autonomy triggers). **The domain
manifest is the extensible seam** — so domains are the packaging/distribution unit
for every other track.

## What's already built (the plugin substrate, ~80%)

- **Install transports** — git (`https://`, `github:owner/repo`, `file://`, with
  branch/tag), local-path copy, symlink (`--link`), catalog (`lib/packages/installer.ts`).
- **Package manifest** (`cosmonauts.json`) + validation; a static **catalog** of
  official domains.
- **Multi-source loading** with precedence + merge strategy; the `portable` flag on
  `DomainManifest`; domain-ID **conflict detection**.
- **Install scopes** (global `~/.cosmonauts/packages/`, project
  `.cosmonauts/packages/`) + install metadata.
- **CLI** — `packages`, `eject` (copy a domain into `.cosmonauts/domains/`),
  `update`.

So "installable external domains, à la Claude Code plugins" is **largely done.**
The remaining work is to finish, document, ship a minimal core, and add routing —
not build from scratch.

## Core bundle (what ships)

**Framework + `shared` + `main`. No merge.**

- **`shared` = the standard library** — capabilities, base prompts, runtime
  overlays; **agent-less**; always loaded first; the universal fallback every
  domain (including external) inherits. Merging an assistant into it would force
  `cosmo` onto every external domain — so it stays neutral.
- **`main` = the default assistant domain** (home of `cosmo`). Without at least one
  assistant domain, Cosmonauts has no value out of the box.
- **Audit the `shared`/`main` split:** move anything cosmo-specific out of `shared`;
  move anything reusable-by-any-domain out of `main`.
- **`coding` + all future/experimental domains = external repos.**

## Boundary — framework vs. domain

- **Framework provides** (substrate + contracts): loader/registry/prompt-assembly;
  manifest + package system (install/eject/update/catalog); the extension+tool API
  (`registerTool`); built-in tools + `tools` presets; the four-layer prompt
  convention; orchestration runtime; task/plan/session lifecycle; CLI; config; and
  **`shared`** (the stdlib).
- **A domain provides** (content + behavior): agents, personas, capabilities,
  skills, domain tools/extensions, chains, a lead.
- **Connectors (seams):** package manifest (`cosmonauts.json`) + domain manifest
  (`domain.ts`); the convention dirs (auto-discovered); the `registerTool`/extension
  API; capability+prompt layering (domain-first → `shared` fallback); the
  qualified-ID registry (`coding/worker`); install/resolution + precedence/merge.

## Where everything is defined + the declarative decision

| Asset | Location | Format |
|---|---|---|
| Manifest | `domain.ts` | TS object (data-shaped, but code) |
| Agents | `agents/*.ts` | TS `AgentDefinition` (mostly named references) |
| Personas | `prompts/*.md` | markdown ✅ |
| Capabilities | `capabilities/*.md` | markdown ✅ |
| Skills | `skills/<n>/SKILL.md` | markdown + frontmatter ✅ |
| Named chains | `chains.ts` | TS array of `{name, chain}` |
| Tools | `extensions/*` | TS `registerTool` (genuinely code) |

Content (prompts/capabilities/skills) is already markdown/declarative; structure
(manifest/agents/chains) is data-shaped but in code; tools are genuinely logic.

**Decision (open, plan-time):** push the declarative-by-nature assets — **manifest,
agent definitions, named chains** — toward pure data (JSON/YAML/frontmatter) so a
domain is *mostly editable config + markdown*, with code confined to tool behavior.
Data merges cleaner for overrides and authors without a compiler. Trade-off: loses
TS type-checking on those objects (recover via schema validation); it's a real
refactor. **Principle: as declarative/conventional as possible — easy to access,
understand, override.**

## Customization model (customize ⇄ upgrade)

The loader's layered sources resolve the tension:
`builtin/bundled` (low) → `~/.cosmonauts/domains/` (user) → `.cosmonauts/domains/`
(project, high), `merge` = union, higher precedence wins.

- **Override-layer:** customize a bundled domain (including `main`) by shadowing
  *only the changed assets* in a higher-precedence layer; upgrades replace the base
  layer, overrides persist. **Customizable *and* upgradeable, no fork.** (Confirm
  asset-granular merge at plan time.)
- **`eject`:** full fork into the project — total control, no upgrades.
- **User-definition surfaces already exist:** `.cosmonauts/domains/`,
  `~/.cosmonauts/domains/`, config (`domain`/`skills`/`skillPaths`/`chains`),
  `--plugin-dir`, `eject`. Work = make them coherent, asset-granular, documented.

## New mechanics (beyond a plugin system)

- **Domain routing** — with many domains (including several coding variants),
  `cosmo` must pick the right domain for a task. A level above `skill-routing`
  (which picks skills *within* a domain). New capability.
- **Domain-aware skill discovery** — discovery is global today; scope it to the
  active domain context (`domain-aware-skills`) and route skills to workers by
  domain/language/task label (`skill-routing`).
- **Domain composition / inheritance — DEFERRED.** Variant domains share most of a
  base; today domains are standalone (only `shared` is universal fallback). For now
  experiment via install-many + eject-to-fork (both exist); add inheritance only if
  duplication justifies it.

## Decouple hardcoded IDs

Framework hardcodes a few IDs: `"shared"` (stays special by design), `"main"`/
`"cosmo"` (default lead), `"coding"` (dump-prompt fallback only). Hoist to
constants/config so external domains aren't second-class. Minor.

## Forward slices

- **S1 — Core bundle + boundary doc.** Ship framework + `shared` + `main`; audit +
  document the `shared`/`main` split and the framework/domain contract; decouple the
  stray hardcoded IDs.
- **S2 — Extract `coding`.** Move `bundled/coding/` → its own repo; register in the
  catalog; `--link` dev loop; decide ships-by-default vs. install-on-demand. The
  first real consumer.
- **S3 — Customization model formalized.** Asset-granular override-layer + `eject`;
  document the user-definition surfaces.
- **S4 — Domain routing + domain-aware skills** (`domain-aware-skills` +
  `skill-routing`).
- **S5 (decision) — Declarative-format migration** (manifest/agents/chains → data),
  if adopted.
- **Deferred** — domain composition/inheritance; a remote catalog/marketplace
  (discovery beyond git URLs).

## Open decisions

- Declarative format for manifest/agents/chains (TS object vs. JSON/YAML/frontmatter).
- Ships-by-default vs. install-on-demand for `coding` (and whether the framework npm
  tarball keeps bundling it).
- Override merge granularity (asset-level vs. whole-domain) — verify + formalize.
- Whether domain routing lives in `cosmo`'s prompt vs. a typed mechanism.

## Consolidation ledger

- **Absorbs ROADMAP ideas:** `domain-plugins` (→ S1/S2), `domain-aware-skills`
  (→ S4), `skill-routing` (→ S4).
- **Cross-links (not absorbed):** the tool-authoring contract (tool-ecosystem
  track); `language-skills` / `domain-skills` (skill *content* that lives in external
  domains — downstream/separate); `hook-system` (extensibility).
- **Status:** the plugin substrate is ~80% built (installer/catalog/eject/update/
  multi-source); this track finishes + documents + ships minimal + adds routing.
