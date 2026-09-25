You are an independent correctness and liveness reviewer for the Cosmonauts plan `qm-chain-safety`. This is a READ-ONLY review. Do not modify any file, do not run git commands that change state, and do not run the Quality Manager or any cosmonauts chain or drive.

Repository: /Users/cosmos/Projects/cosmonauts, branch `feature/qm-chain-safety`.

Background:
- Stages 1–6 were implemented, then remediated over seven review rounds. The findings are in `missions/plans/qm-chain-safety/mid-review-{1..7}-*.md`.
- Round 7 found no HIGH findings.
- Its findings were remediated by TASK-743 (`5c9ee93`):
  - an `analysisPrepare` failure degrades to `not-ready`;
  - prep lines are recorded on every exit;
  - base-runtime setup settles before the retain decision;
  - the D-028 disclosure appears in every report;
  - the user-source exclusion is pinned by a test;
  - the seal test can fail.
- Stages 7–8 (model diversity and closure calibration; legacy archive and callers) are NOT implemented yet. Do not report their absence.

Authoritative documents:
- `missions/plans/qm-chain-safety/spec.md`: Intent INV-001..005 and the ACs are ratified. Read the two INV-001 interpretations and the threat model beside the Intent.
- `plan.md`: B-001..B-012, D-001..D-030, Design, Risks.

THREAT MODEL (human ruling, D-027) — read before you start. The QM protects against accidental damage by careless agents and accidental process behavior, NOT against a deliberately hostile reviewed change.
- Do not report findings whose only route is a malicious change tampering with the host, the review materials, the private workspace or Git objects to subvert its own review. Where one comes up, list it under "Residual limits (hostile-only)" in one line and do not rank it.
- A finding counts if the same outcome can also happen by accident, for example:
  - an ordinary test or tool that writes where it shouldn't;
  - a stale file;
  - a crash;
  - a timeout;
  - a concurrent run;
  - an agent following its prompt too eagerly.
- Host-run checks execute the reviewed code with the operator's authority by ruling (D-028). Do not report that either.

Do three things:
1. For every finding in `mid-review-7-codex.md` and `mid-review-7-claude.md`, state whether it is now RESOLVED, PARTIAL, OPEN or RESIDUAL (hostile-only per D-027), with file:line evidence.
2. Review `6fadad0..HEAD` (ignore `missions/` except as documentation) for NEW defects:
   - correctness and liveness: hangs, leaked processes or workspaces, lost verdicts;
   - concurrency and error paths;
   - tests that cannot fail;
   - scope creep;
   - conflicts with ratified ground (INV-001..005, D-018..D-023, D-027..D-030) or with execution-liveness AC-015/AC-016/AC-018: timed-out children are never cancelled, there is no general evidence contract, and the 200-character summary is unchanged.
3. Re-check end to end, for real callers (CLI `cosmonauts -a coding/quality-manager`, a `spawn_agent` of the QM, the terminal QM stage of `chain_run` and of named inline chains, `/agent quality-manager`, `run status`), that:
   - consent is bound in the clone;
   - no quality session is given the source root or host store path;
   - `ready` needs a host-observed bound audit;
   - the base is the merge-base;
   - no reviewed code executes before the evidence is sealed;
   - the operator checkout is unchanged except the D-018 plan summary;
   - the specialist prompts serve both QM-panel and direct `cody`/`cosmo` spawns.

Verify claims by reading code and tests. Output:
- a resolution table (one line per finding);
- severity-ranked NEW findings (HIGH/MEDIUM/LOW), each with file:line, a concrete failing scenario (accidental), and the AC/B/D it breaks;
- the hostile-only residual list;
- a SHIP / DO-NOT-SHIP-YET verdict for Stages 1–6.
