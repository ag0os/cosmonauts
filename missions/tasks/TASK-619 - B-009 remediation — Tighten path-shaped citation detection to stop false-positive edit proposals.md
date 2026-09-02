---
id: TASK-619
title: >-
  B-009 remediation — Tighten path-shaped citation detection to stop
  false-positive edit proposals
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:living-memory'
dependencies:
  - TASK-618
createdAt: '2026-09-02T18:12:30.518Z'
updatedAt: '2026-09-02T18:12:30.518Z'
---

## Description

`isPathShaped` in `lib/memory/living-memory.ts` accepts a token when it merely `!includes(" ") && (includes("/") || /\.[A-Za-z0-9]{1,12}([?#].*)?$/)`. Against the real corpus that makes almost any backticked token a "citation": a live dry run produced 15 stale-reference observations and 10 edit proposals, the large majority of them false positives.

Observed false positives (verbatim from `cosmonauts memory consolidate --dry-run --no-model --json`): dotted code identifiers `Bun.spawn`, `Promise.race`, `JSON.parse`, `Type.Object`, `Type.Union`, `pi.exec`, `analysis.provider`, `options.client`, `query.recordTypes`, `scope.projectRoot`, `episodicLog.enabled`, `drive.run`, `autonomy.wake`, `MemoryQuery.recordTypes`, `MemoryWriteResult.failed`, `RetrievedMemoryRecord.source`; slash-namespaced identifiers with no extension `coding/worker`, `main/cosmo`, `coding/quality-manager`, `example/worker`, `cosmonauts/cli`, `knowledge/url`; brace expansions `lib/config/{types,loader}.ts`, `lib/memory/{types,okf,paths,markdown-store,index}.ts`, `bundled/coding/prompts/{spec-writer,planner}.md`; globs and placeholders `tests/driver/*`, `memory/**`, `missions/**`, `.cosmonauts/*.lock`, `docs/fallow*.md`, `node_modules/.bin/<tool>`, `@fallow-cli/<platform>/fallow`, `${role}-<uuid>.jsonl`, `<userRoot>/memory/agent/profile.md`, `review-<n>.md`, `review-round-N.md`; git rev ranges `51ef662..HEAD`, `main..HEAD`, `round-1..3`; elided paths `.../references/plan-format.md`; separator-less bare names and bare extensions `types.ts`, `index.md`, `config.json`, `qm.md`, `store.ts`, `generator.ts`, `.md`; and line-suffixed `lib/tasks/file-system.ts:105`.

Why this matters: B-009 scopes the deterministic detector to "path-shaped backtick citations", and each finding becomes an N=1 edit proposal that "mechanically marks or removes only the unresolved citation". A promoted false positive would therefore mechanically damage a correct, human-curated record — e.g. stripping the `Bun.spawn` reference out of `knowledge/drive-process-reaping.md`, whose whole point is that Bun.spawn honours `detached: true`. INV-001 is not breached (proposals change no bytes), but the descriptive outlet becomes untrustworthy noise and the human review queue fills with harmful edits. Sample record for reference: `knowledge/drive-process-reaping.md` lines 98 and 102 use `Bun.spawn` and `Promise.race` as prose API names.

Tighten the heuristic so a backtick token counts as a citation only when it is genuinely path-shaped. Markdown-link and `files:` frontmatter extraction must keep working exactly as today (they are explicit citations and are not affected by this heuristic). Prefer a small, well-named predicate with the rejection classes expressed clearly rather than one dense regex.

Binding ratified ground — stop and escalate rather than adjust it: never move, edit, or delete anything under this repository's live `knowledge/`; use temp fixtures only; `knowledgeSurface` stays on; no live retirement round; no TTL, OM, scheduling, user-scope L4 mutation, embeddings, new OKF type, or explicit-save change. Do not silence findings by lowering caps, disabling the detector, or dropping the backtick channel entirely — the true positives below must still be found.

<!-- AC:BEGIN -->
- [ ] #1 Backtick tokens in these classes are NOT treated as citations: dotted code identifiers with no path separator (`Bun.spawn`, `Promise.race`, `JSON.parse`, `Type.Object`, `MemoryQuery.recordTypes`, `episodicLog.enabled`); slash-namespaced identifiers carrying no file extension (`coding/worker`, `main/cosmo`, `cosmonauts/cli`, `knowledge/url`); brace expansions, globs and placeholders (`lib/config/{types,loader}.ts`, `tests/driver/*`, `memory/**`, `docs/fallow*.md`, `node_modules/.bin/<tool>`, `${role}-<uuid>.jsonl`, `review-<n>.md`); git rev ranges and elided paths (`main..HEAD`, `51ef662..HEAD`, `round-1..3`, `.../references/plan-format.md`); and separator-less bare names or bare extensions (`types.ts`, `index.md`, `config.json`, `.md`).
- [ ] #2 Genuine path-shaped citations are still detected: the existing B-009 fixture `lib/missing-backtick.ts` still yields its stale finding, and a real-corpus reference such as `memory/episodic-log.md` (which does not resolve) is still reported; markdown-link and `files:` frontmatter extraction behave exactly as before, including the anchor/query canonicalization already covered.
- [ ] #3 B-009 remains green under its exact existing name and marker in `tests/memory/living-memory.test.ts`, extended with table-driven positive and negative cases covering every rejection class above so the heuristic cannot silently loosen again.
- [ ] #4 A live `bun bin/cosmonauts memory consolidate --dry-run --no-model --json` from the repository root completes as `ran` or `noop`, and every remaining stale-reference observation names only tokens that genuinely fail to resolve — no dotted identifier, glob, brace expansion, placeholder, rev range, or bare filename appears in any reason string.
- [ ] #5 Project-native universal correctness evidence passes after every commit; the Slice 0 B-001 receipt test and every marker B-001..B-021 remain green and owned by their original tasks; live `knowledge/` and `memory/` stay byte-identical with a clean worktree.
<!-- AC:END -->
