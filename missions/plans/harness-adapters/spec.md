## Purpose

Cosmonauts assets — skills, harness commands, and the external "drive
cosmonauts" surface — are authored once, in this repository, and consumed
natively from any harness (cosmonauts itself, Claude Code, Codex, Gemini)
without hand-maintained copies. Today the export path is `rm -rf` + `cp -r`
with no provenance, no staleness detection, and no transform seam; every
exported copy inspected during the 2026-08-25 survey had drifted from its
source, and the two highest-value assets (`/spec-to-backlog`,
`/implement-plan`) have no in-repo source at all. This plan replaces
copy-and-pray with a harness-adapter contract: one harness registry, one
git-tracked native home per asset kind, per-harness thin rendering, and
drift that is either impossible (link mode) or mechanically detectable
(copy mode with provenance).

The motivation is coordinator flexibility: the human coordinates from
subscription Claude Code today and must be able to switch harness or model
tomorrow — or return to an internal cosmonauts coordinator — without
re-authoring anything. This is the first plan of the portable-harness track
(ROADMAP 2026-08-25), whose arc runs: assets (this plan) → free Drive
(`drive-envelope`) → **packaged coordinators** (`coordinator-packages`:
launch Claude Code or Codex already *being* a cosmonauts coordinator, in
cosmo/general or cody/coding flavor) → session capture
(`external-session-capture`). This plan's sync contract is what keeps those
coordinators thin: the binary carries identity + CLI knowledge; skills and
commands come from the live sync, so a running coordinator never drifts
from the repo.

## Users

- **The human coordinator** — authors and edits assets in one place; runs
  one sync command; trusts that what a harness loads is what the repo says.
- **External harness agents** (Claude Code, Codex, Gemini, …) — load
  cosmonauts skills/commands in their native format and drive cosmonauts
  through the CLI, with the content guaranteed current (or verifiably
  stale).
- **Internal cosmonauts agents** — unchanged; they keep reading the native
  homes directly.
- **CI / gates** — can ask "are any exports stale?" and get a nonzero exit.
- **Packaged coordinators** *(future consumer, shape-setting)* — a
  binary-launched harness session (`cosmonauts export`) whose skills and
  commands are this plan's synced assets rather than an inline-frozen
  snapshot.

## User Experience

- `cosmonauts harness sync [--target <id>] [--scope project|personal]
  [--link|--copy] [--check]` (final surface is a plan-stage call; the
  contract is: one command syncs, `--check` verifies without writing and
  exits nonzero on drift).
- In link mode, an exported asset is a symlink (or a thin generated wrapper
  whose body points at the repo file) — editing the source is immediately
  live everywhere.
- In copy mode, every exported asset carries a provenance record (source
  path, content hash, export time) and a generated-by marker; `--check`
  reports drift both ways (source changed vs target locally edited).
- A locally-edited target is a **conflict**, reported and left intact —
  never silently overwritten.
- `/spec-to-backlog` and `/implement-plan` exist in-repo as first-class,
  git-tracked command assets and appear in `~/.claude/commands/` as
  rendered exports.
- The external "drive cosmonauts" skill's inventories (named chains, skill
  lists, export paths) are generated from live introspection, not
  hand-mirrored tables.

## Intent

*Drafted 2026-08-25; INV-001..INV-006 **ratified 2026-08-25 (Decided-by: human)**.*
*Goal added and identifiers normalized 2026-08-25 (Decided-by: human) — see Amendments.*

Goal: Cosmonauts assets are authored once and remain live or mechanically
verifiable in every supported harness, so coordinators can switch harnesses
without re-authoring or silent drift.

Invariants — mechanism yields to these:

- **INV-001 — Single source of truth.** Every exported/linked asset is
  traceable to exactly one in-repo source; no exported copy is
  authoritative. Editing a wrapper is a conflict, not a fork.
- **INV-002 — Sync never destroys local edits.** A target whose content no
  longer matches its recorded provenance is reported as a conflict and left
  byte-intact. (The current `rm -rf` + `cp` behavior is the named failure
  mode; same spirit as knowledge-surface D-026.)
- **INV-003 — Drift is mechanically detectable.** A single command with
  nonzero exit reports, for every registered target: missing, current,
  source-ahead, or locally-edited. Suitable for CI.
- **INV-004 — Rendered facts are introspected, never mirrored.** Any table of
  chains, skills, agents, or paths that lands in an exported asset is
  generated from the live registry/CLI at sync time, or replaced by an
  instruction to query the CLI. Hand-mirrored inventories are the named
  failure mode (the `adapt` chain and the 3-missing-skills table).
- **INV-005 — One harness registry.** Every export mechanism (skills,
  commands, agent packages) resolves targets through one registry: target
  id, per-scope directories, supported asset kinds, rendering transform.
  No second target vocabulary. Adding a harness means adding a registry
  entry, not a new code path.
