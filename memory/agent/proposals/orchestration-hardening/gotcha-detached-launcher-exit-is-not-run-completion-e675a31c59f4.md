---
type: gotcha
title: Detached launcher exit is not run completion
description: >-
  Detached execution must explicitly separate successful launch from eventual
  run termination in output and documentation.
resource: >-
  knowledge/orchestration-hardening/gotcha-detached-launcher-exit-is-not-run-completion-e675a31c59f4.md
tags:
  - cli
  - detached
  - observability
  - orchestration
timestamp: '2026-06-24T17:54:07.204Z'
scope: project
kind: semantic
writer: coding/distiller
source: >-
  missions/archive/tasks/TASK-405 - Clean up detached Drive launcher output and
  the spurious --mode flag warning.md
date: '2026-06-24T17:54:07.204Z'
---
Returning from a detached launcher proves only that background execution was started, not that the run succeeded or even finished. Print the durable run identity and an exact observation command at launch, and describe this distinction in help text. Flag-processing layers must also recognize command-local options before warning about unsupported global flags, or valid detached invocations can appear erroneous.
