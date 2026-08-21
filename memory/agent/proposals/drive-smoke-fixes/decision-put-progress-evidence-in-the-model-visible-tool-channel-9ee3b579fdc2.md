---
type: decision
title: Put progress evidence in the model-visible tool channel
description: >-
  Operational tools must render useful event evidence in the text seen by the
  model, not only in structured metadata.
resource: >-
  knowledge/drive-smoke-fixes/decision-put-progress-evidence-in-the-model-visible-tool-channel-9ee3b579fdc2.md
tags:
  - agent-interface
  - events
  - observability
  - tool-output
timestamp: '2026-05-12T20:55:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/drive-smoke-fixes/plan.md
date: '2026-05-12T20:55:00.000Z'
---
When a tool returns both model-visible text and structured details, do not assume the model receives the structured payload. Progress-watching output should include compact event summaries with decisive fields such as block reasons, activity summaries, verification status, and commit subjects. Preserve the structured details contract for programmatic consumers while enriching text for the decision-maker that actually sees it.
