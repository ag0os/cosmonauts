---
id: TASK-455
title: Implement guarded agent-memory remember and recall tools
status: To Do
priority: high
labels:
  - backend
  - api
  - testing
  - 'plan:memory-interface'
dependencies:
  - TASK-454
createdAt: '2026-07-08T13:53:47.074Z'
updatedAt: '2026-07-08T13:53:47.074Z'
---

## Description

Implementation Order step 5, first half. Build Cosmo's authored-memory tool edge on top of the markdown store. Behavior ownership: B-005, B-007, and B-012 only. Keep W1 limited to explicit note saves and pull recall; no background capture or extra record types.

<!-- AC:BEGIN -->
- [ ] #1 The agent-memory extension exports createAgentMemoryExtension(deps) with injectable userCosmonautsRoot, storeFactory, and now, plus a production default that resolves homedir()/.cosmonauts; extension tests inject temp roots/spies so they never touch the real home directory and never make model calls.
- [ ] #2 B-012 remember and recall are registered at extension factory load for Cosmo's real allowlist but execute only when session/turn authorization is main/cosmo, with authorization reset on session_start, session_shutdown, and every before_agent_start; non-Cosmo after Cosmo returns unauthorized, injects no context, creates/scans no stores, and cannot inherit state; tests carry @cosmo-behavior plan:memory-interface#B-012.
- [ ] #3 B-005 remember writes an explicit visible OKF note through the factory-bound markdown store to the correct project or user sibling store with type: note, scope/kind taxonomy, tags, timestamp/source, body content, and a result naming saved title, scope, and human-readable path; tests carry @cosmo-behavior plan:memory-interface#B-005.
- [ ] #4 Remember supports deterministic minimal { content } saves: title defaults to the first content line trimmed to 60 characters, description to the title, tags to [], scope to project, kind to semantic, timestamp to injected now; failed writes return path/reason, leave no partial file, and keep the session alive.
- [ ] #5 B-007 recall requires non-empty query text, uses recordTypes: ["note"] over current project+user eligible scopes, defaults limit to 5 and caps caller limit at 20, returns full matching detail with path/scope/kind/timestamp, and returns an honest no-match result naming searched scopes; tests carry @cosmo-behavior plan:memory-interface#B-007.
- [ ] #6 W1 excludes session-scope writes, embeddings, SQLite, relevance-gate push recall, decay, pruning, background capture, W2 profile/playbook types, and broad domain-registration machinery beyond the two W1 stores.
- [ ] #7 Mutation-target tests catch lazy remember/recall registration missing from the real allowlist, non-Cosmo calls after a Cosmo note write, broad-query limit bypass, and failed-write partial-file behavior; tool descriptions stay short with no promptSnippet to minimize external-host exposure.
<!-- AC:END -->
