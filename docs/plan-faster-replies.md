# Plan: fewer tokens and faster replies (2026-10-01)

Gab's goals, both required: **use fewer tokens** and **reply faster**, without worse answers. This builds on
[plan-token-reduction.md](plan-token-reduction.md), which is already applied (per-agent models, output budgets, no
skill preload, slim Local LLM prompt). Every change below is scored on both goals. Changes that only speed things up
come last.

## Where tokens and time go today (measured on this laptop)

| What | When | Tokens | Time |
| --- | --- | --- | --- |
| **Each subagent starts its own context** (system prompt, tool list, role, brief) | every agent call; Workspace rooms now call at least 2 per message | thousands of input tokens **per agent**, before any work | each agent waits to read them |
| **Long chats re-read their whole history** every message | follow-ups in a big chat | the 780k-token chat read about 2.3M tokens for one short reply | slow first token |
| Hand-offs quote earlier agents' outputs | every later agent | grows with each agent | more to read |
| Skill scout (its own process + one Haiku call) | first message of a chat | a few thousand | a few seconds |
| Cache writes when the 5-minute cache expires | coming back to a chat after a break | the prefix is written again at 1.25× price | slower first token |
| **Starting a Claude Code process** (plugins, 22 MCP servers) | every message | none | **4.8–5.6 s** |
| Agents run one after another in team rooms | every team message | none | each waits for the previous one |

**Principle:** the biggest token cost is how many separate model contexts a reply opens, and how much history each
one re-reads. The biggest time cost is process start plus the longest chain of agents. Only some fixes help both.

## The changes, ranked: fewer tokens first

