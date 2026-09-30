# Plan: fewer tokens, better answers (2026-09-30)

Gab's report: the app burns his Claude plan fast. At the time, `/usage` showed the 5-hour session at 88%, and Claude Code's own
breakdown said *"95% of your usage came from subagent-heavy sessions, 92% at >150k context"*.

This plan cuts tokens where they don't buy quality, and spends a few where they do. **Measure first, change second, keep
what the numbers support.**

## What the research says

| Finding | Source |
| --- | --- |
| Every subagent pays full startup overhead (system prompt, tool schemas, its own role, the task). For small jobs a subagent costs more than it saves. Use one only when the context it keeps out of the lead is worth more than that overhead. | [Composio: 9 ways to cut token consumption](https://composio.dev/blog/ways-to-cut-token-consumption-in-claude-code), [MorphLLM: context window](https://morphllm.com/claude-code-context-window) |
| Subagents inherit the main model (Opus) unless told otherwise. Routing them to Haiku or Sonnet saves about 80% per call on routine work. | [MindStudio: dynamic workflows and cost](https://www.mindstudio.ai/blog/claude-code-dynamic-workflows-token-management-cost), [Agent SDK: subagents](https://platform.claude.com/docs/en/agent-sdk/subagents), [Medium: subagent model routing](https://medium.com/@roanmonteiro/claude-code-subagent-model-routing-stop-paying-for-opus-on-haiku-work-ee76dc32cb88) |
| Model resolution order: `CLAUDE_CODE_SUBAGENT_MODEL` env → per-call model → the agent definition's `model` → the main model. | [Claude Code settings](https://docs.anthropic.com/claude/docs/claude-code/settings), [claude-code#10993](https://github.com/anthropics/claude-code/issues/10993) |
| Prompt caching gives a 90% discount on repeated input, but only if the prefix is **stable**. Switching models mid-session, or changing CLAUDE.md or the system prompt, breaks the cache. | [Prompt caching docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) |
| System prompt, tools, MCP schemas and memory cost 30–40k tokens before the first word. Thinking tokens count as output, and **effort** controls how much the model thinks. | [MorphLLM: token limit](https://www.morphllm.com/claude-code-token-limit), [Analytics Vidhya: 23 tips](https://www.analyticsvidhya.com/blog/2026/05/tips-for-claude-code-token-saving/) |
| Skills are cheap only through progressive disclosure: a listing of about 30–100 tokens each, with the body loaded only when used. | [Composio](https://composio.dev/blog/ways-to-cut-token-consumption-in-claude-code) |
| In multi-agent systems, input is the biggest cost (54% of agentic coding tokens are a "communication tax" of passing context around). Schema-contracted prompts, compressed hand-offs and fetch-once patterns cut 60–70%. | [arXiv 2608.17188](https://arxiv.org/pdf/2608.17188), [RDEL #138](https://rdel.substack.com/p/rdel-138-where-do-all-the-tokens) |
| AgentSlimming prunes agents and messages in multi-agent systems: up to **−78.9% tokens with no loss, sometimes better accuracy**. Fewer, better-chosen agents beat everyone talking. | [AgentSlimming (alphaXiv 2605.08813)](https://www.alphaxiv.org/abs/2605.08813) |
| Point the agent at the right files. Vague "look around" requests cost the most. Filter logs and test output to the part that matters. | [KDnuggets: 7 ways](https://kdnuggets.com/7-practical-ways-to-reduce-claude-code-token-usage), [AutoScout24: 3 techniques](https://tech.autoscout24.com/blog/posts/3-techniques-to-reduce-token-consumption-claude-code-codex/) |

## Where Gabo spends today (from the code and measurements)

1. **Every agent runs on Opus.** `~/.claude/settings.json` sets `model: opus`, and no `AgentDefinition` sets a model, so the Caveman's three-line recap runs on Opus.
2. **A forced extra subagent on every message.** Every room's workflow says *"The Caveman always writes the final recap"*: a whole subagent start (about 25k tokens of context) just to shorten text the lead already has.
3. **Long fixed chains.** Arena: Emperor → idea-arena (16 competitors plus about 75 match calls) → Believer → Skeptic → Investor → Judge → Caveman, for every question, even small ones. Library and Hackathon have similar fixed chains.
4. **Skills preloaded in full.** `AgentDefinition.skills` *preloads* the whole SKILL.md into the agent ("Array of skill names to preload into the agent context"). The scout's picks go there, so a big guideline skill is paid for on every agent call.
5. **The skill rule tells agents to browse GitHub.** The spec's rule (*"opens github.com/vercel-labs/agent-skills and reads…"*) is pasted into every agent prompt, which invites WebFetch round-trips, although the server's scout has already done the job.
6. **Every agent gets every tool.** Believer, Skeptic, Investor, Judge and the Caveman never need Bash, Edit or MCP, but they carry the schemas and can wander into file reads.
7. **No effort control per agent.** Thinking is adaptive, but everything inherits the lead's effort (often high).
8. **Unbounded hand-offs.** Subagents return long prose, and the lead then repeats it, so each downstream agent re-reads everything.
9. **Progress summaries** (`agentProgressSummaries: true`) add small background model calls per subagent. They're cosmetic.
10. **Long chats.** `resume` resends the whole history. It's cached, but still counted; nothing suggests `/compact`.

A measured baseline (Haiku, Home, `/context`): system prompt 6.8k, system tools 13.4k, MCP 0.5k, about **25k per turn before the user's words**. Each subagent pays a similar floor.

## The plan

Principle: **spend Opus on judgment, Sonnet on work, Haiku on formatting. Call an agent only when it adds something the lead can't.**

### Phase 0: Measure (do first, about 1 hour)
- Record the lead's tokens separately from each subagent's (`task_notification.usage.total_tokens` + `result.usage`) in `usage.jsonl`, and show a per-run breakdown on Status.
- Add `scripts/token-bench`: 3 fixed prompts per room (Home, Library, Arena, Hackathon, Lab), run on the real plan once. It saves tokens, time and the answers.
- The quality check is a blind Judge (Opus, one call per answer pair) scoring *before* and *after* on the room's own criteria. This is the gate for every later phase.

### Phase 1: Free wins, no quality risk (expected −40–60%)
1. **Caveman as a style, not a hop.** The lead writes the final recap in Caveman style (the rule is added to the lead's system prompt). The Caveman subagent is only called when the user asks it directly or is in the Caveman's solo room. *The Caveman stays in every room.*
2. **Stop preloading skills.** Pass the kept skills' **names** in the agent prompt ("Skills available to you: X, Y — load with the Skill tool if needed") and drop `AgentDefinition.skills`. This is progressive disclosure again.
3. **Replace the pasted skill rule** in agent prompts with one line: "Your skills were chosen for you: …". The server-side scout already follows the spec's rule. `docs/spec.md` stays verbatim; the scout reads it.
4. **Per-role tools:** thinking roles (Believer, Skeptic, Investor, Judge, Tutor, Planner, Caveman) get `disallowedTools: ["Bash", "Edit", "Write", "NotebookEdit", "mcp__*"]`. Builders (Coder, Tester, Designer, Researcher, Emperor) keep what they need; Researcher keeps WebSearch and WebFetch.
5. **Turn caps:** `maxTurns` per role (for example Caveman 1, the thinking roles 4, Researcher 12, Coder and Tester 25) so an agent can't loop forever.
6. **`agentProgressSummaries` off by default,** with a toggle in Settings.

### Phase 2: Right model, right effort (expected −30–50% more, quality kept or better)
7. **Model routing per role** (`AgentDefinition.model`, overridable in Settings → Agents):

   | Role | Model | Effort | Why |
   | --- | --- | --- | --- |
   | Lead (room) | the user's pick (default Sonnet) | medium | orchestration |
   | Judge, Coder, Emperor | Opus | high / medium | decisions and code quality matter most |
   | Researcher, Designer, Tester, Skeptic, Believer, Investor, Planner, Tutor | Sonnet | medium | solid reasoning at about 1/5 the cost |
   | Caveman, skill scout, generators | Haiku | low | formatting and picking |

8. **Effort per role** (`AgentDefinition.effort`) as in the table. The status-line effort picker only sets the lead's.
9. **Keep the cache warm:** don't change the lead's model mid-chat (the model picker applies from the next *chat*, or warns). Keep the room workflow text byte-stable, and put volatile bits (skills, workspace) last.

### Phase 3: Fewer, sharper hand-offs (AgentSlimming, expected −20–40% more, often better answers)
10. **Triage before teams:** each room's lead first decides *solo / 1 agent / team*. A plain question is answered directly; the team is only pulled when the task needs several viewpoints. The prompt says so explicitly, and a per-room **agent budget** is shown in the UI (Library 2, Hackathon 3, Arena 4 plus the arena).
11. **Schema-contracted outputs:** every role already has a fixed output in the spec, so enforce a **token budget** on it ("≤ 250 words, sections: …"). Downstream agents get the **structured summary**, not the transcript.
12. **Arena:** run the idea-arena only when the question asks for ideas (the Emperor's triage); `--quick` with **8** competitors by default (16 with `--full`, 100 only with confirmation); the Believer, Skeptic and Investor get the crowned idea as a 5-line brief and run in parallel; the Judge reads their three structured outputs.
13. **Fetch once:** the lead reads files once and passes paths plus excerpts; subagents are told "don't re-read files already quoted".

### Phase 4: Long chats and visibility
14. A **context meter** in the status line (tokens in context versus the window), with a one-click `/compact` suggestion past 60%.
15. A **budget mode** selector: *Economy / Balanced / Max quality*. It picks the routing table, effort and agent budget. The default is Balanced.
16. The Status page shows **tokens by agent** and "what burned most today".

## Quality guards
- Every phase ships only if the token bench shows **≥ 20% fewer tokens** and the blind Judge's score is **not lower** (it usually rises, because answers get more focused).
- Rollback is a Settings toggle per lever (routing, triage, recap mode), so a bad call is one click away from undone.
- `docs/spec.md` role texts stay verbatim. Only *how* agents are called changes, not *who they are*.

## Expected result
Phases 1–2 alone should cut a typical room turn from about 6 agent starts on Opus to about 2–3 on Sonnet/Haiku. Estimate: **60–80% fewer tokens against the plan limit**, in line with the AgentSlimming and fetch-once results, with equal or better answers from focused roles and structured hand-offs.

## Order of work
Phase 0 → 1 (items 1–6) → bench → 2 (7–9) → bench → 3 (10–13) → bench → 4. Each step is TDD in the fake harness plus one live bench run.
