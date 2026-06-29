# Dogfood Drive Verification

plan: coding-agnostic-framework
task: TASK-426

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

No runtime spawn-resolution event was added. Existing inspectable test evidence
proves the resolved agent identity, so no human sign-off scope exception was
invoked.

## B-021 Bounded Smoke Evidence

Marker: `@cosmo-behavior plan:coding-agnostic-framework#B-021`

Satisfying executable smoke:
`tests/driver/backends/cosmonauts-subagent-resolution.test.ts` > `runs inline Drive with cosmonauts-subagent, omitted envelope input, and no domain override`

Verification command run during TASK-426:

```bash
bun run test tests/driver/backends/cosmonauts-subagent-resolution.test.ts
```

Recorded smoke facts from the executable test:

- Run id: `run-b021-cosmonauts-subagent-smoke`
- Task id: `TASK-001` in the test-local task project created for the smoke
- Backend: `cosmonauts-subagent`
- Run mode: inline Drive via `runInline(...)`
- Run-specific envelope input: omitted before spec freezing; the test calls the
  framework default resolver and snapshots that path/content into the frozen
  `DriverRunSpec`
- Frozen framework default envelope path:
  `/Users/cosmos/Projects/cosmonauts/lib/prompts/framework/drive/envelope.md`
- Project domain override: none; the inspected spawn config has
  `domainContext: undefined`
- Resolved-agent proof: the inspected `createAgentSessionFromDefinition(...)`
  input has resolved definition `domain: "coding"`, `id: "worker"`; the test
  asserts the qualified id is `coding/worker`
- Event proof: the smoke reads the generated `events.jsonl` and asserts it
  contains backend `cosmonauts-subagent` and the smoke task id

Prior non-satisfying evidence: the earlier
`run-69594351-1abe-4b89-9a99-cb80c68cd71a` codex run used an explicit legacy
compatibility envelope path under `bundled/coding/drivers/templates/envelope.md`.
It is not counted as B-021 evidence.
