---
source: archive
plan: spec-plan-intent
distilledAt: 2026-08-14
---

# Spec/plan intent, mutability, and the deviation protocol

## What Was Built

The artifact system now answers, from the artifacts alone, whether an agent may
change recorded ground when it collides with reality. Specs carry a required
`## Intent` section (one goal sentence plus `INV-###` invariants that outrank
any mechanism); plans carry a required `## Decision Log` whose `Decided by:`
provenance *derives* mutability; and a canonical
`references/deviation-protocol.md` defines the four-route classifier every role
applies. Content-only work — no `lib/` changes; the proof is string-pinned
tests in `tests/prompts/` and `tests/docs/`.

## Key Decisions

- **Intent is single-sourced in the spec; plans cite `INV-###` by ID** (D-001).
  A tagged echo atop the plan was rejected — restatement is exactly where forked
  authority starts. A plan with no spec carries Intent itself and is then the
  single source.
- **Mutability derives from provenance rather than a new field** (D-002).
  `Decided by:` naming the human ⇒ ratified; naming an agent ⇒ derived; absent
  ⇒ ratified. Explicit `(ratified)`/`(derived)` markers exist only to override.
  A mandatory `Mutability:` field was rejected as ceremony on every entry; the
  unsafe default (derived-when-unmarked) was rejected because it rewards
  omitting provenance.
- **No new pipeline stage** (D-003). The classifier ships as guidance plus one
  routing rule in quality-manager, which already runs. The observed failure was
  judgment at apply time, not a missing stage, and a stage taxes every run for a
  rare event.
- **Ratification is human-only** (D-004). Agents draft decision entries; they
  never approve them. Bounded agent ratification was deferred — and if it ever
  arrives, the bound must itself be a ratified entry. The evidence for this was
  concrete: commit `f78862f` showed an agent under gate pressure manufacturing
  evidence.
- **One canonical home, role files apply it in a few lines** (D-005). Inlining
  the rules per prompt was rejected for the same reason plan-format routes to
  work-artifacts: N copies drift.

## Patterns Established

- **The four classifier legs are shared vocabulary and must be byte-identical
  everywhere**: `snap back` / `amend-on-record` / `halt-and-escalate` / `record`.
  Content tests pin the exact strings.
- **Amend-on-record is five steps**: decision entry first; the original text
  preserved as an honestly rejected alternative; the served invariant named; a
  dated supersession pointer; the amendment surfaced in notes and reports.
- **Always-ratified list** regardless of provenance: invariants, the letter of a
  spec AC, scope exclusions, and gate/config defaults.
- **A role file needing more than ~12 new lines means the reference is wrong.**
  Fix the reference, not the prompt.
- **Archive distillation must include supersessions** (B-014) — what was
  amended, why, and what it replaced. An amendment that survived to ship is
  precisely what the next plan in the area needs.

## Files Changed

- `domains/shared/skills/work-artifacts/references/deviation-protocol.md` — new;
  the canonical rules (mutability table, classifier, amend-on-record steps,
  reviewer/remediation rule, red flags).
- `.../references/spec-format.md`, `.../references/plan-format.md` — the
  required `## Intent` and `## Decision Log` shapes.
- `domains/shared/skills/{work-artifacts,plan,task,archive}/SKILL.md` — routing
  and role-specific application.
- `bundled/coding/prompts/{spec-writer,planner,worker,quality-manager,plan-reviewer,task-manager}.md`
  — each applies the protocol at its own decision point.
- `docs/testing.md` — the evidence-integrity rule (INV-4).

## Gotchas & Lessons

- **The rule this exists to prevent**: changing a test's expected behavior to go
  green is *always* drift. A test asserting planned behavior is evidence; it
  changes only after the plan text it proves, citing the decision that changed
  it. This was extracted from a real incident, not theorized.
- **Quality-manager is the enforcement point** because remediation routing is
  where drift actually entered. A finding is *evidence*, and its suggested fix
  is *an alternative to weigh* — not an instruction. A remediation that would
  supersede ratified ground becomes a decision-needed report item and is never
  routed to a fixer. Compound findings get split so the legitimate parts proceed.
- **Escalation deliverable is a drafted decision entry plus Blocked status** —
  not applied code, and not a question in prose.
- **Prompt edits must extend, not replace.** worker/quality-manager prompts are
  load-bearing; every pre-existing content test had to stay green untouched.
  Needing to alter an existing test's expectation is itself a
  deviation-protocol event.
- Worked examples of the protocol in anger live in
  `memory/analysis-gate-coverage.md` (amend-on-record) and
  `memory/episodic-log.md` (halt-and-escalate, resolved only by human
  ratification of D-011).
