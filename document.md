# Gabo — features and commands

Gabo is a local, multi-agent harness for Claude Code. It runs on the AI account you connect (a **Claude**, **OpenAI** or **Gemini** API key) or on a free **Local LLM** in Ollama, loads everything your Claude Code CLI loads, and adds a team of role agents and rooms around it. An install that already had chats before Connect existed keeps using the Claude Code login on that computer.

Start it with `npm run dev`, then open http://127.0.0.1:3217. It only answers on this machine.

---

## Pages (sidebar)

| Page | What it is |
| --- | --- |
| **New** | Starts a fresh chat in the room you're in. During a run it stops that run first. |
| **Home** `/` | A normal Claude Code session. The office scene (Gabo walks in and sits at the desk) sits above the input until you send something. The Caveman is on call for short answers. |
| **Agents** `/agents` | The twelve agents, each on its own themed background (sunrise hill, rainy street, courtroom, code room, cave with a campfire…), plus **your agents**. Click one for a solo chat with it (plus the Caveman). |
| **Workspace ▸ Library** `/library` | Studying and research: Researcher, Tutor, Planner, Caveman. The top-left scene shows the agents at a library table. |
| **Workspace ▸ Arena** `/arena` | Brainstorming and picking the best idea: Emperor (runs the idea-arena with the Idea Rubric), Believer, Skeptic, Investor, Judge, Caveman. The agents spar in an arena. |
| **Workspace ▸ Hackathon** `/hackathon` | Building and shipping: Planner, Designer, Coder, Tester, Investor, Caveman. The agents type at desks. |
| **Workspace ▸ Laboratory** `/laboratory` | **You pick the team.** Tick the agents (built-in and your own) to include; the Caveman is always in. Their mascots load above the prompt box, and the chat runs with exactly that team. "Change team" before the first message; **New** starts over. |
| **Connect AI** `/connect` | Which account runs Gabo. Pick **Claude**, **OpenAI** or **Gemini**, press **Connect** (opens the provider's sign-in page in a new tab to create an API key), paste the key, and **Test and connect** checks it with the provider before saving. "Models" sets the strong, standard and fast model. **Disconnect** stops runs until you connect again. Keys stay in `.data/backend.json` and are never shown again. |
| **Local LLM** `/local-llm` | **Switch to Local LLM**. **Setup guide**: install Ollama, download a recommended model (sized to this computer's memory), **Prepare model** (makes a copy with a 16k–64k context window so Gabo's prompt isn't cut off; Gabo also does it by itself on the first message), **Test model** (must make a tool call), then flip the switch. **Readiness** shows what's done. **Plugins for Local LLM**: tick which installed Claude Code plugins the local model may use (all off by default: each adds its tools to every message, GitHub alone about 10k tokens); connect **Notion** (integration token), **Obsidian** (your vault folder) and any MCP server (command or URL), each with **Test**; and pin skills to always offer. While it's on, the model gets a slim prompt (8 tools, only the picked skills, only the ticked plugins, no claude.ai connectors or git instructions: about 6k tokens) and nothing goes to an AI account. Models under 4B (like llama3.2) are flagged: they repeat their instructions instead of doing the task. The status line shows `local · <model>`. |
| **About** `/about` | What Gabo is, where each page goes, and its principles. |
| **Status** `/status` | **Analytics** (last 7 days): tokens used with the change from the week before, average per day and per run, busiest day, **reply speed** (average time to the first words and to done), API-equivalent cost, a day-by-day stacked bar chart (fresh input, cache write, cache read, output; hover a day for its numbers), top room and model, and a table view. Counts every model call (subagents included), logged per message as the change in that chat's running total. **Usage**: your plan meters from Claude Code's `/usage` (5-hour session and week, with reset times, no tokens spent), plan-limit reports from runs, and Gabo's own log (runs and tokens for today and the last 7 days, by room and by model). Also which backend is in use (Claude plan or local model), and Claude Code's version (the one Gabo uses and the CLI on your PATH), the Agent SDK version, default model, models, permission mode, your account and plan, connectivity (Claude Code login, the Anthropic API, Anthropic's status page), every MCP server with its status, your plugins, other AIs, the workspace, and Python for the Arena. **Refresh** re-checks. |
| **Plugins** `/plugins` | Connect other AIs (ChatGPT, Gemini, OpenClaw, Hermes, or any OpenAI-compatible server) so Claude can consult them. Also lists your Claude Code plugins and MCP servers with their status. |
| **History** (dropdown) | Your whole Claude Code history, CLI and app sessions from every project, newest first, labelled by folder. It remembers whether it's open. |
| **Pinned** | Pin any chat with the pin button on its row (it shows on hover). Pinned chats stay at the top of the sidebar, even when History is collapsed, and survive reloads. Unpin with the same button. |
| **Settings → Agents** `/settings` | **Token budget** (Economy / **Balanced**, the default / Max quality) sets every agent's model and effort. Per agent: edit the role prompt, add a goal, and pick a **model and effort** ("Recommended" follows the budget; the reason is shown). Saved to `config/agent-overrides.json`; the text in `docs/spec.md` stays the default, so "Reset to defaults" restores it. Why each default: [docs/token-budget.md](docs/token-budget.md). **Run my Claude Code hooks in Gabo** (off by default): your plugins' hooks added about 4–5 s to every session start and extra text to every chat; Gabo's own safety checks run either way. |
| **Settings → Add agent** `/settings?tab=new` | Make your own agent: name, one-liner, **mascot** (describe it and press **Generate mascot**, press **Randomize costume**, or pick each part: body colour, hat, face, holding, clothes, back), **system prompt**, **goal**, and **background** (pick one, or **Generate background** from the prompt and goal). A live preview shows it on its stage. Saved to `config/custom-agents.json`. Edit or delete it later from the same tab. |

The **sidebar** hides with the sidebar button or **Ctrl+B** and remembers that. On a phone it's a slide-out drawer.

The **intro** shows once per browser session: Gabo pops in, "GABO" types out, then "A Multi-Agent Harness" appears. Click or press any key to skip it.

**First run:** when nothing is connected, a **Connect your AI** pop-up follows the intro. **Connect** signs you in to Claude, OpenAI or Gemini to create a key (as on the Connect AI page); **Use Local LLM** opens the Local LLM setup guide; **Not now** hides it for this session. Until something is connected, sending a message says how to connect. Subscription logins (Claude Pro/Max, ChatGPT Plus, Gemini) can't be offered to other people's apps: Anthropic's Agent SDK terms forbid offering claude.ai login in third-party products, and OpenAI and Google offer subscription login only in their own tools. So people connect with an API key, billed by the provider.

---

## Agents

| Agent | Does |
| --- | --- |
| The Believer | Makes the strongest honest case *for* an idea and names the one bet it rests on. |
| The Skeptic | Tries to kill it: who won't pay, the free workaround, the fatal flaw. |
| The Investor | Is there proof people will pay? The cheapest test this week, and the one number that would change its mind. |
| The Judge | Rules last: BUILD, FIX FIRST or KILL, with the biggest risk and a 10-minute test. |
| The Designer | Direction first, one bold move; refuses the default AI look; checks contrast, focus, 320px and the empty, loading and error states. |
| The Coder | Smallest working version first; handles the unhappy paths; says plainly what it couldn't verify. |
| The Tester | Assumes it's broken; reproducible bug reports ranked by harm; the one test to automate. |
| The Researcher | Strong sources first, every claim cited, disagreements shown, a question to test yourself tomorrow. |
| The Tutor | A study plan that fits your time, active recall, hints before answers, three levels of questions. |
| The Caveman | Most said, fewest words. In every room. |
| The Planner | Defines done, orders small steps, riskiest first, one owner per step. |
| The Emperor | Sharpens the challenge, runs the idea-arena (8 agents by default, 16 `--quick` if you ask, the full 100 only after you confirm), crowns one idea. |

**Recommended defaults** (Balanced): Opus for the Judge (high effort), Coder and Emperor; Haiku for the Caveman; Sonnet for everyone else. Thinking roles have no shell, edit or MCP tools; each agent has a turn cap and an output length. **Home** triages first (answers directly unless help is needed). **Workspace rooms** (Library, Arena, Hackathon, Laboratory) work as a **team on every prompt**, sized by a **router** (rules on your prompt, no model call) to save tokens:

| Tier | When | How the team works |
| --- | --- | --- |
| **Quick** | short questions | the lead writes 2 members' turns in **one reply**, each answering the other |
| **Standard** | regular tasks | the same, with at most **one** real agent when a role needs tools (web, files, commands) |
| **Deep** | build or code work, long tasks, the Arena tournament | real agents, run in **layers**: members that don't need each other start together (e.g. Library: Researcher, then Tutor and Planner together) |

A notice says which tier ran. Add **`--deep`** to force real agents, or **`--lite`** for a Quick reply. Either way, each agent answers its teammates first (agree, challenge or build on) and the chat shows who it builds on (**← Researcher**). Hand-offs between real agents carry each agent's "For the next agent" line and key points, not its whole output. Measured: a Quick reply used about 47% fewer tokens than a Deep run with one agent, and showed its first words about 5 s sooner. The lead writes the Caveman-style recap itself; the Caveman agent runs when you ask for it. Full table and reasons: [docs/token-budget.md](docs/token-budget.md).

Every agent follows the **skill rule**: on the first message of a chat it keeps only the skills that fit its role and the task (the server's scout applies it; agents get the picks by name and load one only when needed). If a useful skill from vercel-labs/agent-skills isn't installed, a **Skills** card offers **Download / Skip**. Downloads go into the workspace's `.claude/skills/`.

---

## The chat (works like the Claude Code CLI)

### Keys

| Key | Does |
| --- | --- |
| **Enter** | Send. While Claude is working, the message is **queued** and sent when it finishes. |
| **Shift+Enter** | New line. |
| **Esc** | Interrupt the run (and clear the queue). Closes an open menu first. |
| **Shift+Tab** | Cycle the permission mode: ask before edits → accept edits → plan mode → auto. |
| **↑ / ↓** | With a menu open: move through commands or files. Otherwise: recall previous prompts, like a terminal (only from the first line, so multi-line editing still works). |
| **Tab** | Complete the highlighted command or file. |
| **1 / 2 / 3** | Answer a permission prompt or a plan approval. |
| **Ctrl+B** | Show or hide the sidebar. |
| **Ctrl+S** | Save on the Settings page. |

### Status line (under the input)

- **Permission mode**: click it, or press Shift+Tab. It starts where your CLI starts (`permissions.defaultMode` in `~/.claude/settings.json`). Changing it mid-run applies right away.
- **Model**: every model your plan offers (default, opus, sonnet, haiku, …).
- **Effort**: auto, low, medium, high, xhigh, max.
- Also shown: the room, the working folder and the tokens used. Your choices are remembered in this browser.

### Context guard

The status line shows how many tokens the chat **re-reads on every message** (for example `230k context`). Above **150k**, a warning above the prompt box offers **New Session**. Above **400k**, sending asks first, and Cancel starts a New Session.

### Warm sessions

Each chat keeps its Claude Code process alive between messages (closed after 10 minutes idle; at most 3 at a time), and one spare process waits ready for the next new chat, so a message skips the process start. Esc interrupts the current reply without closing the process. The Arena still starts a fresh process per message.

### New Session (status line, left of "/ commands")

Shows once a chat has messages. It copies the chat's Claude Code session, runs `/compact` on the copy, and opens the copy as a **new chat** titled "… (continued)". The new chat starts with a collapsible **Carried over** block (the `/compact` summary Claude continues from), and its next messages resume from that summary instead of re-reading the whole old conversation. The original chat stays exactly as it was. Compacting reads the old chat once (on your default model), so use it on a long chat before it gets expensive; after that every message is cheap again.

### Typing `/`

A menu lists **every command**: the app's own plus all of Claude Code's (your plugins, your skills, and built-ins like `/compact`, `/context`, `/init`, `/review`). Use ↑/↓ to scroll it, Enter to run, Tab to complete.

App commands:

| Command | Does |
| --- | --- |
| `/clear` | Start a new chat in this room. |
| `/model [name]` | Show or set the model, e.g. `/model opus`, `/model default`. |
| `/mode [name]` | Show or set the permission mode: `default`, `acceptEdits`, `plan`, `auto`. |
| `/effort [level]` | Show or set the effort: `low` … `max`, or `auto`. |
| `/mcp` | List MCP servers and their status (connected, needs-auth, failed…). |
| `/agents` | The agents this room can pull. |
| `/skills` | The skills each agent kept for this chat. |
| `/cost` | Tokens used in this chat, with the API-equivalent price. It's billed to your plan, not per token. |
| `/cwd [path]` | Show or change the default workspace folder. |
| `/help` | This list and the keys. |

Anything else starting with `/` goes to Claude Code. For example:

| Command | Does |
| --- | --- |
| `/compact` | Summarise the conversation to free up context. |
| `/context` | Show context usage by category. |
| `/init` | Write a CLAUDE.md for the project. |
| `/review` | Review the current changes. |
| `/superpowers:brainstorming`, `/commit-commands:commit`, … | Plugin and skill commands, exactly as in the CLI. |

### Typing `@`

Suggests files from the workspace (skipping node_modules, .git, build folders). Use ↑/↓ to pick and Tab or Enter to insert the path.

### Images

**Paste** a screenshot or **drop** image files onto the input: PNG, JPEG, GIF or WebP, up to 5 per message, about 3.5 MB each. They show as thumbnails you can remove, and Claude sees them with your message.

### What shows in the transcript

- **Tool lines** such as `● Read(src/auth.ts)` with a folded `⎿` result. Edits and new files show a **−/+ diff**.
- **Agent blocks**: when a room's agent works, its mascot, what it's doing, and its own words tagged with its name. The top-left scene animates whoever is working.
- **Permission prompts** for edits, commands and paid tools: **1** Yes · **2** Yes for this chat (the exact command) · **3** No.
- **Questions from Claude**: pick an option, several if allowed, or type **Other**, then **Answer** (or **Skip**).
- **Plan approval** in plan mode: **1** Yes, and auto-accept edits · **2** Yes, and approve edits manually · **3** No, keep planning.
- **Todo list**: Claude's live checklist above the input (☐ to do, ◐ doing, ☒ done).
- **Skills card**: the skills each agent kept, and downloads for missing ones.

---

## History and sessions

- The app and the CLI share the same session files. Chats started in the app show up in the CLI's `/resume`, and your CLI sessions show up in the app's **History**.
- Opening a CLI session shows its transcript and continues **that same session in its own project folder**.
- If you continue a chat in the terminal, the app shows the newer transcript when you reopen it.
- Background helpers (the skill picker and the info check) aren't saved to your history.

---

## Plugins: other AIs

1. Open **Plugins**, switch a provider **On**, and fill in:
   - **Base URL**
   - **Model**
   - **API key**: leave it empty for a local server. Keys are write-only; you only ever see `••••1234` again.
2. **Save**, then **Test connection** (sends "Reply with exactly: OK").
3. In any chat, ask Claude to consult it: "ask Gemini for a second opinion on this". Claude calls `mcp__gabo-ai__ask_<provider>`, and **you approve each call**, because it's billed on that provider.

| Provider | Default endpoint | Notes |
| --- | --- | --- |
| ChatGPT | `https://api.openai.com/v1` | OpenAI API key (separate from a ChatGPT Plus plan). |
| Gemini | `https://generativelanguage.googleapis.com/v1beta` | Key from Google AI Studio. |
| OpenClaw | `http://127.0.0.1:18789/v1` | Your OpenClaw gateway's OpenAI-compatible endpoint. |
| Hermes | `https://openrouter.ai/api/v1` | Nous Research Hermes via OpenRouter, or a local Ollama at `http://127.0.0.1:11434/v1`. |
| Custom | any | Any OpenAI-compatible server (LM Studio, vLLM, Groq, …). |

Plain `http://` is only allowed to this machine, so keys never cross the network unencrypted. The default model names are starting points; set the ones your accounts have.

---

## Safety

- The server listens on 127.0.0.1 only, and every API route rejects other hosts and origins.
- Agents are locked to the workspace folder, or to a history session's own folder. File tools outside it are refused, reads included; a hook also re-checks through junctions and symlinks.
- Writes, edits and state-changing shell commands ask first. Read-only commands run without asking, as in the CLI.
- The Arena can't start more than 16 agents unless you add `--full` and confirm, and never more than 100.
- `bypassPermissions` mode isn't offered.

---

## Your agents

- Made in **Settings → Add agent**. Each gets an id like `x-data-wizard`.
- They work in the **Laboratory** (tick them into the team) and on their own page (`/agents/x-…`). The built-in rooms keep their fixed teams.
- **Generate mascot** and **Generate background** use one quick Haiku call on your plan (not saved to your history). If Claude can't be reached, they match your words instead and say so.
- The mascot borrows the hover animation of the built-in agent holding a similar item (a gavel swings like the Judge's, a sword like the Caveman's club).

## Files you might edit

| File | What |
| --- | --- |
| `docs/spec.md` | The original request, verbatim. Agent role prompts are read from here. |
| `config/agent-overrides.json` | Your prompt, goal, model and effort edits from Settings. Tracked in git. |
| `config/custom-agents.json` | The agents you made (prompt, goal, costume, background). Tracked in git. |
| `.data/` | Chats, pins, the workspace setting, provider keys, the local-LLM setting, the token budget, the usage log, the skills cache. Local only, git-ignored. |
| `vendor/idea-arena/` | The arena skill (Jakeschincariol/arena-skill, pinned). |

## Development

| Command | What |
| --- | --- |
| `npm run dev` | The app on :3217 (uses your Claude plan). |
| `npm run dev:fake` | Scripted runs on :3218 with no Claude usage; its data goes to `.data-fake/`. |
| `npm test` | Unit tests (Vitest). |
| `npm run test:e2e` | Browser tests (Playwright, fake mode). |
| `npm run typecheck` | TypeScript. |

Next.js allows only one dev server per project folder: stop `dev` before starting `dev:fake`.
