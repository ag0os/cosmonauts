---
type: convention
title: >-
  Never record a live verification before observing it, and probe with the call
  site's exact arguments
description: >-
  A coordinator record of a live check is written only after the observation is
  in the tool output, and a hand probe of a helper must pass what the production
  call site passes.
resource: >-
  knowledge/driver-hardening/convention-never-record-a-live-verification-before-observing-it-and-probe-with-the-call-site-s-exact-arguments-4fefdcb42d70.md
tags:
  - probes
  - records
  - verification
timestamp: '2026-09-30T00:00:00.000Z'
scope: project
kind: semantic
writer: claude-code/archivist
source: missions/archive/plans/driver-hardening/coordinator-status.md
date: '2026-09-30T00:00:00.000Z'
---
# Never record a live verification before observing it, and probe with the call site's exact arguments

Two false records were written and then corrected in driver-hardening. The first claimed a probe had deleted a retained snapshot ref; the claim was composed before the probe ran, and the probe retained the ref. The second probe retained the ref again, but only because it omitted the resolved task path that Drive passes as a new seventh argument, so the default exempted a file that does not exist.

The rule: read the production call site before probing a helper by hand and pass the same arguments; run the probe; then write the record from the output, quoting it. If the probe is polluted by your own edits since the observed state (a record file you changed after the snapshot), say so rather than re-interpreting the result. A record that says "verified live" is a claim about an observation, not about intent.
