---
title: 'Harness Adapters: Single-Source Factory Assets'
status: active
createdAt: '2026-08-25T17:12:38.973Z'
updatedAt: '2026-08-25T19:31:09.144Z'
---

## Overview

Replace the destructive skill copier with one harness-adapter subsystem that resolves targets, renders skills and commands, materializes links or provenance-checked copies, and checks drift without writing. The registry becomes the only target-resolution boundary used by `cosmonauts skills export`, `cosmonauts harness sync`, and agent-package export; agent-package prompt/skill assembly, binary compilation, invocation, and inline delivery remain unchanged.

This is a 12-behavior planned feature/refactor. It migrates the two live Claude commands only after pair-level byte-equivalence proof, regenerates the repository's five stale Claude skill exports through the safe path with durable evidence, and removes hand-maintained inventory facts from the external `cosmonauts` skill. It does not build coordinator packages, `skillDelivery: "reference"`, Drive envelopes, external-session capture, Gemini support, domain distribution, or any memory/knowledge feature.

Implementation is blocked at Gate 0. The four spec open questions remain planner proposals for the human to rule, and review exposed a separate ratified-spec-format collision: `spec.md` has ratified invariants but no canonical Intent Goal. D-010 presents the options without modifying or inferring ratified spec text.

## Architecture Context

This plan is bounded by existing architecture records rather than creating a new one:

- `missions/architecture/domains.md` makes domains the eventual packaging/distribution unit, keeps `shared` neutral, and sends coding content toward an external domain. D-001 therefore treats a top-level command home as a proposed transitional home for this repository, not a permanent framework/domain boundary; source descriptors, not physical paths, are the adapter contract.
- `missions/architecture/orchestration-future.md` remains the forward orchestration source. The prioritized `ROADMAP.md` says `drive-envelope` extends a `runStart` seam, although that architecture record does not literally name `runStart`; this plan exposes no orchestration hook and does not guess the follow-on contract.
- `missions/architecture/code-structure-map.md` says the derived map is the mechanical structural evidence source. The runtime architecture-map read reported `memory/architecture/index.md` missing, so direct code inspection is the available evidence and the missing map remains uncertainty.
- The prioritized `ROADMAP.md` orders `harness-adapters -> drive-envelope -> coordinator-packages -> external-session-capture`. The registry exposes stable target/asset lookup for later `skillDelivery: "reference"`, and the external-skill renderer can later accept capture instructions as generated inputs. Neither follow-on is built here.
- Pi v0.80.6 provides skill discovery/loading (`DefaultResourceLoader`, `loadSkills`, `loadSkillsFromDir`) but no provenance-aware external-harness sync. Reuse the existing Cosmonauts runtime/discovery seam rather than build another skill loader.
- `domains/shared/skills/work-artifacts/references/deviation-protocol.md` governs all collisions. INV-1..INV-6, AC-1..AC-7, the Out of Scope list, and any human choice at Gate 0 are ratified ground.

Boundary rules:

- `lib/harness-adapters/` owns canonical target identity, source descriptors, rendering, provenance, state classification, and safe materialization. It may depend on filesystem/path/crypto primitives and injected plain inventory data, but never on CLI modules or agent-package builders.
- `cli/`, `lib/skills/`, and `lib/agent-packages/` depend inward on the registry. Only the registry maps canonical harness identity to an existing package serialization/runtime label.
- Live inventory collection uses the already-created `CosmonautsRuntime`, `listNamedChains`, effective `discoverSkills`, and the registry. Renderers receive plain rows and do not bootstrap or shell out to a second runtime.
- Existing internal agents continue reading domain skill homes directly. The adapter writes only registered external target-owner roots and never memory, knowledge, mission task state, or orchestration run state.

## Decision Log

- **D-001 - Propose a transitional top-level `external-commands/` native home**
  - Decision: Propose `external-commands/spec-to-backlog.md` and `external-commands/implement-plan.md` as the git-tracked native sources in this repository. Register them through stable source descriptors; do not make the physical path a public contract. When the domains track defines command contribution and coding is extracted, it may relocate these coding-facing sources into that domain while retaining asset IDs and the adapter contract. Publication in this package's `files` list follows only if the human ratifies this option.
  - Alternatives: `domains/shared/commands/` is rejected because these workflows are not neutral stdlib content and `shared` is explicitly agent-less/neutral; folding commands into `external-skills/` is rejected because it conflates separate target directories, formats, and lifecycles. A permanent top-level framework ownership promise is also rejected after `review.md (round 1) PR-006` because it would pre-empt coding extraction and the domains packaging boundary.
  - Why: Serves INV-1 with one current native home while making the least durable claim necessary and leaving `missions/architecture/domains.md` free to own packaging for the world.
  - Decided by: planner-proposed, 2026-08-25

- **D-002 - Default normal sync to copy-with-provenance**
  - Decision: When neither `--copy` nor `--link` is supplied, normal sync uses copy mode. `--link` is explicit opt-in. `--check` without a mode validates the recorded mode for managed assets and uses copy only as the desired mode for never-managed assets.
  - Alternatives: Link-by-default is rejected despite immediate source visibility because it surprises users with live filesystem coupling and is unsuitable outside the local trust boundary; requiring a mode every time is rejected as needless friction.
  - Why: Prioritizes INV-2 and INV-3's safe, inspectable default while preserving INV-6 availability.
  - Decided by: planner-proposed, 2026-08-25

- **D-003 - Keep this repository's `.claude/` exports ignored but mechanically checked**
  - Decision: Keep `.claude/` gitignored. Generated Claude assets/manifests remain local outputs; one-time migration evidence and explicit provisioned-environment checks are tracked instead.
  - Alternatives: Selectively tracking `.claude/skills/**` plus a manifest would expose drift in review but commit a large duplicate tree and machine/scope churn; tracking all `.claude/` risks unrelated local harness state.
  - Why: INV-1 keeps reviewed authority in native sources; INV-3 supplies fresh read-back evidence without making copies authoritative.
  - Decided by: planner-proposed, 2026-08-25

- **D-004 - Keep `--check` manual/provisioned-CI rather than a universal v1 repo gate**
  - Decision: Ship a CI-suitable nonzero check and run it at this plan's migration/release checkpoints, but do not add it to universal test/lint/typecheck scripts in v1.
  - Alternatives: A universal gate is rejected because a clean checkout intentionally lacks ignored project/personal outputs; a gate that syncs first is rejected because it writes and hides `missing`.
  - Why: Preserves INV-3 automation without making machine-local provisioning an implicit clean-checkout prerequisite.
  - Decided by: planner-proposed, 2026-08-25

