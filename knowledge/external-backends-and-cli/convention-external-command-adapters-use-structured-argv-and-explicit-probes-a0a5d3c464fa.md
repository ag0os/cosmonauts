---
type: convention
title: External command adapters use structured argv and explicit probes
description: >-
  Backend adapters invoke commands with argument arrays and declare
  backend-specific liveness probes that run before durable setup.
resource: >-
  knowledge/external-backends-and-cli/convention-external-command-adapters-use-structured-argv-and-explicit-probes-a0a5d3c464fa.md
tags:
  - argv
  - error-handling
  - external-cli
  - liveness
timestamp: '2026-05-05T16:24:56.227Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/external-backends-and-cli/plan.md
date: '2026-05-05T16:24:56.227Z'
---
External command adapters must pass executable and arguments as a structured array, never interpolate a shell command template. Each adapter declares an explicit liveness probe because generic version assumptions do not fit every CLI shape. Run the probe before creating a work directory or other durable state; failures should report the backend name, attempted argv, exit status, and stderr.
