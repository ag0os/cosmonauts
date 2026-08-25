---
title: 'Harness Adapters: Single-Source Factory Assets'
status: active
createdAt: '2026-08-25T17:12:38.973Z'
updatedAt: '2026-08-25T20:15:00.000Z'
---

## Overview

Replace the destructive skill copier with one harness-adapter subsystem that resolves targets, renders skills and commands, materializes local links or provenance-checked copies, and checks drift without writing. The registry becomes the only target-resolution boundary used by `cosmonauts skills export`, `cosmonauts harness sync`, and agent-package export; agent-package prompt/skill assembly, binary compilation, invocation, and inline delivery remain unchanged.

Gate 0 is open. On 2026-08-25 the human ratified D-001..D-004, resolved D-010 through spec amendment A-002, narrowed AC-007 through A-001, and dropped D-012/B-009. This revision applies those rulings, both mandatory review channels, the `review-3.md` lifecycle pass, and the `review-4.md` findings (canonical-root lock identity, bounded lock acquisition, command link rejection, cross-project bundle freshness, and behavior ownership for the ratified publication/ignore rules). The result has 12 contiguous behaviors: the prior root-chain-list behavior is gone, agent-package parse and selection behavior are split for precise evidence, and the three implementation slices are explicit.

The first live validation is the recoverable project-scope migration of exactly `plan`, `roadmap`, `skills-cli`, and `task`. Only after its durable evidence and a zero selected check does the plan migrate the personal external `cosmonauts` bundle, then bootstrap and migrate the two live Claude commands. The third-party same-name target remains a permanent conflict outside the migration set. The plan does not build coordinator packages, `skillDelivery: "reference"`, Drive envelopes, external-session capture, Gemini support, domain distribution, or any memory/knowledge feature.

> Superseded 2026-08-25 by D-001..D-004 and D-010: “Implementation is blocked at Gate 0. The four spec open questions remain planner proposals ... D-010 presents the options.” All eight human rulings are now settled ground; ordinary plan approval is the only pre-task gate.

## Architecture Context

This plan is bounded by existing architecture records rather than creating a new one:

- `missions/architecture/domains.md` keeps `shared` neutral and makes domains the eventual content/distribution unit. Ratified D-001 therefore makes `external-commands/` a transitional physical home hidden behind stable source descriptors, not a permanent framework API.
- `missions/architecture/orchestration-future.md` remains the forward orchestration source. This plan exposes no Drive/session hook and does not guess the later `drive-envelope` contract.
- `missions/architecture/code-structure-map.md` defines the derived map as mechanical evidence. `memory/architecture/index.md` is missing, so direct reads are the available evidence and the absent map is uncertainty, not a clean baseline.
- The prioritized `ROADMAP.md` orders `harness-adapters -> drive-envelope -> coordinator-packages -> external-session-capture`. The registry may later be consumed by reference-delivery packages, but this plan builds none of those follow-ons.
- Pi v0.80.6 supplies skill loading/discovery primitives but no provenance-aware external-harness sync. Reuse `CosmonautsRuntime`, `discoverSkills`, and `listNamedChains`; do not add another runtime or shell out for live inventory.
- `domains/shared/skills/work-artifacts/references/deviation-protocol.md` governs collisions. The amended `INV-001..INV-006`, `AC-001..AC-007`, the Out of Scope list, A-001, A-002, and all human decisions below are ratified ground.

Boundary rules:

- `lib/harness-adapters/` is the inward core. It owns harness/scope types, target descriptors, asset descriptors, pure rendering, provenance schemas, classification, transaction planning, and materialization. It imports no CLI, `CosmonautsRuntime`, skill discovery, chain loader, agent-package builder, or git reader.
- New `lib/harness-runtime-inventory.ts` is the outer composition seam. It alone turns an already-created `CosmonautsRuntime` into plain chain/skill/path rows and a strict discovery-health snapshot by calling `listNamedChains` and candidate/effective skill discovery. CLI modules inject those rows into the core.
- `lib/skills/`, `lib/agent-packages/`, and `cli/` depend inward on `lib/harness-adapters/`. `ExportScope` becomes a compatibility alias of the inward `HarnessScope`; the core never imports it from `lib/skills/exporter.ts`.
- New `scripts/validate-harness-exports.ts` is the project-only migration edge. It may read git objects through an injected historical-source reader and pass verified proofs/evidence receipts into the core; ordinary sync cannot create legacy or command-bootstrap authorization.
- Existing internal agents continue reading domain skill homes directly. Writes are limited to registered owner roots, their fixed sibling transaction files, the two native command sources, the two tracked migration-evidence files, publication metadata, and repository ignore rules.

Capability evidence: `analysis_complexity`, `analysis_duplication`, `analysis_boundaries`, and symbol traces for `withEntityFileLock`, `ExportScope`, `discoverSkills`, `listNamedChains`, and `loadAgentPackageDefinition` all returned `unbound` (`execution-not-consented`, provider `fallow`). The architecture map is missing. The design therefore relies on direct file/signature reads and records structural claims as review-required rather than mechanically clean.

## Decision Log

- **D-001 - Use transitional `external-commands/` sources** *(Revised 2026-08-25 after review)*
  - Decision: `external-commands/spec-to-backlog.md` and `external-commands/implement-plan.md` are the git-tracked native sources. Stable descriptors carry asset IDs and source-root-relative paths, so the physical directory is not public contract. Add `external-commands/` to `package.json` `files`; a later domain contribution may relocate the files without changing asset IDs.
  - Alternatives: `domains/shared/commands/` is rejected because the workflows are coding-facing rather than neutral stdlib; folding commands into `external-skills/` conflates target formats and lifecycles; promising a permanent top-level framework home conflicts with `missions/architecture/domains.md`.
  - Why: Serves `INV-001` while preserving the domain packaging seam (`review.md` round 1 PR-006).
  - Decided by: human, 2026-08-25
  - Supersedes: the planner-proposed/conditional D-001 publication language in the prior plan revision.

- **D-002 - Make recorded mode sticky and conversion explicit** *(Revised 2026-08-25 after review)*
  - Decision: A never-managed asset defaults to copy-with-provenance. A managed asset keeps its recorded `copy` or `link` mode when neither flag is supplied, for both normal sync and `--check`. `--copy` or `--link` explicitly requests conversion; before any conversion write the report row exposes `recordedMode` (old), `requestedMode` (new), and `beforeStatus: source-ahead` with reason `mode-conversion`. Conversion proceeds only if the existing target still matches its recorded baseline.
  - Alternatives: Unconditional copy on bare sync is rejected because bare sync and bare check disagree and silently convert links; link-by-default surprises users with live filesystem coupling; requiring a flag for never-managed assets adds needless friction.
  - Why: Makes check a faithful preview of sync while prioritizing `INV-002`, `INV-003`, and opt-in `INV-006` (independent M-2).
  - Decided by: human, 2026-08-25
  - Supersedes: “When neither `--copy` nor `--link` is supplied, normal sync uses copy mode” from the prior D-002.

- **D-003 - Keep generated owner roots ignored but checked** *(Revised 2026-08-25 after review)*
  - Decision: Keep `.claude/` ignored; add `.agents/` and `.cosmonauts-harness-*` so every project-scope owner root and sibling transaction path the registry can write is ignored. Generated outputs/manifests stay local; tracked evidence plus provisioned checks prove migrations. A closing full default sync in this repository must leave `git status --porcelain` empty even though its known permanent foreign-conflict row makes that unfiltered invocation nonzero.
  - Alternatives: Tracking generated trees duplicates authority and risks unrelated harness state; ignoring only Claude leaves default Codex sync dirty; treating a known conflict as a successful default check violates A-001.
  - Why: Keeps reviewed authority in native sources under `INV-001` while satisfying `INV-002`/`INV-003`, review-2 PR-005/independent Md-3, and `review-3.md` PR-007.
  - Decided by: human, 2026-08-25
  - Supersedes: “`.gitignore` does not change under D-003” and the earlier Claude-only ignore rule.

- **D-004 - Ship CI-suitable check without a universal v1 script gate** *(Revised 2026-08-25 after review)*
  - Decision: `--check` returns nonzero for every non-current, recovery-pending, evidence-required, incomplete-discovery, or conflict row. Selected migration checks run to zero at this plan's checkpoints. The unfiltered repository check is expected to remain nonzero for the ratified permanent foreign target. Check does not join universal test/lint/typecheck scripts in v1.
  - Alternatives: A universal clean-checkout gate would fail because ignored outputs are intentionally absent and this repository intentionally retains one foreign conflict; syncing in a gate writes and hides `missing`.
  - Why: Serves `INV-003` without turning local harness provisioning into a universal prerequisite.
  - Decided by: human, 2026-08-25
  - Supersedes: the prior planner-proposed D-004 and any implication that every full-default check must exit zero.

- **D-005 - Separate definition parsing from package-target selection** *(Revised 2026-08-25 after review)*
  - Decision: Canonical harness IDs are `claude` and `codex`; agent-package selection continues to accept/serialize `claude-cli` and `codex`. Definition parsing remains target-selection agnostic enough to preserve well-formed `gemini-cli` and `open-code` blocks, and also accepts canonical `claude`; it validates option shape but does not claim runtime support. Selection resolves only through registry metadata: Claude accepts exactly one of `claude`/`claude-cli`, rejects both before build, generates canonical `claude`, and maps to unchanged `serializedTarget: "claude-cli"` and `packageIdSuffix: "claude-cli"`. CLI help and unsupported-target errors remain serialized as `claude-cli, codex`.
  - Alternatives: Validating every parsed block against supported registry entries breaks the pinned future-block parser test; retaining consumer-local runtime support tables violates `INV-005`; changing CLI/package serialization expands observable package behavior.
  - Why: Serves `AC-001`/`INV-005` while preserving the current parser and package runtime contracts (review-2 PR-006; independent Md-4).
  - Decided by: planner, amend-on-record, 2026-08-25
  - Supersedes: the prior D-005's unspecified declared/unknown parse and error behavior.

- **D-006 - Local or foreign edit evidence outranks source drift** *(Revised 2026-08-25 after review)*
  - Decision: If an owned copy/generated target differs from recorded target provenance, a link points elsewhere, or an output path is owned by another owner, classify `locally-edited` even when source inputs changed. `source-ahead` requires owned target evidence still match the recorded baseline. Unmanaged existing targets are `locally-edited`; exact desired bytes do not authorize copy adoption.
  - Alternatives: Reporting only source drift could authorize overwrite; adding a fifth public state violates `AC-002`; treating unmanaged bytes as missing violates `INV-002`.
  - Why: Gives `INV-002` precedence while retaining the four ratified states.
  - Decided by: planner-proposed, 2026-08-25
  - Supersedes: the prior D-006 only insofar as foreign-owner priority is now explicit.