- **D-005 - Canonical harness IDs map to explicit package compatibility metadata**
  - Decision: Supported v1 harness IDs are `claude` and `codex`; `claude-cli` is accepted only as a legacy agent-package input alias. The Claude registry entry's agent-package adapter explicitly declares `acceptedDefinitionKeys: ["claude", "claude-cli"]`, `canonicalDefinitionKey: "claude"`, `serializedTarget: "claude-cli"`, and `packageIdSuffix: "claude-cli"`. Generated definitions use `claude`; existing definitions using `claude-cli` remain valid; `AgentPackage.target`, generated package IDs, binary dispatch, and success JSON retain existing `claude-cli` serialization. Supplying both keys is rejected before build, even if options match. `open-code` remains declared/unimplemented; Gemini has no v1 entry.
  - Alternatives: Carrying `claude` through existing builder serialization was rejected because it changes observable package behavior; retaining consumer-local target sets was rejected by INV-5; silently choosing one of duplicate alias/canonical blocks was rejected as ambiguous. This exact compatibility boundary addresses `review.md (round 1) PR-001`.
  - Why: Serves AC-1/INV-5 while changing only target resolution and preserving the ratified agent-package building exclusion.
  - Decided by: planner-proposed, 2026-08-25

- **D-006 - Local-edit evidence outranks source drift**
  - Decision: If a copy target or generated wrapper node differs from recorded target provenance, classify `locally-edited` even when source inputs also changed. `source-ahead` requires the materialized target still match its recorded baseline while desired render, desired mode, source existence/structure, generated facts, or durable transaction state differs. Unprovenanced targets are `locally-edited`.
  - Alternatives: Reporting only `source-ahead` for both-changed was rejected because it could authorize overwrite; adding a fifth public state was rejected because AC-2 ratifies four; treating unmanaged targets as `missing` was rejected by INV-2.
  - Why: Gives INV-2 precedence without narrowing AC-2.
  - Decided by: planner-proposed, 2026-08-25

- **D-007 - Separate complete reconciliation from partial selection**
  - Decision: `harness sync` is `complete` within each explicitly selected target/scope/kind inventory and may remove a manifest-owned unchanged output only when its source asset truly disappeared from that complete inventory. Compatibility `skills export <names>` is `partial`: it touches only named assets and never interprets unselected manifest entries as removed. Omitted target selects all supported v1 targets; omitted scope uses project for skills and personal for commands; explicit scope overrides both.
  - Alternatives: Treating “not selected” as removed was rejected after `review.md (round 1) PR-002` because a later named export could delete another valid skill; making every operation partial was rejected because full sync must reconcile real source deletion.
  - Why: Preserves current named-export UX and INV-2 while giving complete sync a defined stale-output exit.
  - Decided by: planner-proposed, 2026-08-25

- **D-008 - Link provenance tracks pointer shape, not live source bytes**
  - Decision: A correct direct directory link remains `current` when source file contents or descendants change because those changes are already live. A flat `.md` skill uses a target directory with `SKILL.md` linked to the source file and follows the same rule. A generated wrapper separately records authored link-map shape and generated-node hashes: authored content edits behind correct links are current; authored path additions/removals or generated-fact changes are `source-ahead`; generated target edits or wrong links are `locally-edited`; broken/missing sources are `source-ahead`. Remote sources, unexpected source-root escapes, escaping descendant symlinks, symlinked target parents, and wrapper output escapes are rejected.
  - Alternatives: Hashing linked source content as copied output was rejected after `review.md (round 1) PR-004` because one edit became both current and ahead; silent copy fallback was rejected by INV-6; mutating package sources was rejected.
  - Why: Satisfies immediate-live INV-1/INV-6 semantics while retaining mechanical detection for pointer/wrapper state.
  - Decided by: planner-proposed, 2026-08-25

- **D-009 - One owner-root lock; check observes recovery without writing**
  - Decision: The canonical target/scope owner root is `.claude` or `.agents` under project/home. Its manifest, lock, and single pending journal have fixed sibling names; Claude skills and commands therefore share exactly one lock identity. Normal sync acquires that lock and reconciles the journal before new work. `--check` creates no root/lock and never recovers: it reads the journal and reports `source-ahead` with `recovery-pending` when old/new evidence is recognized, `missing` when the recorded target is absent, or `locally-edited` when ambiguous; every pending journal makes check nonzero.
  - Alternatives: Per-kind locks were rejected because they race on one manifest; check-time recovery was rejected by the no-write contract; in-memory recovery was rejected across crashes. This addresses `review.md (round 1) PR-003`.
  - Why: Serves INV-2/INV-3 across processes without contradicting read-only check.
  - Decided by: planner-proposed, 2026-08-25

- **D-010 - Ratified Intent Goal requires a human decision** *(ratified decision needed)*
  - Decision: No Goal amendment is applied by this plan. Proposed option A is for the human to add/ratify: “Cosmonauts assets are authored once and remain live or mechanically verifiable in every supported harness, so coordinators can switch harnesses without re-authoring or silent drift.” Option B is for the human to explicitly ratify the invariant-only Intent as a deliberate artifact-format exception. Until one is chosen, Gate 0 remains closed.
  - Alternatives: Silently inferring a Goal from Purpose is rejected because Intent is ratified; allowing implementers to choose priority without a Goal is rejected because the deviation discriminator needs canonical intent. This records `review.md (round 1) PR-011` rather than editing `spec.md`.
  - Why: Preserves ratified-ground authority under the deviation protocol.
  - Decided by: planner-proposed, decision-needed, 2026-08-25

- **D-011 - Generated inventory has one exact portable Markdown contract**
  - Decision: Render `external-skills/cosmonauts/references/generated-inventory.md` with a deterministic marker and exactly three sorted sections: `Named chains` (`Name | Description | Expression`), `Skills` (`Name | Domain | Description`), and `Harness paths` (`Target | Kind | Project | Personal`). Rows sort by name/domain or target/kind; table controls/newlines/pipes are escaped; paths are registry-derived portable templates such as `.claude/skills` and `~/.claude/skills`, never machine-absolute paths. Authored chain/skill files say to read this reference when present and otherwise query the CLI, so a direct source symlink remains coherent.
  - Alternatives: An unnamed/generated blob was rejected after `review.md (round 1) PR-009` because workers could invent incompatible bytes; writing generated facts back into source was rejected by INV-1; hand tables were rejected by INV-4.
  - Why: Makes AC-5 authorable, deterministic, and compatible with copy and wrapper hashes.
  - Decided by: planner-proposed, 2026-08-25

