---
id: TASK-620
title: B-009 follow-up — Ignore citations inside code spans and fenced blocks
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:living-memory'
dependencies:
  - TASK-619
createdAt: '2026-09-02T18:22:08.586Z'
updatedAt: '2026-09-02T18:22:08.586Z'
---

## Description

TASK-619 left one explicit AC#1 case unmet: `knowledge/url` is still reported as an unresolved citation. It is not a backtick/`isPathShaped` case — it comes from the OTHER extraction channel.

`knowledge/code-structure-map.md` line 169 reads: "renderer never rendered them — added escaped `[text](url)` with an unsafe-scheme". The markdown-link regex in `citationReferences` (`/\[[^\]]*\]\(([^)\s]+)...\)/`) matches the `(url)` INSIDE that inline code span and, because link extraction canonicalizes relative to the citing file, resolves it to `knowledge/url`. A markdown link quoted as an EXAMPLE inside code formatting is documentation, not a citation.

Consequence is the same harm class TASK-619 addressed: this yields an N=1 edit proposal that would mechanically mark or remove `[text](url)` from a correct human-curated record whose subject is exactly how markdown links are rendered and escaped. INV-001 still holds (proposals change no bytes), but the outlet's precision is the point.

Fix: exclude inline code spans and fenced code blocks from markdown-link and path-shaped-backtick citation extraction, so content that is being QUOTED as an example is never read as a live citation. Explicit `files:` frontmatter is unaffected. Keep it a small, clearly-named step in `citationReferences` — mask or skip code regions before matching, rather than complicating the individual regexes.

Binding ratified ground — stop and escalate rather than adjust it: never move, edit, or delete anything under this repository's live `knowledge/`; temp fixtures only; `knowledgeSurface` stays on; no live retirement round; no TTL, OM, scheduling, user-scope L4 mutation, embeddings, new OKF type, or explicit-save change. Do not suppress the finding by lowering caps or disabling a channel — genuine citations outside code regions must still be found.

<!-- AC:BEGIN -->
- [ ] #1 Markdown links and path-shaped backtick tokens appearing inside inline code spans or fenced code blocks are not treated as citations: the live corpus no longer reports `knowledge/url` from `knowledge/code-structure-map.md`, satisfying the TASK-619 AC#1 case that remained unmet.
- [ ] #2 Citations outside code regions are unaffected: the existing B-009 fixture still yields its stale findings for its markdown link, its `files:` frontmatter entry, and its path-shaped backtick token, and `files:` frontmatter extraction is untouched.
- [ ] #3 B-009 remains green under its exact existing name and marker, extended with cases proving a link inside an inline code span and a link inside a fenced block are both ignored while an equivalent link in ordinary prose is still detected.
- [ ] #4 A live `bun bin/cosmonauts memory consolidate --dry-run --no-model --json` from the repository root completes as `ran` or `noop` and every remaining unresolved-citation token genuinely fails to resolve on disk, with no example-only or code-quoted token among them.
- [ ] #5 Project-native universal correctness evidence passes after every commit; the Slice 0 B-001 receipt test and every marker B-001..B-021 remain green and owned by their original tasks; live `knowledge/` and `memory/` stay byte-identical with a clean worktree.
<!-- AC:END -->