- **D-007 - Expose explicit kind/asset selection and descriptor defaults** *(Revised 2026-08-25 after review)*
  - Decision: Add repeatable `--kind skill|command` and `--asset <assetId>` filters. No asset filter means complete reconciliation within the selected target/scope/kind harness catalogue; any explicit asset list and every compatibility `skills export` invocation (named or `--all`) are partial and never infer source removal for unselected/non-compatibility entries. Omitted target selects supported Claude/Codex. Omitted scope uses each descriptor's default: runtime skills are project, the single external `cosmonauts` bundle is personal, and both commands are personal. Explicit scope overrides descriptor defaults.
  - Alternatives: A catalogue with no narrowing makes command and bundle close checks unsatisfiable; treating unselected entries as removed deletes valid exports; making `skills export --all` complete across all skill descriptors could delete the separately catalogued bundle.
  - Why: Serves `INV-002`, makes migration checkpoints selectable, and owns AC-005's real personal bundle (independent M-3/M-4).
  - Decided by: planner, amend-on-record, 2026-08-25
  - Supersedes: the prior D-007's implicit “selected target/scope/kind” surface, kind-wide scope defaults, and any complete compatibility-export interpretation.

- **D-008 - Link provenance tracks pointer shape, not live source bytes** *(Revised 2026-08-25 after review)*
  - Decision: A correct direct directory link remains current when linked source bytes/descendants change. A flat `.md` skill renders as a directory whose `SKILL.md` links to the source. Generated wrappers record authored link-map shape plus generated-node hashes: authored content behind correct links is live/current; link-map/generated-input changes are ahead; wrong links/generated-target edits are local. Missing or escaping sources are ahead/error as specified below.
  - Alternatives: Copy-style content hashes make one link edit both current and ahead; silent copy fallback violates `INV-006`; source mutation violates `INV-001`.
  - Why: Defines one mechanical interpretation of `INV-001`, `INV-003`, and `INV-006` (`review.md` round 1 PR-004).
  - Decided by: planner-proposed, 2026-08-25
  - Supersedes: no user ground; identifier references and wrapper evidence are clarified.

- **D-009 - Use a canonical-root sibling lock, bounded acquisition, and phase-aware lock-held transactions** *(Revised 2026-08-25 after review-4)*
  - Decision: Each canonical owner root has one lock/journal identity shared by skills and commands. Transaction identity derives from the **resolved canonical owner-root path**, never from the `(target, scope)` pair. Lock files live as `.cosmonauts-harness-<target>.lock` siblings under that resolved parent, never inside `.claude`/`.agents`. When project and personal scope resolve to the same parent — the verified aliasing case where `projectRoot === homedir()`, since `lib/skills/exporter.ts:48` picks `homedir()` for personal and `options.projectRoot` for project — both scopes share exactly one lock, one journal, and one manifest; a single request naming both scopes is one transaction, not two. Acquisition is **bounded**: the adapter always passes an explicit `waitTimeoutMs` to `withEntityFileLock` (whose default is documented as indefinite at `lib/entity-file-lock.ts:27`) and surfaces `EntityFileLockTimeoutError` as a reported `lock-contended` row naming the lock path and the live owner pid, exiting nonzero without writing. Stale reclamation still applies only after the owner pid dies, so contention by a live-but-wedged owner terminates instead of hanging. `withOwnerRootTransaction` performs read-only containment checks, acquires that sibling lock once, revalidates containment, and passes an opaque `OwnerRootTransaction` to `applySyncPlanInTransaction`; neither that function nor set migration reacquires. The journal is persisted in `prepared` phase before any stage/backup exists, then moves through `installing`, `commit-ready`, `committed`, or `rolling-back`. Migration transactions carry `cleanupPolicy: after-evidence`, so generic recovery preserves backups/journal until the migration driver supplies a re-read durable evidence receipt. Check acquires no lock and writes nothing. Unconfirmed release preserves persisted action state but produces nonzero and stops subsequent owner-root work.
  - Alternatives: Locking inside the owner root writes through a symlink before validation; nested ordinary sync self-deadlocks; staging before journaling leaks orphan stages; observation-only recovery cannot distinguish commit, rollback, and evidence hold; check-time recovery violates no-write. Scope-keyed lock names were rejected after `review-4.md` PR-001 because an aliased root yields two transaction identities over one manifest and can lose updates. Inheriting the helper's indefinite default was rejected after `review-4.md` PR-005 because a wedged live owner then hangs the CLI with no bounded outcome and the recovery table is never reached.
  - Why: Serves `INV-002`/`INV-003` and resolves review-2 PR-002/PR-004, `review-3.md` PR-002/PR-003/PR-005, and `review-4.md` PR-001/PR-005.
  - Decided by: planner, amend-on-record, 2026-08-25
  - Supersedes: “Acquire the personal Claude owner lock ... run ordinary now-missing copy sync,” containment only inside the callback, stage-before-journal ordering, and the prior phase-free recovery table.

- **D-010 - Adopt amended canonical Intent and identifiers** *(Revised 2026-08-25 after review)*
  - Decision: Spec amendment A-002 supplies the canonical Goal and normalizes all references to `INV-001..INV-006` and `AC-001..AC-007`. The plan uses only those forms; no artifact-format exception remains.
  - Alternatives: Retaining noncanonical IDs or an invariant-only Intent leaves the deviation discriminator ambiguous.
  - Why: Restores the canonical behavior spine and ratified Intent authority (`review.md` round 1 PR-011; review-2 PR-008).
  - Decided by: human, 2026-08-25
  - Supersedes: the prior decision-needed D-010 and its proposed Goal options.

- **D-011 - Generate one exact inventory contract and remove every exported path table** *(Revised 2026-08-25 after review)*
  - Decision: Render `external-skills/cosmonauts/references/generated-inventory.md` with exactly three sorted sections: named chains (`Name | Description | Expression`), skills (`Name | Domain | Description`), and supported materialized harness paths (`Target | Kind | Project | Personal`). Path rows are exactly Claude skill, Claude command, and Codex skill; no agent-package, declared `open-code`, or unsupported target/kind row appears. Authored bundle content uses the generated file when present and falls back to `cosmonauts run chain list` plus `cosmonauts skills list --json`. `domains/shared/skills/skills-cli/SKILL.md` also loses its hand-authored path table and tells readers to query a read-only JSON harness check for resolved rows.
  - Alternatives: A new root chain-list flag is unnecessary; leaving the shared `skills-cli` table violates `INV-004` in AC-007's own exported regression target; including non-materialized/unsupported rows invents paths.
  - Why: Makes `AC-005` exact and applies `INV-004` consistently (review-2 missing coverage; independent m-5).
  - Decided by: planner, amend-on-record, 2026-08-25
  - Supersedes: the prior D-011 fallback `cosmonauts --list-chains --json` and its unspecified path-row membership.

- **D-012 - Drop the root `--list-chains` addition** *(Revised 2026-08-25 after review)*
  - Decision: D-012 and the old B-009 are dropped from v1. Authored fallback instructions use `cosmonauts run chain list`, which already emits the full effective named-chain set as JSON from any cwd and outside the no-domain guard. Sync-time generation calls `listNamedChains(projectRoot, runtime.chains)` directly.
  - Alternatives: Adding a duplicate root flag creates public UX with no AC need and a second test/documentation surface.
  - Why: Reuses the verified existing path and follows `review.md` round 1 PR-007.
  - Decided by: human, 2026-08-25
  - Supersedes: “Add root `--list-chains` while retaining the existing route.”

- **D-013 - Distinguish project owners from stable generic-asset authority** *(Revised 2026-08-25 after review)*
  - Decision: Provenance owner is a discriminated identity. Project-derived runtime skills use `ownerId = project:sha256(realpath(projectRoot))`; source catalogue location is diagnostic, not owner identity. The generic personal bundle and commands declare stable `authorityId: cosmonauts/core`, yielding `ownerId: authority:cosmonauts/core` across cwd, checkout, monorepo, package-install path, and upgrade. Manifest entries remain keyed by `(ownerId, assetId)`, and all owners are scanned for output-path claims. Source-removed deletion is limited to the invoking project owner or an explicitly present/healthy authority descriptor. For stranded project owners, explicit `--transfer-owner <oldOwnerId>` may move only the manifest key to the invoking project owner when asset/output identities match, no journal is pending, and the target is absent or exactly matches the old baseline; target bytes are never changed. Edited targets remain conflicts.
  - Alternatives: Binding generic machine-global assets to cwd makes every other project foreign; binding owner to catalogue realpath breaks package moves; one owner for all runtime skills recreates cross-project clobber; implicit transfer weakens `INV-002`.
  - Why: Prevents cross-project deletion while keeping generic personal assets usable from any project and giving moved project owners a non-destructive exit (independent M-1; `review-3.md` PR-004).
  - Decided by: planner, amend-on-record, 2026-08-25
  - Supersedes: the prior `sha256(projectRoot + catalogueRoot)` owner rule and deferral of all ownership transfer.

- **D-014 - Same-name untraceable targets are permanent conflicts** *(Added 2026-08-25 after review)*
  - Decision: If a cosmonauts descriptor and existing target share output identity but the target cannot be traced to that descriptor, report public state `locally-edited` with reason `foreign-or-untraceable`; never offer or execute migration/adoption. Unknown target-side frontmatter keys remain opaque raw bytes and do not make comparison fail early.
  - Alternatives: Name equality, matching required frontmatter, or user-generated hashes do not prove origin and can destroy richer foreign assets.
  - Why: Applies A-001's general rule and `INV-002`/`AC-003` beyond the known case.
  - Decided by: human, 2026-08-25

- **D-015 - Authorize legacy copied targets only through historical byte lineage** *(Revised 2026-08-25 after review)*
  - Decision: The project-only migration driver accepts a `LegacyMigrationAuthorization` for an unmanaged copied target only when the current target tree digest exactly equals the legacy-rendered digest of the named git revision and source-root-relative path, and the row also matches current owner/authority, `assetId`, output path, and node shape. It persists this verified authorization and set journal before the first move, then re-reads the target under lock. Exactly the four AC-007 copied targets and the personal copied bundle use this proof; commands do not.
  - Alternatives: Recording an observed hash without historical proof authorizes arbitrary foreign bytes; same-name/frontmatter checks repeat the A-001 defect; applying this proof to newly created command sources is circular.
  - Why: Supplies the missing traceability mechanism for stale copies without making AC-004 impossible (review-2 PR-001; independent E-1/M-4; `review-3.md` PR-001).
  - Decided by: planner, amend-on-record, 2026-08-25
  - Supersedes: any B-009/Design §8 text requiring historical command lineage.

