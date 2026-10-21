# Notes: lean CLI flags

## Choices the plan left open

- **How `runtimeBackends` learns the reviewer kind and the billing opt-in.** Alternatives: a third optional `choices` argument on `CreateLeanBackends`; calling the two-argument form twice from the CLI; a new factory. Picked the optional third argument (`LeanBackendChoices { reviewerKind?, allowApiBilling? }`): one runtime is built for both roles, and the tools' `createBackends(kind, cwd)` call and every existing double still type-check and behave as before.
- **How a plan/request refusal leaves the CLI.** Alternatives: throw inside `withRun` (JSON line under `--json`, an uncaught throw otherwise, as a failing run does); or commander's `command.error()`. Picked `command.error()`: the refusal is a usage error like a bad `--backend`, so it takes the same route (one JSON line under `--json`, plain stderr otherwise, exit 1) and happens before any backend is built.
- **Wording of the refusals.** The tool's messages name `planPath`; the CLI keeps the tool's rules and sentence shapes but names the flags: "lean build takes --plan or --request, not both", "lean build needs --plan or a non-empty --request", "lean review takes --plan or --request, not both". A blank request shares the "neither" message, as in the tool. No `error:` prefix, matching the tool's text rather than commander's.
- **A blank `--request` on review.** The plan only says review refuses it with `--plan`. Mirrored the tool: blank text is dropped and the review runs with no context; `--plan` with any `--request`, even blank, is refused.
- **Where `--allow-api-billing` lives.** On both build and review through the shared `runCommand`, since a review's claude-cli reviewer bills the same way.
- **`--reviewer-backend` has no default.** Commander shows no default in help; the description says it defaults to `--backend`.
- **Hand-off line.** The skill's command line gains `--reviewer-backend` and `--allow-api-billing`, and one short paragraph explains them and the `--request` alternative, since the skill hands off a plan rather than a request.

## Discoveries

- Commander routes `command.error()` through the program's `configureOutput.outputError`, so the JSON error hook covers the new refusals with no extra code (`lean build` "refuses --plan with --request, and neither, before any run" and "refuses neither --plan nor --request on stderr without --json").
- `jsonFlagGiven` already treats `--request <text>` as taking a value, so `--request --json` reads `--json` as the request text and a commander error stays on stderr (`lean build` "reads --json after --request as the request text, so a commander error stays on stderr").
- `createClaudeCliInvocation` reads `allowApiBilling` but nothing on the lean path set it, so lean claude-cli sessions always dropped the key (`createExternalBuilderBackend` "passes ANTHROPIC_API_KEY to claude only with allowApiBilling: true/false" in `tests/lean-run/backends.test.ts`).
- A review run never uses a builder, so `lean review --backend` is the reviewer's kind and needs no `--reviewer-backend` (`lean review` "defaults the reviewer backend to pi").

None of the Contract tests looked wrong; none were edited.