### 1. Complexity router + "team in one reply" (biggest token cut, also faster)
A rule-based router (no model call, no added latency; the idea behind [RouteLLM](https://shekhargulati.com/2024/07/09/routellm-paper/))
reads the prompt (length, question versus build words, code, paths, attachments) and picks a tier:

| Tier | Example | How the team works | Contexts opened |
| --- | --- | --- | --- |
| **Quick** | "what's the difference between a list and a tuple?" | **Team in one reply:** the lead writes the fitting agents' turns itself, each in its role, answering each other | **1** |
| **Standard** | "make me a 2-week study plan for my exam" | Team in one reply, plus **one** real subagent when a role needs tools (Researcher searching, Coder editing) | 1–2 |
| **Deep** | "build and test a landing page" | Real subagents for the roles that do the work, as today | as many as needed |

"Team in one reply" is **Solo Performance Prompting**: one strong model simulates several personas that collaborate
in a single answer. It beat single-persona prompting on knowledge and reasoning tasks
([Wang et al.](https://arxiv.org/abs/2307.05300v3)). With a fixed token budget, a single agent is the more
information-efficient choice ([arXiv 2604.02460](https://arxiv.org/pdf/2604.02460)). It works on strong models
(Claude, GPT, Gemini) but **not on small local models**, which keep one real agent at a time.

- **What you see:** the agents still talk to each other. The lead writes each turn under the agent's name, and Gabo
  shows those turns as the agents' blocks, hand-offs included.
- **Tokens:** a 3-agent Library reply goes from 4 contexts to 1. That's an estimated **50–70% fewer tokens** on Quick
  and Standard prompts.
- **Time:** no subagent start-ups, so faster.

### 2. Context guard (stops the 780k-chat problem)
After each run Gabo knows how many tokens the chat re-reads per message (from the new usage logging). Past
**150k**, the chat shows a one-line warning ("this chat re-reads 230k tokens per message") with a **New Session**
button: compact a copy and continue. Past **400k**, it asks before sending. This avoids the single biggest waste
seen so far (about 2.3M tokens for one reply). It's faster too, since a smaller prompt means a quicker first token.

### 3. Hand-off trimming (−10–30% tokens in team rooms)
A later agent gets the earlier agent's **"For the next agent"** line plus its key points (about 120 words), not its
whole output. That's the idea behind task-conditioned pruning ([Squeez](https://arxiv.org/pdf/2604.04979)) and
[LLMLingua](https://www.microsoft.com/en-us/research/?p=987321), without running an extra model. The full outputs stay
in the chat for you. Later agents get a shorter prompt, so they're faster too.

### 4. Keyword-first skill scout (−1 Haiku call per chat, faster first message)
The instant keyword scout picks first. The model scout runs **in the background** only when keywords found nothing,
and applies from the next message.

### 5. Cache-friendly prompts (cheaper, faster first token)
Put stable text first and per-chat text last:
- **In each agent's prompt:** role, then teammate rules, then output budget, with the per-chat skill list at the end.
- **In the lead's prompt:** keep the appended text identical across messages.

Cache reads cost about 10% of normal input, and the best caching cut cost about 80% and time to first token about 31%
across 500+ agent sessions ([fast.io](https://fast.io/resources/ai-agent-prompt-caching)). The token **count** stays
the same, but the **cost** and plan-limit weight drop.

### 6. Run independent agents at the same time (faster; tokens unchanged)
Applies to the Deep tier, where real subagents remain. Each room gets a dependency graph, and agents with ready inputs
run in parallel (several Agent calls in one message):

| Room | Layers (agents in a layer run at the same time) |
| --- | --- |
| Library | Researcher → Tutor ‖ Planner |
| Arena | Emperor → Believer ‖ Investor → Skeptic → Judge |
| Hackathon | Planner → Designer ‖ Investor → Coder → Tester |

Parallel execution gave a 1.6–1.8× faster reply on real queries
([DynAMO, in arXiv 2608.05791](https://arxiv.org/pdf/2608.05791)), and latency-aware orchestration cut the critical
path by 38–46% ([LAMaS](https://www.alphaxiv.org/abs/2607.13359)).

### 7. Warm sessions (faster; small token gain)
- **Warm pool:** keep each chat's Claude Code process alive between messages (close it after 10 minutes idle, keep
  at most 3), which removes about 5 s per follow-up.
- **Ready process for new chats:** the SDK's `prewarm()` keeps a started process waiting, which removes about 5 s
  from a new chat's first message.

On tokens, the prompt cache is on the provider's side, so this doesn't save tokens by itself. It only helps when it
keeps you inside the 5-minute cache window.

### 8. Local LLM (separate track, speed)
- **Keep the model loaded** with a warm-up ping, so Ollama doesn't unload it (a reload costs 10–30 s).
- **Turn on flash attention and a q8 KV cache** in Ollama.
- **Use thinking only on the Deep tier** (on thinking models like qwen3).
- **Keep tokens low** with the slim prompt (already done) and no team-in-one-reply (small models can't do it).

### Not recommended
- **Semantic response cache:** Gabo's prompts are mostly unique tasks, so hits would be rare and a wrong hit is costly
  ([arXiv 2411.05276](https://arxiv.org/abs/2411.05276)).
- **Two-model cascades** (FrugalGPT, [arXiv 2305.05176](https://arxiv.org/abs/2305.05176)): a miss costs a second full
  answer, which spends both tokens and time.

## Expected effect

| Change | Tokens | Speed |
| --- | --- | --- |
| 1 Router + team in one reply | **−50–70% on Quick/Standard prompts** | faster (no subagent start-ups) |
| 2 Context guard | **prevents the biggest waste** (huge chats) | faster first token in long chats |
| 3 Hand-off trimming | −10–30% in team rooms | later agents faster |
| 4 Keyword-first scout | −1 Haiku call per chat | first message a few seconds faster |
| 5 Cache-friendly prompts | same count, cheaper (more cache reads) | faster first token |
| 6 Parallel agents (Deep) | unchanged | team replies 1.6–1.8× faster |
| 7 Warm sessions | ~unchanged | −5 s per message |

These are estimates from the sources and the measurements above. **Measure each step:** Status → Analytics already
shows tokens per day; add time to first token and total time per run.

## Build order (tokens first, while getting faster)
1. **Timing in the usage log:** a baseline for both goals (small).
2. **Router + team in one reply** (medium): the biggest token cut.
3. **Context guard** (small).
4. **Hand-off trimming + keyword-first scout + cache-friendly prompts** (small).
5. **Parallel agents in the Deep tier** (small).
6. **Warm sessions** (larger): speed only.

## Sources
- Solo Performance Prompting: [arXiv 2307.05300](https://arxiv.org/abs/2307.05300v3); single vs multi-agent under a token budget: [arXiv 2604.02460](https://arxiv.org/pdf/2604.02460); small agents vs one large model: [arXiv 2601.11327](https://arxiv.org/pdf/2601.11327)
- Routing and cascades: [survey arXiv 2603.04445](https://arxiv.org/pdf/2603.04445), [RouteLLM](https://shekhargulati.com/2024/07/09/routellm-paper/), [FrugalGPT](https://arxiv.org/abs/2305.05176)
- Latency-aware orchestration: [LAMaS](https://www.alphaxiv.org/abs/2607.13359), [AdaptOrch](https://arxiv.org/html/2602.16873v1), [parallelism in multi-agent systems](https://arxiv.org/pdf/2608.05791), [Gradientsys](https://arxiv.org/html/2507.06520v1)
- Prompt caching: [fast.io](https://fast.io/resources/ai-agent-prompt-caching), [futureagi](https://futureagi.com/blog/understanding-prompt-caching-for-faster-ai-responses/)
- Pruning and compression: [Squeez](https://arxiv.org/pdf/2604.04979), [LLMLingua](https://www.microsoft.com/en-us/research/?p=987321)
- Parallel subagents in Claude Code: [morphllm](https://www.morphllm.com/claude-subagents), [mindstudio](https://www.mindstudio.ai/blog/claude-code-dynamic-workflows-parallel-sub-agents)
- Semantic caching: [arXiv 2411.05276](https://arxiv.org/abs/2411.05276)
- Ollama: [FAQ (keep-alive)](https://ollama.readthedocs.io/en/faq/), [KV-cache quantization](https://smcleod.net/2024/12/bringing-k/v-context-quantisation-to-ollama/)
- SDK `prewarm()` / `startup()`: `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` (alpha)
