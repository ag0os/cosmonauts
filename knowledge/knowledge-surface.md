---
type: decision
title: Knowledge surface
description: Archived plan distillation for knowledge-surface.
resource: knowledge/knowledge-surface.md
tags:
  - 'plan:knowledge-surface'
  - 'source:archive-distillation'
timestamp: '2026-08-21T00:00:00.000Z'
scope: project
kind: semantic
writer: coordinator
source: missions/archive/plans/knowledge-surface/plan.md
date: '2026-08-21T15:40:00.000Z'
---

# Knowledge Surface

## What Was Built

A human-curated project knowledge base at `knowledge/`, with a user-scoped twin
at `~/.cosmonauts/knowledge/`, plus framework-wide retrieval — an injected index
and a shared `recall` — reaching every agent in a cosmonauts-assembled session.
The 36 root distillations and 100 records across 10 JSONL bundles became 136 OKF
markdown records; the `.knowledge.jsonl` read/write path is gone. A supervised
backfill produced 164 attributable proposals for the 19 archived plans that had
no distillation. The entire runtime surface is config-gated and defaults OFF;
only a literal `true` enables it.

## Key Decisions

- **One configured inline extension composed at session assembly, not shared
  runtime state (D-017).** Pi 0.80.6 gives every extension its own `ExtensionAPI`
  and loads extensions under jiti with `moduleCache: false`, so cross-extension
  coordination through a WeakMap or a module singleton is not merely inelegant —
  it is impossible. The original design (D-008) assumed otherwise and had to be
  superseded. Assembly resolves the gate once and supplies one named
  `InlineExtension` whose closure captures identity and authority.
- **OFF-identity governs the gated runtime surface, not prompt bytes (D-009).**
  "The gate adds nothing when off" is the real guarantee; "the repo's prompts are
  frozen" was an over-reading that collided with retiring JSONL — the same prompt
  cannot be byte-frozen and simultaneously stop instructing the old format.
- **Write authority binds dedicated tools, not generic ones (D-010).** INV-1/INV-2
  govern the memory system's own surfaces. Generic file/shell tools and external
  backends stay trusted and unsandboxed, because path-string guards cannot soundly
  constrain shell indirection or symlinks, and a portable sandbox is major new
  architecture. Git review is the actual enforcement, as for every other tracked file.
- **Registration is separate from authorization (D-023).** An agent may keep a
  legacy tool registered while being denied the store behind it. Equating the two
  would have silently widened authored-memory and architecture authority.
- **A concurrent config edit is never overwritten (D-026).** The supervised backfill
  restores byte-for-byte only when the file still holds exactly what it wrote;
  otherwise it preserves the edit, saves its snapshot beside it, and fails with a
  conflict report. Unconditional restoration would destroy the very data the
  protocol exists to protect.

## Patterns Established

- **Proposal identity is semantic-idempotent and includes the writer**
  (D-019/D-024): retries at the same key return the first record untouched, while
  a writer-only change selects a different path rather than colliding.
- **Machine output is proposals-only.** Records land under
  `memory/agent/proposals/` with full `writer`/`source`/`date`; promotion into
  `knowledge/` is a human act, and approval is not promotion.
- **Cost gates measure the production composition.** D-025 put first measurement
  in the slice that creates the real corpus, so integration does not discover cost
  late.

## Gotchas & Lessons

- **A test that mutates its own expected fixture proves nothing.** The migration
  test applied the same eight edits to both source and destination before
  comparing, so it asserted byte-preservation while exempting the one file that
  violated it. Negative controls must be verified to fail against the unfixed code.
- **Correction-region allowlists decay into blanket permission.** A single region
  widened to span a whole document left 5% of it byte-verified. Pin narrow regions
  and re-check the pinned fraction when corrections move.
- **Do not rewrite history during migration.** A distillation records what a past
  plan decided; "fixing" its stale pointers falsifies the archive. Byte-for-byte
  means byte-for-byte.
- **Reformatting can be load-bearing.** Decision Log headings wrapped across lines
  do not resolve in the artifact parser. A change that looks purely cosmetic may be
  the thing keeping a gate green — check before reverting it.
- **Archiving a plan drifts the frozen backfill inventory.** The batch freezes the
  archived-plan set it derived against, so any later archive halts B-010 until the
  inventory is amended on record. Expected, and it must be amended deliberately —
  adding a slug to `missingSlugs` silently claims a backfill is owed for it.
- **Drive excludes `missions/` from per-task source commits.** Intended end-state
  — deleted legacy files, scan evidence, review artifacts — is routinely left
  uncommitted. Sweep `git status` after every run.

## Provenance

Written by the coordinating agent at the project owner's direction, using a
generic file tool rather than the dedicated memory pathway. Permitted by D-010,
which places generic tools outside INV-1, and reviewable as an ordinary diff.
The dedicated `propose_knowledge` route was unavailable because it exists only in
a gate-enabled session, and enabling the gate is a separate adoption decision this
plan excludes.