- **D-012 - Add root `--list-chains` while retaining the existing route**
  - Decision: Add `cosmonauts --list-chains` with the existing top-level human/plain/JSON convention, backed by the same `listNamedChains` result as `cosmonauts run chain list`; keep the latter for compatibility. Sync-time generation calls the shared loader directly, not either CLI route.
  - Alternatives: Reusing only `run chain list` would be less surface and was recommended by `review.md (round 1) PR-007`, but the user-supplied verified-current requirement explicitly identifies the absent root flag as the AC-5 prerequisite. Building another chain registry or parsing subprocess output is rejected.
  - Why: Serves AC-5/INV-4 with one data source and a uniform root enumeration surface alongside domains/agents.
  - Decided by: planner-proposed, 2026-08-25

## Behaviors

### B-001 - Registry and skills export use one canonical target contract

- Source: AC-1
- Context: registry or legacy skills-export callers request Claude/Codex project/personal destinations, declared `open-code`, or unregistered Gemini
- Action: target, asset kind, scope, directory, and renderer are resolved
- Expected: `claude` and `codex` resolve all supported roots/transforms from the registry; `open-code` returns declared-unimplemented and Gemini unregistered; skills export has no local target set/switch and resolves all four existing paths through the same registry
- Seam: `lib/harness-adapters/types.ts`, `lib/harness-adapters/registry.ts`, `lib/skills/exporter.ts`, `cli/skills/subcommand.ts`
- Test: `tests/skills/exporter.test.ts` > `resolves registry and legacy skill export targets from one canonical contract`
- Marker: `@cosmo-behavior plan:harness-adapters#B-001`

### B-002 - Agent-package resolution preserves the existing serialized build contract

- Source: AC-1
- Context: a loaded or generated definition uses `claude`, legacy `claude-cli`, both keys, `codex`, or a declared/unknown target
- Action: `cosmonauts export` resolves target support/options before the existing build/compile path
- Expected: canonical and legacy single-key Claude definitions resolve identical options; generated definitions use `claude`; both-key definitions fail before build; package ID suffix, `AgentPackage.target`, binary dispatch, CLI success target, prompt/tool options, and inline skill delivery remain existing `claude-cli` behavior; no consumer-local target resolver exists
- Seam: `lib/harness-adapters/registry.ts`, `lib/agent-packages/types.ts`, `lib/agent-packages/definition.ts`, `lib/agent-packages/build.ts`, `cli/export/subcommand.ts`
- Test: `tests/agent-packages/definition.test.ts` > `maps canonical and legacy Claude definitions to the unchanged package runtime contract`
- Marker: `@cosmo-behavior plan:harness-adapters#B-002`

### B-003 - Complete sync reconciles deletion while partial export preserves unselected assets

- Source: AC-2
- Context: two managed skills exist, then one source is deleted or merely omitted from a later named `skills export`
- Action: complete `harness sync` or partial compatibility export runs
- Expected: complete sync removes only the unchanged manifest-owned target whose source truly disappeared and retains all live assets; partial export updates the named skill and leaves every unselected target/entry byte-identical; omitted target/scope defaults follow D-007
- Seam: `lib/harness-adapters/sync.ts`, `cli/harness/subcommand.ts`, `cli/skills/subcommand.ts`
- Test: `tests/skills/exporter.test.ts` > `distinguishes complete source reconciliation from partial named export selection`
- Marker: `@cosmo-behavior plan:harness-adapters#B-003`

### B-004 - Copy and local-link materialization are safe, idempotent, and shape-correct

- Source: AC-2
- Context: missing directory skills, a flat root `.md` skill, and invalid remote/escaping/symlink inputs are prepared
- Action: sync runs in copy and explicit link modes
- Expected: copy writes `<name>/SKILL.md` plus support files, deterministic marker, and copy provenance; directory link points to the local source; flat link creates `<name>/SKILL.md` pointing to the source file; repeated current sync writes nothing; remote or escaping source/target/wrapper shapes fail before any target/manifest write
- Seam: `lib/harness-adapters/render.ts`, `lib/harness-adapters/provenance.ts`, `lib/harness-adapters/sync.ts`
- Test: `tests/skills/exporter.test.ts` > `materializes directory and flat skills safely in idempotent copy and link modes`
- Marker: `@cosmo-behavior plan:harness-adapters#B-004`

### B-005 - Read-only check reports the four states with unambiguous link semantics

- Source: AC-2
- Context: copy, direct-link, and generated-wrapper fixtures cover missing, current, source/render/structure/mode ahead, and target-edited cells
- Action: `--check` runs without a pending transaction
- Expected: every selected asset is reported once as `missing`, `current`, `source-ahead`, or `locally-edited`; direct-link source content/descendant edits remain current, wrapper link-map or generated-fact changes are ahead, wrong links/generated edits are local; fresh source/target data is read and any non-current row exits nonzero without creating or changing files, links, roots, locks, manifests, journals, timestamps, or mtimes
- Seam: `lib/harness-adapters/provenance.ts`, `lib/harness-adapters/sync.ts`, `cli/harness/subcommand.ts`
- Test: `tests/skills/exporter.test.ts` > `checks copy direct-link and generated-wrapper states without writing`
- Marker: `@cosmo-behavior plan:harness-adapters#B-005`

### B-006 - Fresh processes recover writes while check remains observational

- Source: AC-2
- Context: a prior normal sync died with each recognized old/new target, manifest, backup, and pending-journal combination, plus an ambiguous changed target
- Action: a fresh normal sync or fresh `--check` starts at the shared target/scope owner root
- Expected: normal sync under the one owner-root lock finalizes new, rolls back old staging, or restores the recorded backup before classification; ambiguous bytes remain untouched and conflict; check performs no recovery/write and reports recognized pending cells non-current with `recovery-pending`; no fresh process fabricates a default manifest/hash
- Seam: `lib/harness-adapters/provenance.ts`, `lib/harness-adapters/sync.ts`, `lib/entity-file-lock.ts`
- Test: `tests/skills/exporter.test.ts` > `rehydrates pending sync state for writers and leaves check strictly observational`
- Marker: `@cosmo-behavior plan:harness-adapters#B-006`

