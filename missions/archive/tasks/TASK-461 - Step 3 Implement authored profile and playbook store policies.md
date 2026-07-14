---
id: TASK-461
title: 'Step 3: Implement authored profile and playbook store policies'
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:profile-playbooks'
dependencies:
  - TASK-460
createdAt: '2026-07-13T14:11:11.133Z'
updatedAt: '2026-07-13T20:46:54.577Z'
---

## Description

Implementation Order step 3. Extend the fixed-layout markdown store through red/green/refactor loops in `lib/memory/authored-records.ts`, `lib/memory/okf.ts`, `lib/memory/paths.ts`, `lib/memory/markdown-store.ts`, `lib/memory/index.ts`, and `tests/memory/markdown-store.test.ts`. This task owns B-008, B-011, B-012, B-014, B-017, and B-018. It also supplies B-004's store prerequisite—atomic singleton replacement at the stable user profile path and refusal of an invalid occupant—but does not own/mark B-004, which completes at the visible save edge in step 4. Keep one explicit three-type store/switch and fixed paths: no cache/latest map, registry, backend/plugin dispatch, approval state, W3/W4 machinery, or outward `lib/memory/*` imports. `lib/memory/types.ts` remains UNCHANGED; pressure to edit it is stop-and-report. All filesystem tests use temporary roots and make no model calls.

<!-- AC:BEGIN -->
- [x] #1 B-008 is proven by `tests/memory/markdown-store.test.ts` test `canonicalizes playbook names into stable scoped resources`, carrying `@cosmo-behavior plan:profile-playbooks#B-008`: NFKC-normalized, trimmed, lowercase titles replace non-letter/number runs with `-`, trim edge separators, cap at 80 Unicode code points, reject an empty key, share identity only within a scope, and create `playbooks/<canonical-key>.md` without timestamp/hash forks.
- [x] #2 B-011 is proven by `tests/memory/markdown-store.test.ts` test `keeps profile and playbook scopes isolated across projects`, carrying `@cosmo-behavior plan:profile-playbooks#B-011`: project A retrieves its project playbook plus shared user playbook/profile, project B retrieves only the shared user records, no project profile is eligible, and `session` stays skipped.
- [x] #3 B-012 is proven by `tests/memory/markdown-store.test.ts` test `skips malformed profile and playbook records with file warnings`, carrying `@cosmo-behavior plan:profile-playbooks#B-012`: recursive `notes/` accepts only notes, reserved user `profile.md` accepts only a user/semantic profile, and direct-child-only `playbooks/` accepts only scope-correct/procedural playbooks; every bad-frontmatter or location/type/scope/kind violation is skipped with path-and-reason warning while healthy records return, physical location cannot be upgraded by frontmatter, reads scaffold nothing, and the session remains usable.
- [x] #4 B-014 is proven by `tests/memory/markdown-store.test.ts` test `reflects playbook rename edits and deletion without a stale cache`, carrying `@cosmo-behavior plan:profile-playbooks#B-014`: current frontmatter title/body governs retrieval and confirmed same-name updates at the existing path; a retitle frees the old canonical key, whose new record uses the first deterministic numeric alternate path if needed; old names are not aliases; duplicate canonical titles both retrieve with a warning naming both paths and refuse writes; deletion removes the record, with no stale process state and W1's write-regenerated browsing-index semantics preserved.
- [x] #5 B-017 is proven by `tests/memory/markdown-store.test.ts` test `rejects profile writes over the 4000 byte body bound`, carrying `@cosmo-behavior plan:profile-playbooks#B-017`: the store rejects an over-4,000-UTF-8-byte profile body before changing an existing file, reports bound and measured size, yet reads and returns a valid oversized human-edited profile unchanged.
- [x] #6 B-018 is proven by `tests/memory/markdown-store.test.ts` test `reports profile and playbook write failures without partial files`, carrying `@cosmo-behavior plan:profile-playbooks#B-018`: blocked create/update paths for both new types return existing-union `failed` outcomes with type, intended scope/path, and filesystem reason; no temp/partial record remains, and an existing record is always old-complete or new-complete.
- [x] #7 Applicable Quality Contract gates 1–6 pass for this store slice: the named tests and exact B-008/B-011/B-012/B-014/B-017/B-018 markers cover the relevant mutation negatives; profile singleton replacement safely refuses malformed `profile.md`; unknown type/session/wrong scope-kind/empty key/oversize map to existing `unsupported`, ambiguity/invalid occupants to existing `failed`; deterministic index regeneration writes frontmatter `type: memory-index`, uses the exact empty state `No valid authored records.`, lists notes/playbooks (profile excluded), defaults playbook description to title, and preserves W1 note format; TASK-460's red B-002 profile/playbook contract assertions now pass green (B-002 completes here); `lib/memory/index.ts` exports only the existing public API plus the authored policy constants/helper the Pi edge needs, keeping OKF parser and path internals private. `lib/memory/types.ts` and architecture-map code stay unchanged; `lib/memory/*` imports no Pi/CLI/domain/architecture code; the design remains one fixed store with finite variants and no cache, registry/backend/approval, extra consumer, W3, or W4 code.
- [x] #8 B-004's store prerequisite has direct store-level evidence: a `tests/memory/markdown-store.test.ts` test proves atomic in-place singleton replacement at the stable user `profile.md` path (same path, advanced timestamp, no second profile file) and the safe refusal of an invalid occupant naming path and reason; B-004 itself completes and is marked in TASK-462.
<!-- AC:END -->
