# W2 (profile-playbooks) task-backlog verification

**Verdict: READY**

Fresh, evidence-quoting verification of the 7-task backlog
(TASK-459 → TASK-465, linear chain) against
`missions/plans/profile-playbooks/plan.md` (B-001..B-024, D-001..D-010,
Design, Files to Change, Quality Contract, Implementation Order steps 1-7)
and `spec.md` (assumptions ratified, not re-litigated).

Findings: **1 total — 0 blocking, 1 minor.**

Every one of B-001..B-024 is owned by exactly one task whose ACs reproduce the
plan's exact test file, exact test name, and (with the single minor exception
below) the exact `@cosmo-behavior plan:profile-playbooks#B-###` marker, and
whose AC text covers the behavior's full Expected clause. The four sanctioned
splits (B-002 red→green, B-003 save→inject, B-004 store→edge, B-017/B-022) are
present with both halves stated. The deliberately-red B-002 at step 2 is
treated as expected, not a defect. The dependency chain
(459→460→461→462→463→464→465) mirrors Implementation Order steps 1-7; no task
requires a later task's machinery; the B-001 audit gate blocks all production
work; TASK-465 owns no behavior and is checkpoint-only. Every D-001..D-010
constraint and every Files-to-Change entry (including the conditional
`extension-api.ts` and `docs/memory.md`) is owned by an implementing task's AC,
and the "Files intentionally not changed" list is guarded by implementing-task
git-status/boundary ACs. Mechanical structure is intact across all 7 files.

---

## Findings

### F-1 (minor) — TASK-463 AC#4 names the B-013/B-023 markers by shorthand instead of inlining the literal marker strings

- **Location:** TASK-463 AC#4.
- **Quote (task):** "`tests/extensions/agent-memory.test.ts` tests `reflects
  profile edits and deletion on the next injected context and recall` and
  `reflects playbook renames edits and deletion in injected context and recall`
  **carry their exact B-013/B-023 markers**".
- **Quote (plan, B-013 Marker / B-023 Marker):** "`@cosmo-behavior
  plan:profile-playbooks#B-013`" and "`@cosmo-behavior
  plan:profile-playbooks#B-023`".
- **Why minor, not blocking:** every other behavior-owning AC in the backlog
  inlines the full literal marker string (e.g. TASK-463 AC#1 "carrying
  `@cosmo-behavior plan:profile-playbooks#B-020`"). AC#4 is the sole AC that
  refers to its two markers by the shorthand "their exact B-013/B-023
  markers". Ownership is not in question: AC#4 names both behaviors, both plan
  test names match exactly, and TASK-463 AC#7 reinforces the obligation ("all
  seven exact markers sit by the named executable tests"); TASK-465 AC#2 also
  enumerates B-013 and B-023 in the artifact-conformance checkpoint. The marker
  requirement is therefore stated — it is only the literal-string consistency
  that lapses, so it cannot let an implementation ship without the markers.
- **Suggested patch:** in TASK-463 AC#4, replace "carry their exact
  B-013/B-023 markers" with the two literal markers, i.e. the B-013 profile
  test carries `@cosmo-behavior plan:profile-playbooks#B-013` and the B-023
  playbook test carries `@cosmo-behavior plan:profile-playbooks#B-023`.

---

## Axis 1 — Behavior ownership (B-001..B-024)

Every behavior maps to exactly one owning AC. Exact test file + test name +
marker verified against the plan for all 24 (see per-behavior table). The four
sanctioned splits verified with both halves stated:

- **B-002** — authored RED in TASK-460 AC#1 ("the new profile/playbook
  assertions are expected RED at this checkpoint … they turn green in TASK-461
  … and B-002 completes there"); completes GREEN in TASK-461 AC#7 ("TASK-460's
  red B-002 profile/playbook contract assertions now pass green (B-002
  completes here)"). Single marker authored once in `interface.test.ts` via
  TASK-460 AC#1.
- **B-003** — save/result path lands in TASK-462 (description: "it lands
  B-003's save/result prerequisite, while B-003 completes and is marked in step
  5"); completes + marked in TASK-463 AC#2 (test `creates a user profile and
  injects it in a different project session`, marker `#B-003`, full
  cross-project injection assertion).
- **B-004** — store half in TASK-461 AC#8 ("atomic in-place singleton
  replacement at the stable user `profile.md` path … and the safe refusal of an
  invalid occupant … B-004 itself completes and is marked in TASK-462");
  completes + marked in TASK-462 AC#1 (test `updates the same profile file and
  reports the change summary`, marker `#B-004`, visible `updated` +
  `changeSummary`, malformed-occupant refusal).
