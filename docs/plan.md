# Gabo — multi-agent harness on your Claude subscription

## Context
Gab wants a local app that works like Claude Code in a terminal but runs a team of 12 role agents
(Believer, Skeptic, Investor, Judge, Designer, Coder, Tester, Researcher, Tutor, Caveman, Planner, Emperor).
Rooms group the agents: **Home** (plain Claude Code), **Agents** (one subtab per agent), **Library** (study/research),
**Arena** (brainstorm with the Jakeschincariol arena skill plus the Idea Rubric) and **Hackathon** (build and ship).
The Caveman is in every room. Each room shows the pulled agents' mascots working together in a scene at the top left.
Agents pick skills from vercel-labs/agent-skills and ask before downloading any that are missing.
The landing page is an office where the mascot walks to a desk and sits. Layout copies `claude_landing.jpg`; the
animation replaces the greeting.

**Spec:** Gab's message (the full role texts, the Idea Rubric and the skill-scout rule) is the binding spec.
Task 0 saves it verbatim to `docs/spec.md` so every agent prompt is copied from it, not paraphrased.

## Decisions already made (with Gab)
- **Auth = Claude Pro/Max subscription** → `@anthropic-ai/claude-agent-sdk` `query()`. It drives the logged-in
  `claude` CLI and replaces `@anthropic-ai/sdk` Tool Runner, which needs a paid API key.
  **Ruling:** stack deviation approved by Gab. Local, personal use only; not deployable for others.
  Next.js App Router, React and our own TypeScript module (`src/harness/`) stay.
- **Tool scope** = Claude Code tools locked to one workspace folder. An inline allow/deny prompt appears before any
  write, edit or bash (Claude Code style, via `canUseTool`).
