---
id: TASK-441
title: Implement audit-selected TypeScript analyzer adapter behind map contracts
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:code-structure-map'
dependencies:
  - TASK-440
createdAt: '2026-07-03T14:12:56.203Z'
updatedAt: '2026-07-03T14:12:56.203Z'
---

## Description

Implementation order step 3. Behavior ownership: owns B-003 only. Implement the concrete `SourceAnalyzer` adapter using only the substrate allowed by the audit, keeping import/export analysis deterministic and behind the stable `ModuleSkeleton` contract. If the audit selected a runtime dependency, package metadata and lockfile changes belong here. Planned-behavior tests must carry `@cosmo-behavior plan:code-structure-map#B-003`.

<!-- AC:BEGIN -->
- [ ] #1 The analyzer adapter uses the audit-selected substrate and exposes module skeletons through the planned `SourceAnalyzer` contract without leaking substrate-specific types to generator callers.
- [ ] #2 B-003: fixture analysis distinguishes barrel-defined public interfaces from non-barrel exported declarations.
- [ ] #3 B-003: fixture analysis resolves relative imports and tsconfig `baseUrl`/`paths` aliases to internal module dependencies when they point at included source files.
- [ ] #4 B-003: fixture analysis records unresolved bare imports as external dependencies and does not misclassify aliased internal imports as external.
- [ ] #5 B-003: analyzer output contains the dependency information needed for downstream dependents derivation on module records.
- [ ] #6 Tests for B-003 carry the required `@cosmo-behavior plan:code-structure-map#B-003` marker.
- [ ] #7 Quality Contract: architecture-map core remains independent of CLI, Pi runtime/session APIs, domains/extensions, viewer, plans, tasks, and orchestration modules.
<!-- AC:END -->