- **D-016 - Require healthy discovery and give source-removed states safe exits** *(Revised 2026-08-25 after review)*
  - Decision: Destructive source removal is authorized only by a strict, complete discovery snapshot that successfully scanned the manifest entry's still-declared source root and observed the asset absent. Any permission, I/O, parse, or declared-root availability failure marks the selected owner inventory incomplete and aborts before every target/manifest write. With healthy absence, complete sync removes an unchanged owned target plus entry and removes an orphan entry when target is absent. If target is edited, preserve it; `--forget-removed <assetId>` removes only the invoking-owner entry after healthy absence. If a source root is no longer declared, explicit `--forget-removed` may remove only the entry while preserving the target; it may not override a declared-but-unreadable source.
  - Alternatives: Tolerant runtime discovery can mistake EACCES/I/O for deletion; leaving absent entries makes check nonzero forever; auto-forgetting edited targets hides ownership; deleting edited targets violates `INV-002`.
  - Why: Completes the state space without treating incomplete observation as deletion (independent m-2; `review-3.md` PR-006).
  - Decided by: planner, amend-on-record, 2026-08-25
  - Supersedes: source-removal decisions based on candidate absence without a discovery-health token.

- **D-017 - Treat the external bundle as one asset with reserved nested names** *(Added 2026-08-25 after review)*
  - Decision: `external-skills/cosmonauts` is one skill asset, `assetId: external-skill:cosmonauts`, output identity `cosmonauts`, default personal scope, stable authority `cosmonauts/core`. Its five nested `SKILL.md` frontmatter names are reserved in the collision namespace but are not export candidates. The `frontmatter-name` flattening rule applies to runtime skill candidates only and never shatters the bundle.
  - Alternatives: Discovering each nested file exports an invalid fragmented bundle; reserving only the outer name permits runtime exports to collide with nested harness-visible identities.
  - Why: Makes AC-005/AC-006 composition deterministic (independent m-6).
  - Decided by: planner, amend-on-record, 2026-08-25

- **D-018 - Bootstrap native command authority from the ratified live pair** *(Added 2026-08-25 after review)*
  - Decision: AC-004 itself authorizes one bootstrap for exactly `command:spec-to-backlog` and `command:implement-plan`. The driver copies each live raw file to its new native source without normalization, renders in memory, and requires live/native/marker-stripped-render equality for both. Under the personal Claude lock it re-reads live targets and native sources immediately before any move. Evidence records `authorizationKind: ratified-live-bootstrap`, not a historical revision. After the first manifest commit, ordinary provenance governs forever; the bootstrap path cannot accept any other asset/path.
  - Alternatives: Historical lineage is impossible because no prior in-repo sources exist; committing copied sources then citing that commit is circular; weakening byte equivalence violates `AC-004`.
  - Why: Makes the commanded one-time source creation authorable while preserving exact bytes and `INV-001`/`INV-002` (`review-3.md` PR-001).
  - Decided by: planner, amend-on-record, 2026-08-25

- **D-019 - Command assets reject link mode with an actionable error** *(Added 2026-08-25 after review-4)*
  - Decision: The registry's `command` asset kind declares `supportedModes: ["copy"]`. `--link` combined with `--kind command` (or with a selection resolving to any command) fails before any owner-root or manifest write, naming the asset and the supported mode. Command provenance therefore only ever records copy mode, and `--check` never has a link row to classify for commands. Skills keep both modes.
  - Alternatives: A direct `.md` file symlink into `~/.claude/commands/` was rejected because AC-004 ratifies exact rendered bytes at that path and a symlink defeats the byte-equivalence and provenance comparison that proves it; a generated wrapper was rejected because the Claude command format has no include mechanism, so a wrapper cannot render the ratified body. Leaving the combination undefined was rejected because a worker would invent observable behavior and provenance rules.
  - Why: Preserves ratified AC-004's path/format/byte-equivalence promise while keeping `INV-006` opt-in availability meaningful for the kinds that can honor it (`review-4.md` PR-003).
  - Decided by: planner-proposed via coordinator, amend-on-record, 2026-08-25

- **D-020 - Cross-project bundle freshness is last-writer with an explicit stale-owner report** *(Added 2026-08-25 after review-4)*
  - Decision: The generic personal bundle's generated inventory is built from the invoking project's runtime, so its bytes are project-specific. Provenance records the `generatingProjectRoot` alongside the content hash. A sync from a different project rewrites the bundle (last writer wins, no foreign-owner conflict, per D-013) but the row reports `regenerated-from-other-project` naming the previous generator. `--check` run from project A against a bundle last generated by project B reports `source-ahead` with the same annotation rather than `current`, so the staleness is visible instead of silent. No attempt is made to merge two projects' inventories.
  - Alternatives: Declaring the first generator the permanent owner was rejected because it makes the bundle unsyncable from every other project; per-project personal bundles were rejected because `~/.claude/skills/cosmonauts` is one machine-global path an external coordinator reads by name; weakening AC-005's live-introspection requirement to a static inventory was rejected as ratified ground requiring escalation.
  - Why: Keeps AC-005's live-introspection requirement intact while making the unavoidable cross-project oscillation mechanically visible under `INV-003` rather than silent (`review-4.md` PR-002).
  - Decided by: planner-proposed via coordinator, amend-on-record, 2026-08-25

### Review disposition

| Review item | Disposition in this revision |
|---|---|
| `review-2.md` PR-001 | A-001 narrows the set; D-014/D-015 require historical lineage before moving any remaining copied target; B-008/B-012 assert no unchecked override. |
| PR-002 | D-009 and Design §7 define the opaque lock-held seam; B-009 uses one acquisition and never calls public sync. |
| PR-003 | Design §7 gives an ordered phase/state table, including post-commit states with and without backup. |
| PR-004 | D-009/Design §7 move the lock to a validated sibling and revalidate before every owner-root mutation. |
| PR-005 | D-003 ignores `.agents/` and transaction siblings and requires a clean worktree after full default sync. |
| PR-006 | D-005 and B-002/B-003 pin parse-time future blocks, selection-time rejection, and serialized error labels. |
| PR-007 | Architecture Context/Design §1 move scope types inward and name `lib/harness-runtime-inventory.ts` as runtime composer. |
| PR-008 | D-010 applies A-002; all IDs are canonical. |
| `review-2.md` missing coverage | B-007/B-009/B-012 cover crash/retry and release uncertainty; D-011 fixes path rows; live link/wrapper probes are an explicit checkpoint/abort condition. |
| Independent M-1..M-4 | D-013 owner variants; D-002 sticky mode; D-007 selection; B-010/B-012 plus personal bundle default/evidence. |
| Independent m-1..m-6 | Mirrored new tests; D-016 source-removal exit; repo migration precedes personal writes; three slices/one split trigger; D-011 removes both path tables; D-017 fixes bundle identity. |
| Independent E-1/E-2/E-3 | Resolved by human rulings A-001, A-002/D-010, and dropped D-012 respectively. |
| `review-3.md` PR-001 | D-018 creates a nonhistorical, two-command-only ratified bootstrap; D-015 is narrowed to copied legacy targets. |
| PR-002/PR-003/PR-005 | D-009/Design §7 add journal-before-stage ordering, cleanup policy, evidence receipt hold, and durable rollback intent with partial-vector exits. |
| PR-004 | D-013 gives generic assets stable authority and project owners an exact-baseline transfer exit; B-006 tests second-project/package-move behavior. |
| PR-006 | D-016/Design §3 require strict discovery health before source-removal writes. |
| PR-007 | D-003/D-004 and closing gates expect the known permanent conflict and nonzero full-default check while requiring zero selected migration checks. |
| `review-4.md` PR-001 | D-009 derives transaction identity from the resolved canonical owner root, collapsing the aliased `projectRoot === homedir()` case to one lock/journal/manifest; B-007 tests it. |
| `review-4.md` PR-002 | D-020 records `generatingProjectRoot` and reports cross-project regeneration/staleness instead of silent oscillation; B-010 tests it. AC-005's live introspection is preserved. |
| `review-4.md` PR-003 | D-019 declares `command` copy-only and rejects `--link` before any write; B-001/B-005 test the rejection. |
| `review-4.md` PR-004 | B-001 now owns the `package.json` `files` assertion and B-012 owns the `.gitignore` + clean-worktree assertion, so neither ratified rule rests on a closing audit. |
| `review-4.md` PR-005 | D-009 mandates an explicit `waitTimeoutMs` and a bounded nonzero `lock-contended` report; B-007 tests the wedged-live-owner path. |

## Behaviors

### B-001 - Registry and skills export use one canonical target contract

- Source: AC-001
- Context: registry and legacy skills-export callers request Claude/Codex project/personal destinations, declared `open-code`, or an unregistered harness
- Action: target, scope, asset kind, owner root, target directory, and renderer are resolved
- Expected: `claude` and `codex` resolve every supported root/transform from the registry; `open-code` is declared-unimplemented and Gemini is unregistered; `lib/skills/exporter.ts` has no local target set/switch and its four existing paths resolve through the inward `HarnessScope` contract; the `command` kind declares `supportedModes: ["copy"]` and a link request for it fails before any write (D-019); `package.json` `files` contains `external-commands/` so an installed package carries the native command sources, asserted by reading the manifest entry (D-001)
- Seam: `lib/harness-adapters/types.ts`, `lib/harness-adapters/registry.ts`, `lib/skills/exporter.ts`, `cli/skills/subcommand.ts`
- Test: `tests/harness-adapters/registry.test.ts` > `resolves registry and compatibility skill-export targets from one contract`
- Marker: `@cosmo-behavior plan:harness-adapters#B-001`

### B-002 - Definition parsing preserves canonical and future target blocks

- Source: AC-001
- Context: a package definition contains canonical `claude`, legacy `claude-cli`, both, `codex`, `gemini-cli`, or `open-code` blocks with valid or invalid option shapes
- Action: the definition is parsed without selecting a runtime target
- Expected: each single canonical/legacy/future block with valid options parses and retains exact options; invalid option shapes fail; parser acceptance does not imply support; both Claude keys remain parseable so selection can issue the dedicated ambiguity error; no consumer-local runtime-support table is consulted
- Seam: `lib/agent-packages/types.ts`, `lib/agent-packages/definition.ts`
- Test: `tests/agent-packages/definition.test.ts` > `parses canonical legacy and future target blocks without selecting support`
- Marker: `@cosmo-behavior plan:harness-adapters#B-002`