### B-007 - Locally edited and unmanaged targets are never overwritten

- Source: AC-3
- Context: a copy/generated target differs from its recorded baseline, a link points elsewhere, or a target exists without provenance, with or without source drift
- Action: normal sync attempts to make it current
- Expected: `locally-edited` wins, every target/backup/journal byte/type/link remains intact, and the report includes absolute resolved source and target paths plus options to port edits to source or preserve/move the target before rerunning; there is no force overwrite path
- Seam: `lib/harness-adapters/provenance.ts`, `lib/harness-adapters/sync.ts`, `cli/harness/subcommand.ts`
- Test: `tests/skills/exporter.test.ts` > `preserves local and unmanaged target edits and reports both resolution paths`
- Marker: `@cosmo-behavior plan:harness-adapters#B-007`

### B-008 - Pair-level Claude command migration proves equivalence and fully rolls back failures

- Source: AC-4
- Context: both live home commands remain untouched while native sources and deterministic Claude renders are prepared
- Action: pair-level preflight compares both live/source/render-stripped byte streams, then transactional cutover and post-write comparison run under the personal Claude owner lock
- Expected: either preflight mismatch causes zero live/manifest writes; only after both pass are both live files backed up; final stripped targets equal recorded live hashes and preserve frontmatter/body; post-write mismatch restores both live files and the prior manifest/journal; evidence-write failure retains current outputs, backups, and resumable migration state; success records equal hashes/lengths and removes backups only after check passes
- Seam: `external-commands/spec-to-backlog.md`, `external-commands/implement-plan.md`, `lib/harness-adapters/render.ts`, `lib/harness-adapters/sync.ts`, `missions/plans/harness-adapters/command-migration-evidence.json`
- Test: `tests/skills/exporter.test.ts` > `preflights both commands and restores targets plus provenance on cutover failure`
- Marker: `@cosmo-behavior plan:harness-adapters#B-008`

### B-009 - Root CLI enumerates the effective named-chain registry

- Source: AC-5
- Context: installed domain chains and project overrides exist in a selected domain context
- Action: `cosmonauts --list-chains` runs in human, plain, and JSON modes and `run chain list` runs
- Expected: both surfaces derive the same effective visible set from `listNamedChains`; root modes preserve descriptions/expressions with structured JSON, and no second chain table/registry is introduced
- Seam: `cli/main.ts`, `cli/types.ts`, `lib/chains/loader.ts`, `cli/run/subcommand.ts`
- Test: `tests/cli/main.test.ts` > `lists the effective named chains from one loader in root and run surfaces`
- Marker: `@cosmo-behavior plan:harness-adapters#B-009`

### B-010 - External cosmonauts inventory has exact live-generated bytes

- Source: AC-5
- Context: runtime facts include current chains, effective visible skills, and registry path templates, including `adapt`, all shared additions, and both main skills
- Action: the external bundle renders and syncs to Claude
- Expected: `references/generated-inventory.md` has exactly D-011's escaped/sorted three-section schema and exact supplied rows; authored external files contain no chain/skill/agent/path inventory and provide generated-reference plus live-query fallback; changing any supplied fact makes copy/wrapper check `source-ahead`
- Seam: `lib/harness-adapters/inventory.ts`, `lib/harness-adapters/render.ts`, `external-skills/cosmonauts/SKILL.md`, `external-skills/cosmonauts/chains/SKILL.md`, `external-skills/cosmonauts/skills/SKILL.md`
- Test: `tests/cli/skills/subcommand.test.ts` > `renders the exact external inventory schema from live runtime and registry rows`
- Marker: `@cosmo-behavior plan:harness-adapters#B-010`

### B-011 - Export candidates preserve runtime precedence and fail closed on every output collision

- Source: AC-6
- Context: discovery includes nested Rails skills, flat root skills, merged same-logical-path overrides, cross-domain duplicate names, a runtime `cosmonauts` name, and all nested identities inside the explicit external bundle
- Action: runtime-effective skills and export candidates are resolved separately
- Expected: runtime listing keeps existing effective first-root precedence; export candidates record `languages/rails/rails-api -> rails-api` with `frontmatter-name`, flatten flat files to `<name>/SKILL.md`, collapse only same-domain/same-logical-path overrides, and fail before writes when any remaining runtime/external logical source maps to the same output skill identity, listing all domains/source paths
- Seam: `lib/skills/discovery.ts`, `lib/harness-adapters/inventory.ts`, `lib/harness-adapters/sync.ts`
- Test: `tests/skills/discovery.test.ts` > `separates effective skills from export candidates and reports every output collision`
- Marker: `@cosmo-behavior plan:harness-adapters#B-011`

### B-012 - The five real stale repository exports produce durable live-validation evidence

- Source: AC-7
- Context: real `.claude/skills/{plan,playwright-cli,roadmap,skills-cli,task}` targets are unmanaged stale directories and their five native sources are known
- Action: validation first records the expected unmanaged conflicts/old hashes, moves all five to recovery backup, runs normal sync/check, validates source-target provenance, checks rendered `skills-cli`, and finalizes evidence
- Expected: all five named source/target pairs end current through the new path; `.codex/skills` count is zero and `.agents/skills` is present; evidence records old/new hashes, manifest entry IDs, check rows, and backup cleanup; backups are removed only after evidence is durable, and ignored targets are not presented as the unit test's proof
- Seam: `.claude/skills/plan`, `.claude/skills/playwright-cli`, `.claude/skills/roadmap`, `.claude/skills/skills-cli`, `.claude/skills/task`, `domains/shared/skills/skills-cli/SKILL.md`, `missions/plans/harness-adapters/repo-export-validation-evidence.json`
- Test: `tests/skills/exporter.test.ts` > `validates durable evidence for all five real repository export migrations`
- Marker: `@cosmo-behavior plan:harness-adapters#B-012`

### Acceptance-criterion mapping

| Acceptance criterion | Behaviors |
|---|---|
| AC-1 | B-001, B-002 |
| AC-2 | B-003, B-004, B-005, B-006 |
| AC-3 | B-007 |
| AC-4 | B-008 |
| AC-5 | B-009, B-010 |
| AC-6 | B-011 |
| AC-7 | B-012 |

## Design

### 1. Registry, render, and package-resolution contracts

Create `lib/harness-adapters/` as the stable core:

```ts
type HarnessTargetId = "claude" | "codex" | "open-code";
type HarnessAssetKind = "skill" | "command" | "agent-package";
type SyncMode = "copy" | "link";
type SyncStatus = "missing" | "current" | "source-ahead" | "locally-edited";

interface HarnessTarget {
  readonly id: HarnessTargetId;
  readonly status: "supported" | "declared";
  readonly aliases: readonly string[];
  readonly ownerRoot: (scope: ExportScope, roots: ScopeRoots) => string;
  readonly assets: Partial<Record<HarnessAssetKind, HarnessAssetAdapter>>;
}

interface HarnessAssetAdapter {
  readonly targetDir?: (ownerRoot: string) => string;
  readonly render: (asset: HarnessAsset, facts: HarnessFacts) => Promise<RenderedTree>;
  readonly agentPackage?: AgentPackageTargetAdapter;
}

interface AgentPackageTargetAdapter {
  readonly acceptedDefinitionKeys: readonly string[];
  readonly canonicalDefinitionKey: HarnessTargetId;
  readonly serializedTarget: "claude-cli" | "codex";
  readonly packageIdSuffix: "claude-cli" | "codex";
}
```

Registry entries:

| Canonical target | Owner roots | Skill dir | Command dir | Agent-package metadata |
|---|---|---|---|---|
| `claude` | `<project>/.claude`, `~/.claude` | `skills` | `commands` | accepts `claude`/`claude-cli`; serializes/invokes as existing `claude-cli` |
| `codex` | `<project>/.agents`, `~/.agents` | `skills` | unsupported v1 | canonical/serialized `codex` |
| `open-code` | none | none | none | declared, unimplemented |

Gemini is absent until the later entry-plus-transform validation.

Agent-package flow is exact:

1. Parse raw definition target blocks without consumer-local validity tables.
2. Resolve CLI/input ID through the registry.
3. Ask the selected registry adapter for target options across accepted keys; zero keys means definition mismatch, two keys means ambiguous error, one yields exact options.
4. For generated definitions, write the canonical key but use registry `packageIdSuffix` for stable IDs.
5. Pass a resolved object containing canonical `harnessId`, existing private `serializedTarget`, and exact target options into the unchanged builder/compile path. Only the registry creates that object; `serializedTarget` is transform metadata, not another resolvable target vocabulary.

This leaves the follow-on seam narrow: coordinator packages can later ask the registry for skill/command roots when they add `skillDelivery: "reference"`; this plan does not add the mode or packages.

### 2. Source descriptors and candidate/effective discovery

`HarnessAsset` is a plain descriptor with stable asset ID, kind, one registered local source root/path, logical path, output identity, default scope, and optional generated-input kind. Physical source location may move without changing identity.

Split skill discovery deliberately:

- `discoverSkillCandidates(...)` returns every candidate with domain/source/root precedence/logical path and does not deduplicate by frontmatter name.
- Existing `discoverSkills(...)` resolves candidates to the current effective runtime/list view, preserving first-root precedence and public-surface filtering. Internal sessions, `skills list`, and generated effective inventory keep this contract.
- `prepareSkillExportAssets(...)` collapses only same-domain/same-logical-path overrides, then combines runtime candidates with all `SKILL.md` identities inside `external-skills/cosmonauts`. It validates one safe output identity per harness and reports all colliding domains/logical/source paths before any write.

The flattening rule is `frontmatter-name`: `languages/rails/rails-api -> rails-api`. A flat `skills/foo.md` is rendered to `foo/SKILL.md`; its link materialization is a real `foo/` wrapper containing a `SKILL.md` symlink. Descendant/source symlinks may be followed only after resolving within the explicitly registered source-root realpath; any escape is an error. The registered package root itself may be a deliberate local package-install link, but target parents and generated output paths may not escape.

The complete harness catalogue is runtime-visible skill candidates, the external bundle descriptor, and two command descriptors. Compatibility named export passes a partial subset. Future domains may inject command descriptors once their packaging contract exists; registry/render/provenance do not change.

### 3. Exact rendering and live inventory

Render to an ordered in-memory tree of exact buffers before target writes. Hash sorted relative paths, node types, and exact bytes; do not normalize line endings. Copy-mode Markdown gets one deterministic generated-by HTML marker after frontmatter (or at byte zero). It has stable IDs and no timestamp, so exact marker removal restores native command bytes.

Collect live facts once from the existing runtime:

- effective chains via `listNamedChains(projectRoot, runtime.chains)`;
- effective visible skills via existing `discoverSkills` plus configured extra paths/context;
- registry path templates;
- agents only if an exported agent table is later introduced (none in D-011 v1).

Render exactly `external-skills/cosmonauts/references/generated-inventory.md`:

```md
<!-- deterministic generated-by marker -->
# Generated Cosmonauts Inventory

## Named chains
| Name | Description | Expression |

## Skills
| Name | Domain | Description |

## Harness paths
| Target | Kind | Project | Personal |
```

Sort chain rows by name; skills by name then domain; paths by target then kind. Escape C0/C1 controls, newlines, pipes, and Markdown table delimiters deterministically. Use portable registry templates, not machine-absolute paths. Authored `chains/SKILL.md` and `skills/SKILL.md` instruct an external agent to read the generated reference if present and otherwise run `cosmonauts --list-chains --json` / `cosmonauts skills list --json`. Other chain/skill/agent/path tables in the bundle are removed, generated, or replaced by live-query instructions.

Copy writes the rendered tree. Link mode links authored entries and writes only generated nodes. Existing direct source symlinks remain coherent through the fallback query even when no generated reference is present.

### 4. Provenance variants and state classification

Use a discriminated manifest; do not apply copy hashes to links:

```ts
type ProvenanceEntry =
  | CopyProvenance
  | DirectLinkProvenance
  | GeneratedWrapperProvenance;

interface ProvenanceBase {
  readonly schemaVersion: 1;
  readonly assetId: string;
  readonly kind: "skill" | "command";
  readonly target: "claude" | "codex";
  readonly scope: "project" | "personal";
  readonly sourcePath: string;   // stable source-root-relative
  readonly logicalPath: string;
  readonly outputPath: string;   // owner-root-relative
  readonly exportedAt: string;   // changes only after a real completed transition
}
```

Copy entries add exact source/rendered target hashes and marker version. Direct links add expected resolved local source and target link shape; source content is not a drift hash. Generated wrappers add authored link-map hash, generated-input/render hash, and generated target hash. Every stored field is compared with freshly resolved source/render/target evidence; no hash is accepted as current merely because it exists.

