---
title: 'Orchestration consolidation: unified backend, capsule abstraction, agent-led Drive'
status: superseded
createdAt: '2026-05-19T00:00:00.000Z'
updatedAt: '2026-06-03T00:00:00.000Z'
---

> **Superseded by the durable orchestration runtime track.** This plan pursued
> the same goal — one engine with chains and Drive as frontends — through a
> per-invocation "capsule" primitive. The authoritative delivery shape is now
> `missions/architecture/durable-orchestration-runtime.md` and its four child
> plans (`durable-run-store-events`, `durable-backend-step-model`,
> `durable-graph-scheduler`, `durable-frontend-migration`), which reach the same
> outcome through a `RunRecord`/`StepRecord` graph, `OrchestrationBackend`
> adapters, and a durable scheduler. The distinct flexibility ideas worth
> keeping — single-adapter backend extensibility and per-step backend selection
> — are folded into that record's Core Contracts. This document and its `spec.md`
> are retained as historical exploration; do not start tasks from them.

## Summary

Merge chains and Drive onto a single agent-execution engine built around a **capsule** abstraction — a per-invocation wrapper that owns prompt scaffolding, completion-signal detection, looping, invariants (commit policy, preflight, postflight), event logging, and run-state files. Backend wrappers (cosmonauts-internal, codex, claude-cli, future kinds) sit beneath the capsule and are interchangeable. Chains become programmatic compositions of capsule invocations; Drive becomes the configured capsule for "a coordinator agent driving a plan." This plan is spec-ready and awaits planner design.

## Scope

Architecture-level consolidation of the orchestration stack: define the capsule and backend-wrapper boundaries, unify loop semantics, generalize Drive's invariants and run-state files into capsule features, and migrate chains onto the unified engine. Concrete coordinator agent definitions, a tmux backend, packaged coordinator binaries, TUI improvements for heterogeneous backend streams, and cross-backend session lineage are tracked as follow-up plans.