### B-003 - Package selection preserves serialized Claude compatibility

- Source: AC-001
- Context: CLI/package selection receives a parsed definition and requests canonical/legacy Claude, Codex, declared, or unknown targets
- Action: registry package metadata resolves target options before the existing build/compile path
- Expected: exactly one `claude` or `claude-cli` block maps to unchanged `claude-cli` package ID suffix, `AgentPackage.target`, builder dispatch, success JSON, prompt/tool options, and inline skill delivery; both blocks fail before build; generated definitions use canonical `claude` but retain the existing `-claude-cli` ID; unsupported CLI selection still names `claude-cli, codex`; no package builder resolves targets independently
- Seam: `lib/harness-adapters/registry.ts`, `lib/agent-packages/definition.ts`, `lib/agent-packages/build.ts`, `cli/export/subcommand.ts`
- Test: `tests/cli/export/subcommand.test.ts` > `maps registry selection to the unchanged serialized package contract`
- Marker: `@cosmo-behavior plan:harness-adapters#B-003`

### B-004 - Complete, partial, transfer, and source-removed selection have defined exits

- Source: AC-002
- Context: managed assets span targets/scopes/kinds/owners; one healthy source disappears, one source root is incomplete, another asset is omitted by explicit selection, and removed-source targets are unchanged, absent, or edited
- Action: complete sync, partial compatibility sync/export, check, `--forget-removed`, or exact-baseline `--transfer-owner` runs
- Expected: complete sync aborts all selected-owner writes on incomplete discovery; with healthy absence it removes only unchanged invoking-owner outputs whose source disappeared and forgets absent entries; edited targets remain until explicit manifest-only forget; partial operations touch only selected assets; kind/asset filters isolate migrations; stable-authority bundle/commands remain the same owner from a second project/package path; project-owner transfer changes only an exact/absent manifest key; foreign entries are never implicit removal candidates
- Seam: `lib/harness-adapters/types.ts`, `lib/harness-adapters/provenance.ts`, `lib/harness-adapters/sync.ts`, `lib/harness-runtime-inventory.ts`, `cli/harness/subcommand.ts`, `cli/skills/subcommand.ts`
- Test: `tests/harness-adapters/sync.test.ts` > `reconciles healthy complete partial transfer and source-removed inventories without destructive inference`
- Marker: `@cosmo-behavior plan:harness-adapters#B-004`

### B-005 - Copy and local-link materialization are safe, sticky, and shape-correct

- Source: AC-002
- Context: missing directory skills, a flat root `.md` skill, generated bundle nodes, recorded copy/link assets, and invalid remote/escaping/symlink inputs are prepared
- Action: bare sync, explicit copy/link sync, and repeated current sync run
- Expected: never-managed assets copy with marker/provenance; managed assets retain recorded mode; explicit conversion reports old mode before rewriting; direct directory links and flat `<name>/SKILL.md` links have the registered local shape; generated wrappers link authored nodes and write generated nodes; repeated current sync writes nothing; `--link` against any command asset fails before owner-root/manifest writes with an actionable supported-mode error and leaves no provenance (D-019); remote/escaping/symlinked invalid shapes fail before owner-root/manifest writes
- Seam: `lib/harness-adapters/render.ts`, `lib/harness-adapters/provenance.ts`, `lib/harness-adapters/sync.ts`
- Test: `tests/harness-adapters/render.test.ts` > `materializes sticky copy direct-link flat and generated-wrapper shapes safely`
- Marker: `@cosmo-behavior plan:harness-adapters#B-005`

### B-006 - Read-only check faithfully reports every state and owner

- Source: AC-002
- Context: project-owned, stable-authority, foreign-owned, and unmanaged fixtures cover second-project/package moves, source present/removed/unavailable, target current/absent/edited, links, wrappers, explicit conversion, and unknown target frontmatter keys
- Action: bare or explicitly-mode-selected `--check` runs without a pending transaction
- Expected: each selected row is reported once through Design §5's ordered grid; bare check and bare sync choose identical desired modes; generic authority assets remain current/source-ahead rather than foreign across cwd/package paths; project foreign claims require safe explicit transfer; unprovenanced exact copies remain conflicts; incomplete discovery is nonzero and authorizes no removal; unknown target keys remain opaque; manifest/journal are double-read around target observation and concurrent change is nonzero; check creates/changes no roots, locks, manifests, journals, timestamps, files, links, or mtimes
- Seam: `lib/harness-adapters/provenance.ts`, `lib/harness-adapters/sync.ts`, `cli/harness/subcommand.ts`
- Test: `tests/harness-adapters/provenance.test.ts` > `classifies the complete owner source target mode and concurrent-read grid without writing`
- Marker: `@cosmo-behavior plan:harness-adapters#B-006`

### B-007 - Fresh processes recover every phase without reentrant locking or lost evidence

- Source: AC-002
- Context: journals represent every Design §7 phase/manifest/target-vector/backup/stage cell, including pre-stage, partial install, commit, evidence-required, partial rollback, malformed evidence, and confirmed/unconfirmed release; plus an aliased owner root where `projectRoot === homedir()` and a lock held by a live, wedged owner process
- Action: a fresh normal sync, migration-driver retry, or fresh check starts at one owner root
- Expected: journal exists before recoverable artifacts; normal sync acquires the validated sibling lock once and follows the phase table; prepared/installing converge old, commit-ready/committed converge new, rolling-back converges old from every exact partial vector, and after-evidence commit preserves backup/journal until a re-read receipt is supplied; ambiguous bytes stay untouched; an aliased root where project and personal scope resolve to one parent yields exactly one lock/journal/manifest identity derived from the canonical owner-root path, and a request naming both scopes runs as one transaction (D-009); acquisition passes an explicit `waitTimeoutMs`, and a live wedged owner produces a bounded nonzero `lock-contended` row naming the lock path and owner pid without writing, never an indefinite wait; check performs no recovery and every pending/evidence-required row is non-current; unconfirmed release preserves persisted phase but returns nonzero/stops later owner work
- Seam: `lib/harness-adapters/sync.ts`, `lib/harness-adapters/provenance.ts`, existing `lib/entity-file-lock.ts` callback contract
- Test: `tests/harness-adapters/sync.test.ts` > `recovers every phase vector through one sibling lock while retaining evidence holds`
- Marker: `@cosmo-behavior plan:harness-adapters#B-007`

### B-008 - Local, foreign, and untraceable targets are never overwritten

- Source: AC-003
- Context: an owned target differs from baseline, a link points elsewhere, an output is claimed by another owner, or an unmanaged same-name copied target does/does not have verified historical lineage
- Action: normal sync, safe owner transfer, or authorized copied-target migration attempts to make the asset current
- Expected: all edited/unowned/foreign cases remain byte/type/link-identical and report source/target paths, owner/conflict reason, and port/preserve/transfer guidance; transfer changes only an exact/absent manifest key; only exact D-015 copied lineage may enter one-time migration; failed proof is permanent `foreign-or-untraceable`; there is no public force/adopt path
- Seam: `lib/harness-adapters/provenance.ts`, `lib/harness-adapters/sync.ts`, `cli/harness/subcommand.ts`
- Test: `tests/harness-adapters/provenance.test.ts` > `preserves edited foreign and untraceable targets and permits only safe lineage or owner transfer`
- Marker: `@cosmo-behavior plan:harness-adapters#B-008`

### B-009 - Pair-level Claude command bootstrap and migration are single-lock and retryable

- Source: AC-004
- Context: both live personal commands have no in-repo history while the two fixed native destinations, deterministic Claude renders, bootstrap proof, and crash points are prepared
- Action: D-018 pair bootstrap and the after-evidence atomic-set migration execute through one `withOwnerRootTransaction`
- Expected: raw live bytes create exactly two native sources with `description`, `argument-hint`, and body unchanged; any live/native/render mismatch performs zero live/manifest writes; both commands pass bootstrap before either move; partial pre-commit and rolling-back crashes restore both old targets; success preserves marker-stripped bytes, writes `authorizationKind: ratified-live-bootstrap` plus equal hashes/lengths/manifest keys, and retains pending state/backups until evidence receipt, command-only zero check, and cleanup; no historical revision is required and no path reacquires the lock
- Seam: new `external-commands/spec-to-backlog.md`, new `external-commands/implement-plan.md`, `lib/harness-adapters/render.ts`, `lib/harness-adapters/sync.ts`, new `missions/plans/harness-adapters/command-migration-evidence.json`
- Test: `tests/harness-adapters/sync.test.ts` > `bootstraps and migrates both commands as one nonhistorical recoverable transaction`
- Marker: `@cosmo-behavior plan:harness-adapters#B-009`

### B-010 - External cosmonauts inventory and bundle render exact live bytes

- Source: AC-005
- Context: plain runtime facts include effective chains, visible skills, and supported registry path templates, and the external bundle is one stable-authority asset with five reserved nested identities
- Action: the inventory and bundle render for Claude/Codex copy or wrapper mode
- Expected: `references/generated-inventory.md` exactly matches D-011's escaped/sorted schema and three path rows; authored bundle files contain no chain/skill/agent/path inventory and use existing CLI fallbacks; the single bundle keeps its nested tree/output identity; changed live facts make managed copy/wrapper source-ahead; provenance records `generatingProjectRoot`, and a bundle last generated by a different project reports `regenerated-from-other-project` on sync and `source-ahead` (never `current`) on check, naming the previous generator (D-020); cwd or package relocation alone never makes the generic personal bundle foreign
- Seam: `lib/harness-adapters/inventory.ts`, `lib/harness-adapters/render.ts`, new `lib/harness-runtime-inventory.ts`, `external-skills/cosmonauts/SKILL.md`, `external-skills/cosmonauts/chains/SKILL.md`, `external-skills/cosmonauts/skills/SKILL.md`
- Test: `tests/harness-adapters/inventory.test.ts` > `renders the stable-authority external bundle with exact live inventory bytes and fallbacks`
- Marker: `@cosmo-behavior plan:harness-adapters#B-010`

### B-011 - Export candidates preserve runtime precedence, health, and collisions

