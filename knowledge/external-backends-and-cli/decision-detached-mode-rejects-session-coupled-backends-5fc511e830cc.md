---
type: decision
title: Detached mode rejects session-coupled backends
description: >-
  Backends that depend on a live parent session are supported inline but
  rejected before detached setup begins.
resource: >-
  knowledge/external-backends-and-cli/decision-detached-mode-rejects-session-coupled-backends-5fc511e830cc.md
tags:
  - backend-capabilities
  - detached-execution
  - session-lifecycle
  - validation
timestamp: '2026-05-05T16:24:56.227Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/external-backends-and-cli/plan.md
date: '2026-05-05T16:24:56.227Z'
---
A backend is eligible for detached execution only when it can be reconstructed and operated independently of the initiating session. Reject session-coupled backends before creating a work directory or compiling a worker, and return a structured error directing callers to inline mode. Freezing session registries or in-process bus references into a detached binary creates orphaned activity and invalid lifecycle ownership.
