# Closure evidence: real end-to-end QM runs on a dirty checkout (TASK-728 AC #6)

The coordinator ran two real `verify` runs on 2026-09-24. They used real model sessions: the QM and panel on `openai-codex/gpt-5.6-sol` through Pi, with no fakes. No Quality Manager was used to verify this plan (D-002/D-033). These runs are evidence about the product.

## Setup

- **Checkout:** a local `git clone --no-hardlinks` of this repository. `feature/qm-chain-safety` is checked out at `cca8f7d`, and `bun install --frozen-lockfile` was run.
- **Dirty state:**
  - an unstaged edit to `docs/orchestration.md`;
  - a staged edit to `lib/orchestration/stage-prompts.ts`;
  - an untracked `e2e-untracked.txt`.
- **Snapshot before and after each run:**
  - HEAD, the symbolic ref and every ref (`for-each-ref`);
  - the SHA-256 of `.git/index` and of the stash list;
  - the SHA-256 of every file in the working tree, tracked, untracked and ignored (including `node_modules`), excluding only `.git/`;
  - every symlink target.

  About 33,500 file hashes were recorded per snapshot. The script was `scratchpad/e2e/snapshot.sh`.
- **Command:** `bun bin/cosmonauts run chain verify "<prompt>"`, run in the clone.

## Run 1: whole branch against `main` `29fc0ce`

The QM run was `qm-1cdfcf49`; the chain run was `chain-2acff638`.

- **Base config:** `main` has no `qualityReview` config, so the report shows the expected "not configured" human items for checks and diverse model (D-019). It also shows gate-owned-file human items for the branch's baseline, config and policy files.
- **Panel:** all four reviewers (generalist, security, ux, performance) completed.
- **Assessment:** the QM session was aborted at the fixed assessment deadline. The report says `QM assessment deadline exceeded after 900000ms`, and the verdict is **failed**.
  - The deadline comes from `qualityReview.assessmentTimeoutMs` in base-owned config. The default is 900 s.
  - Reviewing the whole branch (173 changed files) needs more. This is a configuration follow-up, not a defect: the every-exit verdict persisted, as INV-003 requires.
- **Lifecycle:** allocated → workspace-reserved → snapshot-ready → assessing → finalizing → finalized. The workspace disposition was **removed**.
- **Checkout before vs after:** HEAD, refs, `.git/index` and the stash were identical, and every file hash was identical. The only difference was 29 added files under the gitignored `missions/sessions/chain/runs/` artifacts.

## Run 2: narrow range, base `61ac478` (a branch commit with `qualityReview` configured)

The QM run was `qm-1ff3fc33`. The clone's local `main` was set to `HEAD~1`, so the review base is a commit that configures `qualityReview`. The reviewed range was `61ac478..captured:cca8f7d` plus the dirty edits.

- **Host preparation:** analysis preparation passed with lifecycle scripts disabled.
- **Host-run checks, after the panel was sealed (D-026):**

  | Check | Exit | Duration |
  |---|---|---|
  | suppressions | 0 | 12.8 s |
  | lint | 0 | 2.3 s |
  | typecheck | 0 | 7.7 s |
  | test | 1 | 176 s |

  The test failure was 1 of 3408: the known `validate-harness-exports` timeout flake, hit while several suites were running on the machine. The host reported it faithfully.
- **Analysis audit:** unbound, because of `execution-not-consented`. This is by design: consent carries from the source project, and the scratch clone is a new path with no recorded consent. It surfaced as a human item.
- **Reviewer panel:** failed. The required generalist evidence contained only "reviewer completed". This is a live reproduction of closure-review-1 HIGH-1 (a failed or empty reviewer session was accepted as evidence), which TASK-762 remediates. Here the QM caught it in prose.
- **QM findings:** the QM wrote UR-001..UR-003, which cover the closure prompt's worktree option, TASK-760's full-suite AC note and the e2e sentinels. It wrote them as paragraphs rather than `- ` bullets, so the host carried each forward as "omitted" and raised a human item. This fails safe (D-032) but is noisy. TASK-762 tightens the prompt.
- **Verdict:** **failed**. The index was unavailable, so the verdict was derived from the report sections. Lifecycle was finalized, and the workspace was **removed**.
- **Checkout before vs after:** HEAD, refs, `.git/index`, the stash and every file hash were identical. The only difference was 26 added files under `missions/sessions/chain/runs/`.

## Conclusions

- **INV-001 held on both real runs.** The dirty checkout was byte-identical before and after, apart from the ignored run artifacts. That covers HEAD, refs, the index, the stash, and every tracked, untracked and ignored file.
- **INV-003 held.** A complete verdict persisted on both exits: a deadline failure and a report failure.
- **The workspace lifecycle was removed on both runs.**
- **The production path exercised:** host checks after sealing, base-owned config, not-configured items, gate-owned items and fail-safe carry-over. It also reproduced HIGH-1 on real models.

**Follow-ups, not blocking:**
- set a larger `qualityReview.assessmentTimeoutMs` for whole-branch reviews of this repository;
- the known suite flakes make a host `test` check fail under load.
