# Memory

Cosmonauts W1 memory is a small, plain-text substrate for explicit authored
agent notes plus generated architecture-map retrieval. It is intentionally
minimal: files stay human-owned, retrieval scans disk on demand, and Pi session
state remains responsible for short-term conversational continuity.

## Store Layout

Authored agent notes live in two sibling markdown stores:

```text
<projectRoot>/memory/agent/
  index.md
  notes/*.md

~/.cosmonauts/memory/agent/
  index.md
  notes/*.md
```

The project store is for facts tied to the current repository or workspace. The
user store is for durable preferences and facts that should follow the user
across projects. Both stores use the same on-disk shape. `index.md` is a compact
derived list rebuilt from valid notes after writes; it is not itself an authored
record.

Generated architecture maps remain separate under `memory/architecture/`. They
are not part of the authored note store.

## OKF Note Shape

W1 authored records are plain markdown files using OKF v0.1-style YAML
frontmatter with `type: note`:

```markdown
---
type: note
title: Release branch
description: Staging deploy branch.
resource: memory/agent/notes/20260708T140000000Z-release-branch-a1b2c3d4.md
tags:
  - deploys
timestamp: 2026-07-08T14:00:00.000Z
scope: project
kind: semantic
source: main/cosmo
---
Staging deploys happen from the `release` branch.
```

Required frontmatter fields are `type`, `title`, `description`, `resource`,
`tags`, `timestamp`, `scope`, and `kind`. `source` is optional. The markdown body
is the full note content returned by recall.

W1 scope taxonomy:

- `session`: recognized by the contract but not backed by a markdown store.
- `project`: stored under `<projectRoot>/memory/agent/`.
- `user`: stored under `~/.cosmonauts/memory/agent/`.

W1 kind taxonomy:

- `semantic`: facts and durable knowledge.
- `procedural`: preferences, workflows, and instructions.
- `episodic`: event-like memories tied to something that happened.

## Session Scope

The Pi-First audit for W1 keeps session memory out of the markdown substrate.
Session-scoped writes return `unsupported`. Retrieval requests that include
`session` report it in `skippedScopes` with an explanation instead of creating a
session store. Pi session state and compaction cover short-term memory.

## Recall Model

Cosmo uses an index-inject plus pull recall model.

At `before_agent_start`, the `agent-memory` extension loads current project and
user notes from disk and injects one hidden `agent-memory-context` message for
`main/cosmo` only. The injected index lists compact metadata only: title, scope,
kind, timestamp, description, and path. It does not include full note bodies.

The injected index is capped to the 50 most recent records before truncation and
has its own independent 12,000-byte UTF-8 budget. When Cosmo needs details, it
uses `recall(query)`, which searches current project and user notes and returns
full note bodies. Recall defaults to 5 results and caps caller-supplied limits
at 20.

Retrieval is intentionally simple in W1: each turn reads the store from disk,
filters plain text, and sorts most recent first. Human edits and deletes are
visible on the next retrieval. There is no process-local content cache deciding
truth.

`consolidate()` is part of the shared contract, but both W1 stores return an
explicit no-op result. W1 performs no background consolidation, pruning, decay,
or dreaming.

## W1 Exclusions

W1 deliberately does not include:

- Relevance-gated push recall.
- Embeddings or vector search.
- SQLite or another database backend.
- Decay, pruning, consolidation, dreaming, or background capture.
- A session-scope markdown store.
- A registry or plugin framework for memory backends.
- Future record types beyond authored `note` records and generated
  architecture-map records.

Per-turn full-store scans are accepted at W1 scale. Reassess for W2 before
authored stores grow into the hundreds of records.

## Ownership And Operations

Memory files are human-owned markdown. Project memory lives under `memory/` and
is git-tracked; W1 adds no ignore rule for it. User memory lives under
`~/.cosmonauts/memory/agent/` and is outside the project repository by default.

The architecture map remains under `memory/architecture/` and is generated
state, not authored agent memory.

Drive runs may exclude `missions/**` and `memory/**` artifacts when preparing
commits or diffs. Always check `git status` when memory files are expected to be
part of a change.
