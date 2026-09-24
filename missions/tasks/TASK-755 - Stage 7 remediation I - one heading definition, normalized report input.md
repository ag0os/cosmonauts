---
id: TASK-755
title: 'Stage 7 remediation I - one heading definition, normalized report input'
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-754
createdAt: '2026-09-24T19:46:09.807Z'
updatedAt: '2026-09-24T19:46:09.807Z'
---

## Description

Close the heading-definition class found by `missions/plans/qm-chain-safety/stage7-review-9-{codex,claude}.md`: codex MEDIUM x3 and LOW, Claude MEDIUM and LOW x2.

The heading and section functions in `lib/orchestration/quality-review-report.ts` disagree about what a heading is:
- body terminators stop at `^## `;
- the unexpected-section scan needs a title character;
- the required-heading check accepts `\s*$`;
- `sectionBodyStart` accepts only `[ \t]`.

Because of this, a CRLF duplicate, an empty-title `## ` section, a `##<tab>X` heading or a non-breaking space can each hide content, which yields a false `ready` or loses a carryover entry.

Fix the class structurally, not shape by shape:
1. **Normalize the QM report text once**, where the host first reads it, before assessment, calibration, amendment and plan-summary rendering: convert CRLF and lone CR to LF, and non-breaking spaces to spaces. Every function then works on normalized text.
2. **One heading predicate and one title parser, shared by every function:** the body terminators, the unexpected/duplicate scan, the required-heading check, `sectionBodyStart`, the unindexed amendment and `replaceSectionEntries`. A heading line is `##` followed by whitespace or end of line; the title is the rest of the line, trimmed. An empty title is an unexpected heading.
3. **Text after the report-index comment counts as unexpected content** and blocks `ready`. Text before the first section heading, meaning the Verdict/Reason preamble, stays as today.

Keep the change small, and delete the now-redundant per-function variants.

Keep the changed-scope audit against `main` passing: no new complexity, dead-code or duplication findings, no baseline change, no suppression.

`bun run lint` has one known error, in the gitignored `.shepherd/backups/`; lint on tracked paths must pass. Run the suite as `env -u COSMONAUTS_DRIVER_CODEX_ARGS bun run test`.


<!-- AC:BEGIN -->
- [ ] #1 Every heading and section function in `quality-review-report.ts` uses one shared heading predicate and title parser, and the host normalizes CRLF, lone CR and non-breaking spaces once before any of them run (including the plan summary).
- [ ] #2 End to end with host checks, each of these yields `not-ready` and loses no content: an appended bare `## Findings` duplicate with CRLF; a `## ` empty-title heading with content (mid-report and after the index); a `##<tab>Notes` heading with content; content appended after the report-index comment; the tests fail on the current code.
- [ ] #3 With a non-breaking space after `## Findings` and a reviewer finding omitted from the report, the carryover entry appears under Findings in the final report and a human item is raised (floor 2); tested.
- [ ] #4 A clean all-CRLF report reaches `ready`; a clean LF report still reaches `ready`; tested.
- [ ] #5 The changed-scope audit against `main` with committed baselines still passes; typecheck, tracked lint and the full suite pass.
<!-- AC:END -->