- **INV-006 — Link mode is opt-in and local-paths-only**, mirroring
  `packages install --link` semantics. (Symlinks are rejected elsewhere in
  this codebase for good reason — knowledge-store — so the adapter states
  why they are safe here: developer-machine convenience, single-owner
  target directories.)

## Acceptance Criteria

- **AC-001** A harness registry exists and is the single resolution path for
  target id → {project dir, personal dir, supported asset kinds,
  transform}; the existing `skills export` targets (`claude`, `codex`) and
  the agent-package targets (`claude-cli`, `codex`) resolve through it
  under one reconciled vocabulary.
- **AC-002** Skills sync supports link mode and copy mode; copy mode writes a
  provenance manifest and marker; both modes support `--check` with
  the four-state report (missing / current / source-ahead / locally-edited)
  and nonzero exit on any non-current state.
- **AC-003** A locally-edited target is never overwritten by sync; the
  conflict is reported with both paths and the resolution options.
- **AC-004** A `command` asset kind exists with a git-tracked native home;
  `spec-to-backlog` and `implement-plan` are migrated into it and render to
  Claude Code's command format (frontmatter `description` +
  `argument-hint` + body). Their rendered output in `~/.claude/commands/`
  is byte-equivalent to today's hand-maintained files modulo the
  provenance marker, at migration time.
- **AC-005** The external `cosmonauts` skill's chain table and skill
  inventory are generated from live introspection at sync time (which
  requires the CLI to be able to enumerate named chains), and the generated
  copies for at least the Claude Code target replace today's manual copies.
- **AC-006** Nested skill names (e.g. `languages/rails/rails-api`) export
  without collision and with a recorded flattening rule; a name collision
  across domains is a reported error, not first-wins silence.
- **AC-007** The repo's own stale exports under `.claude/skills/*` are
  regenerated through the new path as the first live validation; the
  obsolete-path `skills-cli` copy is the named regression test. The
  validation set is exactly the four verified cosmonauts exports —
  `plan`, `roadmap`, `skills-cli`, `task`. `playwright-cli` is **excluded**:
  it is a foreign asset generated by `playwright-cli install --skills`, not
  a cosmonauts export. Generally: where a cosmonauts source and a target
  that is not traceable to it share a name, the target is a permanent
  conflict, never a migration candidate.
  *(Amended 2026-08-25 by A-001; superseded text preserved there.)*

## Out of Scope

- **Agent-package binaries** — `cosmonauts export <agent-id>` keeps its
  richer compile path; this plan re-homes its target resolution onto the
  shared registry (AC-001) and must not preclude a future
  `skillDelivery: "reference"` mode (a packaged coordinator consuming
  live-synced assets instead of an inline-frozen snapshot). Building that
  mode — and the coordinator packages themselves, including a git-tracked
  home for the today-hand-written, gitignored `packages/*/*-system.md`
  personas — is the follow-on `coordinator-packages` plan.
- **Session-data capture for externally-coordinated runs** — the sibling
  `external-session-capture` roadmap item; this plan only keeps the
  adapter boundary clean enough for it to hook in.
- **Executing cosmonauts chains/agents natively in external harnesses** —
  external harnesses drive cosmonauts through the CLI; "exporting a
  workflow" means rendering a command that shells out, never porting the
  runtime.
- **Gemini as a fully supported target** — the registry must make adding it
  an entry-plus-transform exercise, and it is the natural validation
  candidate, but v1 ships `claude` + `codex`. (Gemini's copy has been
  stale since May; deleting it or refreshing it manually is housekeeping,
  not scope.)
- **`open-code`** — stays a declared-but-unimplemented registry candidate.
- **Marketplace/distribution of assets to other users** — the `domains`
  track owns packaging for the world.

## Assumptions

- Skill frontmatter today is uniformly `{name, description}` (verified
  across all 51 SKILL.md files), so identity rendering is correct for
  skills *now*; the transform seam exists so the first harness-specific
  key does not force a redesign.
- The Claude Code and Codex skill/command formats remain
  markdown-with-frontmatter loaded from well-known directories; if a
  harness moves to a packaged format, that lands in its registry transform.
- Symlinked skill **directories** are followed by Claude Code and Codex
  (empirically true today: `~/.agents/skills/cosmonauts` and three
  hand-made `~/.claude/skills/*` symlinks are in daily use). Symlinked
  `SKILL.md` **files** are followed by Claude Code only; Codex ignores them.
  *(Measured 2026-08-26; see A-003.)*
- The two migrated commands remain cosmonauts-generic (usable from any
  cosmonauts project), which is why personal scope (`~/.claude/commands/`)
  is their default render target.

