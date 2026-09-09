# Escalation — the episode source follows an escaping directory symlink and prunes the file it finds

**Status**: OPEN — awaiting a human ruling. No code has been changed for this.
**Raised**: 2026-09-09, by the implementer, after reproducing it against production code.
**Route**: halt-and-escalate per `work-artifacts/references/deviation-protocol.md`.
**Origin**: Quality Manager finding SRQ-001 (`missions/reviews/qm/living-memory-fidelity-security.md`), medium severity.
**Scope**: pre-existing. Not introduced by `living-memory-fidelity`, and deliberately left out of that plan.

## The finding

`directEpisodePaths()` in `lib/memory/consolidation-sources.ts:1243` builds the
episode directory with a **lexical** `resolve()` and hands it straight to
`readdir()`:

```ts
const directory = resolve(projectRoot, ...PROJECT_EPISODE_DIRECTORY.split("/"));
return (await readdir(directory, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
```

Nothing checks that the directory, or any ancestor of it, actually resolves
beneath the canonical project root. The `O_NOFOLLOW` hardening elsewhere in this
file applies to each *final file*, so it stops a symlinked `episode.md` — but it
does nothing about traversal through a symlinked `episodes`, `agent`, or
`memory` **directory**, which `readdir` follows transparently.

Consolidation then treats whatever it found as ordinary project evidence: it
admits the bytes to the judgment path, and `finalize()` reconstructs the same
lexical path to run the journal → rename → remove prune sequence through the
symlink.

## Reproduction

Confirmed against production code at `af7d406`, not inferred from the QM report.
A real episode was written through `createMarkdownMemoryStore`, its directory
moved outside the project, and a symlink left in its place:

```
collected ids:      [ "memory/agent/episodes/20260901T100000000Z-task-status-changed-0d378cb9.md" ]
inventoryComplete:  true
warnings: 0  omitted: 0
finalize:           {"episodePrunes":[...],"writesCommitted":true}
outside dir now holds: []
```

Both halves reproduce. The external file is **read** as project evidence with a
clean, complete inventory and **no warning**, and it is then **deleted**.

The first pass of the reproduction is worth recording too: with a fixture whose
frontmatter was not valid OKF, the source reported `inventoryComplete: false`
with one warning. So the containment failure is invisible precisely when the
external file is well-formed — the completeness signal reports health exactly in
the case that matters.

## Why it needs a human

Three reasons, in order of weight.

1. **It crosses the project boundary in the destructive direction.** Everything
   else in this subsystem is bounded by the selected project. This is the one
   path where consolidation can delete a file the user never put inside the
   project, running with their full filesystem privileges.

2. **The fix must choose a failure mode, and that choice is policy.** Rejecting
   an escaping episode directory means a project that legitimately symlinks
   `memory/agent/episodes` onto another volume stops consolidating — the
   completeness barrier would then block every absence-dependent seam. Whether
   that is correct or an unacceptable regression is a product call, not an
   implementation detail.

3. **It is adjacent to ground already closed.** D-026 ratified that
   check-then-destructive pathname races are an accepted limitation. This is
   *not* that — it is a missing containment check rather than a TOCTOU window —
   but the distinction is fine enough that an agent should not decide on its own
   that the earlier ruling does not cover it.

## Options

- **A — Reject and fail closed.** Resolve the episode directory's real path and
  reject it when it is not contained beneath the canonical project root; report
  the source as `inventoryComplete: false` so the existing barrier blocks
  absence-dependent work before any record is admitted. This is the QM's
  suggested fix. Safest; breaks a legitimate symlinked-episodes layout.

- **B — Admit but never prune.** Collect through the symlink as today, but treat
  an uncontained episode directory as read-only: no rename, no remove, no
  journal. Keeps consolidation working for a symlinked layout while removing the
  destructive half. Leaves the disclosure half open.

- **C — Reject only the destructive path, warn on the read path.** As B, plus a
  source warning so the condition is visible rather than silent. Costs one more
  warning class; the completeness barrier stays honest.

- **D — Accept and record.** Rule it a limitation of trusting the project root,
  consistent with the memory boundary being deliberately unsandboxed, and record
  it alongside D-026 rather than fixing it.

## Note on the sibling finding

SRQ-002 (rejected knowledge directories reported as a healthy complete
inventory) is the same shape one layer up, and the `living-memory-fidelity` plan
records in its Risks that closing the completeness rule over any
listed-but-unscanned path would wedge the pass permanently for any corpus
containing a symlinked or non-regular `.md` — with an explicit "do not close
this by widening the rule without a ruling". Whatever is decided here should be
decided for both, or the two will diverge.