Local-edit priority follows D-006. A direct link remains current across content/descendant changes because the harness sees them immediately; source disappearance is ahead. Wrapper authored structure/generated facts ahead are distinct from generated target edits. Requested mode conversion is ahead only while current target matches its recorded mode baseline.

### 5. Owner-root transactions and read-only check

For each target/scope, fixed paths share one owner root:

- `.cosmonauts-harness-manifest.json`
- `.cosmonauts-harness-sync.lock`
- `.cosmonauts-harness-pending.json`
- unique staged/backup paths named in the journal

All Claude project skills/commands share `<project>/.claude`; personal share `~/.claude`; Codex equivalents share `.agents`. Normal sync processes owner roots in sorted order and holds one `withEntityFileLock` while mutating that root.

Writer transaction:

1. Rehydrate any pending journal.
2. Discover/render and preflight all collisions/containment.
3. Stage one asset, atomically persist old/new entries/hashes/stage/backup in the journal, then immediately re-read the old target.
4. Rename old target to backup, staged target into place, and atomically update manifest.
5. Remove backup/journal only after manifest and target verify new. `exportedAt` changes only now; current sync is byte-no-op.

Fresh normal recovery:

- target/new with old manifest: finalize new manifest;
- target/old with old manifest: discard stage/journal and resume classification;
- target missing with intact old backup: restore then resume;
- anything outside recorded old/new: preserve target/backup/journal and report conflict.

Check never creates the owner root or lock and never mutates recovery. It double-reads manifest/journal around target observation to detect concurrent changes. Recognized pending target-new/target-old states report `source-ahead` plus `recovery-pending`; absent recorded target reports `missing`; ambiguous bytes report `locally-edited`. Any journal makes exit nonzero.

### 6. Complete versus partial reconciliation

A `SyncRequest` carries `reconciliation: "complete" | "partial"`:

- `harness sync` is complete for each selected target/scope/kind inventory. A manifest entry absent from the complete fresh inventory is `source-ahead (source-removed)`; normal sync removes it only if its materialized target still matches provenance. Local edits conflict.
- `skills export <names>` is partial. Unselected entries are outside the request, are neither reported nor deleted, and retain exact target/manifest bytes. Selected entries use the same renderer/classifier/materializer.
- Explicit target/scope narrows ownership to that target/scope only. Omitted target selects supported Claude/Codex. Omitted scope selects project skills and personal commands; explicit scope overrides both.

### 7. Pair-level command migration

Read/copy the two live command sources exactly; do not retype/normalize. Migration is one durable pair transaction:

1. Under a migration preflight with no live writes, read both live files, both native sources, and both in-memory renders. Strip only the exact marker and require all three streams per command to match. Both commands must pass before either moves.
2. Acquire personal Claude owner lock; snapshot old manifest/journal; persist pair migration intent; move both live files to backups outside `commands/`; run ordinary now-missing copy sync.
3. Read both final targets and compare marker-stripped bytes to recorded live hashes.
4. On post-write mismatch, restore both live files and the complete old manifest/journal snapshot. If rollback cannot finish, preserve backups/journal and fail without claiming current.
5. On byte success, write `command-migration-evidence.json` with normalized `~` paths, lengths, all live/source/render/final hashes, marker version, manifest IDs, and timestamp. If evidence write fails, keep new current targets plus backups/migration state and return nonzero; rerun finalizes evidence. Remove backups/state only after evidence is durable and `--check` passes.

The test proves mechanism/failure ordering with temp files; the tracked evidence proves the actual August 25 inputs without freezing future source edits.

### 8. Repository stale-export validation

The five required live pairs are:

| Target | Native source |
|---|---|
| `.claude/skills/plan` | `domains/shared/skills/plan` |
| `.claude/skills/playwright-cli` | `bundled/coding/skills/playwright-cli` |
| `.claude/skills/roadmap` | `domains/shared/skills/roadmap` |
| `.claude/skills/skills-cli` | `domains/shared/skills/skills-cli` |
| `.claude/skills/task` | `domains/shared/skills/task` |

First run normal sync and record all five as unmanaged conflicts without changing them. Hash and move all five to a recovery backup, then run ordinary complete Claude/project sync and check. Validate each manifest/source/target, render `skills-cli`, and write `repo-export-validation-evidence.json` with old hashes, new target/manifest hashes, exact current check rows, `.codex/skills` count zero, `.agents/skills` presence, backup identity, and completion time. Remove backup, then atomically mark `backupsRemoved: true`; if final evidence update fails, retain/recreate recoverable evidence and do not claim completion.

Ignored targets are live outputs, not the durable proof. The named test validates the evidence schema, exact five pairs, equal recorded source/render relationships, check rows, obsolete-path assertions, and completed backup exit.

### 9. CLI and reports

Add `cosmonauts harness sync [--target <id>] [--scope project|personal] [--link|--copy] [--check]` with standard human/plain/JSON output. Rows include target, scope, kind, asset/source/target paths, requested/recorded mode, before status, action/final status, and conflict/recovery details. `--copy`/`--link` are mutually exclusive.

Normal sync returns success after safe missing/ahead transitions and nonzero for conflict/collision/manifest/recovery/write failures. Check returns nonzero for any non-current row and never calls materializers.

Retain `skills export` as a partial compatibility facade; remove its `VALID_TARGETS` and destructive target switch/`rm`+`cp`. Agent-package CLI similarly uses registry resolution then existing builders.

Add root `--list-chains` by reusing `listNamedChains`, preserving `run chain list`. Root output mirrors domains/agents human/plain/JSON and bypasses interactive/no-domain guards as an informational mode.

### 10. Invariant-to-write trace

| Written field/artifact | INV-1 | INV-2 | INV-3 | INV-4 | INV-5 | INV-6 |
|---|---|---|---|---|---|---|
| Copy target/marker | One asset ID/source; target never input | Fresh baseline is replace precondition | Source/render/target bytes re-read | Generated facts only injected | Path/renderer registry-owned | Not applicable |
| Direct link/flat wrapper | One resolved registered source | Wrong/unmanaged link conflicts | Pointer/source existence/shape re-read | No mirrored facts | Registry path | Explicit local mode; containment enforced |
| Generated wrapper | Authored nodes point to source; generated nodes derived | Wrong links/generated bytes conflict | Link map, facts, generated bytes re-read | Exact live-fact schema | Registry transform | Explicit local wrapper, no escapes |
| Manifest variant and `exportedAt` | Provenance only | Old entry/hash gates writes | Every variant compared fresh; timestamp ignored for current | Facts not authoritative in manifest | Canonical target validated | Records materialization variant |
| Owner lock/stage/backup/journal | No alternate source | Serialize and recover old/new | Fresh process rehydrates; check observes only | No fact authority | Owner root registry-derived | Cannot authorize remote/escape |
| Command native files/evidence | Native source plus historical proof | Pair preflight/rollback | Actual live/final hashes recorded | No mirrored inventories | Claude adapter | Link can point local native file |
| Repository validation evidence | Named source/targets only | Old exports backed up until proof | Five fresh current rows/hashes | Obsolete path rendered from source | Claude registry path | Records actual mode |

