# Cosmo as an Ambient Terminal Assistant (herdr-backed)

**Status:** Design / proposal. No code changes yet. **Blocked on a general agent-memory system (planned separately).**
**Branch:** `claude/herdr-repo-overview-9ruL6`

> **Consumer of the autonomy base (2026-06-12).** This is the herdr-backed
> *consumer* (W5) of the autonomy/always-on substrate — see
> `missions/architecture/autonomy.md` for the base (scheduling/lifecycle host,
> trust tiers, episodic log) it builds on. This doc remains the detailed herdr
> design; the generalized autonomy layer lives in the autonomy source of truth.

## Problem

`cosmo` (`domains/main/agents/cosmo.ts`) is today the cross-domain executive
assistant *inside* a Cosmonauts session. But the way the author actually works
is across a whole terminal: many tabs (one per project), each tab holding three
or four panes, with a mix of agents running side by side — Cosmonauts/Pi
sessions, Claude Code, Codex, plus plain shells (dev servers, tests, REPLs).

There is no assistant that sits *above* that terminal. Nothing watches the panes,
notices that the Codex session in project B is blocked waiting on input, sets up
the morning's layout, or launches "a Claude Code session in the cosmonauts repo
to analyze module X" on request. The human is the orchestrator of their own
terminal, and that orchestration is repetitive, manual, and invisible.

The motivating idea: **let `cosmo` run the terminal.** An always-on assistant
whose "body" is the terminal multiplexer, with read visibility into every agent
session and the authority to act — without changing how the human works with
Cosmonauts, Codex, or Claude Code inside any individual pane.

This is the far end of the spectrum AGENTS.md already names: *"always-on,
side-by-side pairing."* This document specifies that end.

## Background: herdr as the substrate

