# Notes: plan-vs-actual reads the Approach

## Choices the user has not settled

- **A Reuses entry vetoes by the same coverage as a Touches entry.** A Reuses directory (`lib/core/`) or glob keeps every Approach path beneath it unplanned, not only an exact match. Alternative: exact-only veto. Picked because Reuses means "do not change", and coverage keeps more files visible as unplanned, never fewer. Test: "keeps an Approach path unplanned when Reuses covers it" in `tests/lean-run/graph/plan-vs-actual.test.ts`.
- **Reuses entries go through `touchesPath` and normalization, like Touches.** A caller may pass a raw line ("`./lib/run.ts`: no change") and it still vetoes `lib/run.ts`. Alternative: normalization only, since `parsePlan` already yields bare paths. Picked so the two list options read their entries the same way. Same test.
- **Paths inside a fenced block in the Approach count.** `parsePlan` keeps the Approach whole and `requestPaths` reads the whole text, so a path in a code fence plans its file. Alternative: strip fences first, which would need new parsing code outside `requestPaths`' rule. Picked because R-1 says to read prose by `requestPaths`' rule unchanged. No test: it is today's `requestPaths` behavior.
- **`graph/plan-vs-actual.ts` imports `requestPaths` from `../plan.ts`.** It is the first value import from outside `graph/` in that folder. `plan.ts` imports only types, so there is no cycle. Alternative: a copy of the rule in `graph/`, which R-1 and the Scope rule out.

- **The Reuses veto reads each entry with `touchesPath` alone, not `normalizeRepoPaths`.** This removes the `?? []` default that left a surviving mutant. The one difference: an empty Reuses string would veto an absolute path the Approach names, where `normalizeRepoPaths` would have dropped it. `parsePlan` never yields an empty entry, so only a direct caller could see it. No test.

## Discoveries

- A URL normalizes to `https:/host/path`, so a test that a URL in the Approach plans nothing must list that form among the changed files; checking only `lib/a.ts` passes even when the URL is read as a path. Test: "does not read a URL in the Approach as a path" in `tests/lean-run/graph/plan-vs-actual.test.ts`.
