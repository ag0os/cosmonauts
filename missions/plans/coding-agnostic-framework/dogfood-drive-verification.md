# Dogfood Drive Verification

plan: coding-agnostic-framework
task: TASK-427

## B-020 Worker Resolution Proof

Marker: `@cosmo-behavior plan:coding-agnostic-framework#B-020`

Executable proof: `tests/driver/backends/cosmonauts-subagent-resolution.test.ts`

Verification command:

```bash
bun run test tests/driver/backends/cosmonauts-subagent-resolution.test.ts
```

The test loads the framework domains plus bundled `coding`, asserts `main` has no
`worker` agent, then runs the real `cosmonauts-subagent` Drive backend with its
default unqualified role and no `domainContext`. The backend calls the real
`createPiSpawner`; only the Pi session factory is mocked. The inspected session
factory input proves the final resolved qualified agent id is exactly
`coding/worker`, while the spawn config remains the requested unqualified
`worker`.

Runtime spawn-resolution observability was added at the existing spawner/Drive
activity seam after review-round:2 found that existing artifacts did not expose
the resolved agent id from a real run. The event is informational only and does
not change agent resolution behavior. The same test now asserts that Drive
activity records `requestedRole: "worker"` and `resolvedAgentId:
"coding/worker"`.

## B-021 Actual Dogfood Drive Smoke

Marker: `@cosmo-behavior plan:coding-agnostic-framework#B-021`

Command invocation run during TASK-427 (no `--envelope` argument, no
project-domain override in `.cosmonauts/config.json`):

```bash
./bin/cosmonauts run drive \
  --plan coding-agnostic-framework \
  --task-ids TASK-427 \
  --backend cosmonauts-subagent \
  --mode inline \
  --commit-policy no-commit \
  --state-commit-policy none \
  --overrides /tmp/cosmo-b021-overrides \
  --task-timeout 5000
```

Recorded smoke facts from the real plan-linked run:

- Run id: `run-c8424c9c-4db0-4261-b35e-680faf89aa2e`
- Task id: `TASK-427` (labels include `plan:coding-agnostic-framework`; this is
  not a test-local fixture id)
- Backend: `cosmonauts-subagent`
- Run mode: inline Drive
- Run-specific envelope input: omitted; the frozen spec resolved the framework
  default envelope
- Frozen framework default envelope path:
  `/Users/cosmos/Projects/cosmonauts/lib/prompts/framework/drive/envelope.md`
- Project domain override: none; `.cosmonauts/config.json` contains only skills
  and no `domain`
- Durable run/event evidence:
  - `missions/sessions/coding-agnostic-framework/runs/run-c8424c9c-4db0-4261-b35e-680faf89aa2e/spec.json`
    records `backendName: "cosmonauts-subagent"`, `taskIds: ["TASK-427"]`, and
    the frozen framework default `promptTemplate.envelopePath` above.
  - `missions/sessions/coding-agnostic-framework/runs/run-c8424c9c-4db0-4261-b35e-680faf89aa2e/events.jsonl`
    records:
    `{"type":"driver_activity",..."activity":{"kind":"agent_resolved","requestedRole":"worker","resolvedAgentId":"coding/worker"}}`.
  - `missions/sessions/coding-agnostic-framework/runs/run-c8424c9c-4db0-4261-b35e-680faf89aa2e/orchestration-events.jsonl`
    mirrors the same `agent_resolved` Drive activity for durable run inspection.

The bounded smoke intentionally used a short timeout and exited blocked after the
resolution event was durably recorded; TASK-427 was restored to `In Progress`
for this worker session afterward. The run's purpose was the B-021 spawn
resolution evidence, not completing the task through a nested worker.

B-020 seam coverage remains valid but is not counted as the actual B-021 smoke:
`tests/driver/backends/cosmonauts-subagent-resolution.test.ts` still exercises
the mocked Pi session factory boundary and now also verifies the minimal
resolved-agent Drive activity shape.

Prior non-satisfying evidence: the earlier
`run-69594351-1abe-4b89-9a99-cb80c68cd71a` codex run used an explicit legacy
compatibility envelope path under `bundled/coding/drivers/templates/envelope.md`,
and the TASK-426 `run-b021-cosmonauts-subagent-smoke` evidence used test-local
`TASK-001`. Neither is counted as B-021 evidence.

## Scope Exception Sign-off (B-021 `agent_resolved` runtime event)

The plan (plan.md:368 and plan.md:440) reserves human sign-off for adding a new
framework runtime event, because it introduces runtime behavior beyond Wave 1's
"defaults and fixtures, not runtime" scope. To satisfy B-021's requirement for
durable, real-run proof that an unqualified Drive `worker` resolves to
`coding/worker`, an `agent_resolved` event was added to
`lib/orchestration/{types,agent-spawner}.ts` and
`lib/driver/{types,backends/cosmonauts-subagent}.ts`.

Assessment: the change is minimal and side-effect-contained — listener errors
are swallowed, chain progress/durable-chain mappers ignore the event, and Drive
maps it only to informational `driver_activity`. Resolution logic is unchanged;
the event is purely observability. An independent `codex exec` review confirmed
B-020's mocked-seam test alone would not satisfy B-021's durable real-run bar.

Disposition: **ACCEPTED**. Human sign-off granted 2026-06-29. The exception is
in scope for this wave as the chosen B-021 evidence mechanism.