- **B-017 / B-022** — the former B-017 split: store bound in TASK-461 AC#5
  (`#B-017`, "rejects an over-4,000-UTF-8-byte profile body before changing an
  existing file … yet reads and returns a valid oversized human-edited profile
  unchanged"); extension honesty in TASK-463 AC#6 (`#B-022`, excerpt + reserved
  notice + recall pinning + over-bound replacement refusal), with the
  prompt-contract half explicitly delegated to TASK-464 AC#3.

No behavior is double-owned. Literal-marker tally across task files:
459→{B-001}, 460→{B-002,B-015}, 461→{B-008,B-011,B-012,B-014,B-017,B-018},
462→{B-004,B-005,B-007,B-009,B-021,B-024},
463→{B-003,B-010,B-016,B-020,B-022} literal + {B-013,B-023} shorthand (F-1),
464→{B-006,B-019}, 465→none (checkpoint). Total = 24, each once.

## Axis 2 — Dependency / sequencing

- Frontmatter dependencies form the exact linear chain: 459 `[]`, 460
  `[TASK-459]`, 461 `[TASK-460]`, 462 `[TASK-461]`, 463 `[TASK-462]`, 464
  `[TASK-463]`, 465 `[TASK-464]` — mirrors Implementation Order steps 1-7.
- **B-001 gate:** TASK-459 is the chain root; AC states "No production
  implementation may begin until this task is Done; contradictory evidence
  requires stop-and-report". Every other task transitively depends on it.
- **No forward dependency:** TASK-460 authors B-002 red as characterization (no
  461 machinery needed); TASK-461 builds store behavior (self-contained +
  B-004 store prereq for 462); TASK-462 consumes 461's store for the save edge;
  TASK-463 consumes 462's edge for context/recall and completes B-003; TASK-464
  encodes prompt/docs last. Each behavior is satisfiable at its position.
- **TASK-465 checkpoint-only:** description "This task owns no B-### behavior;
  it is the required final verification checkpoint"; grep confirms zero markers
  in the file.

## Axis 3 — Constraint ownership (D-001..D-010 + Files-to-Change)

Decision-log constraints — each owned by an implementing (non-465) AC:

- **D-001** (flat `Type.Object` root, no top-level union, internal narrowing) —
  TASK-462 description + AC#7 ("the flat registered object validates branch
  requirements/invariants before store access … no … top-level schema union").
- **D-002** (one fixed-layout store, no registry/backend) — TASK-461 AC#7 ("one
  fixed store with finite variants and no cache, registry/backend/approval …").
- **D-003** (canonical key = current title; retitle frees key; alternate
  filename; ambiguity refusal; old names not aliases) — TASK-461 AC#4.
- **D-004** (4,000-byte body bound; not a reserved sub-budget) — TASK-461 AC#5
  (bound) + TASK-463 AC#5 ("an index-only message may use the full budget") +
  TASK-463 AC#6 (oversized human handling).
- **D-005** (`recall` gains no type parameter) — TASK-463 AC#3 ("no user-facing
  type filter") + description.
- **D-006** (interface structurally unchanged; preflight via `retrieve()`,
  write after confirm; stop-and-report) — TASK-460 AC#2 + TASK-462 AC#4.
