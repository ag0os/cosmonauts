---
id: TASK-501
title: Review fix — validate fallback completion authority
status: To Do
priority: medium
labels:
  - review-fix
  - 'review-round:1'
  - backend
  - testing
  - pre-existing-on-main
dependencies: []
createdAt: '2026-07-22T22:05:32.285Z'
updatedAt: '2026-07-24T03:33:53.573Z'
---

## Description

**Triage 2026-07-24: PRE-EXISTING ON `main`, not a regression from
`episodic-log-detached-hardening`. Unlabelled from that plan and kept as a
standalone follow-up.**

Evidence: `readRunCompletion` in `lib/driver/run-state.ts` is a verbatim
relocation of `main`'s `readDetachedCompletion` in `lib/driver/driver.ts` —
character-for-character the same blind `JSON.parse(...) as DriverResult`, the
same ENOENT-only catch, and the same rethrow of every other error. `main`'s
abort path already fed that unvalidated object straight into
`recordDriveTerminalEpisode`, so the "persisted bytes become authoritative
terminal data" surface predates this plan.

The plan made this path **stricter**, not looser: `main` preserved a persisted
completion whenever it merely existed, whereas `writeFallbackRunCompletion`
preserves it only when it carries `completedAt` (B-010).

Two further limits on severity:
- `writeRunCompletion` uses `writeFileAtomically`, so a crash mid-write cannot
  leave partial JSON. The corruption path requires a deliberate external writer.
- The threat model is a local, gitignored, project-owned run workdir. Write
  access there implies code execution as the user. `spec.md` rates this class of
  threat "low" for SR-001, and the security review scored SR-004 P2/low.

Still worth doing as driver input-validation hardening; just not a defect this
plan introduced.

Original framing follows.

Round-1 remediation for SR-004. Narrowly validate persisted run.completion.json before it suppresses a fallback result: require a valid DriverResult shape, exact matching runId, valid terminal outcome fields, and exact completedAt timestamp for stamped authority. Invalid/mismatched content must not let child-controlled bytes replace the parent/CLI/tool fallback, while preserving current valid bytes and D-001 ownership. Avoid widening schemas or unrelated parsers.

<!-- AC:BEGIN -->
- [ ] #1 A stamped completion suppresses fallback only when it is a valid DriverResult for the same run id.
- [ ] #2 Malformed, wrong-run, invalid-outcome, and invalid-timestamp completion JSON cannot become authoritative terminal data.
- [ ] #3 Valid current completion bytes remain untouched and existing CLI/tool/abort behavior stays compatible.
- [ ] #4 No MemoryStore/config-loader/episode-serializer schema surface widens.
- [ ] #5 Focused/full verification stays green.
<!-- AC:END -->
