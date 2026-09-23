---
id: TASK-719
title: 'Stage 8: preservation walk and slice closure'
status: To Do
priority: high
labels:
  - 'plan:execution-liveness'
  - testing
dependencies:
  - TASK-718
createdAt: '2026-09-23T13:13:13.833Z'
updatedAt: '2026-09-23T13:13:13.833Z'
---

## Description

Execution-liveness Implementation Order stage 8; owns B-012. Walk AC-001..AC-013 and AC-018 through the supported Chain/Drive modes and backends, including every case listed in the Implementation Order stage 8 paragraph. Confirm AC-014..AC-017 remain follow-ups and no AC-015 delivery change landed early. Every review-7 finding carried under D-041 must be closed, with a pointer to its evidence. The plan is not marked completed until H-004's approved amendment is applied.

<!-- AC:BEGIN -->
- [ ] #1 B-012: Chain summaries keep 200 characters, spawn depth/concurrency rejection is unchanged, unrelated Drive policy is unchanged, and coordinator/harness selection stays neutral. Git signing and commit hooks stay effective, excluded tracked paths survive, and unrelated real-index staging is neither committed nor destroyed.
- [ ] #2 Each of review-7 PR-001, PR-002, PR-003, PR-004, PR-005, PR-007 and its Missing Coverage items has a recorded disposition pointing to the test or commit that closed it, or a raised deviation.
- [ ] #3 AC-014..AC-017 are unimplemented, and spawn waiter delivery (AC-015) is unchanged from the base commit.
- [ ] #4 The plan stays active until H-004's approved D-007 amendment (review-7 PR-006) is applied to missions/architecture/orchestration-future.md.
- [ ] #5 check-artifacts, lint, typecheck and the full suite pass.
<!-- AC:END -->
