# Episodic-log — Quality Manager review & dispositions (round 1)

Coordinator remediation record for the `coding/quality-manager` multi-dimension
review of `feature/episodic-log`, reconciled against **local `main`**
(`ea9c0bc..HEAD`; origin/main lags 31 commits). Each finding was independently
verified against ground truth before action. Fixed findings have targeted tests
or are covered by existing suites; deferred findings are narrow, off-by-default
edge cases whose safe fix is plan-touching and should be a focused follow-up.

Ground-truth gates after remediation: `bun run test` 2644 pass / 236 files,
`bun run lint` clean, `bun run typecheck` clean, `check-artifacts` 29 behaviors /
0 issues. Live E2E re-confirmed (enabled capture writes correct OKF episodes with
`cosmonauts/cli` actor + `writer:cosmonauts` tag; disabled writes zero;
injection-shaped query scans 0 episode files; recall returns them).

## Fixed

| ID | Sev | Title | Fix | Coverage |
|---|---|---|---|---|
| F-001 (=SR-003) | P2 | OKF episode parse didn't validate the action/outcome/subject(+wake payload) tag envelope → malformed human episodes recalled as healthy | `parseEpisodeOkfRecord` now calls the shared `parseEpisodeTagEnvelope` (extracted from `parseEpisodeRecord`); malformed envelope → skip+warn | new store regression test |
| F-002 (=PRF-006=UR-004) | P2 | `readEpisodeRecords` recursed (no direct-child guard) → nested `episodes/*/x.md` recalled, violating B-006 | direct-child guard mirroring playbooks; nested → warn+skip; threshold counts direct children only | new store regression test |
| F-006 | P2 | Disabled cross-plan detached result assertion weakened `toEqual`→`toMatchObject` | restored `toEqual` (passes → disabled path byte-identical; re-arms drift guard) | existing test, now exact |
| F-007 | P3 | Dead exports `resolveDriveEpisodeSource`, `TimestampedDriverResult` | deleted | typecheck |
| PRF-001 | P1/high | Concurrent identical `writeEpisode` writers created `base.md` + `-2.md` (EEXIST race advanced suffix instead of deduping) → violates D-009 exactly-one-terminal | reread candidate on lost exclusive-create race; dedupe to identical winner | new 8-way concurrency test |
| F-004 | P2 | Drive episode reporter rode the shared sink whose durable-append failure is swallowed → `recordEpisode` saw false success, stderr fallback never fired (violates D-008) | `appendDurableDiagnostics` rethrows **only** for the `episode_capture_failed` diagnostic (keyed on code); all other events keep fail-soft | covered by B-026 reporter path; keyed change, full suite green |
| UR-003 | P2 | "episode log large" advisory rendered as "N records skipped because they could not be read" (false/confusing) | `formatRecallWarnings` partitions advisories (rendered `Note:`) from unreadable-record warnings | existing agent-memory suite green |
| SR-004 (Drive part) | P3 | `reportDriveEpisodeLaunchWarning` wrote unbounded detail to stderr | clamp to 500 chars, matching recordEpisode's bounded-stderr posture | — |

## Rejected (false positive / out-of-scope)

- **UR-001** — "chain capture warnings hidden by TUI renderer." FALSE POSITIVE:
  the ratified B-025 test *deliberately* asserts the warning is in `content`
  (model-visible) but **not** in `details`
  (`expect(JSON.stringify(response.details)).not.toContain("Episode capture skipped")`).
  Surfacing it in `details.lines` (the TUI render source) violates the ratified
  behavior. The warning reaching the model via `content` satisfies B-025; TUI
  human-visibility was an explicit design tradeoff, not a defect.
- **SR-002** — "symlinked episode directories escape memory roots." FALSE
  POSITIVE as episode-specific: episodes reuse the pre-existing store-wide
  `listMarkdownFiles`/`writeFileAtomic*` machinery that already backs
  notes/profile/playbooks on `main` with identical symlink behavior; symlinked
  files *inside* a store dir are skipped (not followed); only a symlinked
  store-dir-itself escapes, requiring the same local FS trust the store already
  assumes. No new confinement class; any fix belongs store-wide, not here.
