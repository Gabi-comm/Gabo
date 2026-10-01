# Token budget: recommended defaults per agent

Why each agent runs on the model, effort, tools, turn cap and output length it does. The code is
`src/harness/budget.ts`, and you can change it in Settings → Agents. For the research and the full plan,
see [plan-token-reduction.md](plan-token-reduction.md).

## The problem

With no settings, every agent inherited the lead's model (Opus, from `~/.claude/settings.json`) and effort, had every tool,
and could run without a turn limit. On top of that, every room forced a Caveman subagent on every message. Claude Code's
own report put **95% of usage in subagent-heavy sessions**. Each subagent pays about 25k tokens before it reads its brief
(system prompt, tool schemas, role), so every agent call has to be worth that much.

## The rule behind the defaults

**Opus for the calls that decide the result, Sonnet for the work, Haiku for formatting. Call an agent only when it adds
something the lead can't.**

- *Model routing.* Subagents inherit the main model unless their definition sets one. Routing routine work to
  Sonnet or Haiku saves about 80% per call, and quality drops only where the task really needs deeper reasoning
  (sources: Agent SDK subagent docs; MindStudio; Medium "subagent model routing").
- *Effort* controls thinking tokens, and those count as output. Medium is enough for argued, well-scoped roles.
  High is kept for the one ruling where a wrong call wastes the whole run.
- *Fewer agents, used on purpose.* AgentSlimming cut multi-agent tokens by up to 78.9% with no loss in accuracy (sometimes
  a gain). Triage in Home does the same: it answers directly, or calls an agent only when needed. Workspace rooms use the team on every prompt (Gab's choice, 2026-10-01), but with short, quoted hand-offs instead of whole conversations.
- *Tool pruning.* Roles that only think don't need Bash, Edit or MCP. Blocking those tools stops costly detours
  (reading files, shell runs) and keeps the role on its job.
- *Output budgets and short hand-offs.* In multi-agent systems, input is the biggest cost: agents re-read each other's
  outputs. Capping what each agent returns, and passing a brief rather than the whole conversation, cuts the 54%
  "communication tax" (arXiv 2608.17188).
- *Skills by name, not preloaded.* `AgentDefinition.skills` pastes a whole SKILL.md into the agent. Gabo now lists
  the scout's picks by name, and the agent loads one with the Skill tool only when it needs it (progressive disclosure).

## Per-agent defaults (Balanced mode)

| Agent | Model | Effort | Tools | Max turns | Output | Why |
| --- | --- | --- | --- | --- | --- | --- |
| Judge | **Opus** | high | think | 3 | 200 words | The final BUILD / FIX / KILL call is where quality matters most, so it gets one short, deep Opus pass. |
| Coder | **Opus** | medium | build | 30 | 300 | Correct code avoids re-runs, which cost more than the Opus premium. |
| Emperor | **Opus** | medium | build | 40 | 250 | Frames the challenge and runs the idea-arena. The framing decides the whole tournament. |
| Believer | Sonnet | medium | think | 4 | 250 | Builds one argued case from a brief. Sonnet reasons well at about a fifth of Opus's cost. |
| Skeptic | Sonnet | medium | think | 4 | 250 | Attacks the Believer's case. Needs sharp reasoning, not tools. |
| Investor | Sonnet | medium | think | 4 | 200 | A short money-and-demand check in a fixed format. |
| Planner | Sonnet | medium | think | 4 | 300 | Puts steps and owners in order: structured reasoning without tools. |
| Tutor | Sonnet | medium | think | 6 | 400 | Writes plans and questions from what the Researcher found. |
| Researcher | Sonnet | medium | research | 15 | 400 | Searches and reads sources. Has web and read tools, no shell or edits. |
| Designer | Sonnet | medium | build | 15 | 350 | Reads and edits UI files. Sonnet handles design work well. |
| Tester | Sonnet | medium | build | 25 | 300 | Runs checks and tries to break things. Sonnet is reliable at tool-heavy checking. |
| Caveman | **Haiku** | low | think | 2 | 80 | Compresses text. Haiku does this well at a tiny cost. |
| Custom agent | Sonnet | medium | build | 12 | 350 | A safe middle ground until you pick otherwise. |
| Room lead | Sonnet | medium | all | – | – | Orchestration and triage. The status-line model or effort picker overrides it. |

Tool profiles:
- **think** blocks `Bash, Edit, Write, NotebookEdit, mcp__*`.
- **research** blocks `Bash, Edit, Write, NotebookEdit`.
- **build** blocks nothing.

The permission prompts and the workspace path guard still apply to every agent.

Why Opus goes to three roles and not more:
- **The Judge** makes a single decision that decides everything downstream.
- **The Coder** makes mistakes that cost whole fix loops (Tester → Coder → Tester) when it gets things wrong.
- **The Emperor** writes the arena's question, and the question sets what every competitor writes about.

Every other role works from a brief the lead or another agent already sharpened. Moving those roles to Sonnet is where
the research found the savings with the least quality risk.

## Budget modes (Settings → Agents → Token budget)

| Mode | Agents | Lead | When to use |
| --- | --- | --- | --- |
| Economy | Judge, Coder, Emperor on Sonnet/medium; everyone else Haiku/low | Haiku/low | Near your plan limit, quick questions |
| **Balanced** (default) | The table above | Sonnet/medium | Everyday use |
| Max quality | Everyone Opus/high | Opus/high | A decision that matters, when the plan has room |

Model and effort overrides per agent (Settings → Agents → Model and effort) apply on top of any mode.
"Recommended" means "follow the mode". The status-line model and effort pickers still set the lead for one chat.
Local LLM mode sends everything to the chosen Ollama model and ignores these.

## Workflow changes that go with it

- **Home triages first**: answer directly, or call one agent. **Workspace rooms work as a team on every prompt** (changed 2026-10-01 at Gab's request): at least two fitting members, run in order, each brief starting with a Hand-off that quotes earlier agents by id; each agent answers its teammates, does its part, and ends with "For the next agent:".
- **The Caveman recap is a style.** The lead writes it itself: answer first, no filler, every number, file name and
  warning kept. The Caveman stays in every room's roster and runs when you ask for it by name or in its own room.
- **Arena:** the tournament runs only when you want ideas generated or compared. It uses `--agents 8` by default (16 with
  `--quick` only if you ask). When you bring your own idea, the tournament is skipped. Believer, Skeptic and Investor get
  a five-line brief.
- **Hand-offs:** the lead passes a short brief (question, key facts, paths or quotes) and the agent's structured output.
  It does not pass the whole conversation.
- **Progress summaries** (`agentProgressSummaries`) are off. They were cosmetic background model calls.

## What keeps quality from dropping

- The decisive calls stay on Opus, so the outcome never depends on a cheaper model.
- Role texts from `docs/spec.md` are unchanged. Only the model, tools and output length around them changed.
- Output budgets ask for the sections each role already has, so no required section is cut.
- Every default is a starting point. If a role underperforms on your tasks, raise just that agent in Settings; you don't
  have to raise the whole mode.

## Not measured yet

These defaults rest on the research above and on how Gabo spent tokens before; they haven't been benchmarked on Gabo itself.
Phase 0 of the plan (a per-agent token log and a small before/after benchmark scored by a blind Judge) is the next step.
Use it to confirm or tune the numbers in the table.