- Source: AC-006
- Context: discovery includes healthy/inaccessible roots, nested/flat skills, same-domain/same-logical-path overrides, cross-domain duplicate names, and runtime names colliding with bundle reserved identities
- Action: runtime-effective skills and strict export candidates are resolved separately
- Expected: tolerant runtime listing preserves existing first-root behavior; strict export discovery returns candidates plus per-root health and fails reconciliation on read/parse errors; candidates record nested flattening and flat wrappers, collapse only same-domain/same-logical-path overrides, treat the external bundle as one asset, and report all remaining output/reserved-name collisions before writes
- Seam: `lib/skills/discovery.ts`, `lib/harness-adapters/inventory.ts`, `lib/harness-runtime-inventory.ts`
- Test: `tests/harness-adapters/inventory.test.ts` > `separates tolerant effective listing from strict healthy collision-aware export candidates`
- Marker: `@cosmo-behavior plan:harness-adapters#B-011`

### B-012 - Four repo exports then the personal bundle produce durable live evidence

- Source: AC-005, AC-007
- Context: exactly four copied project targets and one copied personal bundle have D-015 authorizations; interruptions span authorization persistence, journal-before-stage, partial backup/install, evidence receipt, selected check, and cleanup
- Action: the project migration driver first migrates/checks the four project skills and durably records that phase, then migrates/checks the personal bundle; retries start from pending phase plus evidence files
- Expected: the project validation set has exactly four rows; each proves historical lineage before move, old/new hashes, `(ownerId, assetId)` manifest key, current selected-check row, evidence receipt, and backup exit; obsolete-path `skills-cli` is corrected from source; the manual personal bundle copy is replaced through the same authorized path; crashes restore/resume without losing old bytes; repo evidence is durable before personal migration; `.gitignore` contains `.agents/` and `.cosmonauts-harness-*` and `git status --porcelain` is empty after a full default `harness sync` in this repository, asserted directly rather than deferred to a closing audit (D-003); selected checks reach zero and cleanup completes before command bootstrap
- Seam: `.claude/skills/plan`, `.claude/skills/roadmap`, `.claude/skills/skills-cli`, `.claude/skills/task`, `domains/shared/skills/skills-cli/SKILL.md`, `/Users/cosmos/.claude/skills/cosmonauts`, new `scripts/validate-harness-exports.ts`, new `missions/plans/harness-adapters/repo-export-validation-evidence.json`
- Test: `tests/scripts/validate-harness-exports.test.ts` > `validates evidence-held recovery for four repo exports before the personal bundle`
- Marker: `@cosmo-behavior plan:harness-adapters#B-012`

### Acceptance-criterion mapping

| Acceptance criterion | Behaviors |
|---|---|
| AC-001 | B-001, B-002, B-003 |
| AC-002 | B-004, B-005, B-006, B-007 |
| AC-003 | B-008 |
| AC-004 | B-009 |
| AC-005 | B-010, B-012 |
| AC-006 | B-011 |
| AC-007 | B-012 |

## Design

### 1. Inward types, registry, and outer runtime composition

Create the inward contract in `lib/harness-adapters/types.ts`; it replaces the scope type currently owned by the destructive exporter:

```ts
type HarnessTargetId = "claude" | "codex" | "open-code";
type HarnessScope = "project" | "personal";
type HarnessAssetKind = "skill" | "command" | "agent-package";
type MaterializedAssetKind = "skill" | "command";
type SyncMode = "copy" | "link";
type SyncStatus = "missing" | "current" | "source-ahead" | "locally-edited";

type AssetOwnership =
  | { readonly kind: "project" }
  | { readonly kind: "authority"; readonly authorityId: "cosmonauts/core" };

interface ScopeRoots {
  readonly projectRoot: string;
  readonly homeRoot: string;
}

interface HarnessAsset {
  readonly assetId: string;
  readonly kind: MaterializedAssetKind;
  readonly ownership: AssetOwnership;
  readonly sourceRootId: string;
  readonly sourceRoot: string;
  readonly sourcePath: string;
  readonly logicalPath: string;
  readonly outputIdentity: string;
  readonly defaultScope: HarnessScope;
  readonly generatedInputs?: "cosmonauts-inventory";
}

interface RuntimeInventorySnapshot {
  readonly chains: readonly ChainInventoryRow[];
  readonly effectiveSkills: readonly SkillInventoryRow[];
  readonly candidates: readonly SkillCandidate[];
  readonly sourceHealth: readonly SourceHealthRow[];
  readonly paths: readonly HarnessPathRow[];
}
```

`lib/harness-adapters/registry.ts` owns target identity, aliases, owner roots, supported kinds, materialized target directories/renderers, package compatibility, and static authority descriptors. `open-code` has `status: "declared"` and no roots/adapters. Gemini has no entry.

New `lib/harness-runtime-inventory.ts` is deliberately outside the inward directory. It accepts an already-created runtime and calls `listNamedChains`, tolerant effective discovery, strict candidate discovery, and registry path projection. It returns only plain rows plus source-health tokens. Both harness and skills CLI bootstrap one runtime and call this composer; renderers never bootstrap, import runtime, or invoke CLI subprocesses.

Dependency direction:

`cli/* -> lib/harness-runtime-inventory.ts -> {lib/runtime.ts, lib/chains/, lib/skills/, lib/harness-adapters/types.ts}`

`{cli/, lib/skills/, lib/agent-packages/} -> lib/harness-adapters/`

`lib/harness-adapters/ -X-> {cli/, lib/runtime.ts, lib/skills/, lib/agent-packages/, git}`

### 2. Registry and package compatibility flow

Registry rows:

| Canonical target | Owner roots | Skill dir | Command dir | Package compatibility |
|---|---|---|---|---|
| `claude` | `<project>/.claude`, `~/.claude` | `skills` | `commands` | accepts definition keys `claude`/`claude-cli`; serializes/invokes `claude-cli` |
| `codex` | `<project>/.agents`, `~/.agents` | `skills` | unsupported v1 | canonical/serialized `codex` |
| `open-code` | none | none | none | declared, unimplemented |

Package flow:

1. `loadAgentPackageDefinition` validates target option objects without deciding export support. It preserves `claude`, `claude-cli`, `codex`, `gemini-cli`, and `open-code`. The runtime `TARGETS` set in `lib/agent-packages/definition.ts` is removed; schema syntax is not a resolution registry.
2. CLI selection retains public values `claude-cli|codex` but calls the harness registry. Claude metadata returns `{harnessId:"claude", serializedTarget:"claude-cli", packageIdSuffix:"claude-cli", targetOptions}`.
3. Zero Claude keys means mismatch; both keys means ambiguity before build; exactly one yields unchanged options.
4. `definitionFromAgent` writes `targets.claude` but uses `packageIdSuffix`, retaining `*-claude-cli` IDs.
5. Builders/compilers receive existing serialized targets; prompt/tool/skill assembly is unchanged.

### 3. Source descriptors, strict candidate discovery, and bundle identity

`HarnessAsset` identity is stable across physical relocation. Runtime skills use project ownership; the external bundle and two command descriptors use stable `cosmonauts/core` authority. Stable authority means same machine-global generic asset across projects/package paths, not same bytes across all versions: a newer source is ordinary source-ahead if target still matches baseline.

Split discovery:

- `discoverSkillCandidatesStrict(...)` returns `{candidates, sourceHealth}`. Every declared root is `complete` only after directory enumeration and every encountered candidate's file/frontmatter read succeeds. Permission/I/O/parse errors are diagnostics, never silent absence. A root no longer declared is distinguishable from a declared root that is unreadable.
- Existing `discoverSkills(...)` keeps tolerant first-root runtime/list behavior by reducing the same scanner in tolerant mode; its current skip-on-error behavior is not deletion authority.
- `prepareSkillExportAssets(...)` requires complete selected health before complete reconciliation, collapses only same-domain/same-logical-path overrides, applies `frontmatter-name` flattening to runtime candidates, combines the one bundle descriptor, reserves all five nested bundle names, and reports every collision before transaction planning.

A nested candidate such as `languages/rails/rails-api` records that path and output `rails-api`. A flat root `foo.md` outputs `foo/SKILL.md`. The bundle remains one tree at `cosmonauts`; nested skills are neither flattened nor selected separately.

Source containment resolves roots/descendants against registered realpaths. Local package-install symlinks may be registered at the source-root boundary; descendant escapes, remote URLs, broken sources, and generated output escapes fail. Target-only frontmatter is raw bytes plus optional `Record<string, unknown>` identity view; unknown keys are never normalized or rejected before conflict classification.

### 4. Deterministic rendering and live inventory

Render an ordered in-memory tree of exact buffers before target writes. Hash sorted relative paths, node types, link targets, and exact bytes; never normalize line endings. For identity Markdown, preserve source bytes and insert one stable generated-by HTML marker after frontmatter (or byte zero). Do not parse/reserialize unknown frontmatter merely to add the marker. Exact marker removal is the only command-migration normalization.

Copy mode writes rendered tree. Direct link mode links registered local directory. Flat links create an output directory and link only `SKILL.md`. Generated-wrapper mode links authored bundle nodes and writes generated nodes, recording each separately.

`external-skills/cosmonauts/references/generated-inventory.md` is exact:

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

Rows sort chains by name, skills by name/domain, paths by target/kind. Escape controls, newlines, backslashes used by escaping, pipes, and table delimiters deterministically. Path rows are exactly:

| Target | Kind | Project | Personal |
|---|---|---|---|
| `claude` | `command` | `.claude/commands` | `~/.claude/commands` |
| `claude` | `skill` | `.claude/skills` | `~/.claude/skills` |
| `codex` | `skill` | `.agents/skills` | `~/.agents/skills` |

No package/open/unsupported row is rendered. Chain fallback is `cosmonauts run chain list`; skill fallback is `cosmonauts skills list --json`. The shared `skills-cli` source replaces its static path table with a read-only JSON harness-check query.

> Superseded 2026-08-25 by D-011/D-012: fallback to a new `cosmonauts --list-chains --json` route and leaving `domains/shared/skills/skills-cli/SKILL.md` outside the inventory/path sweep.

### 5. Authority/project provenance, sticky modes, and complete classification

Manifest schema is discriminated by variant and keyed by owner plus asset:

```ts
type OwnerIdentity =
  | { readonly kind: "project"; readonly ownerId: string; readonly projectRoot: string }
  | { readonly kind: "authority"; readonly ownerId: "authority:cosmonauts/core"; readonly authorityId: "cosmonauts/core" };

interface ProvenanceBase {
  readonly schemaVersion: 1;
  readonly owner: OwnerIdentity;
  readonly assetId: string;
  readonly kind: MaterializedAssetKind;
  readonly target: "claude" | "codex";
  readonly scope: HarnessScope;
  readonly sourceRootId: string;
  readonly sourcePath: string;
  readonly logicalPath: string;
  readonly outputPath: string;
  readonly mode: SyncMode;
  readonly exportedAt: string;
}
```

