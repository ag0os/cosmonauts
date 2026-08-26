---
id: TASK-604
title: Bind manifest output claims to registered asset directories
status: Done
priority: high
labels:
  - backend
  - security
  - testing
  - review-fix
  - 'review-round:1'
  - 'plan:harness-adapters'
dependencies: []
createdAt: '2026-08-26T12:30:22.729Z'
updatedAt: '2026-08-26T14:56:50.747Z'
---

## Description

Remediate security finding SR-002 against INV-002/D-009. Manifest parsing/classification currently accepts any outputPath under an owner root, allowing a forged matching-owner stale entry to nominate non-asset descendants such as settings or an entire skills directory for deletion. Validate each manifest key/owner/target/kind/output path against the registry adapter directory and strict direct-child asset shape before classification or transaction planning. Malformed claims must be nonzero and non-writing. Implement test-first; do not modify existing plan artifacts.

<!-- AC:BEGIN -->
- [ ] #1 A manifest entry outputPath must match the strict registered target/kind adapter directory and asset output identity before it can authorize any write.
- [ ] #2 Forged paths to owner-root settings, adapter directories themselves, nested escapes, or another asset are reported nonzero and remain byte-identical.
- [ ] #3 Manifest key, owner variant, target, scope, kind, and output-path identity are cross-validated rather than trusted independently.
- [ ] #4 Valid existing manifests and source-removal flows retain their behavior.
- [ ] #5 Security regressions and all project-native checks pass.
<!-- AC:END -->
