---
title: 'Orchestration consolidation: unified backend, capsule abstraction, agent-led Drive'
status: active
createdAt: '2026-05-19T00:00:00.000Z'
updatedAt: '2026-05-19T01:00:00.000Z'
---

## Summary

Merge chains and Drive onto a single agent-execution engine built around a **capsule** abstraction — a per-invocation wrapper that owns prompt scaffolding, completion-signal detection, looping, invariants (commit policy, preflight, postflight), event logging, and run-state files. Backend wrappers (cosmonauts-internal, codex, claude-cli, future kinds) sit beneath the capsule and are interchangeable. Chains become programmatic compositions of capsule invocations; Drive becomes the configured capsule for "a coordinator agent driving a plan." This plan is spec-ready and awaits planner design.

## Scope

Architecture-level consolidation of the orchestration stack: define the capsule and backend-wrapper boundaries, unify loop semantics, generalize Drive's invariants and run-state files into capsule features, and migrate chains onto the unified engine. Concrete coordinator agent definitions, a tmux backend, packaged coordinator binaries, TUI improvements for heterogeneous backend streams, and cross-backend session lineage are tracked as follow-up plans.