Copy adds source/render/target digests and marker version. Direct link adds expected canonical source and link/wrapper shape, not content digest. Generated wrapper adds authored link-map, generated-input/render, and generated-target digests.

Every stored field is loaded/schema-validated. Project owner realpath/hash is re-derived; authority identity is re-read from descriptor; source/logical/output paths are re-resolved; source/render/target/link/generated evidence is recomputed; marker version is read; `exportedAt` is read for reporting and changes only on committed transition. Catalogue physical path is never an owner discriminator. No field's presence proves current.

Ordered tiebreaks: pending/ambiguous transaction -> recovery state; incomplete discovery -> `source-ahead (inventory-incomplete)` with no writes; output collision/foreign owner -> `locally-edited`; owned target mismatch -> `locally-edited`; source/desired/mode difference with intact baseline -> `source-ahead`; absent target -> `missing`; otherwise `current`.

Complete grid:

| Ownership | Source observation | Target observation | Check classification | Normal sync exit |
|---|---|---|---|---|
| invoking project or matching authority | present/healthy | exact baseline, desired/mode equal | `current` | no write |
| invoking project or matching authority | present/healthy | exact baseline, desired/mode differs | `source-ahead` | transactional replace/conversion |
| invoking project or matching authority | present/healthy | absent | `missing` | transactional create |
| invoking project or matching authority | present/healthy | differs | `locally-edited` | preserve/conflict |
| invoking project or matching authority | absent in healthy still-declared root | exact baseline | `source-ahead (source-removed)` | transactional target+entry removal |
| invoking project or matching authority | absent in healthy still-declared root | absent | `source-ahead (source-removed)` | entry removal only |
| invoking project or matching authority | absent healthy | differs | `locally-edited (source-removed)` | preserve; explicit entry-only forget |
| invoking project or matching authority | declared root incomplete | any | `source-ahead (inventory-incomplete)` | abort selected-owner transaction before writes |
| invoking project | source root no longer declared | any | `source-ahead (source-unavailable)` | no automatic delete; explicit entry-only forget |
| foreign project owner | any | exact, absent, or different | `locally-edited (foreign-owner)` | preserve; exact/absent explicit transfer only |
| matching stable authority from another cwd/package path | present/healthy | baseline cases above | classify as same owner | current/ahead/missing/local normally |
| unmanaged | present | absent | `missing` | create owned entry/output |
| unmanaged | present | exact desired or different | `locally-edited (unmanaged)` | preserve; only authorized migration path |
| unmanaged | absent | unrelated/absent | outside catalogue | no row/write |

Partial requests omit unselected rows before the grid. `--forget-removed` never changes target bytes. `--transfer-owner` requires selected asset, old owner ID, matching asset/output, target absent or exact old baseline, and no journal; it atomically changes the manifest key only. After transfer, ordinary classification repairs missing or advances source using the transferred baseline. Edited targets cannot transfer.

Bare mode resolution is pure: explicit request; else recorded mode for managed asset; else copy. Check/sync share it. Check double-reads manifest and pending journal before and after target observation; any version/digest change is `source-ahead (concurrent-change)` and nonzero.

### 6. Selection and reporting

```ts
interface SyncRequest {
  readonly targetIds?: readonly HarnessTargetId[];
  readonly scopes?: readonly HarnessScope[];
  readonly kinds?: readonly MaterializedAssetKind[];
  readonly assetIds?: readonly string[];
  readonly requestedMode?: SyncMode;
  readonly reconciliation: "complete" | "partial";
  readonly check: boolean;
  readonly forgetRemovedAssetIds?: readonly string[];
  readonly transferOwner?: { readonly oldOwnerId: string; readonly assetIds: readonly string[] };
}
```

`harness sync` derives partial whenever `--asset` is present and otherwise complete within selected harness descriptors. Every `skills export` invocation supplies runtime-skill IDs and is partial, including `--all`; it never reconciles bundle/command or omitted manifest entries.

CLI:

`cosmonauts harness sync [--target <id>] [--scope project|personal] [--kind skill|command] [--asset <assetId>] [--copy|--link] [--check] [--forget-removed <assetId>] [--transfer-owner <ownerId>] [--json|--plain]`

Selectors deduplicate. Copy/link are exclusive. Forget cannot combine with check, mode, partial asset selection (other than its own IDs), or transfer. Transfer requires explicit asset IDs and cannot combine with check/mode/forget.

Rows include owner kind/ID/diagnostics, target/scope/kind/asset, absolute source/target, recorded/requested mode, before state/reason, action, final state, recovery/evidence detail, discovery diagnostics, and release warning. Normal sync is nonzero for conflict, incomplete inventory, ambiguous recovery, evidence-required, containment/write failure, or unconfirmed release. Check is nonzero for any non-current row and never calls transaction/materialization.

### 7. Race-aware, phase-aware owner transactions

For owner root `<base>/.claude` or `<base>/.agents`, fixed sibling paths under canonical `<base>` are:

- `.cosmonauts-harness-<target>-<scope>.lock`
- `.cosmonauts-harness-<target>-<scope>.pending.json`
- `.cosmonauts-harness-<target>-<scope>.stage-<transactionId>`
- `.cosmonauts-harness-<target>-<scope>.backup-<transactionId>`

Manifest stays inside owner root as `.cosmonauts-harness-manifest.json`. Siblings stay same filesystem and are ignored.

Ordering:

1. Resolve trusted project/home base. Read-only `lstat` every owner-root component; reject symlink/non-directory/escape before lock.
2. Acquire `withEntityFileLock` at sibling lock; its parent creation touches only canonical base.
3. Inside `withOwnerRootTransaction`, repeat containment validation; create absent owner root only now; revalidate before every stage/rename/manifest/backup/journal operation and after install.
4. Rehydrate the one pending journal before planning. Complete reconciliation also requires strict source-health success before any write.
5. Render in memory and re-read old targets. Atomically persist `phase: prepared`, old/new manifest snapshots, old/new target snapshots, planned stage/backup paths/digests, atomic-set flag, and `cleanupPolicy` **before** creating stage/backup. The transaction ID makes later artifacts discoverable only through that journal.
6. Create/verify stages, set `phase: installing`, move old targets to backups and stages to targets. A crash in prepared/installing always converges old.
7. After every member is exact new, atomically set `phase: commit-ready`; only then write new manifest. Verify, then set `phase: committed`.
8. For `cleanupPolicy: after-commit`, remove exact backups/stages and journal. For `after-evidence`, preserve backup/journal and return `evidence-required`; generic sync/recovery cannot clean them. The migration driver writes/re-reads tracked evidence `phase: installed`, then supplies its digest as `EvidenceReceipt`; the lock-held core verifies receipt key/digest/new state, clears pending journal but retains backup, and returns to the driver.
9. With pending journal absent, the driver runs the same fresh read-only selected classifier under the held transaction, updates/re-reads evidence `phase: checked`, removes exact backups, then writes/re-reads evidence `phase: complete`. Crash after pending clear resumes from tracked evidence and backup; ordinary sync never deletes unreferenced migration backups.
10. Before any post-install rollback write, atomically set `phase: rolling-back`. That phase always converges every exact member to old (restore backup, delete exact new when old was absent), then writes old manifest and cleans. It never interprets all-new as commit.

`withOwnerRootTransaction` wraps `onReleaseUnconfirmed` into `{state:"persisted-release-unconfirmed", result, error}`. The persisted phase/result stands; callers emit nonzero, stop later owner work, and rerun recovery.

Normalized observations: `M=old|new|other`; each target `T=old|new|missing|other`; backup `B=old|absent|other`; stage `S=new|absent|other`. Old/new snapshots may be absent. Rows evaluate top-to-bottom; vector means every atomic-set member. This phase table covers every combination by final wildcard rows:

| Priority | Journal phase/policy | M | Target vector / B / S | Writer or migration-driver recovery | Check |
|---:|---|---|---|---|---|
| 1 | absent | * | * | no transaction recovery; §5 grid. Because journal is written first and stage/backup removed before ordinary journal cleanup, no normal orphan stage exists; evidence files exclusively name retained migration backups | §5 grid |
| 2 | malformed/owner-path-schema mismatch | * | * | preserve all; ambiguous conflict | local/recovery-ambiguous, nonzero |
| 3 | any phase | `other` | * | preserve all | ambiguous, nonzero |
| 4 | any phase | * | any `T/B/S=other` | preserve all | ambiguous, nonzero |
| 5 | `prepared` | `old` | every T old; B absent; S absent or exact new | delete exact stages, clear journal; old restored | recovery-pending, no write |
| 6 | `prepared` remaining | * | * | preserve; impossible/ambiguous | ambiguous |
| 7 | `installing` | `old` | each member old, missing+B old, or new with exact old/absent backup; S exact/absent | set/retain rolling-back and converge all old; clear after old manifest/targets verify | per-member pending/missing, nonzero |
| 8 | `installing` remaining | * | * | preserve ambiguous | ambiguous |
| 9 | `commit-ready` | `old` | every T new; B old/absent; S absent | write new manifest, set committed | source-ahead/recovery-pending |
| 10 | `commit-ready` | `new` | every T new; B old/absent; S absent | set committed | source-ahead/recovery-pending |
| 11 | `commit-ready` remaining | * | * | preserve; phase was written only after all-new verification | ambiguous |
| 12 | `committed/after-commit` | `new` | every T new; B old/absent; S absent | cleanup exact backup/journal; current | recovery-pending until cleanup |
| 13 | `committed/after-evidence` | `new` | every T new; required old backups present when old existed; S absent | preserve; only verified evidence receipt may clear journal; backup retained | source-ahead/evidence-required |
| 14 | `committed` remaining | * | * | preserve ambiguous | ambiguous |
| 15 | `rolling-back` | `old` or `new` | each T old, new, or missing with exact old backup; no `other` | converge each to old, write/verify old manifest, cleanup | recovery-pending/missing |
| 16 | `rolling-back` remaining | * | * | preserve ambiguous/local bytes | ambiguous |
| 17 | valid phase, any remaining cell | * | * | preserve; explicit recovery guidance | ambiguous |

