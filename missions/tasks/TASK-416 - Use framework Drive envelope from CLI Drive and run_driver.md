---
id: TASK-416
title: Use framework Drive envelope from CLI Drive and run_driver
status: Done
priority: high
labels:
  - backend
  - api
  - testing
  - 'plan:coding-agnostic-framework'
dependencies:
  - TASK-415
createdAt: '2026-06-26T15:43:48.142Z'
updatedAt: '2026-06-29T17:38:56.735Z'
---

## Description

Wire both Drive entrypoints to the framework default envelope resolver, preserve explicit legacy envelope compatibility, and update user-facing wording. This task owns B-011, B-012, and B-025. Planned-behavior tests must include markers near executable tests: `@cosmo-behavior plan:coding-agnostic-framework#B-011`, `#B-012`, and `#B-025`.

<!-- AC:BEGIN -->
- [x] #1 B-011 CLI Drive builds omitted-envelope run specs using framework default envelope content and a path under `lib/prompts/framework/drive/`.
- [x] #2 B-012 Pi `run_driver` omitted-envelope specs use the same framework default resolver, point at an existing file, and no longer use the doubled bundled-coding path.
- [x] #3 Drive skill and tool wording refers to the framework default Drive envelope rather than a bundled coding envelope.
- [x] #4 B-025 explicit `--envelope` and `envelopePath` overrides continue to honor the correct legacy path `bundled/coding/drivers/templates/envelope.md` exactly as before, without preserving the nonexistent doubled path.
<!-- AC:END -->