No implementation field is written under `memory/`, `knowledge/`, task state, or run/session state. Memory/knowledge remains gated OFF.

## Files to Change

- `tests/skills/exporter.test.ts` ↔ new `lib/harness-adapters/types.ts`, new `lib/harness-adapters/registry.ts`, new `lib/harness-adapters/render.ts`, new `lib/harness-adapters/provenance.ts`, new `lib/harness-adapters/sync.ts`, new `lib/harness-adapters/index.ts`, `lib/skills/exporter.ts`, `lib/skills/index.ts`, existing `lib/entity-file-lock.ts` API (B-001, B-003..B-008, B-012).
- `tests/agent-packages/definition.test.ts`, `tests/agent-packages/build.test.ts`, `tests/agent-packages/export.test.ts`, `tests/cli/export/subcommand.test.ts` ↔ `lib/harness-adapters/registry.ts`, `lib/agent-packages/types.ts`, `lib/agent-packages/definition.ts`, `lib/agent-packages/build.ts`, `lib/agent-packages/export.ts`, `cli/export/subcommand.ts` (B-002 compatibility only; no new package-building behavior).
- `tests/skills/discovery.test.ts` ↔ `lib/skills/discovery.ts`, new `lib/harness-adapters/inventory.ts`, `lib/harness-adapters/sync.ts` (B-011).
- `tests/cli/skills/subcommand.test.ts` ↔ new `lib/harness-adapters/inventory.ts`, new `cli/harness/subcommand.ts`, `cli/skills/subcommand.ts` (B-003, B-010).
- `tests/cli/main.test.ts`, `tests/cli/run/subcommand.test.ts` ↔ `cli/main.ts`, `cli/types.ts`, `cli/run/subcommand.ts`, existing `lib/chains/loader.ts` API (B-009).
- New `external-commands/spec-to-backlog.md`, new `external-commands/implement-plan.md`, and new `missions/plans/harness-adapters/command-migration-evidence.json` ↔ `tests/skills/exporter.test.ts` (B-008), contingent on Gate-0 D-001 ratification.
- `external-skills/cosmonauts/SKILL.md`, `external-skills/cosmonauts/chains/SKILL.md`, `external-skills/cosmonauts/skills/SKILL.md`, `external-skills/cosmonauts/plans/SKILL.md`, `external-skills/cosmonauts/tasks/SKILL.md` ↔ `tests/cli/skills/subcommand.test.ts` exact generated-reference/live-query tests (B-010, INV-4).
- `.claude/skills/plan`, `.claude/skills/playwright-cli`, `.claude/skills/roadmap`, `.claude/skills/skills-cli`, `.claude/skills/task`, `domains/shared/skills/skills-cli/SKILL.md`, and new `missions/plans/harness-adapters/repo-export-validation-evidence.json` ↔ `tests/skills/exporter.test.ts` evidence validation (B-012). The `.claude` paths remain ignored outputs.
- `domains/shared/skills/agent-packaging/SKILL.md`, `README.md`, `docs/orchestration.md` ↔ package/CLI content regressions in `tests/skills/agent-packaging.test.ts`, `tests/agent-packages/definition.test.ts`, and `tests/cli/main.test.ts` (B-001, B-002, B-009).
- `package.json` adds `external-commands/` to the published source set only if D-001 is human-ratified; it adds no universal harness-check script under D-004.
- `.gitignore` does not change under D-003.

## Risks

- **Gate 0 is intentionally blocking.** D-001..D-004 answer the four open questions but are not ratified. D-010 is a separate decision-needed collision with ratified Intent format. No tasks or implementation begin until the human rules all five and the plan/spec are amended where authorized.
- **Command-home/domain tension.** `external-commands/` is only a transitional proposal. If the human rejects framework-package publication, choose another listed home and revise descriptors/files before tasks; do not silently ship coding content from core (`review.md (round 1) PR-006`).
- **Live command cutover drives this pipeline.** Both commands must pass preflight before either live write. Post-write failures restore both targets plus provenance; evidence failures retain backups/resumable state. Any inability to prove exact bytes halts under AC-4 (`review.md (round 1) PR-005`).
- **Unmanaged stale targets are conflicts.** Initial commands and five skill directories are moved only through explicit migration after hashes/backups. No force flag is allowed.
- **Crash/TOCTOU complexity is load-bearing.** One owner-root lock, immediate baseline re-read, durable journal, and fresh recovery are required. Check stays observational. If the filesystem cannot distinguish recorded old/new states, halt rather than fabricate current (`review.md (round 1) PR-003`).
- **Link trust is narrow.** Registered source roots must resolve locally; descendant/source and wrapper outputs must remain contained; target parents cannot redirect writes. If Claude/Codex does not follow the wrapper shape, INV-6 still requires a pointer solution—do not copy silently.
- **Project-controlled execution.** Runtime introspection dynamically loads installed/plugin domain TypeScript as existing runtime-backed CLI commands do. Explicit sync/check invocation is the consent gate; no rendered asset executes and no remote content is fetched.
- **Arbitrary projects.** Test missing config, monorepo subdirectory cwd, custom skill paths, domain overrides, absent owner roots, flat skills, project/personal scopes, and deliberate linked packages. Output containment is resolved against invocation cwd/home, not this repo's shape.
- **Complete-inventory authority.** A domain-context/config change may legitimately remove a formerly visible asset only in complete sync. Partial commands never delete. Tests must mutate the reconciliation mode, not merely asset names (`review.md (round 1) PR-002`).
- **Inventory injection.** Project-controlled names/descriptions can contain Markdown/control characters. Exact escaping/order is part of B-010; an unescaped table can alter external instructions.
- **Canonical package mapping.** Existing `claude-cli` labels remain serialized compatibility metadata. Any new target condition outside the registry or change to package IDs/output is a failing AC-1/out-of-scope regression (`review.md (round 1) PR-001`).
- **Publication/autoload blast radius.** Publishing `external-commands/` must not add Pi/domain auto-discovery. Only the adapter catalogue reads it. Future source relocation changes descriptors, not registry contracts.
- **Follow-on mismatch.** The roadmap names `runStart` but orchestration-future does not. No worker adds Drive/session hooks here.
- **Structural evidence is unavailable, not clean.** Cyclomatic/cognitive complexity, duplication, boundaries, dead code, file traces, and symbol traces (`discoverSkills`, `exportSkill`, `buildAgentPackage`, `listNamedChains`, `withEntityFileLock`) all returned unbound due `execution-not-consented` from provider `fallow`; the derived architecture map is missing. Bindable gates remain degraded.

