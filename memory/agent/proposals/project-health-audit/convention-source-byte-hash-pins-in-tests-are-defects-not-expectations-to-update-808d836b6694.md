---
type: convention
title: "Source-byte hash pins in tests are defects, not expectations to update"
description: "The human ruled that a test asserting the SHA-256 of a lib source file must be deleted, never re-pinned, because it forbids any refactor."
resource: knowledge/project-health-audit/convention-source-byte-hash-pins-in-tests-are-defects-not-expectations-to-update-808d836b6694.md
tags:
  - pins
  - rulings
  - testing
timestamp: '2026-09-29T00:00:00.000Z'
scope: project
kind: semantic
writer: claude-code/archivist
source: missions/archive/plans/project-health-audit/plan.md
date: '2026-09-29T00:00:00.000Z'
---
During the audit a clone extraction changed lib/architecture-map/retrieval.ts and a test in tests/memory/interface.test.ts failed because it pinned the SHA-256 of that file's bytes. The first proposal was to update the literal narrowly; the human overruled it ("such a test shouldn't exist... unacceptable") and ruled Q-009: remove the source-hash assertions and keep the behavioral toContain checks. Under INV-002 the pin itself is the defect being removed, so deleting it is a permitted expectation change citing the ruling. Hashes of fixtures and produced artifacts are fine; hashes of shipped source are not.
