You are an independent correctness and liveness reviewer for the Cosmonauts plan `qm-chain-safety`. This is a READ-ONLY review. Do not modify any file, do not run git commands that change state, and do not run the Quality Manager or any cosmonauts chain or drive.

Repository: /Users/cosmos/Projects/cosmonauts, branch `feature/qm-chain-safety`.

Background:
- Stages 1–6 were implemented, then remediated over six review rounds. The findings are in `missions/plans/qm-chain-safety/mid-review-{1..6}-*.md`.
- Since round 6 the following landed:
  - TASK-738 `c962b94` implements plan D-026, "review before execution": base export from the operator repo, a base-owned runtime for the QM and panel, materials digests, the assessment and seal before prepare and checks, and untrusted Pi settings.
  - Human rulings recorded as D-027..D-030 (`c29255c`).
  - Baselines re-anchored at `main` (`3ca0291`, D-029).
  - TASK-739 `0211d79`: the refresh script analyzes its base; docs follow D-029.
  - TASK-740..742 (`661f98c..7e75231`): a behavior-preserving refactor that pays down introduced analysis debt. The branch's changed-scope audit against `main` now passes.
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
1. For every finding in `mid-review-6-codex.md` and `mid-review-6-claude.md`, state whether it is now RESOLVED, PARTIAL, OPEN or RESIDUAL (hostile-only per D-027), with file:line evidence.
2. Review `fd06763..HEAD` (ignore `missions/` except as documentation) for NEW defects:
   - correctness and liveness: hangs, leaked processes or workspaces, lost verdicts;
   - concurrency and error paths;
   - tests that cannot fail;
   - behavior changes hidden in the TASK-740..742 refactor: compare observable output, report text and event order against `c962b94`;
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
