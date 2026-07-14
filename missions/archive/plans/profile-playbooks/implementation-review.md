# W2 (profile-playbooks) implementation review record

Branch: `feature/profile-playbooks` (off local `main`). Driver: `/implement-plan`,
Drive backend `codex`, run `run-3d21959e`.

**Final verdict: SHIP** (independent codex review, round 2). Gates: 2570 tests
pass, lint clean, typecheck clean.

## Gate outcome (B-001)

The Pi-First re-audit of pinned Pi 0.80.6 found no equivalent mutable
profile/playbook store and no collision-save primitive, so the gate resolved to
*lean on Pi's lifecycle/tool primitives, retain the Cosmonauts disk store*. No
stop-and-report condition. Audit:
`missions/plans/profile-playbooks/pi-first-profile-playbooks-audit.md`.

## Findings and dispositions

### Round 1 — Quality Manager (chain stalled before its verdict; stage reviews in `missions/reviews/`)

| ID | Severity | Disposition |
|---|---|---|
| PR-001 | high | **Fixed** (`d47f1cf`). Record bodies are bounded on write, but human-edited frontmatter is not, so an unbounded metadata value escaped B-016's hard 12,000-byte bound: the profile-only branch returned unmeasured, and with an index the profile became the non-truncatable header, where `truncateWithFooter` *threw* — a throw inside `before_agent_start` breaks the turn. Clamped rendered profile metadata, budgeted the profile-only branch, and made truncation total instead of throwing. Regression test red→green (15,278 bytes → ≤12,000). |
| PR-003 | low | **Fixed** (`d47f1cf`, corrected in `c0cd33b`). Unbounded `while(true)` suffix probe. See round 2 — the first fix was itself wrong. |
| PR-002 | medium | **Accepted, not fixed.** `playbooks/` discovery walks recursively then rejects nested files, but the *outcome* already conforms to B-012 (direct children only, warnings naming the physical path). The suggested change would alter B-012's asserted warning surface, and the plan explicitly ratifies per-turn full rescans with "stores approaching hundreds of records" as the ◆reassess trigger. Scan cost is a named reassess input, not a W2 defect. |
| UR-001 | medium | **Accepted, not fixed.** `before_agent_start` does not surface malformed-record warnings in the injected context. This is W1 parity — `main` behaves identically — and the spec ratifies "Same contract as W1 notes". Surfacing them would add behavior no B-### asks for. |
| UR-002 | medium | **Accepted, not fixed.** `recall` renders warnings as a count, with path+reason in structured `details.warnings`. Also W1 parity (`formatRecallWarnings` predates this branch). |
| UR-003 | low | **Not fixed — escalated to the human.** Real coherence gap: `remember` now saves profiles and playbooks but still describes itself to the model as "Save an explicit note to agent memory." However, that string is pinned by a **W1** test (`plan:memory-interface#B-012`, "short host-safe descriptions"). Changing it requires a second W1 behavioral delta, and both plan gate 1 and the run's constraints allow exactly one (B-020). Mitigated in practice: B-006's `cosmo.md` guidance tells Cosmo when and how to use `remember` with each type. Recommend a small follow-up plan. |

### Round 2 — independent codex review (verdict DO-NOT-SHIP; both findings real)

| ID | Severity | Disposition |
|---|---|---|
| Atomic-write gate not exercised | high | **Fixed** (`c0cd33b`). B-018's named test never made the *record* write fail — create cases failed before any record write; update cases blocked `index.md` only after the record write had already succeeded, then accepted either old or new content. Swapping the atomic helper for a direct `writeFile()` still passed, leaving bound Quality Contract gate 3 unmet. Now fault-injects the record write itself (read-only record directory blocks the temp create while the existing record file stays writable), asserting `failed` + byte-identical survival + no `.tmp` residue. Verified as a genuine mutation gate: a direct `writeFile()` returns `written` and mutates the file, turning B-018 red. |
| 100-suffix cap violates D-003 | medium | **Fixed** (`c0cd33b`). The round-1 PR-003 fix introduced this: a cap makes a *creatable* name fail, but D-003 requires the first free suffix "instead of failing". Replaced with one directory listing plus an in-memory scan — always finds the first free suffix, never fails, and drops the serial stat-per-candidate the cap was meant to bound. Locked by an isolated dense-suffix test (occupied through `-120`, lands at `-121`), which the capped version would have failed. |

Round-2 re-review: **no remaining findings, SHIP.**

## Notes

- The two added regression tests intentionally carry **no** `@cosmo-behavior`
  marker: the 24 plan-owned markers stay one-per-plan-named-test, as the
  artifact-conformance gate requires.
- The B-001 audit artifact was stranded uncommitted by Drive (it excludes
  `missions/**` from per-task source commits) and was committed by the driver.