## Open Questions

- **Native home for the `command` asset kind** — a new top-level
  (`external-skills/` sibling, e.g. `external-commands/`), a domain
  surface (`domains/shared/commands/`), or folded into `external-skills/`
  as a harness-facing bundle. Planner proposes; affects the domains track's
  packaging story.
- **Default mode** — is link the default on developer machines with copy
  the explicit choice, or copy-with-provenance the default and link the
  opt-in? (INV-006 fixes opt-in *availability*, not the default.)
- **Should the repo's own `.claude/` exports become git-tracked?** Today
  export destinations are gitignored, which is what made drift invisible to
  review. Tracked-generated vs ignored-but-checked is a plan-stage call
  with CI implications.
- **Does `--check` run as a repo gate** (check-artifacts style) or stay a
  manual/CI-only command in v1?

## Amendments

Ratified amendments to this spec, recorded per
`work-artifacts/references/deviation-protocol.md`. Ratification is human-only.

- **A-001 — AC-007's validation set excludes `playwright-cli`.**
  - Superseded text: "The repo's own stale exports (`.claude/skills/*`) are
    regenerated through the new path as the first live validation; the
    obsolete-path `skills-cli` copy is the named regression test."
  - Why it failed: the text assumes all five `.claude/skills/*` directories
    are stale cosmonauts exports. Verified 2026-08-25, four are;
    `.claude/skills/playwright-cli/` is a third-party asset generated by
    `playwright-cli install --skills` (7450 bytes, 8 files, carries an
    `allowed-tools:` frontmatter key its cosmonauts source lacks), while the
    cosmonauts source is a 2693-byte wrapper whose body instructs the reader
    to run that generator. Migrating it would destroy richer third-party
    data — the destructive override INV-002/AC-003 forbid.
  - Alternatives rejected: keeping all five behind per-target authorization
    evidence (leaves the identical trap for the next same-named foreign
    skill); narrowing to four with no general rule (same).
  - Why: serves INV-002 (sync never destroys local edits) and AC-003.
  - Decided by: human, 2026-08-25

- **A-002 — Intent gains a canonical Goal; INV/AC identifiers normalized.**
  - Added the Goal sentence required by
    `work-artifacts/references/spec-format.md`, and renumbered `INV-1..6` to
    `INV-001..INV-006` and `AC-1..7` to `AC-001..AC-007` throughout. No
    invariant or criterion changed in substance.
  - Why: the deviation protocol's discriminator appeals to a canonical
    Intent goal; an invariant-only Intent leaves implementers without one.
  - Decided by: human, 2026-08-25

- **A-003 — Link-shape support is registered per target, not per mode.**
  - Superseded text: the Assumptions bullet "Symlinked skill directories are
    followed by Claude Code and Codex", insofar as the plan extrapolated it from
    directory symlinks to `SKILL.md` file symlinks for every target.
  - Why it failed: the assumption is true as written but was read more broadly
    than it was measured. A controlled Checkpoint B sandbox probe varying only
    link shape found Codex 0.147.0 discovers a directory-symlinked skill but
    **not** either `SKILL.md` file-symlink shape (flat-skill or
    generated-wrapper); Claude Code discovers all three. Reproduced
    independently via `codex -a never exec --ephemeral --ignore-user-config
    --sandbox read-only`. Under the unamended reading, `harness sync --target
    codex --link` would emit a wrapper Codex silently cannot load — no error and
    no drift signal.
  - Amendment: link support is registered per target **and per link shape**. The
    Claude skill adapter registers `directory`, `flat-skill`, and
    `generated-wrapper`; the Codex skill adapter registers only `directory`. A
    `--link` selection resolving to an unregistered shape fails before any
    owner-root or manifest write, naming the asset, the resolved shape, and the
    shapes that target does register. Explicit link never falls back to copy, and
    no provenance is recorded for a rejected request. Copy mode is unaffected for
    every target and shape. `AC-002`'s "supports link mode and copy mode" is read
    accordingly: availability is per target/shape, not universal.
  - Alternatives rejected: falling back to copy for Codex (silently violates an
    explicit `--link`, and the plan's Link-harness-support risk forbids it);
    leaving link support unqualified (produces undetectably broken skills, which
    is exactly what `INV-003` exists to prevent); treating the probe as the
    plan's split trigger (the fix extends the existing `supportedModes`
    mechanism under `B-001`/`B-005` exactly as D-019 did, needing no thirteenth
    behavior).
  - Why: keeps `INV-006` link mode opt-in *and honest about what a target can
    actually load*, and keeps `INV-003` drift detection meaningful. Slice C was
    unaffected — every live migration is copy mode against Claude.
  - Implemented by plan decision D-021 and TASK-594.
  - Decided by: human, 2026-08-26
