---
id: TASK-501
title: Review fix — validate fallback completion authority
status: To Do
priority: medium
labels:
  - review-fix
  - 'review-round:1'
  - backend
  - testing
  - 'plan:episodic-log-detached-hardening'
dependencies: []
createdAt: '2026-07-22T22:05:32.285Z'
updatedAt: '2026-07-22T22:05:32.285Z'
---

## Description

Round-1 remediation for SR-004. Narrowly validate persisted run.completion.json before it suppresses a fallback result: require a valid DriverResult shape, exact matching runId, valid terminal outcome fields, and exact completedAt timestamp for stamped authority. Invalid/mismatched content must not let child-controlled bytes replace the parent/CLI/tool fallback, while preserving current valid bytes and D-001 ownership. Avoid widening schemas or unrelated parsers.

<!-- AC:BEGIN -->
- [ ] #1 A stamped completion suppresses fallback only when it is a valid DriverResult for the same run id.
- [ ] #2 Malformed, wrong-run, invalid-outcome, and invalid-timestamp completion JSON cannot become authoritative terminal data.
- [ ] #3 Valid current completion bytes remain untouched and existing CLI/tool/abort behavior stays compatible.
- [ ] #4 No MemoryStore/config-loader/episode-serializer schema surface widens.
- [ ] #5 Focused/full verification stays green.
<!-- AC:END -->
