# Independent codex post-review — planning-system-hardening

Scope: branch `feature/planning-system-hardening` vs local `main`.
Round 1 verdict: **DO-NOT-SHIP** (3 high, 3 medium). All findings triaged
against ground truth; dispositions below. Round 2 verdict appended after
the fix pass.

## Findings and dispositions

- **F1 (high) — free-text `Supersedes:` grounds bypassed date validation.**
  FIXED (`bdbaf81`): a ground that is not a pure structured ID list now
  requires an ISO date within its decision entry; structured pointers still
  date themselves. Rule recorded in plan Design §1; regression added.
  Descriptive grounds in dated entries stay accepted (matches the
  `analysis-capabilities` corpus and B-013).
- **F2 (high) — stray backticks in adjacent list items paired and masked
  real citations.** FIXED (`bdbaf81`): list items interrupt the inline-code
  context in `maskInlineCodeSpansByBlock`. The earlier fixture that relied
  on a span swallowing a bullet line was rewritten to quote the declaration
  in a fence — in Markdown that bullet is a real list item, so the original
  fixture pinned incorrect semantics. Adjacent-bullet regression added.
- **F3 (high) — trailing text after a withdrawal annotation still
  withdrew.** FIXED (`bdbaf81`): `WITHDRAWN_ANNOTATION_REGEX` anchored to
  the heading end; trailing-garbage regression added.
- **F4 (medium) — superlinear inline-span scan.** ACCEPTED-MITIGATED: after
  F2, masking runs per paragraph/bullet-scale block, bounding the scanner's
  input; the adversarial multi-megabyte case is unreachable for plan files.
  No dedicated cap added.
- **F5 (medium) — B-012/B-013 proof contracts.** FIXED (`bdbaf81`): the
  plan-named CLI rendering test now carries the B-012 marker; B-013's
  Expected was trimmed on the record per the provability rule (legacy-round
  readability is a prompt contract proven by B-009/B-010).
- **F6 (medium) — out-of-scope artifact-viewer read path (symlink-following
  after a lexical check) plus unrelated edits.** Viewer change REVERTED
  (`d7b04a2`) — out of scope per the plan's prompt-only round decision and
  unsafe; viewer support for review rounds is follow-up work with a real
  path-containment check. `fallow.toml` entry for `lib/artifacts/index.ts`
  KEPT (companion to the new public surface; disclosed). Chain-runner test
  stabilization KEPT (pre-existing flake, disclosed). Terminal-control
  escaping in CLI rendering KEPT (in-scope hardening of check-artifacts
  output).

## Round 2

Verified all six round-1 findings resolved (viewer tree hash identical to
`main`; adjacent-bullet probe exposes the citation; scan bounded to
block-scale; B-012/B-013 contracts satisfied; prompts stack-agnostic;
gates green). Found two regressions introduced by the round-1 fixes:

- **R2-1 (high) — code-quoted trailing text after the annotation masked to
  spaces and satisfied the end anchor.** FIXED (`73453c1`): withdrawal now
  requires the exact dated annotation to end the heading in both the raw
  and the quote-masked views. Regression added.
- **R2-2 (medium) — `decisionEntryBlockAt` scanned raw lines, so a fenced
  decision example split the entry and dropped its date.** FIXED
  (`73453c1`): boundary and date detection use the quote-masked view.
  Regression added.

Verdict: DO-NOT-SHIP (pending the two fixes).

## Round 3 — final

Both round-2 fixes verified by direct probes (annotation-plus-quoted-span
active; span-before-annotation still withdraws; fenced/inline examples
neither split entries nor contribute dates; genuinely undated entries
still flag). Gates green (2778 tests), hardening plan 0 issues + expected
size advisory, `analysis-capabilities` 0 new-kind issues / 2 withdrawn.

**Verdict: SHIP** — no remaining or new findings. Reviewed at feature HEAD
`73453c1` against local `main` `360f176`.
