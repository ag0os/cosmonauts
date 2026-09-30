---
type: decision
title: 'The task notes boundary is structural, never a re-scan'
description: >-
  Note preservation splices only the span the serializer reports for
  Implementation Notes and closes any open fence at that boundary; three rounds
  of heading-scan heuristics each lost data silently.
resource: >-
  knowledge/driver-hardening/decision-the-task-notes-boundary-is-structural-never-a-re-scan-3276942349ef.md
tags:
  - D-040
  - notes
  - serializer
  - tasks
timestamp: '2026-09-30T00:00:00.000Z'
scope: project
kind: semantic
writer: claude-code/archivist
source: missions/archive/plans/driver-hardening/plan.md
date: '2026-09-30T00:00:00.000Z'
---
# The task notes boundary is structural, never a re-scan

Three review rounds in a row found a silent-loss case in the same place: the note editor located the canonical Implementation Notes span by scanning the serialized task text for the next recognized heading. Each fix (F1 shared heading grammar, D-039 fence-aware grammar) closed one trigger and opened or exposed another: an indented heading, an unclosed fence swallowing a following section, and untitled preamble text that no scan can find because it is not a heading.

D-040 changed the rule instead of the scan. `serializeTaskLayout` returns the serialized text together with the exact span of the notes section (heading to where rawContent was placed). `preserveTaskNotes` splices only that span. When anything follows the notes, the preserved section ends with a closing fence line if its notes are inside an open fence, plus a blank line, so the fence-aware parser cannot run past it.

Verification standard that finally caught it: not parse parity (old and new parser agreed on all 781 task files) but an update round trip through the real TaskManager, one status update per file, comparing bytes. A parse-only check cannot see an update-path defect.