- **D-007** (`remember` sequential, `recall` default) — TASK-462 AC#5 (`#B-021`).
- **D-008** (current-turn context message survives; keep newest) — TASK-463
  AC#1 (`#B-020`).
- **D-009** (write outcomes map to existing arms; the outcome table) — TASK-462
  AC#7 (`invalid_request` / `confirmation_required` / existing arms) + TASK-461
  AC#7 (`unsupported` / `failed`).
- **D-010** (`index.md` → `type: memory-index`, empty state "No valid authored
  records.", notes+playbooks, description defaults to title) — TASK-461 AC#7,
  verbatim.

Files to Change — each owned by an implementing AC/description:
`pi-first-…-audit.md`→459; `interface.test.ts`→460 AC#1; `authored-records.ts`,
`okf.ts`, `paths.ts`, `markdown-store.ts`, `markdown-store.test.ts`,
`index.ts`→461; `agent-memory/index.ts` + `agent-memory.test.ts`→462/463;
`extension-api.ts` (conditional)→462 description ("widen … only if registration
capture requires it"); `main-domain.test.ts`→464; `cosmo.md`→464 AC#3;
`docs/memory.md`→464 AC#4. "Files intentionally not changed" (`types.ts`,
architecture-map/architecture-memory, `cosmo.ts`, CLI, `fallow.toml`, generated
`memory/architecture/*`, coding agents) guarded by TASK-460 AC#2/AC#4, TASK-461
AC#7, and the "Final git status … no changes outside its listed files" clauses
in TASK-462 AC#7 / TASK-463 AC#7 / TASK-464 AC#5.

## Axis 4 — AC fidelity

Spot-checked every Expected clause against its owning AC for dropped clauses,
weakened quantifiers, and divergent test names. No divergence found. Notable
full-fidelity carries: B-012's location/type matrix (recursive `notes/` note-
only, reserved `profile.md` user/semantic-only, direct-child `playbooks/`
procedural-only) reproduced in TASK-461 AC#3; B-014's freed-key + numeric
alternate path + duplicate-title warn/refuse in TASK-461 AC#4; B-022's recall
pinning "outside the 5/20 window", reserved notice with accurate counts, and
over-bound replacement refusal in TASK-463 AC#6; B-016's "profile … regardless
of timestamp", 50-cap, 12,000-byte bound, index-only-full-budget in TASK-463
AC#5. All 24 task test names are byte-identical to the plan's Test fields.

## Axis 5 — Mechanical

- `AC:BEGIN`/`AC:END`: exactly one pair per file, all 7.
- Sequential `#N`: 459 #1-5, 460 #1-4, 461 #1-8, 462 #1-7, 463 #1-7, 464 #1-5,
  465 #1-6 — no gaps or repeats.
- Frontmatter parses for all 7 (id/title/status/priority/labels/dependencies/
  timestamps).
- Labels: every task carries `plan:profile-playbooks`.

---

## Per-behavior ownership table

