# Review synthesis: project-health-audit (round 3, coordinator)

Date: 2026-09-28. Channels merged: chain plan-reviewer rounds 1-2
(`review-1.md` PR-001..005, `review-2.md` PR-006..007) and the coordinator's
independent four-lens review (spec-fidelity SF, feasibility FEAS, design-attack
DA, scope/sequencing SEQ; 24 findings, every one CONFIRMED or PARTIAL by an
adversarial verifier; raw output in the coordinator session's workflow
journal). The planner did not revise after either chain round (plan.md mtime
precedes both review files), so all 31 findings were applied by the
coordinator in one revision. Decision Log D-011..D-017 and in-place amendment
notes carry the changes.

## Clusters and dispositions

| Cluster | Findings | Disposition |
|---|---|---|
| Duplication slices edit below-high criticals before characterization | SF-001, FEAS-001, DA-001, SEQ-001, PR-006 (four lenses + chain converged) | Applied. D-009 broadened to any slice with an overlap check; the three affected families move to the critical stages that own their enclosing functions (Design §3 gate; stages 11, 13, 15). |
| Duplication capability structurally failed | SF-002, FEAS-002, DA-002, SEQ-006, PR-007 | Applied as D-012/R-001 (labeled diagnostic pair at every checkpoint, AC-004 `unmet: capability failed` until a completed surface run) plus the persisted group-to-family mapping (D-008, Design §3). Whether the adapter defect is fixed here is human ruling Q-006. |
| AC-008 "branch's final commit" reading | PR-001 | Escalated as Q-004 (ratified AC letter). D-010 kept as the recommended reading, marked pending. |
| Class-member finding cannot be symbol-traced | PR-002, SF-003 | D-013: reproduced-but-untraceable rows hard-stop (`escalated`); the one class member has a live call at `lib/driver/drive-graph-runner.ts`, so its disposition is `false-positive` if Q-005 rules so. B-002 restored to AC-002's letter (zero findings) with the public-API escalation path. |
| Record contract incomplete / digest ill-defined | PR-003, DA-005, FEAS-003 (digest half), DA-006, SEQ-004 | Applied: full type contract in Design §1; D-005 reads bundles from the object store at the snapshot commit, splits `analysisConfiguration` from `floorConfiguration`, adds `tsconfig.json` and the adapter, fixes byte encodings; R-015 covers instrument refactors. |
| Q-002 hard stop has no observer | DA-004 | Applied as D-015 (mechanical test-freeze check with an independent observer). |
| Record custody across Drive commits | SEQ-002 | Applied in D-015 (coordinator record-only commits; rows mirrored in task notes). |
| Task split, ordering, count | SEQ-003 | Applied as D-016: two tasks per refactor stage, disjoint stages independent, `runPass` last; sixteen slices accepted on record instead of a plan split. |
| Execution backend lacks the analysis surface | FEAS-005 | Applied as D-017 (Pi-hosted role with `project-tools`), escalated as Q-007 because the brief named the Codex backend. |
| Gate-owned paths change by design | FEAS-003 | Applied as R-013 (QM cannot return `ready`; closeout sign-off packet). |
| CRAP ceilings for extracted helpers; failed-slice exit | FEAS-004, DA-003 | Applied in Design §4 (tier-dependent ceilings, seam-or-escalate exit). |
| AC-006 justification location | SF-004 | Applied as D-014 (`docs/fallow-exceptions.md` subsection, record mirror). |
| Characterization outcomes not observable | PR-004 | Applied in Design §4 (runPass variants named; every characterization task enumerates result variants first). |
| Behavior-sensitive clone edges | PR-005 | Applied as B-011 and stage 2 (characterize runners and locks before extraction). |
| execution-liveness overlap | SEQ-005 | Applied as R-014 and the closeout downstream-impact section. |
| Stage gates not concrete; suppression base unpinned | SEQ-006, SF-006 | Applied in the Implementation Order preamble (five commands, base `main`, postflight listing). |
| D-002 provenance mislabel | SF-005 | Applied: derived decisions split into D-011 (coordinator-proposed, human-confirmed). |
| `runDrive` stale directive | FEAS-006 | Applied in B-007 and stage 9. |
| Spec said five tests/ criticals, evidence has four | R-010 (planner), verified by coordinator | Spec corrected in place as a factual amendment; ruling count-independent. |

Rejected: none. Every verified finding changed plan text.

## Open for the human

Q-004 (AC-008 reading), Q-005 (class-member disposition), Q-006 (fix the
duplication reconciliation defect in this plan or record AC-004 unmet), Q-007
(execution backend). Full packet in `coordinator-status.md`. Task creation
waits on Q-004..Q-007 because they change task shape.