Pivot/abort conditions:

- Any change touches ratified INV/AC/out-of-scope/default-OFF ground: halt-and-escalate.
- Gate 0 lacks human decisions: do not create tasks.
- More than 12 task-sized units: split after registry/discovery (steps 1-3) and before materialization/migrations (steps 4-9).
- Command bytes differ modulo marker, link requires unchecked copy/source mutation, recovery cannot distinguish old/new/local, or evidence cannot name the five real targets: halt and redesign.

## Quality Contract

Plan-specific acceptance evidence:

1. Registry/package tests prove one resolver, canonical/alias duplicate rejection, exact `claude-cli` serialization compatibility, and no build-scope expansion.
2. Complete-versus-partial tests prove omitted named assets survive while truly removed complete-inventory assets exit safely.
3. Copy/direct-link/generated-wrapper tests mutate source content/structure, target bytes/link, mode, containment, and flat-file shape; each maps to one specified state.
4. Fresh-process tests cover every journal old/new cell; check no-write assertions include owner root, lock, manifest, journal, timestamp, and mtime.
5. Command evidence records actual equal pair hashes and rollback/evidence-failure exits; repository evidence names all five actual pairs, current rows, obsolete-path assertions, and backup completion.
6. Generated-inventory tests compare exact escaped/sorted D-011 bytes and assert no authored chain/skill/agent/path inventory survives.
7. Scope audit proves no memory/knowledge/task/session, coordinator package, `skillDelivery: "reference"`, Drive envelope, capture, Gemini, or marketplace implementation.

| Order | Gate kind | Tier | Binding state | Threshold | Protocol | Degradation / notes |
|---:|---|---|---|---|---|---|
| 1 | `correctness` | universal | bound | Project-native correctness evidence, B-001..B-012 tests, and both live evidence artifacts pass | project-discovered | hard fail |
| 2 | `artifact-conformance` | universal | bound | Every behavior has required fields, existing root-relative test path, and exact marker | artifact evidence | hard fail |
| 3 | `mutation` | bindable | unbound | Negative controls catch destructive overwrite, partial deletion, stale-hash trust, alias ambiguity, recovery writes in check, inventory mirroring, and command-byte changes | pending | reviewer judgment; no fabricated pass |
| 4 | `duplication` | bindable | unbound | No second target/directory/chain/inventory registry remains | pending | execution not consented; reviewer/search judgment |
| 5 | `complexity` | bindable | unbound | Registry, candidate resolution, render, classify, recover, and materialize remain separately testable | pending | execution not consented; reviewer judgment |
| 6 | `boundary-conformance` | bindable | unbound | Consumers depend on adapter core; core imports no consumer and writes only owner roots/evidence paths | pending | execution not consented; reviewer judgment |
| 7 | `dead-code` | bindable | unbound | Destructive copier and consumer-local target constants/switches are gone or tested compatibility serialization only | pending | execution not consented; reviewer/search judgment |

## Implementation Order

0. **Human/ratified-ground checkpoint.** Rule D-001..D-004 and choose D-010 option. If Goal option A is chosen, only the human-authorized spec amendment adds it. Update dependent paths/defaults/gates before task creation. Confirm all ratified ground unchanged.
1. **Characterize package and discovery surfaces.** Pin current agent-package IDs/options/serialization/build dispatch, skill paths/flat files/merged roots, both chain-list routes, the two live commands, and five stale target hashes. RED B-001/B-002/B-011 before restructuring.
2. **Registry slice - B-001/B-002.** Add canonical registry and exact package compatibility metadata. Route skills/package resolution; reject duplicate alias/canonical blocks. Keep package builders behaviorally unchanged. **Checkpoint A:** target-resolution/package compatibility green; no sync/content migration.
3. **Candidate/effective discovery - B-011.** Add candidate API, preserve effective runtime listing, implement flattening/flat shape and all runtime/external collision preflight. Validate all 51 current `SKILL.md` identities across runtime and external catalogue.
4. **Sync state core - B-003..B-007.** One RED/GREEN/REFACTOR loop per behavior: deterministic copy/link/wrapper render, provenance variants, complete/partial selection, four-state classifier, owner lock, journal recovery, read-only check, conflict reporting/containment. **Checkpoint B:** crash/restart and partial-delete mutations pass; no production `rm(target)+cp` path remains.
5. **CLI/introspection - B-003/B-005/B-009.** Add harness command/reports/defaults, partial skills facade, root `--list-chains`, and shared loader parity. Verify no-domain informational routing and arbitrary project/home roots.
6. **Command preflight - B-008 RED before live writes.** Create exact native sources and renderer/verifier. Require both live/source/render comparisons. If D-001 ratification requires publication, add package source entry without auto-load. Stop untouched on mismatch.
7. **Generated bundle - B-010.** Implement exact generated reference, escaping/sorting, authored fallback queries, and source-ahead fact detection. Remove/replace all authored inventory/path tables.
8. **Transactional live migrations - B-008 then B-012.** Under the owner lock, run pair command migration with rollback/evidence exits. Then demonstrate five unmanaged conflicts, back up all five, sync/check, write durable five-pair evidence, validate `.agents`/no `.codex`, and close backup exits. Ignored targets are not committed.
9. **Closing checkpoints.** Run targeted tests after each behavior, full correctness/artifact gates, explicit provisioned `harness sync --check`, publication/autoload audit, structural reviewer checks, and out-of-scope write audit.

If a stage reveals unexpected complexity, stop at its checkpoint. Derived mechanisms amend on record only when all ratified intent survives; otherwise halt-and-escalate. Steps 1-3 and steps 4-9 are the explicit split boundary if the work cannot stay within the 12-behavior guidance.
