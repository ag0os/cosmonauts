---
type: gotcha
title: Mocked compiler tests can miss generated-entry failures
description: >-
  Verifying compiler argv and generated text through a mocked process boundary
  does not prove that the generated entry is accepted by the real compiler.
resource: >-
  knowledge/external-agent-orchestration/gotcha-mocked-compiler-tests-can-miss-generated-entry-failures-363a54d47115.md
tags:
  - compiler
  - generated-code
  - integration
  - testing
timestamp: '2026-05-12T01:48:43.990Z'
scope: project
kind: semantic
writer: coding/distiller
source: >-
  missions/archive/sessions/external-agent-orchestration/reviewer-39c97aa6-3884-4855-a56f-b1f9b362894f.transcript.md
date: '2026-05-12T01:48:43.990Z'
---
Add at least one end-to-end smoke test that generates an entry and invokes the actual supported compiler or bundler. Unit tests should still inject the process boundary to verify arguments and failure handling, but they cannot validate module-specifier resolution, generated-source syntax, or compiler-specific behavior. A generated entry can look correct and pass mocked tests while every real export fails to compile.