Post-commit normal crashes with/without backup are row 12. Evidence-held post-commit crashes are row 13 and never lose backup. A crash after one rollback target is restored remains row 15 and continues rollback; manifest order cannot reverse intent because phase outranks observed old/new vector. Creation/removal use absent old/new snapshots under the same rows.

> Superseded 2026-08-25 by D-009: acquiring a lock inside `.claude`/`.agents`, checking containment only after acquisition, invoking ordinary sync while the lock is held, staging before journaling, and phase-free observation rules.

### 8. Authorized live migrations and evidence

#### 8.1 Legacy copied-target traceability

New `scripts/validate-harness-exports.ts` is a project integration edge, not a force path. Through an injected historical-source reader it loads named git revision/path without executing project code, applies recorded legacy identity-copy rendering, and compares the exact current target tree. Authorization requires historical render, current target, owner/authority, asset, output, and node shape all agree. It applies only to the four project copies and one personal bundle copy. Unknown frontmatter keys remain part of raw digest. Failure is D-014 conflict.

Historical revisions/digests are evidence to establish in Slice C, not assumed facts. If no exact historical object/render match exists, migration halts and the plan returns to the human because AC-005/AC-007 cannot be safely completed by this mechanism.

#### 8.2 First live validation: exactly four repository skills

The AC-007 set is:

| Asset ID | Target | Native source |
|---|---|---|
| `skill:shared/plan` | `.claude/skills/plan` | `domains/shared/skills/plan` |
| `skill:shared/roadmap` | `.claude/skills/roadmap` | `domains/shared/skills/roadmap` |
| `skill:shared/skills-cli` | `.claude/skills/skills-cli` | `domains/shared/skills/skills-cli` |
| `skill:shared/task` | `.claude/skills/task` | `domains/shared/skills/task` |

There is no fifth project authorization or migration row. Persist four lineage proofs and one project-owner after-evidence atomic-set journal before staging. Pre-commit interruption restores the entire old set. After new targets/manifest commit, the pending journal retains backups until `repo-export-validation-evidence.json` has a re-read `installed` receipt. Then clear pending, run a four-asset zero check, advance evidence to `checked`, clean backups, and advance/re-read `complete`. Evidence records owner, exact four paths, historical revision/source/old/new digests, manifest keys, recovery outcome, receipt, check row, backup cleanup, and timestamp.

#### 8.3 External bundle migration

Only after four-row complete evidence and zero selected check, authorize `/Users/cosmos/.claude/skills/cosmonauts` against historical `external-skills/cosmonauts`. Migrate one stable-authority personal asset through its own after-evidence transaction. Add `externalBundle`—not a project validation row—to the same evidence file and use the same installed/receipt/check/cleanup phases. If lineage fails, preserve the copy and halt AC-005 completion.

#### 8.4 Command bootstrap and pair migration

Commands use D-018, not git history. Copy the two live files exactly into the two new native paths, then require both native files and marker-stripped Claude renders equal separately recorded live bytes. Both native command frontmatters must contain the existing `description` and `argument-hint`, with body exact. Under the stable-authority personal Claude lock, re-read all four live/native inputs immediately before persisting one after-evidence atomic-set journal; both pass before either target moves.

Pre-commit crashes converge old. After manifest commit, write/re-read `command-migration-evidence.json` with `authorizationKind: ratified-live-bootstrap`, normalized `~` display paths, lengths, live/native/render/final digests, marker version, manifest keys, and `installed` receipt. Supply receipt, clear pending while retaining backup, run command-only zero check, mark evidence checked, delete backups, and mark/re-read complete. Evidence failure leaves pending+backups; post-install byte mismatch first sets rolling-back and converges both old through row 15.

> Superseded 2026-08-25 sequencing/authorization: command migration before repository validation, “five unmanaged conflicts,” and any historical command-lineage requirement. The order is four project copies, personal bundle, then ratified live command bootstrap.

### 9. CLI compatibility, documentation, and publication

Add `cli/harness/subcommand.ts` and register `harness` in `cli/main.ts`. Use existing human/plain/JSON helpers. No root flags or `cli/types.ts` chain-list change.

`cli/skills/subcommand.ts` retains listing. Every export invocation is a partial facade over same discovery/descriptors/renderer/classifier/transaction engine; destructive `rm`+`cp` and `VALID_TARGETS` disappear. `--all` selects all currently discovered runtime skill IDs but does not reconcile bundle or stale manifest entries.

`cli/export/subcommand.ts` keeps serialized target labels/errors and delegates registry resolution. Builders/runners/output JSON stay unchanged.

Update external bundle and shared `skills-cli` content for safe sync/check, generated facts, and existing chain-list route. Add `external-commands/` to publication. Add `.agents/` and `.cosmonauts-harness-*` to ignore rules; no universal check script.

### 10. Invariant-to-write trace

| Written field/artifact | Fresh read/decision use | INV-001 | INV-002 | INV-003 | INV-004 | INV-005 | INV-006 |
|---|---|---|---|---|---|---|---|
| Copy target/marker | Exact tree/marker re-read against fresh render | one descriptor source | mismatch local | recomputed digests | generated facts injected only | registry path/render | n/a |
| Direct link/flat wrapper | Node/target/source realpath/shape re-read | one source | wrong link preserved | pointer checked | no mirrored facts | registry shape | explicit local only |
| Generated wrapper | Authored links, inputs, generated/target bytes re-read | authored source links | edits conflict | all digests recomputed | runtime rows | registry transform | explicit local wrapper |
| Manifest owner/base | Project hash or authority re-derived; all paths/mode/timestamp loaded | stable source trace | owner/baseline gates writes | no decision field trusted alone | no fact authority | target/scope/kind validated | variant/mode re-read |
| Discovery health/sourceRootId | Declared roots strictly rescanned; diagnostic re-read | source identity known | incomplete cannot delete | absence distinguishable from failure | live rows only | descriptors/roots registry/runtime composed | n/a |
| Variant fields | Hash/link/map fields freshly recomputed | maps one source | divergence wins | drives four states | generated input detects drift | variant registry-owned | link verified |
| Pending phase/cleanup policy | Phase, snapshots, paths, vectors re-read fresh | no alternate source | commit/rollback/evidence intent preserved | fresh process rehydrates | no fact authority | owner path registry-derived | no escape authorization |
| Stage/backup | Exist only after prepared journal; exact digest/node re-read before move/cleanup | historical old/new evidence | rollback/hold exact bytes | all crash cells detectable | n/a | owner transaction path | n/a |
| Legacy authorization | Historical object/path re-read/rendered; live target rehashed under lock | proves copied lineage | mismatch never moves | durable/rechecked | n/a | asset/output checked | records mode |
| Command bootstrap evidence | Live/native/render/final re-read; fixed IDs/path kind validated | establishes first native authority | pair mismatch/rollback | actual-byte proof | no inventories | Claude command adapter | no fallback |
| Generated inventory | Runtime rows recollected; target re-read | derived node | edits conflict | fact drift ahead | exact introspection | registry paths | wrapper tracked |
| Migration evidence receipt | Evidence phase/digest/new state re-read before pending clear and backup cleanup | proof references native source | backups held until proof | crash-resumable across journal clear | inventory obligations checked | manifest keys checked | actual mode recorded |
| `.gitignore`/`package.json` | Tests read exact entries; clean-worktree/publication observed | publishes native sources | no cleanup pressure | ignored outputs checked | n/a | roots reflected | n/a |

No implementation field is written under `memory/`, `knowledge/`, task state, or run/session state. Memory/knowledge remains OFF.

## Files to Change

- New `tests/harness-adapters/registry.test.ts` ↔ new `lib/harness-adapters/types.ts`, new `lib/harness-adapters/registry.ts`, `lib/skills/exporter.ts`, `lib/skills/index.ts` (B-001).
- `tests/agent-packages/definition.test.ts`, `tests/agent-packages/build.test.ts` ↔ `lib/agent-packages/types.ts`, `lib/agent-packages/definition.ts`, `lib/agent-packages/build.ts`, new registry package metadata (B-002/B-003 only).
- `tests/cli/export/subcommand.test.ts` ↔ `cli/export/subcommand.ts`, registry package resolution (B-003).
- New `tests/harness-adapters/render.test.ts` ↔ new `lib/harness-adapters/render.ts` (B-005/B-009/B-010).
- New `tests/harness-adapters/provenance.test.ts` ↔ new `lib/harness-adapters/provenance.ts` (B-004/B-006/B-008).
- New `tests/harness-adapters/sync.test.ts` ↔ new `lib/harness-adapters/sync.ts`, new `lib/harness-adapters/index.ts`, existing `lib/entity-file-lock.ts` API (B-004/B-005/B-007/B-009; generic helper remains non-reentrant).
- New `tests/harness-adapters/inventory.test.ts`, `tests/skills/discovery.test.ts`, new `tests/harness-runtime-inventory.test.ts` ↔ new `lib/harness-adapters/inventory.ts`, `lib/skills/discovery.ts`, new `lib/harness-runtime-inventory.ts` (B-004/B-010/B-011).
- New `tests/cli/harness/subcommand.test.ts`, `tests/cli/main.test.ts` ↔ new `cli/harness/subcommand.ts`, `cli/main.ts` (B-004/B-006/B-007 CLI selection/report/no-write behavior).
- `tests/cli/skills/subcommand.test.ts`, characterization in `tests/skills/exporter.test.ts` ↔ `cli/skills/subcommand.ts`, `lib/skills/exporter.ts` (B-001/B-004 compatibility; destructive expectations are replaced test-first).
- New `external-commands/spec-to-backlog.md`, new `external-commands/implement-plan.md`, new `missions/plans/harness-adapters/command-migration-evidence.json` ↔ `tests/harness-adapters/sync.test.ts` (B-009).
- `external-skills/cosmonauts/SKILL.md`, `external-skills/cosmonauts/chains/SKILL.md`, `external-skills/cosmonauts/skills/SKILL.md`, `external-skills/cosmonauts/plans/SKILL.md`, `external-skills/cosmonauts/tasks/SKILL.md` ↔ `tests/harness-adapters/inventory.test.ts` (B-010/B-011).
- `domains/shared/skills/skills-cli/SKILL.md` ↔ new `tests/skills/skills-cli.test.ts`, plus B-012 live evidence (D-011/B-012).
- `.claude/skills/plan`, `.claude/skills/roadmap`, `.claude/skills/skills-cli`, `.claude/skills/task`, `/Users/cosmos/.claude/skills/cosmonauts`, new `scripts/validate-harness-exports.ts`, new `tests/scripts/validate-harness-exports.test.ts`, and new `missions/plans/harness-adapters/repo-export-validation-evidence.json` (B-012). Home/project target paths are outputs, not sources.
- `domains/shared/skills/agent-packaging/SKILL.md`, `README.md`, `docs/orchestration.md` ↔ existing package/CLI content tests for registry vocabulary and harness sync; no root chain-list surface (B-001/B-003/B-010).
- `package.json` adds `external-commands/` to `files` and no universal check script (D-001/D-004).
- `.gitignore` adds `.agents/` and `.cosmonauts-harness-*` (D-003).

