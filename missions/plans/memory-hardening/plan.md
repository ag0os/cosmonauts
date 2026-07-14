---
title: Agent-memory post-merge hardening
status: active
createdAt: '2026-07-14T14:39:34.779Z'
updatedAt: '2026-07-14T14:39:34.779Z'
---

## Overview

Close the health gaps that W2's scope discipline deliberately deferred, now that
`profile-playbooks` is merged to local main and the feature is verified working
end-to-end against real Pi 0.80.6 (profile + index injection confirmed live in
cross-project sessions on 2026-07-14). Five small deltas: pin the
reverse-engineered Pi behaviors with real-Pi contract tests, add a
previous-version sidecar for the profile, make memory warnings visible to the
model and the user, fix the stale `remember` tool description, and instrument
scan cost so the ◆reassess gate decides on numbers instead of vibes.

## Current State

- `feature/profile-playbooks` is fast-forward merged into local `main`
  (`df80ce4`); 2570 tests, lint, typecheck green post-merge.
- Two load-bearing Pi behaviors are relied on but pinned only on our side of
  the contract: (a) the Anthropic adapter builds `input_schema` from
  `schema.properties ?? {}` (`pi-ai/dist/api/anthropic-messages.js`, so an
  object root is mandatory), and (b) `agent-loop.js` serializes an entire
  same-message tool batch when any called tool declares
  `executionMode: "sequential"`. Existing tests assert what WE register — the
  same-batch collision test even branches on our own registration and
  simulates the dispatch policy itself. Nothing fails if Pi changes either
  behavior on a lockstep bump.
- `writeProfile` does complete-body replacement of the singleton
  `~/.cosmonauts/memory/agent/profile.md` with no history. Atomic
  temp+rename prevents torn writes but not lost updates; the truncation
  notice is the only guard against a model saving a truncated excerpt (a
  4,000-byte excerpt passes the 4,000-byte write bound).
- Store warnings (malformed/unreadable records, duplicate playbook titles)
  are computed with path+reason but the model can never see them:
  `recall` puts them in `details` (verified: Pi sends only `content` blocks
  to the provider, never `details`), and the injected context ignores
  warnings entirely — including the case where the profile itself is
  malformed and the user experiences silent amnesia.
- `remember` still describes itself as "Save an explicit note to agent
  memory." though it saves notes, profiles, and playbooks; pinned by
  `tests/extensions/agent-memory.test.ts:1377` (`plan:memory-interface#B-012`).
  This is the sanctioned second W1 delta the W2 review deferred.
- No scan-cost instrumentation exists anywhere in `lib/memory/` or the
  extension — the ◆reassess gate names scan cost as an input but has no
  data source.

## Design

**Pi contract tests** (`tests/pi-contract/`): a new suite that imports the
real `@earendil-works/pi-*` packages (no MockPi, no network) and fails
loudly if a lockstep bump shifts a behavior we depend on:

1. *Anthropic schema serialization*: drive the real
   `anthropic-messages` `stream()` with a stubbed transport (patched
   `fetch`/local capture) and two registered tools — one object-rooted, one
   union-rooted — and assert the captured wire request serializes the
   object root's properties and reduces the union root to zero parameters
   (`properties: {}`). The test documents the constraint; it does not
   depend on Anthropic accepting the request.
2. *Sequential batch dispatch*: drive the real `agentLoop` from
   `pi-agent-core` with the faux provider (`registerFauxProvider` /
   `setResponses` + `fauxToolCall`) returning one assistant message with
   two tool calls. With no `executionMode`, assert observed overlap
   (parallel dispatch); with one tool declaring `sequential`, assert strict
   serialization (first completes before second starts). Execution order
   observed via instrumented tool `execute` functions with deliberate
   latency.
3. *Context-hook visibility* (stretch, same suite): a real
   `createAgentSession` from `pi-coding-agent` with the faux provider and
   the real agent-memory extension, asserting the injected
   `agent-memory-context` message survives to the provider request on the
   same turn — the real-Pi version of W2's composed-pipeline test. If the
   session surface demands more scaffolding than the value warrants,
   document the gap in the suite instead and stop.

**Profile sidecar**: before `writeProfile` replaces an existing valid
profile, copy the current file to `profile.md.prev` (same directory,
best-effort, atomic-rename not required for the sidecar). One level of
history is the insurance: any bad overwrite — model-authored or racing
session — is recoverable by hand. The sidecar is ignored by record listing
(only `*.md` files are scanned) and by index generation; document the
recovery path in `docs/memory.md`. No mtime CAS, no locking — rejected as
disproportionate while the live-tested defense stack held.

**Visible warnings**: `formatRecallWarnings` includes each warning's
path and reason in the recall text itself (clamped per entry, capped count
with a "+N more" overflow line) instead of pointing at invisible
`details.warnings`. The injected context gains a warnings section built
from the same retrieve result, reserved-before-truncation like the other
notices, so a malformed profile or skipped record is named at session
start instead of producing silent amnesia. When warnings exist but zero
records load, inject the warnings-only notice rather than skipping
injection.

**Tool description fix**: `remember`'s description becomes an accurate
one-liner covering notes, profiles, and playbooks; update the pinning
assertion in the same commit. This is the sanctioned W1 behavioral delta
deferred by W2's one-delta budget.

**Scan instrumentation**: the markdown store counts files scanned, bytes
read, and wall-clock duration per `retrieve()` and reports them on the
existing result object as an optional `stats` field (additive change to
`lib/memory/types.ts` — the W2 byte-freeze was a proof point, not a
permanent constraint). The extension threads stats into `recall`'s
`details` and the injection path logs nothing (no model-visible noise);
the ◆reassess gate reads numbers from any session record or a one-off
scripted `retrieve()`.

## Implementation Order

1. Pi contract tests — schema serialization + sequential dispatch (+
   context-hook stretch). Independent of everything else.
2. Profile sidecar in `writeProfile` + recovery documentation.
3. Visible warnings in recall text and injected context.
4. `remember` description fix + B-012 pin update.
5. Scan-cost instrumentation (`stats` on retrieve results).

Stages 2–5 touch overlapping files (`markdown-store.ts`, extension,
tests) and land as small sequential commits on one branch
(`feature/memory-hardening`).

## Risks

- The contract tests depend on undocumented internals staying reachable
  (faux provider registration, patched fetch capture). If a seam is not
  reachable cleanly, prefer documenting the untestable dependency inside
  the suite over building elaborate scaffolding.
- The injected-warnings section adds bytes to a budgeted message; it must
  participate in the reserve-notices-before-truncation discipline or an
  adversarial warning path could evict the profile.
- `types.ts` changes ripple into the architecture-map adapter, which also
  implements `MemoryStore` — `stats` must be optional so the adapter stays
  untouched.
- W3/W4 drift: none of these deltas may add caching, consolidation, or
  episodic machinery; the reassess gate owns those.
