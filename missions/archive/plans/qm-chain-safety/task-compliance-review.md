# Task compliance review: qm-chain-safety (TASK-720..728)

Coordinator channel, 2026-09-24, workflow `wf_2081638c-a05`. Three lenses (AC fidelity, constraint coverage, sequencing/scope) with a refuting verifier per lens. Known-good inputs from the mechanical coverage matrix: the DAG matches the Implementation Order, every B-### has an implementing owner, and the task JSON parses.

| Finding | Verdict | Severity | Disposition |
|---|---|---|---|
| AC-FIDELITY-001 — No AC requires D-013's workspace-reserved ordering or mandatory workspace removal | PARTIAL | medium | TASK-724 #8 |
| AC-FIDELITY-002 — hostRunStoreRoot routing of run records and transcripts is not required by any AC | PARTIAL | low | TASK-725 #8 |
| AC-FIDELITY-003 — No AC requires this repo's configured checks to include the suppression check, and an empty checks list escapes D-019 | PARTIAL | medium | TASK-725 #9 |
| AC-FIDELITY-004 — The outcome of a dependency-preparation failure is ambiguous: refused/blocked or failed | PARTIAL | low | TASK-724 #9 |
| AC-FIDELITY-005 — The rule for deriving plan identity, and planless runs writing no summary, is not in any AC | PARTIAL | low | TASK-723 #8 |
| CONSTRAINT-COVERAGE-001 — D-013 workspace reservation and mandatory workspace removal have no owning AC | PARTIAL | low | TASK-724 #8 (same as AC-FIDELITY-001) |
| CONSTRAINT-COVERAGE-002 — Design §1 hostRunStoreRoot split (run records/transcripts on host store, child cwd in clone) is unowned | PARTIAL | low | TASK-725 #8 |
| CONSTRAINT-COVERAGE-003 — Design §5 plan-identity rule (explicit label or plan-session only; ambiguous → planless, no summary) is unowned | PARTIAL | low | TASK-723 #8 |
| CONSTRAINT-COVERAGE-004 — Terminal-matrix report verdicts and host-owned checks.md are not bound to an AC | PARTIAL | low | TASK-723 #9, TASK-725 #12 |
| CONSTRAINT-COVERAGE-005 — D-004 base-resolution order and reviewer-prompt contract (materials not shell git, final text only) are unspecified in ACs | REFUTED | none | refuted — no change |
| SEQUENCING-SCOPE-001 — Stage 5 must prove INV-001 byte-identity 'whatever the QM's agents did', but the restrictions that make that true arrive in Stage 6 | PARTIAL | medium | TASK-724 #10, TASK-725 #10 |
| SEQUENCING-SCOPE-002 — Stage 6 needs host-observed resolved model identity, but Stage 7 claims that seam | PARTIAL | medium | TASK-725 #11, TASK-726 #8, plan D-024 |
| SEQUENCING-SCOPE-003 — B-009 docs must describe the suppression registry that only the parallel TASK-722 creates | CONFIRMED | medium | TASK-721 now depends on TASK-722; TASK-721 #8; plan D-024 |
| SEQUENCING-SCOPE-004 — Stage 4 is asked to prove matrix rows and lifecycle states whose producers arrive in Stages 5 to 7 | PARTIAL | low | rows needing a workspace or panel re-proven in TASK-724 #8 / TASK-725 (#10); TASK-723 #9 |
| SEQUENCING-SCOPE-005 — Stage 9 closure names attack categories but no concrete attacks, no pass condition and no evidence record | PARTIAL | low | TASK-728 #6, #7 |
