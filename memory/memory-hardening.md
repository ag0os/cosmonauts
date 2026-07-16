---
source: archive
plan: memory-hardening
distilledAt: '2026-07-16'
---

# Agent-memory post-merge hardening

## What Was Built

The health gaps W2's scope discipline deliberately deferred, closed in five
small deltas right after `profile-playbooks` merged: a **real-Pi contract test
suite** (`tests/pi-contract/`) pinning the undocumented Pi behaviors agent
memory depends on, a **`profile.md.prev` sidecar** keeping one previous profile
version, **visible memory warnings** in both recall text and injected context,
accurate `remember`/`recall` tool descriptions, and **scan-cost stats** on
`retrieve()` so the ◆reassess gate decides on numbers. Preceded by the
feature's first-ever end-to-end run against real Pi 0.80.6 (cross-project
profile/index injection verified live; the oversized-profile defense stack held
under a live adversarial test).

## Key Decisions

- **Pin vendor behavior with library-level tests against the real packages, not
  docs or manual re-audit.** pi-ai ships everything needed to run the REAL
  agent loop without network: `createFauxCore` (scripted provider) +
  `runAgentLoop`, and the Anthropic adapter accepts `options.client` — a
  capture-only client records the exact wire request then throws, which the
  stream encodes as a `stopReason: "error"` message instead of rejecting.
  Three behaviors pinned: schema-root-only serialization (union root → zero
  parameters), one-sequential-tool-serializes-the-batch, and transformContext
  reaching the provider on *every* call of a tool-use turn (the W1-bug-class
  seam). Excluded: pi-coding-agent's session-level hook wiring — needs
  settings/auth scaffolding disproportionate to value; documented in the suite
  header as a manual re-audit item per lockstep bump.
- **Sidecar failure fails the profile write.** "Don't replace what you can't
  back up": a directory that can't take `profile.md.prev` almost certainly
  can't take the replacement either, so the guarantee costs nothing real.
  mtime CAS / cross-process locking rejected as disproportionate — the live
  adversarial run showed the notice→recall→write-bound stack composing well.
- **Warnings must reach visible text because the model can never see tool
  `details`.** Verified in `anthropic-messages.js`: only `content` blocks are
  sent to the provider; the old "see details.warnings" pointed the model at a
  field it structurally cannot read. Now: path+reason in recall text (cap 5,
  clamp 512B/line, "+N more"), a reserved `## Memory warnings` section in
  injected context, and injection even when *every* record is unreadable — a
  mangled profile is named at session start instead of silent amnesia.
- **W2's `types.ts` byte-freeze was a proof point, not a permanent constraint.**
  `MemoryRetrieveResult` gained an optional `stats` seam
  (filesScanned/bytesRead/durationMs); the B-002 hash pin was deliberately
  re-pinned with a comment saying why. Optionality keeps the architecture-map
  adapter untouched.
- **Both tool descriptions were stale, not just `remember`.** `recall` claimed
  notes-only too. Fixed together as the sanctioned second W1 delta W2's
  one-delta budget deferred.

## Patterns Established

- **`tests/pi-contract/` is where reverse-engineered Pi behavior gets pinned.**
  Any new dependence on undocumented Pi behavior should land a test there in
  the same change; the suite header lists what it deliberately does not cover.
- **Live E2E verification of Cosmo is four cheap CLI runs — do it for every
  memory-surface change.** `cosmonauts -p -a main/cosmo` from two scratch
  project dirs, a marker token saved in one and recited in the other, is the
  test class that catches what MockPi suites structurally cannot (W1 shipped
  dead with 2543 green tests). Clean `~/.cosmonauts/memory` afterwards.
- **Model-actionable output goes in tool-result `content`; `details` is
  UI/session-record only.** Applies to every Pi tool cosmonauts registers.

## Files Changed

- `tests/pi-contract/pi-behavior-contract.test.ts` — new contract suite (three
  describes: schema serialization, batch dispatch, transformContext reach).
- `lib/memory/markdown-store.ts`, `lib/memory/paths.ts` — sidecar write in
  `writeProfile` (extracted `writeFileAtomic`), `profilePreviousPath`, scan
  tally threaded through all record reads.
- `lib/memory/types.ts` — optional `MemoryRetrieveStats` (only post-W1 change).
- `domains/shared/extensions/agent-memory/index.ts` — warning formatters
  (shared cap/clamp helper), warnings-aware `buildMemoryContext`, stats in
  recall details, corrected descriptions.
- `docs/memory.md` — sidecar recovery path, warnings injection contract.

## Gotchas & Lessons

- **`structuredClone` fails on `AgentContext`** — tools carry `execute`
  functions. Capture message texts, not the context object.
- **A comment mentioning "pi-coding-agent" trips the coding-agnostic ledger.**
  The B-018 fixture test greps tests for `/coding/`; any new test file matching
  it needs a row in `missions/archive/plans/coding-agnostic-framework/`
  `test-decoupling-ledger.md` (`keep-grep-false-positive` for comment-only
  matches).
- **W2's profile pins live in TWO test files.** The profile-file-listing
  assertion (B-004) exists in both `tests/memory/markdown-store.test.ts` and
  `tests/extensions/agent-memory.test.ts`; the types.ts hash (B-002) in
  `tests/memory/interface.test.ts`. A deliberate delta must update all of them.
- **An oversized (>4,000-byte) human-edited profile is un-updatable by the
  model without condensing human content** — every update path requires a full
  rewrite under the write bound, and the rejection message invites
  consolidation of human-authored text. Known and accepted (the bound is
  ratified; the sidecar is the insurance), but worth remembering when a user
  reports Cosmo "wants to shorten" their profile.
- **The dangerous excerpt-save path is guarded by prompt text alone.** A
  4,000-byte truncated excerpt passes the 4,000-byte write bound; only the
  injected notice ("recall the full body first") prevents saving it. One live
  sample showed the model obeying. The sidecar exists because that guard is
  model-dependent.
