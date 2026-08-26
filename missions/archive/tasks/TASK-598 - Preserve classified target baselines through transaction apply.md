---
id: TASK-598
title: Preserve classified target baselines through transaction apply
status: Done
priority: high
labels:
  - backend
  - testing
  - review-fix
  - 'review-round:1'
  - 'plan:harness-adapters'
dependencies: []
createdAt: '2026-08-26T12:26:21.085Z'
updatedAt: '2026-08-26T13:28:10.743Z'
---

## Description

Remediate general-review finding F-001 against INV-002/AC-003. After lock-held classification, apply currently rereads targets and treats whatever bytes now exist as the authorized oldState. A user/harness change between classification and apply can therefore be backed up, overwritten, and deleted on commit. Carry the expected classified snapshot/provenance into apply and revalidate immediately before journaling; changed targets must become non-writing local-edit conflicts. Implement test-first and do not modify existing plan artifacts.

<!-- AC:BEGIN -->
- [x] #1 A managed target edited after lock-held classification but before apply remains byte/type/link-identical and produces a nonzero locally-edited result.
- [x] #2 A target created after being classified missing is preserved and reported as a conflict rather than adopted as transaction baseline.
- [x] #3 Source-removal apply aborts without target or manifest writes when the target changes after classification.
- [x] #4 Mutation tests cover create, replace, and source-removal actions at the classification-to-apply boundary.
- [x] #5 All existing harness-adapter and project-native checks remain green.
<!-- AC:END -->