| Behavior | Owning task / AC | Test file › test name | Marker |
|---|---|---|---|
| B-001 | TASK-459 AC#1 | `pi-first-profile-playbooks-audit.md` › `Pi 0.80.6 recommendation gates W2 implementation` | literal |
| B-002 | TASK-460 AC#1 (red) → TASK-461 AC#7 (green) | `interface.test.ts` › `supports note profile and playbook through the unchanged MemoryStore contract` | literal (460) |
| B-003 | TASK-463 AC#2 (edge in TASK-462) | `agent-memory.test.ts` › `creates a user profile and injects it in a different project session` | literal |
| B-004 | TASK-462 AC#1 (store prereq TASK-461 AC#8) | `agent-memory.test.ts` › `updates the same profile file and reports the change summary` | literal |
| B-005 | TASK-462 AC#2 | `agent-memory.test.ts` › `saves named playbooks directly in project and user scopes` | literal |
| B-006 | TASK-464 AC#1 | `main-domain.test.ts` › `guides Cosmo to propose profile and playbook saves and call remember only after confirmation` | literal |
| B-007 | TASK-462 AC#3 | `agent-memory.test.ts` › `declined or unanswered proposals write nothing and persist no pending state` | literal |
| B-008 | TASK-461 AC#1 | `markdown-store.test.ts` › `canonicalizes playbook names into stable scoped resources` | literal |
| B-009 | TASK-462 AC#4 | `agent-memory.test.ts` › `requires confirmation before updating a canonical playbook name` | literal |
| B-010 | TASK-463 AC#3 | `agent-memory.test.ts` › `indexes playbooks and recalls their full steps in a later session` | literal |
| B-011 | TASK-461 AC#2 | `markdown-store.test.ts` › `keeps profile and playbook scopes isolated across projects` | literal |
| B-012 | TASK-461 AC#3 | `markdown-store.test.ts` › `skips malformed profile and playbook records with file warnings` | literal |
| B-013 | TASK-463 AC#4 | `agent-memory.test.ts` › `reflects profile edits and deletion on the next injected context and recall` | **shorthand (F-1)** |
| B-014 | TASK-461 AC#4 | `markdown-store.test.ts` › `reflects playbook rename edits and deletion without a stale cache` | literal |
| B-015 | TASK-460 AC#3 | `agent-memory.test.ts` › `preserves W1 note save recall allowlisting and Cosmo authorization` | literal |
| B-016 | TASK-463 AC#5 | `agent-memory.test.ts` › `injects profile before the recency ordered note and playbook index within one 12000 byte budget` | literal |
| B-017 | TASK-461 AC#5 | `markdown-store.test.ts` › `rejects profile writes over the 4000 byte body bound` | literal |
| B-018 | TASK-461 AC#6 | `markdown-store.test.ts` › `reports profile and playbook write failures without partial files` | literal |
| B-019 | TASK-464 AC#2 | `main-domain.test.ts` › `keeps W2 memory Cosmo only without broadening the tool allowlist` | literal |
| B-020 | TASK-463 AC#1 | `agent-memory.test.ts` › `keeps the newest injected memory context provider visible through the context transform` | literal |
| B-021 | TASK-462 AC#5 | `agent-memory.test.ts` › `registers remember as sequential so same batch saves cannot bypass collision confirmation` | literal |
| B-022 | TASK-463 AC#6 (prompt half TASK-464 AC#3) | `agent-memory.test.ts` › `injects recalls and protects oversized human profiles honestly` | literal |
| B-023 | TASK-463 AC#4 | `agent-memory.test.ts` › `reflects playbook renames edits and deletion in injected context and recall` | **shorthand (F-1)** |
| B-024 | TASK-462 AC#6 | `agent-memory.test.ts` › `renders profile and playbook write failures visibly while the session continues` | literal |

## D-001..D-010 ownership table

| Decision | Owning implementing AC(s) |
|---|---|
| D-001 flat schema, no top-level union | TASK-462 desc + AC#7 |
| D-002 one fixed store, no registry | TASK-461 AC#7 |
| D-003 canonical current-title identity | TASK-461 AC#4 |
| D-004 4,000-byte bound, not sub-budget | TASK-461 AC#5 + TASK-463 AC#5/AC#6 |
| D-005 no `recall` type param | TASK-463 AC#3 + desc |
| D-006 interface unchanged; preflight-then-write | TASK-460 AC#2 + TASK-462 AC#4 |
| D-007 `remember` sequential | TASK-462 AC#5 |
| D-008 current-turn message survives | TASK-463 AC#1 |
| D-009 outcomes map to existing arms | TASK-462 AC#7 + TASK-461 AC#7 |
| D-010 `memory-index` / empty state / description default | TASK-461 AC#7 |
