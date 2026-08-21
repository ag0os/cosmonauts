---
type: decision
title: Terminal evidence overrides stale running state
description: >-
  Run observation reconciles stale mutable records against authoritative
  terminal evidence before reporting a run as active.
resource: >-
  knowledge/orchestration-hardening/decision-terminal-evidence-overrides-stale-running-state-3e069d31eb89.md
tags:
  - events
  - orchestration
  - reconciliation
  - run-state
timestamp: '2026-06-24T17:36:55.354Z'
scope: project
kind: semantic
writer: coding/distiller
source: >-
  missions/archive/tasks/TASK-402 - Drive run status must reflect terminal
  events, not a stale record.md
date: '2026-06-24T17:36:55.354Z'
---
A run-status surface must not report `running` when the execution process is gone and durable event history ends in a terminal outcome. Persist terminal state when the terminal event is emitted, but retain read-time reconciliation for interrupted writes: status and list views should derive the same completed, aborted, or failed result from terminal evidence. This dual approach keeps ordinary reads cheap while making observation trustworthy after crashes or partial persistence.