## Risks

- **Historical-lineage availability.** The four project copies and personal bundle may not match accessible historical renders. Pivot/abort: if exact lineage cannot be proved, preserve target and halt that AC; never weaken D-015. Historical availability is evidence to establish, not an assumed pass (`review-3.md` missing coverage).
- **Command bootstrap cutover.** D-018 applies only to two fixed assets/paths. Both commands must pass raw native/render/live preflight before either move. Abort on any marker-stripped difference; never substitute circular git history.
- **Transaction complexity.** Prepared-before-stage, durable phases, cleanup policy, evidence receipts, and rolling-back intent are load-bearing. Abort if any crash window maps to two actions or loses a required backup/evidence path.
- **TOCTOU boundary.** Sibling locking avoids verified preflight violation, but Node lacks portable `openat`. A hostile same-user symlink race between final `lstat` and syscall is outside the local single-owner boundary. Pivot if sandbox probes show accidental races cannot be detected/recovered.
- **Lock release uncertainty.** Committed action may accompany unconfirmed release. Return nonzero and preserve phase; never fabricate rollback or silently continue another owner root.
- **Ownership semantics.** Generic bundle/commands use stable authority and can be advanced by any project with that authority; project-derived personal skills remain project-owned. Exact-baseline transfer is explicit. Abort if implementation binds authority to cwd/package path or transfers edited bytes.
- **Discovery incompleteness.** Tolerant listing errors must never authorize deletion. Strict complete discovery aborts before all selected-owner writes; no partial “safe” writes during an incomplete snapshot.
- **Permanent default conflict.** The repository's unfiltered default sync/check must preserve and report the ratified foreign same-name target and exit nonzero. Passing evidence is exact conflict + byte preservation + clean git status, not a zero default check. Selected migration checks still must be zero.
- **Link harness support.** Directory/flat/generated wrapper loading remains unprobed. Abort before live migration if sandboxed probes fail; explicit link never falls back to copy (`review-3.md` missing coverage).
- **Frontmatter variance.** Foreign targets can include arbitrary keys; raw comparison cannot normalize them.
- **Project-controlled execution.** Runtime introspection loads configured/plugin TypeScript as existing commands do; explicit sync/check is consent. Historical reader reads objects but executes no project code/hook. Halt if implementation needs project-controlled execution beyond this.
- **Arbitrary projects.** Test monorepos, cwd changes, package relocation, missing config, custom paths, linked packages, absent roots, and both scopes. Stable authority and project owner must produce specified second-project results.
- **Inventory injection.** Names/descriptions can contain Markdown/control characters; exact escaping/order is behavior.
- **Canonical package mapping.** Any target condition outside registry package metadata, serialized behavior change, or future-block rejection fails AC-001.
- **Publication/autoload blast radius.** `external-commands/` publication must not add Pi/domain auto-discovery; audit globs/package output.
- **First-live ordering.** Four-row evidence/check before bundle, then commands. Abort on bypass.
- **Structural evidence unavailable.** Complexity/duplication/boundaries/dead code/audit/traces are unbound and architecture map missing; reviewer judgment remains required.
- **Scope pressure.** Plan is at 12 behaviors. The single split trigger is in Implementation Order; no hidden behavior in tasks.

## Quality Contract

Plan-specific acceptance evidence:

1. Registry/package tests prove one resolver, inward scope ownership, future-block parsing, alias ambiguity rejection, exact `claude-cli` compatibility, and no build expansion.
2. Selection/state tests cover project vs stable authority, second-project/package relocation, safe transfer, strict discovery failure, full owner/source/target grid, sticky modes, conversion old-mode row, partial non-deletion, and source-removed exits.
3. Render/containment tests mutate source structure, target bytes/links/facts/frontmatter, owner symlinks, and siblings; invalid cases write nothing.
4. Fresh-process tests cover every phase table row, journal-before-stage, post-commit cleanup/evidence policies, every exact partial rollback vector, check no-write/double-read, self-lock non-reentry, and unconfirmed release.
5. Command evidence proves nonhistorical two-command bootstrap, pair equality, evidence hold, rollback, and cleanup; repository evidence contains exactly four project rows plus separate bundle object.
6. Generated inventory compares exact sorted/escaped bytes, three supported path rows, existing chain fallback, bundle one-asset identity, stable authority, and no authored inventories in exported sources.
7. Live checkpoint proves four project copies first, bundle second, commands last; selected checks are zero; an isolated-home full default sync leaves `.codex/skills` absent, uses `.agents`, preserves the known foreign target, returns nonzero for exactly that conflict after provisioning, and leaves `git status --porcelain` empty.
8. Scope audit proves no memory/knowledge/task/session writes, coordinator package, reference delivery, Drive envelope, capture, Gemini, marketplace, or root chain-list flag.

| Order | Gate kind | Tier | Binding state | Threshold | Protocol | Degradation / notes |
|---:|---|---|---|---|---|---|
| 1 | `correctness` | universal | bound | Project-native correctness, B-001..B-012 tests, both evidence artifacts, zero selected checks, and expected-nonzero default conflict pass | project-discovered | hard fail |
| 2 | `artifact-conformance` | universal | bound | Every behavior has required fields, root-relative seam-mirroring test path, and exact marker in implemented test/evidence file | artifact evidence | hard fail at implementation close; declared new tests must exist then |
| 3 | `mutation` | bindable | unbound | Negative controls catch overwrite, project clobber, authority misclassification, partial deletion, discovery-failure deletion, mode disagreement, stale hash, recovery/check writes, lost evidence, rollback reversal, lock reentry, inventory mirroring, and command-byte change | pending | reviewer judgment; no fabricated pass |
| 4 | `duplication` | bindable | unbound | No second target/directory/package-selection/chain/inventory registry | pending | execution not consented; reviewer/search judgment |
| 5 | `complexity` | bindable | unbound | Registry, discovery health, rendering, classification, transaction phases, materialization, and migration proofs separately testable | pending | execution not consented; reviewer judgment |
| 6 | `boundary-conformance` | bindable | unbound | Core imports no runtime/CLI/skills/package/git edge; outer composer/driver own integrations; writes stay declared | pending | execution not consented; reviewer judgment |
| 7 | `dead-code` | bindable | unbound | Destructive copier, local resolver tables/switches, stale inventories, and root chain-list plan surface absent | pending | execution not consented; reviewer/search judgment |

## Implementation Order

0. **Ratified-ground checkpoint (open).** Re-read A-001/A-002 and D-001..D-018; confirm tasks do not reopen human rulings. Record live hashes/paths read-only. Human approval remains required before tasks; no Gate-0 decision blocker.

### Slice A - Registry and discovery; no writes

1. **Characterize contracts.** Pin package parse/build/serialization/errors, skill paths, tolerant discovery, strict-failure candidates, existing chain list, the four copied project rows, personal copied bundle, and two live command bytes. RED B-001/B-002/B-003/B-011.
2. **Inward types/registry - B-001/B-002/B-003.** Add target/package metadata and project/authority descriptors; route skills/package resolution; preserve parse/serialization. Checkpoint A1: no sync/content migration.
3. **Candidate/effective discovery and runtime composition - B-011 support.** Add strict source-health candidate API beside tolerant listing, bundle reserved identities, and outer runtime snapshot. Checkpoint A2: failures/collisions are data, still no writes.

### Slice B - Sync mechanism and generated content; fixtures/ignored outputs only

4. **Render/provenance state - B-004/B-005/B-006/B-008.** TDD deterministic trees, sticky modes, owner variants/transfer, complete grid, double-read check, legacy proof verifier, conflicts, and healthy source-removal exits.
5. **Transactions/recovery - B-007.** TDD sibling lock, opaque seam, prepared-before-stage, phase table, cleanup policies, evidence receipt, rolling-back vectors, containment, and release outcome. Checkpoint B1: every crash/no-write mutation in temp roots; no live writes.
6. **CLI compatibility - integration of B-004/B-006/B-007.** Add selectors/reports/check/forget/transfer, route every `skills export` as partial, register subcommand, remove destructive/local resolver paths. Checkpoint B2: arbitrary temp project/home green.
7. **Generated bundle - B-010.** Exact inventory/fallbacks, sweep authored bundle/shared path tables, source-ahead fact detection, stable authority. Probe link/wrapper loading in sandbox with no project plugin execution. **Checkpoint B:** core/CLI/content green; writes only fixtures/ignored outputs; no live migration.

### Slice C - Ordered live migrations and closing gates

8a. **First live validation - B-012 project phase.** Establish—not assume—exact historical revisions for four rows. Persist proofs/prepared after-evidence set journal, demonstrate unmanaged conflicts, migrate, write/re-read installed receipt, clear pending, selected zero check, checked evidence, backup cleanup, complete evidence. Stop on lineage/recovery ambiguity.

8b. **Personal bundle - B-010/B-012.** Only after 8a complete, establish copied-bundle lineage and run same stable-authority evidence lifecycle. Stop before commands on conflict/unconfirmed release.

8c. **Personal command pair - B-009.** Only after 8a/8b, copy exact live bytes into two native sources, prove D-018 pair equality, execute one after-evidence non-reentrant set transaction, receipt, selected zero check, cleanup, and complete command evidence. No git-history precondition.

9. **Closing checkpoints.** Run targeted tests per behavior, full project-native/artifact gates, provisioned selected checks, then isolated-home full default sync/check. The latter must report/preserve the one ratified permanent foreign conflict and exit nonzero while all other rows are current, `.agents` is used, `.codex/skills` absent, and `git status --porcelain` empty. Audit publication/autoload, structural boundaries, and out-of-scope writes.

**Single split trigger:** if investigation requires a 13th behavior or Slice B cannot remain independently shippable without live migration, stop before tasks and split Slice C into a separately ratified follow-on plan; do not hide extra behavior inside these 12.

If a stage collides with ratified Goal/`INV-001..INV-006`/`AC-001..AC-007`, halt-and-escalate. Derived mechanisms amend on record only when all ratified intent survives.
