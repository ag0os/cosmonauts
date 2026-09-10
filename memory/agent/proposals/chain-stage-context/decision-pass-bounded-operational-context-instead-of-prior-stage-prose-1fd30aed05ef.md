---
type: decision
title: Pass bounded operational context instead of prior-stage prose
description: >-
  Later stages receive only machine-derived purpose and target identity while
  the original user request remains injected at the first stage.
resource: >-
  knowledge/chain-stage-context/decision-pass-bounded-operational-context-instead-of-prior-stage-prose-1fd30aed05ef.md
tags:
  - context
  - durable-runtime
  - orchestration
  - prompts
timestamp: '2026-09-10T00:00:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/chain-stage-context/plan.md
date: '2026-09-10T00:00:00.000Z'
---
Keep the initial request at the first executable stage and do not forward arbitrary prior-stage output. Filesystem artifacts remain the substantive context channel; later stages receive only a bounded instruction describing their operational purpose and, when review binds one, the plan slug and round they must act on. Resolve dynamic target context at stage start rather than compile time because a reviewer may establish the target after the chain graph is compiled. Use one shared composer in inline and durable paths so absent context preserves byte-identical prompts.