- **Mascots:** Mascot.png is reused faithfully. **Ruling:** its 17×14 pixel grid (palette: Blue #4A7BD8,
  Eye #000, Sticker #FFF, Ivory #FAF9F5, Slate #141413) is traced into a pixel-exact SVG sprite, so the legs can
  animate for walking and sitting. Mascot.png itself becomes the logo and favicon. Each role gets pixel-art SVG props.
  Cost if wrong: swap the sprite for `<img>` plus props and use a CSS bob instead of leg frames.
- **Location:** `C:\Users\Gab\Documents\GitHub\Gabo` (an existing empty git repo). Work on branch `feat/harness`.
- **Docs:** `Documents\Obsidian Vault\Gabo\` (see the last task).

## Architecture
```
Browser (React, CLI-style UI) ──SSE── /api/run ──> src/harness/runRoom() ──> claude-agent-sdk query()
      │  permission answer  ──POST── /api/permission ──> PermissionBroker (resolves canUseTool promise)
      └─ skills approve     ──POST── /api/skills/install ──> SkillInstaller (GitHub → <workspace>/.claude/skills)
```
- **One lead query per turn.** The room's lead gets its room workflow through `systemPrompt: {type:'preset',
  preset:'claude_code', append}`, plus `agents` = the room's roster as `AgentDefinition`s, with the prompt text taken
  verbatim from the spec. The lead chooses which agents to call through the Agent tool, so the **pulled agents**
  = the subagent_types actually invoked. That drives which mascots appear and which one is active.
- Options: `cwd: workspace`, `settingSources: ['user','project']`, `skills:'all'`, `includePartialMessages:true`,
  `agentProgressSummaries:true`, `resume: sessionId` for continuing chats, `abortController` for Esc/stop.
- **Security (required):** server bound to `127.0.0.1`; every API route checks the Host/Origin header (blocks
  DNS-rebinding and cross-site requests to a tool-running server). A path guard rejects file tools outside the
  workspace. Bash always prompts unless it's allowed for the session.

### `src/harness/` (our own TypeScript module, no React imports)
- `agents.ts`: the registry of 12 `AgentSpec {id, name, role, prompt, tools, mascot:{props,accent}}`. Prompts come verbatim from spec.
- `rooms.ts`: rosters. Caveman is in every room (a test enforces it).
  - home: Caveman (available as a subagent; otherwise a normal Claude Code session)
  - library: Researcher, Tutor, Planner, Caveman
  - arena: Emperor, Believer, Skeptic, Investor, Judge, Caveman. Flow: Emperor sharpens the challenge → idea-arena
    `--quick` → crowned idea → Believer → Skeptic → Investor → Judge verdict → Caveman recap
  - hackathon: Planner, Designer, Coder, Tester, Investor, Caveman. Flow: plan → design → code → test
    (one fix loop) → Investor's "who pays" check → Caveman recap. **Ruling:** Investor is included because the spec
    says "marketable". Cost if wrong: remove one roster entry.
  - agent solo (Agents tab): that one agent plus Caveman.
- `events.ts`: maps SDK messages to UI events (`text_delta`, `tool_start/result`, `agent_start/stop`,
  `permission_request`, `skill_recommendation`, `result{cost,usage}`, `error`).
- `permissions.ts`: PermissionBroker (pending map keyed by requestId, timeout → deny) and the path guard.
- `skills/scout.ts`: runs before a session's first task. Fetches vercel-labs/agent-skills skill names plus the one-line
  frontmatter `description` only (GitHub contents API; cached 24h in `.data/`). Adds local `~/.claude/skills` and
  `<workspace>/.claude/skills`. Runs one cheap `query({model:'haiku', maxTurns:1})` that returns one line per pulled
  agent: `skills · why (≤5 words)` or `none`. Recommended skills that aren't installed become a `skill_recommendation`
  event. The scout re-runs only when the task touches something new (new room, or the user asks).
- `skills/install.ts`: downloads the approved skill's folder from GitHub into `<workspace>/.claude/skills/<name>/`
  (project scope, so the global dir stays clean). Validates the name (`^[a-z0-9-]+$`) and paths. The next turn
  picks it up through settingSources.
- `arena/`: vendors Jakeschincariol/arena-skill (pinned commit, MIT). **Ruling:** renamed to `idea-arena`, because
  the global `~/.claude/skills/arena` is pstack's arena and would collide. It's installed into the workspace's
  `.claude/skills/idea-arena/` with `idea-rubric.md` next to `rubric.md`. `withIdeaRubric(fn)` copies
  idea-rubric → rubric.md, backs up the original to `rubric.original.md`, and restores it in `finally`
  (idempotent, and recovers a stale backup on start). A full 100-agent run needs an explicit UI confirmation,
  because it spends subscription limits. Needs Python ≥3.8 (checked at startup; Arena shows an error state if missing).
- `sessions.ts`: `.data/sessions.json` holds {id, room, title, sdkSessionId, updatedAt} for the sidebar's recent list.

### UI (`src/app/`, `src/components/`)
- **Direction:** "a night-shift terminal: quiet slate, one blue creature doing the work". Mono everywhere
  (JetBrains Mono via next/font). Slate #141413 bg, Ivory #FAF9F5 text, muted #8a8a85, Blue #4A7BD8 as the only
  accent. That's the bold move: blue appears only on the mascots and the active agent.
  **Ruling:** "waketime" is read as the WakaTime dark dashboard (Gab's GitHub card uses waka-readme): dark, mono,
  stat-dense. No purple gradients, no emoji, no card grids.
- **Shell:** layout like `claude_landing.jpg`. Left sidebar: Home, Agents ▸ (12 subtabs), Library, Arena, Hackathon,
  recent sessions, and a footer "Gabi-comm · Pro". Below 768px the sidebar becomes a drawer. Works at 320px.
- **Home `/`:** the office scene (mascot walks in from the left to the centre desk and sits; CSS `steps()`
  sprite frames; `prefers-reduced-motion` shows it already seated) sits above the input box, in place of the greeting.
  After the first message the page turns into the CLI transcript.
- **CLI transcript (shared by every room):** `>` prompt echo, streamed text, tool lines `● Read(path)` with
  collapsible `⎿` results, spinner with a verb, subagent blocks labelled with the mascot, status line
  (room · model · cwd · tokens/cost). The inline permission prompt reads `Allow Bash(npm test)? 1 Yes · 2 Yes for
  session · 3 No`, answerable by keyboard. Esc stops a run. Slash commands: /clear /skills /agents /cost /cwd.
  Skill recommendation card: "Recommended: web-design-guidelines (Designer, Tester) [Download] [Skip]".
- **Room pages (Library, Arena, Hackathon):** play an intro once per visit (studying mascot / Emperor raising a chalice /
  Coder raising a laptop), then the CLI. A top-left scene widget shows only the pulled agents: at a library table,
  sparring in an arena, or typing at desks. The active agent is animated and the others are idle.
- **Agents `/agents/[id]`:** mascot, role text, kept skills, and a solo chat with that agent.
- **Designed states:** empty (scene plus hint), loading (spinner verbs), error (CLI not logged in → "run `claude`
  then /login"; workspace missing; Python missing; network failure on the skill fetch → the scout reports "skills
  unavailable" and the run continues).
- **Mascot system:** `components/mascot/Sprite.tsx` (grid rects, pose: stand/walk1/walk2/sit/raise/type) plus
  `props/*.tsx`. Believer: pennant. Skeptic: magnifier. Investor: top hat and coin. Judge: gavel. Designer: beret and
  brush. Coder: headphones and laptop. Tester: hard hat and bug net. Researcher: glasses and book. Tutor: mortarboard
  and pointer. Caveman: club and bone. Planner: clipboard. Emperor: crown, cape and chalice.

## Tasks (riskiest first; each is TDD with Vitest, and UI tasks add Playwright checks)
0. **Scaffold:** branch, Next.js (TS, App Router, no Tailwind: CSS modules plus tokens), Vitest, Playwright,
   `docs/spec.md` (verbatim spec), copy assets into `public/`, `.gitignore` for `.data/`.
1. **Spike (riskiest):** from a Next route handler on Windows, `query()` runs on the subscription login and
   streams, and `canUseTool` round-trips through the broker. If this fails, stop and report before building the UI.
2. Harness core: agents, rooms, events mapper (tested against a fake SDK message stream), broker, path guard.
3. API routes (`run` SSE, `permission`, `sessions`, `workspace`, `skills/*`) plus the origin guard (tests: a foreign
   Origin gets 403).
4. CLI transcript components plus the input, permission prompt and slash commands (Playwright against `HARNESS_FAKE=1`).
5. Shell, sidebar, routing, responsive drawer, tokens.
6. Mascot sprite, props, and the office, library, arena and hackathon scenes (visual check with screenshots at 320px and 1440px).
7. Rooms plus the Agents tab wired to the harness.
8. Skill scout and installer, with the recommendation UI.
9. idea-arena vendoring, the rubric swap and restore (tests: restores after a throw; recovers a stale backup), and the 100-agent confirmation.
10. Obsidian docs and the memory pointer.

## Verification
- `npm test` (Vitest): Caveman is in every roster; prompts match spec.md; the events mapper; the broker's
  timeout → deny; the path guard; scout parsing plus the offline fallback; installer name/path validation;
  the rubric swap is idempotent.
- `npx playwright test` with `HARNESS_FAKE=1`: 320px has no horizontal scroll; keyboard-only covers send, the
  permission answer and Esc stop; the empty, loading and error states render; reduced motion is respected;
  a double-click on send doesn't start two runs.
- Live smoke test on Gab's login: `npm run dev` → Home "list files" (a permission prompt appears for bash);
  Library question (Researcher, Tutor and Caveman are pulled; the scene shows those three); Arena `--quick` on a small
  challenge (rubric.md is restored afterwards); Hackathon builds a tiny page in a temp workspace.
- Contrast check on the tokens (Ivory/Slate, muted/Slate ≥4.5:1, Blue on Slate for UI ≥3:1).

## Obsidian (`Documents\Obsidian Vault\Gabo\`)
`Gabo Hub.md` links to: `Architecture.md` (the diagram and why the Agent SDK replaced Tool Runner), `Agents & Rooms.md`
(the rosters and flows), `Design Tokens & Mascot.md` (palette hexes, the 17×14 grid, poses, the landing layout
described in words so no one needs to reopen the images), `Skills.md` (scout and installer, the idea-arena rename, the
rubric swap), `Decisions.md` (every ruling above plus the build-time rulings), `Setup.md` (run commands, Python requirement,
login). Add a `gabo-project` memory pointing to the hub.
