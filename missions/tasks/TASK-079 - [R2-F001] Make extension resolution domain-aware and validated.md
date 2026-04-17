---
id: TASK-079
title: '[R2-F001] Make extension resolution domain-aware and validated'
status: Done
priority: high
assignee: worker
labels:
  - review-fix
  - 'review-round:2'
  - domains
  - orchestration
  - extensions
dependencies: []
createdAt: '2026-03-09T18:07:24.257Z'
updatedAt: '2026-03-09T18:13:16.728Z'
---

## Description

Reviewer finding F-001: extension loading is hardcoded to shared built-ins (`KNOWN_EXTENSIONS`) and silently drops unknown names, breaking custom domains. Implement domain-aware extension resolution with explicit validation errors.

<!-- AC:BEGIN -->
- [x] #1 Agents can load extensions from their own domain (e.g., `domains/<domain>/extensions/<name>`) with defined shared fallback behavior.
- [x] #2 Referencing an unknown extension in an agent definition produces a clear runtime/configuration error instead of being silently ignored.
- [x] #3 `createSession` and `createPiSpawner` use the same domain-aware extension resolution path.
- [x] #4 Tests cover custom-domain extension loading and shared-domain fallback.
- [x] #5 Tests cover missing extension references failing with explicit errors.
<!-- AC:END -->

## Implementation Notes

Replaced hardcoded KNOWN_EXTENSIONS set with domain-aware filesystem resolution in resolveExtensionPaths. The function now accepts a ResolveExtensionOptions parameter with domain and domainsDir. Resolution order: domains/<domain>/extensions/<name> first (if not shared), then domains/shared/extensions/<name>. Unknown extensions throw an Error with a message listing all searched paths. Both createPiSpawner (agent-spawner.ts) and createSession (cli/session.ts) pass domain+domainsDir to the same function. Tests use temp directories to verify domain-specific precedence, shared fallback, and error cases. All 711 tests pass, typecheck clean, lint clean."
