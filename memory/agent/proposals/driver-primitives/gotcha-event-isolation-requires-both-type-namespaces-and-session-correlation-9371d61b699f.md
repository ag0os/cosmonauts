---
type: gotcha
title: Event isolation requires both type namespaces and session correlation
description: >-
  Distinct payload families must not share a bus type, and every forwarded event
  must be scoped to its initiating session.
resource: >-
  knowledge/driver-primitives/gotcha-event-isolation-requires-both-type-namespaces-and-session-correlation-9371d61b699f.md
tags:
  - driver
  - event-bus
  - isolation
  - session-scoping
timestamp: '2026-08-21T14:42:04.297Z'
scope: project
kind: semantic
writer: coding/distiller
source: >-
  missions/archive/sessions/driver-primitives/coordinator-4ee7c9e8-ab41-4d08-a25b-8d585efd0a6c.transcript.md
date: '2026-08-21T14:42:04.297Z'
---
A shared activity bus can silently cross-trigger subscribers when two event families reuse a type name but expect different payload shapes. Give each family distinct bus types, carry the initiating session identifier on every event, and filter at the bridge before enqueueing messages. Test both directions of type isolation and two concurrent sessions; validating only the happy subscriber does not catch leakage.
