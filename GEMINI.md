# Antigravity Learning Hub (`learn`)

This workspace is a dedicated **AI Learning System** in Antigravity, adapted from [How I Use AI to Learn Things](https://www.youtube.com/watch?v=kzcI5F4tGiU).

## First-Time Vault & Dependency Setup (When Requested by User)

If the user asks to **set up their Obsidian vault** (or initialize this repo for the first time):
1. Check if they specified a target path (e.g., `~/Documents/my-vault`). If they didn't specify a location, ask where they want it placed — noting that passing a path (like `~/Documents/my-vault`) stores it outside this repo, while passing only a name (like `my-vault`) creates it inside this repo (`./my-vault/`).
2. Install visual rendering dependencies (skipping redundant Chromium download if local Chrome is installed):
   ```bash
   PUPPETEER_SKIP_DOWNLOAD=1 npm install --prefix .agents/skills/visualize/scripts --no-fund --no-audit
   ```
3. Initialize and configure the Obsidian vault (creates `<vault-path>/`, `<vault-path>/viz/`, and `.obsidian/app.json` with `attachmentFolderPath: "viz"`):
   ```bash
   node .agents/skills/teach/scripts/md_log.mjs set-vault <vault-path>
   ```
4. Let the user know they can open `<vault-path>` as a vault in Obsidian (and remind them to set **Non-Workspace File Access** to `Allow` in Antigravity settings if their vault is outside this repo).

---

## Core Mandate

Whenever the user asks to learn, understand, or be taught any topic (or asks a conceptual question in this workspace), you **MUST** read and follow the [`teach`](./.agents/skills/teach/SKILL.md) skill (`view_file` on `.agents/skills/teach/SKILL.md`) before responding.

When a structural or geometric visual will make a concept clearer than words alone, read and follow the [`visualize`](./.agents/skills/visualize/SKILL.md) skill (`view_file` on `.agents/skills/visualize/SKILL.md`).

## Tool Mapping in Antigravity

1. **Graded Quizzes (`quiz`)**:
   - Use Antigravity's native `ask_question` tool in **Quiz Mode**:
     - Construct even, bare-claim options with zero justification in the option labels.
     - Randomly shuffle the real options, then append `"I don't know"` as the final option.
     - Never prefix any quiz option with `(Recommended)`.
     - Never reveal the answer or explanation before `ask_question` returns.
     - Immediately after the user answers, grade it at the top of your next message (`✓ Correct!`, `✗ Incorrect.`, or `· You said: I don't know`) along with the `explanation`.

2. **Learning Goals & Preferences (`ask_user_question`)**:
   - Use `ask_question` in **Goal Mode** (ungraded options + write-in support) to clarify what the user wants to learn in Phase 1b.

3. **Subagents (`researcher`, `mermaid-maker`, `svg-maker`)**:
   - **Fact & First-Principles Verification (`researcher`)**: Invoke `invoke_subagent` with `TypeName: "research"` following [`.agents/skills/visualize/references/researcher.md`](./.agents/skills/visualize/references/researcher.md).
   - **Verified Diagrams (`mermaid-maker` / `svg-maker`)**: Invoke `invoke_subagent` with `TypeName: "self"` following [`.agents/skills/visualize/references/mermaid-maker.md`](./.agents/skills/visualize/references/mermaid-maker.md) or [`.agents/skills/visualize/references/svg-maker.md`](./.agents/skills/visualize/references/svg-maker.md). The maker renders PNGs into `<vault>/viz/` using [`.agents/skills/visualize/scripts/render_viz.mjs`](./.agents/skills/visualize/scripts/render_viz.mjs) and visually inspects them with `view_file`.

4. **Obsidian Markdown Mirroring (`md-log`)**:
   - Mirror teaching sessions (user prompts, questions, graded quiz answers, and lesson prose with `$LaTeX$` and `![[viz-...png|500]]` embeds) into Obsidian-compatible Markdown files inside the configured Obsidian vault using [`.agents/skills/teach/scripts/md_log.mjs`](./.agents/skills/teach/scripts/md_log.mjs).
   - When creating a new note, always use a **natural, human-readable Title Case filename with spaces** (e.g., `"Jevons Paradox in AI.md"` or `"Linear Algebra.md"` — **do NOT use dashes/kebab-case** like `jev-in-ai.md`, because Obsidian displays the filename as the note's main heading):
     `node .agents/skills/teach/scripts/md_log.mjs link "<Topic Title>.md" --create`
   - If the user writes `/md-unlog`, unlink via:
     `node .agents/skills/teach/scripts/md_log.mjs unlink`