- **SR-004 (config-loader part)** — `formatConfigValue` is pre-existing (10
  usages on `main` across all config warnings); the episodicLog warnings follow
  the **ratified** loader convention (TASK-472 AC#8 required consistency with
  it). Clamping only episodicLog would deviate; clamping globally is out of scope.
- **PRF-005** — "disabled mode rereads project config at every capture boundary."
  Not an AC-001 violation: AC-001 fixes injected context / tool behavior / files
  byte-identical, all preserved. Reading config *is* the gate mechanism (B-002
  only forbids store construction / files, which hold). Micro-optimization only.

## Deferred — narrow, off-by-default; safe fix is plan-touching (recommend a focused follow-up plan)

These are real but confined to detached-Drive terminal-identity or resume edges
(failure-of-a-failure or adoption-after-restart), all behind the off-by-default
gate. Their correct fixes touch the D-009 completion/outcome contract across
`driver.ts` / `cli/drive/subcommand.ts` / `driver-tool.ts` and should be scoped
together, not patched piecemeal.

- **F-003 / UR-002** — In *detached* runs, a terminal-**capture-failure**
  `driver_diagnostic` (emitted after the terminal legacy event) does not reach
  the parent session bus, because the bridge stops on the terminal event.
  **Attempted fix reverted:** reordering capture before the terminal event is
  mutually unsatisfiable with the relied-upon "completion file ⇒ terminal event
  already emitted" invariant (breaks the inline `waitForCompletion`+watch happy
  path — confirmed by a real ordering-regression test failure). The warning
  still persists to legacy JSONL **and** the durable store; only the live parent
  bus misses it. Deferred rather than trade a failure-of-a-failure edge for a
  happy-path ordering regression.
- **PRF-003** — Thrown Drive exits record a `failed` terminal at wall-clock (by
  design, plan §5) and write no completion; settle paths then persist an
  unstamped `aborted` completion that a later resume stamps and re-records →
  two terminals (`failed`+`aborted`) for one attempt. Full remediation must
  reconcile the thrown-path completion/outcome with settle+resume (3 files,
  D-009 contract).
- **PRF-002** — Detached `abort()` snapshots `child`/`workdirCreated` by value;
  a narrow pre-spawn window can leak a child + duplicate terminals, and a
  stamped completion can be overwritten by an unstamped one (resume duplicate).
  Leg "no terminal before mkdir" is a non-defect (no start recorded). The
  snapshot→live-state fix is small but needs a deterministic window test;
  entangled with PRF-003's resume-duplicate leg.
- **PRF-004** — Drive holds the plan lock during non-load-bearing episode/
  diagnostic I/O. Perf only; lock-release-reordering interacts with cross-plan
  commit serialization — risky without focused design.
- **PRF-007** — Concurrent same-entity plan/task status updates from multiple
  sessions can over/mis-count transition episodes (managers don't serialize the
  read/merge/write/decide). Uncommon multi-session race; underlying
  non-serialized update is largely pre-existing.
- **F-005** — Terminal-only `--resume` of a run that completed while logging was
  *off* (then enabled) records no terminal (no frozen `episodeAttemptId`).
  PARTIAL/contestable: the plan is internally inconsistent here ("records only
  the terminal" vs. "using the already-frozen attemptId"), and minting a fresh
  attemptId per resume would break D-009 idempotence. Current skip is a
  defensible reading; existing test asserts the current (zero-episode) behavior.
- **SR-001** — On resume, the frozen `episodeSource` re-resolves the execution
  worker (D-007-intended), and for the inline `cosmonauts-subagent` backend a
  hand-edited `spec.json` could name a different first-party agent; a stale
  fallback can make recorded ≠ executed. Threat model negligible (local,
  gitignored, project-owned artifact; codex/claude-cli ignore it for execution).
  Worth a small "require agentId==='worker' else fresh-resolve for execution,
  keep episodeSource for provenance" hardening, but it touches the resume
  execution path — deferred to the same follow-up.
