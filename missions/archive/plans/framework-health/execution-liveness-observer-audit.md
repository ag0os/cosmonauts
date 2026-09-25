# Observer audit of `execution-liveness` — input for D-014 step 4

Source: the advising session's read of all 21 behaviors, 2026-09-20. The tiering is its judgment; I verified the seam count and read the four Tier 3 entries, nothing more. No behavior text has been changed on the strength of this — that decision is the human's, after the D-009 trial.

**Tier 1 — already has a real observer and shipped entry point (2):** B-011 (restated, trialled), B-012.

**Tier 2 — names an internal component as its actor, but a real observer exists (15):**
- B-001, B-002, B-014, B-021 — a user resuming or retrying a run after an interrupted attempt; `cosmonauts run status` / resume.
- B-004, B-005 — someone running a long task through Drive or a chain; the task is or is not killed.
- B-008 — a user resuming a run; a file-backed session exists to resume from.
- B-009, B-010 — an agent calling `spawn_agent` (same entry point as B-011).
- B-013 — two concurrent `cosmonauts run` invocations, or one resumed after its holder was killed.
- B-017 — a user who suspended and reopened their machine mid-run.
- B-018 — a user watching `run status` on a run that can no longer progress; it reaches an honest terminal state.
- B-019 — someone running Drive with a declared task cap.
- B-020 — an operator who enabled shadow mode and reads the `would-cancel` evidence.

**Tier 3 — implementation invariants, not behaviors (4):** B-003 (heartbeat vs activity fields — its consequence is B-004/B-005), B-016 (cancellation classification — its consequence is B-006), B-015 (event sequence uniqueness), B-007 (registry declares one liveness contract). Proposed: fold each into the behavior whose observable consequence covers it and keep the invariant in `## Design`, where the worker still tests it. My one reservation: B-015 may have an observer after all — someone tailing `cosmonauts run watch` sees duplicated or misordered events — so check before folding it.

A full migration would therefore yield about 17 behaviors, not 21.

**Cheap predictor, verified:** nine behaviors name a `types.ts` as their Seam — B-001, B-003, B-004, B-006, B-008, B-017, B-019, B-020, B-021 (`awk` over the plan). A behavior whose seam is a type declaration cannot be observed by anyone. Three of the four Tier 3 entries are in that list.
