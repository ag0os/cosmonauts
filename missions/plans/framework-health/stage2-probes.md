# Stage 2 probe record

Restores were from `cp` backups. Four environmental failures and the known
flakes are excluded from every count.

## Prose-blanking probe (B-006)

Mutation: the body of every shipped prompt, skill, capability and doc replaced
with one sentence, frontmatter kept. 129 files in round 1, 148 in round 2
(round 1's pathspec missed top-level `docs/*.md`).

| Round | At commit | Tests red | Disposition |
|---|---|---|---|
| 1 | `70b63df` | 20 | 14 prose or source-text pins deleted or loosened; 1 byte-pin removed (D-018); 5 kept |
| 2 | working tree before `282210a` | 14 | 9 prose pins deleted; 5 kept |

Kept red under blanking — structure a body legitimately carries:

| Test | Depends on |
|---|---|
| `tests/prompts/loader.test.ts` — loads runtime sub-agent template | `{{parentRole}}` template token |
| `tests/orchestration/agent-spawner.test.ts` — template loads | `{{parentRole}}` template token |
| `tests/domains/prompt-assembly.test.ts` — loads framework base/runtime | interpolated parent role |
| `tests/analysis/contracts.test.ts` — three tests | documented vocabulary tables compared with code constants |
| `tests/memory/interface.test.ts` — documents exactly the episode actions | documented action table compared with `EPISODE_ACTIONS` |

Round 1 also turned `tests/extensions/orchestration-driver-tool.test.ts`
(a driver end-to-end run) red by timeout; it did not recur in round 2 and was
not investigated.

## Structure-breaking probes (B-007)

| Mutant | File | Before | After `tests/skills/shipped-frontmatter.test.ts` |
|---|---|---|---|
| delete `description:` | `domains/shared/skills/plan/SKILL.md` | survived | killed |
| change the `name:` value | `bundled/coding/skills/tdd/SKILL.md` | survived | killed |
| delete the `name:` key | `bundled/coding/skills/tdd/SKILL.md` | not run | survived the first version of the test (discovery falls back to the directory name; found by review), killed after the test read the key itself |
| delete the `name:` key | `external-skills/cosmonauts/chains/SKILL.md` | not run | killed (first version did not cover `external-skills/`) |
| replace `{{objective}}` with text | `lib/prompts/framework/runtime/sub-agent.md` | killed (2 tests) | — |

## Not yet probed

D-008's sample stratified by directory over the rest of `tests/` has not been
run. This record covers only tests that read shipped markdown.

## Rulings

Human, 2026-09-21: the provider-neutrality guards stay; the documentation-table
tests listed above as kept were deleted (D-019). Three tests remain red under
blanking, all on the runtime template.
