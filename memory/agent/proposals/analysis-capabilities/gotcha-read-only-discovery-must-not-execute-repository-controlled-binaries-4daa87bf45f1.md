---
type: gotcha
title: Read-only discovery must not execute repository-controlled binaries
description: >-
  Detecting a provider from files is not permission to spawn its project-local
  executable during session startup.
resource: >-
  knowledge/analysis-capabilities/gotcha-read-only-discovery-must-not-execute-repository-controlled-binaries-4daa87bf45f1.md
tags:
  - consent
  - discovery
  - security
  - subprocesses
timestamp: '2026-07-29T16:36:48.071Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/analysis-capabilities/plan.md
date: '2026-07-29T16:36:48.071Z'
---
Separate file-based detection from executable introspection. A repository-controlled binary must not run until explicit per-project execution consent has been recorded outside that repository; implicit trust in unrelated project resources is insufficient. Without consent, status should identify the detected provider and explain that execution is withheld, while spawning zero subprocesses. Shell-free invocation and read-only flags constrain a legitimate binary but do not make a replaced binary safe.