[herdr](https://github.com/ogulcancelik/herdr) is a Rust terminal multiplexer
("agent multiplexer that lives in your terminal") purpose-built for supervising
multiple AI coding agents. The properties that make it the right body for an
ambient `cosmo`:

- **It operates at the process/terminal layer** — the only layer that
  Cosmonauts/Pi, Claude Code, Codex, Grok, and Copilot CLI actually share. They
  have nothing in common at the SDK/event level, but they all render to a
  terminal and all expose a coarse "status." herdr is the lingua franca across
  heterogeneous agents precisely because it ignores their internals.
- **Agent state detection** — a sidebar surfaces each agent's status
  (`idle` / `working` / `blocked` / `done`) via foreground-process + terminal
  heuristics, with optional deeper integrations
  (`herdr integration install pi`, `… claude`, `… codex`, …) that forward
  *semantic* status over the socket. Cosmonauts/Pi, Claude Code, and Codex are
  all recognized, so status reads are reliable for our stack.
- **A local Unix-socket API** that lets a process *"create workspaces, split
  panes, spawn helpers, read output, and wait for state changes."* This is the
  control plane an agent drives.
- **Persistence** — a background server keeps panes alive across client
  detach/reattach; sessions can restore after restart.
- **A reference Pi extension already exists**:
  [`@ogulcancelik/pi-herdr`](https://github.com/ogulcancelik/pi-extensions/blob/main/packages/pi-herdr/README.md)
  registers a `herdr` tool for a Pi agent
  (`workspace_*`, `tab_*`, pane `list`/`split`/`run`/`read`/`watch`/`send`/`stop`,
  `wait_agent`, `focus`), with friendly aliases over ephemeral pane IDs. Because
  Cosmonauts agents *are* Pi sessions, this is close to a drop-in reference for
  what a Cosmonauts-native `herdr` capability would do.

### Socket primitives the assistant relies on

From herdr's agent skill (`SKILL.md`) and socket API:

| Concern | Command (shape) | Returns |
|---|---|---|
| Topology | `pane list`, `workspace list`, `tab list` | JSON of panes/workspaces/tabs (focused pane = "yours", others = neighbors) |
| Create | `pane split` → `result.pane.pane_id`; `workspace create` → `result.{workspace,tab,root_pane}`; `tab create` → `result.{tab,root_pane}` | JSON with new IDs |
| Read | `pane read <id> --source recent --lines N` | **rendered text** (not structured) |
| Wait (output) | `wait output <id> --match "…" --timeout <ms>` | JSON on match; exit 1 on timeout |
| Wait (status) | `wait agent-status <id> --status done --timeout <ms>` | JSON when a *recognized* agent reaches a status |
| Act | `run` (submit command), `send` (raw input), `focus`, `stop` (close) | JSON |

**Constraint:** IDs are *not durable* — they compact when panes close. The
assistant must re-read IDs from `*-list` / create responses, and should carry a
durable **alias → pane** mapping of its own (e.g. `cosmo`, `codex-api`,
`dev-server`, `tests`). The `pi-herdr` extension already models aliases; a
Cosmonauts-native capability should too.

## Vision

`cosmo`'s identity expands from **executive over Cosmonauts domains** to
**executive over the machine.** Its existing cross-domain job becomes a subset.
Concretely, an ambient `cosmo`:

- **Sets up** — "open my three projects" → creates workspaces/tabs/panes and
  launches the agents the user wants in them.
- **Watches** — knows the whole topology and uses herdr's blocking waits as its
  event loop; when an agent goes `blocked`/`done` or emits an expected line, it
  reads that pane.
- **Routes attention** — "Codex in *api* is blocked on a prompt; Claude in *web*
  finished the refactor" — then `focus`es the human to exactly the right pane.
- **Acts** (see Autonomy) — relaunch a dead dev server, rerun tests, answer a
  blocked prompt, run a saved routine — from day one.

Crucially this is **non-invasive**: the agents in each pane don't know `cosmo`
exists. `cosmo` observes their rendered output + status and manages the
container. For an ambient supervisor, coarse fidelity (status + rendered text) is
not a compromise — it is exactly what a human watching the panes also has.

## Goals

1. **Ambient supervision of the whole terminal** — topology awareness, per-pane
   status, attention routing — across Cosmonauts, Claude Code, Codex, and plain
   shells.
2. **Autonomous action from day one**, with a trust model that makes "it acts on
   its own" safe rather than spooky (tiered actions + an audit trail).
3. **Non-invasive** — zero change to how the human uses any individual agent
   inside a pane.
4. **Learns the user's workflows over time** — saves and replays personal
   routines ("playbooks"), e.g. *"set up a Claude Code session in the cosmonauts
   repo and ask it to analyze module X."* (This is the part that depends on the
   memory system — see below.)
5. **Pi-First** — prefer a Cosmonauts capability/skill over custom plumbing;
   reuse `pi-herdr` patterns; treat herdr as an optional external tool the user
   installs, not a bundled dependency.

## Non-Goals

- **Cross-machine orchestration.** herdr is a single-host, Unix-socket,
  Linux/macOS multiplexer. This design coordinates agents on *one* machine. A
  cross-host fabric is explicitly out of scope.
- **Replacing Cosmonauts' own orchestration.** Chains, Drive, fan-out, and the
  structured event bus (`ChainEvent`/`SpawnEvent`) remain the source of truth for
  *Cosmonauts-internal* multi-agent logic. herdr is the *view + process +
  cross-framework* layer, not a second brain. Internal Cosmonauts coordination
  must NOT be downgraded to scraping rendered panes.
- **A structured cross-framework event protocol.** Foreign agents (Codex, Claude
  Code) are coordinated on *status* + *result artifacts on disk*, not a shared
  event stream.
- **Building the memory system itself.** This document *depends on* a general
  agent-memory system; that system is a separate effort, planned in its own
  session (see "Dependency").
- **Bundling/redistributing herdr.** herdr is AGPL-3.0 / commercial dual-licensed.
  Treating it as a user-installed external tool (we shell out to its CLI / socket)
  sidesteps licensing entanglement and matches the Pi-First "depend on / adapt"
  posture. `cosmo` should degrade gracefully when no herdr socket is present.

## Proposed Design

### 1. A `herdr` capability (the body)

A new Cosmonauts capability that wraps the herdr socket, loaded by `cosmo`. It
exposes two families of tool actions:

- **Observe** (read-only): `topology` (pane/workspace/tab list), `read <pane>`,
  `wait_output`, `wait_status`.
- **Act**: `workspace_create` / `tab_create` / `pane_split`, `run`, `send`,
  `focus`, `stop`.

It maintains the durable **alias → pane-id** map (re-resolved against live
`*-list` output, since IDs are ephemeral). It detects the presence of a herdr
socket and is a no-op/disabled when herdr isn't running. Where practical it
should reuse `pi-herdr`'s action surface and aliasing rather than reinvent it,
and compose with the existing spawn surface
(`domains/shared/extensions/orchestration/spawn-tool.ts`) rather than create a
competing spawn path.

### 2. Autonomy model (act from day one, safely)

Autonomy is made trustworthy not by asking permission for everything (rejected),
but by **tiering actions** and **keeping a record**:

| Tier | Examples | Behavior |
|---|---|---|
| **Auto** (reversible, low-stakes) | layout (create/split panes), launch sessions, `focus`, rerun tests, read panes | act silently |
| **Act-then-announce** | answer a blocked prompt, `send` input, `stop` a pane | act, then report what was done so the human can catch it |
| **Reserved** (irreversible) | `git push`, `rm`, confirming a destructive prompt another agent is showing | pause even when autonomous — surface and wait |

This is enforced in the capability/prompt, and backed by an **episodic log**:
`cosmo` records every action it takes. The log is the thing that makes
autonomous action feel safe (full audit trail) — and it doubles as the raw
material the memory system learns playbooks from.

### 3. Control loop: waits, not polling

`cosmo` must not busy-poll `pane read` (cost + noise). The efficient pattern uses
herdr's blocking waits as an event loop: `wait agent-status <pane> --status
blocked|done` and `wait output <pane> --match …` as triggers, reading a pane only
on a transition or on explicit user request. `wait agent-status` only fires for
*recognized* agents, so the relevant herdr integrations
(`pi`, `claude`, `codex`) should be installed for semantic status.

### 4. Supervision surface

`cosmo` runs in a dedicated "mission control" pane the human can talk to. From
there it manages the surrounding panes/tabs and `focus`es the human to whatever
needs attention. Persistence is inherited from herdr's background server: detach
the client, agents (and `cosmo`'s supervision) keep running; reattach later.

### 5. Foreign-agent results: artifacts over scraping

For anything beyond coarse status, reading rendered panes is brittle. Where a
routine needs an agent's *output* (e.g. "analyze module X" → a written analysis),
the playbook should instruct the foreign agent to **write a result artifact to a
known path**, which `cosmo` then reads — rather than scraping the rendered TUI.
`pane read` remains the fallback, not the contract.

## Dependency: a general agent-memory system

The supervision/autonomy layer above is buildable on herdr alone. **The part that
makes `cosmo` genuinely *useful and personal* — learning and replaying the user's
workflows — is blocked on a memory system that Cosmonauts does not yet have.**

Per the author's framing, this memory system is **not just for `cosmo`** — it is a
general capability **for all Cosmonauts agents**, and it will be **planned and
built in a separate session.** This document only states the dependency and the
shape `cosmo` needs from it.

### How this relates to the memory Cosmonauts already has

Cosmonauts already has a *memory* directory and roadmap items
(`architecture-of-record`, `embedding-memory`, `memory/<slug>.knowledge.jsonl`).
But that is **code/architecture knowledge distilled from completed plans** — what
the *codebase* is and why. What `cosmo`-as-assistant needs is a different axis:
**operational / personal memory** — what the *user* does and how they like to
work. The separate memory effort should decide whether these are one substrate
with multiple record types or sibling systems; this design assumes at minimum a
new operational/personal layer, ideally on a shared substrate.

### What `cosmo` needs from it (three layers)

1. **Profile** — stable facts: the user's projects, layout conventions, git
   habits, and "interrupt me when…" rules.
2. **Playbooks (routines)** — *parameterized*, replayable action sequences. The
   canonical example: `analyze-module` = open repo `X`, launch a Claude Code
   pane, prompt `"analyze {module}"`, collect the result artifact. Named,
   invocable, editable.
3. **Episodic log** — what `cosmo` actually did (also the autonomy audit trail),
   and the source data from which playbooks are learned.

### Properties the memory system must provide

- **Self-authored, but human-legible and editable.** `cosmo` writes its own
  memory files; they should be markdown (+ frontmatter for playbook params —
  `gray-matter` is already a dependency) so the human can read, correct, and
  prune them. `cosmo`'s memory is *proposed truth the user can override*, not
  silently-mutated state.
- **Explicit-save before implicit-learning.** v1: after the user does a thing,
  `cosmo` proposes *"save that as a playbook?"* and the user confirms. Auto-mining
  recurring patterns from the episodic log is a valuable v2 but is noisy and
  presumptuous as a starting point.
- **User-scoped storage, not repo-scoped.** This is the most structural
  consequence of `cosmo` becoming a *machine* assistant: its memory spans every
  project and is personal, so it cannot live in any single repo's tracked
  `memory/`. A user-level store (e.g. `~/.cosmonauts/`) is the likely home. The
  separate memory plan owns this decision; it is flagged here because it directly
  shapes whether this `cosmo` feature is possible.
- **Memory hygiene** — consolidation/pruning, not unbounded append (especially
  the episodic log).

### Pi-First audit note for the memory effort

Before building, audit whether Pi's session-state / `pi.appendEntry()` or any
pi-skills cover cross-session, user-scoped durable memory. The likely answer for
the personal/operational layer is a thin markdown-file store read by a skill
(consistent with how Cosmonauts already does skills + `memory/`), but this must be
confirmed during the memory session, not assumed.

## Sequencing

Phased, with the memory dependency gating the high-value half:

1. **Read-only mirror (no memory needed).** `cosmo` gains the herdr capability in
   *observe* mode: topology awareness, `read`, `wait_status`/`wait_output`,
   attention routing via `focus`. Proves the socket integration and status
   semantics with zero blast radius.
2. **Autonomous action (no memory needed).** Add the *act* tier with the
   tiering model + episodic log (the log can start as a flat append file even
   before the full memory system exists). `cosmo` can now set up layouts, launch
   sessions, answer blocked prompts, rerun tests.
3. **Playbooks + profile (BLOCKED on the memory system).** Once the general
   agent-memory system lands, layer in profile + parameterized playbooks +
   the explicit "save that as a playbook?" learning loop. This is where `cosmo`
   becomes the *intelligent* assistant rather than a scriptable tmux.

Phases 1–2 are independently shippable and de-risk the herdr integration; phase 3
is the payoff and explicitly waits on the separately-planned memory work.

## Open Questions / Decisions

- **One memory substrate or two?** Does operational/personal memory share a store
  with code-knowledge memory (`architecture-of-record`/`embedding-memory`), or is
  it a sibling? — *Owned by the separate memory plan.*
- **Exact user-scoped location & format** (`~/.cosmonauts/` layout). — *Memory plan.*
- **Cosmonauts-native `herdr` capability vs. depend on `@ogulcancelik/pi-herdr`
  directly** — reuse vs. control vs. licensing/coupling. Decide at plan time.
- **Naming:** these personal **playbooks** are deliberately *not* Cosmonauts'
  "Named Workflows" (which are agent *build* chains, `planner → coordinator → …`).
  Keep the term **playbook** to avoid a collision — as we already separated this
  "assistant" role from the chain `coordinator` role.
- **How much of the reserved tier is hard-blocked vs. confirm-and-proceed** under
  full autonomy.

## References

- herdr — <https://github.com/ogulcancelik/herdr> (repo), `SKILL.md`, Socket API (`herdr.dev/docs/socket-api/`)
- `pi-herdr` Pi extension — <https://github.com/ogulcancelik/pi-extensions/blob/main/packages/pi-herdr/README.md>
- AGENTS.md — "always-on, side-by-side pairing" spectrum; Pi-First principle
- `docs/orchestration.md` — chains, Drive, event bus (the internal layer this does *not* replace)
- ROADMAP.md — `architecture-of-record`, `embedding-memory` (the *code-knowledge* memory, distinct from this operational memory)
