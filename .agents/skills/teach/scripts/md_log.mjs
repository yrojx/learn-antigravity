#!/usr/bin/env node
/**
 * md_log.mjs — Obsidian Markdown session logger & vault manager for Antigravity
 * (adapted from Amos Blomqvist's `learn` system).
 *
 * Mirrors the learning session to an Obsidian-compatible Markdown file using:
 *   - `> [!quote] YOU`
 *   - `> [!abstract] ANTIGRAVITY`
 *   - `> [!question] Quiz` / `> [!question] Question`
 *   - `> [!success] Quiz — correct ✓` / `> [!failure] Quiz — incorrect ✗` / `> [!question] Quiz — I don't know`
 *   - `> [!example] Answer`
 *
 * Commands:
 *   node md_log.mjs status
 *   node md_log.mjs set-vault <vault-folder-name>
 *   node md_log.mjs link <filepath> [--create]
 *   node md_log.mjs unlink
 *   node md_log.mjs user --text "<prompt>"
 *   node md_log.mjs assistant --text "<lesson text>"
 *   node md_log.mjs question --kind <quiz|ask> --question "<q>" [--context "<ctx>"] --options '<json array>'
 *   node md_log.mjs quiz-answer --status <correct|incorrect|dont_know|cancelled> --selected "<sel>" --correct "<corr>" [--note "<note>"] [--explanation "<exp>"]
 *   node md_log.mjs ask-answer --answer "<ans>"
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(SCRIPT_DIR, "../../../..");
const STATE_FILE = path.join(WORKSPACE_ROOT, ".agents", "md-log-state.json");

function expandHome(p) {
  if (!p) return p;
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

function resolveAnyPath(rawPath, baseDir = WORKSPACE_ROOT) {
  const expanded = expandHome(rawPath);
  return path.isAbsolute(expanded) ? expanded : path.resolve(baseDir, expanded);
}

function readState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    }
  } catch {
    // ignore
  }
  return { vault: null, file: null };
}

function writeState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n", "utf8");
}

/**
 * Resolve the active Obsidian vault directory:
 * 1. Explicit `vault` in `.agents/md-log-state.json` (inside or outside workspace, supports `~/...`)
 * 2. Auto-detect any first-level subfolder containing `.obsidian`
 * 3. Default to `<workspace>/vault`
 */
function detectVaultRoot(state) {
  if (state?.vault) {
    const resolved = resolveAnyPath(state.vault, WORKSPACE_ROOT);
    if (fs.existsSync(resolved)) return resolved;
  }
  try {
    const entries = fs.readdirSync(WORKSPACE_ROOT, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        const candidate = path.join(WORKSPACE_ROOT, entry.name);
        if (fs.existsSync(path.join(candidate, ".obsidian"))) {
          return candidate;
        }
      }
    }
  } catch {
    // ignore
  }
  return path.join(WORKSPACE_ROOT, "vault");
}

function resolveVaultNotePath(rawPath, vaultRoot) {
  const expanded = expandHome(rawPath);
  if (path.isAbsolute(expanded)) return expanded;
  const vaultName = path.basename(vaultRoot);
  const prefixRegex = new RegExp(`^${vaultName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\\\/]+`);
  const cleaned = expanded.replace(prefixRegex, "");
  return path.resolve(vaultRoot, cleaned);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args[0];
  const positional = [];
  const flags = {};
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = "true";
      }
    } else {
      positional.push(a);
    }
  }
  return { command, positional, flags };
}

function appendToFile(logFile, text) {
  if (!logFile) {
    console.error("No markdown log file linked. Run `node md_log.mjs link <filepath> --create` first.");
    process.exit(1);
  }
  let current = "";
  if (fs.existsSync(logFile)) {
    current = fs.readFileSync(logFile, "utf8");
  }
  const prefix = current.trim().length > 0 ? "\n\n" : "";
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.writeFileSync(logFile, current + prefix + text + "\n", "utf8");
}

function callout(type, title, bodyLines) {
  const lines = [`> [!${type}] ${title}`];
  for (const line of bodyLines) {
    lines.push(line.length === 0 ? ">" : `> ${line}`);
  }
  return lines.join("\n");
}

function userBlock(text) {
  return `> [!quote] YOU\n\n${text.trim()}`;
}

function assistantBlock(text) {
  return `> [!abstract] ANTIGRAVITY\n\n${text.trim()}`;
}

function questionCallout(label, question, context, options) {
  const body = [];
  for (const line of String(question).split("\n")) body.push(line);
  if (context) {
    body.push("");
    for (const line of String(context).split("\n")) body.push(line);
  }
  if (options && options.length > 0) {
    body.push("");
    options.forEach((opt, i) => {
      const labelText = typeof opt === "string" ? opt : opt.label;
      body.push(`${i + 1}. ${labelText}`);
    });
  }
  return callout("question", label, body);
}

function answerCalloutQuiz({ status, selected, correct, note, explanation }) {
  if (status === "cancelled") {
    return callout("warning", "Quiz — cancelled", ["(user skipped)"]);
  }
  const dontKnow = status === "dont_know";
  const isCorrect = status === "correct";
  const type = dontKnow ? "question" : isCorrect ? "success" : "failure";
  const title = dontKnow
    ? "Quiz — I don't know"
    : isCorrect
      ? "Quiz — correct ✓"
      : "Quiz — incorrect ✗";

  const body = [];
  if (dontKnow) {
    body.push("Your answer: I don't know");
  } else {
    body.push(`Your answer: ${selected || "(none)"}`);
  }
  if (correct) {
    body.push(`Correct answer: ${correct}`);
  }
  if (note) {
    body.push("");
    const noteLines = String(note).split("\n");
    body.push(`Note: ${noteLines[0]}`);
    for (let i = 1; i < noteLines.length; i++) body.push(noteLines[i]);
  }
  if (explanation) {
    body.push("");
    for (const line of String(explanation).split("\n")) body.push(line);
  }
  return callout(type, title, body);
}

function answerCalloutAsk(answerText) {
  const lines = String(answerText || "(no answer)").split("\n");
  return callout("example", "Answer", lines);
}

function readStdinIfPiped() {
  if (!process.stdin.isTTY) {
    try {
      return fs.readFileSync(0, "utf8").trim();
    } catch {
      return "";
    }
  }
  return "";
}

function main() {
  const { command, positional, flags } = parseArgs(process.argv);
  const state = readState();
  const vaultRoot = detectVaultRoot(state);

  if (!command || command === "status") {
    console.log(`Vault: ${vaultRoot}`);
    console.log(state.file ? `Linked file: ${state.file}` : "Linked file: (none)");
    return;
  }

  if (command === "set-vault") {
    const rawVault = positional.join(" ").trim() || flags.vault || "vault";
    const resolvedVault = resolveAnyPath(rawVault, WORKSPACE_ROOT);
    const vizDir = path.join(resolvedVault, "viz");
    const obsidianDir = path.join(resolvedVault, ".obsidian");
    const appJsonPath = path.join(obsidianDir, "app.json");

    fs.mkdirSync(vizDir, { recursive: true });
    fs.mkdirSync(obsidianDir, { recursive: true });

    let appConfig = {};
    if (fs.existsSync(appJsonPath)) {
      try {
        appConfig = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
      } catch {
        appConfig = {};
      }
    }
    if (!appConfig.attachmentFolderPath) {
      appConfig.attachmentFolderPath = "viz";
      fs.writeFileSync(appJsonPath, JSON.stringify(appConfig, null, 2) + "\n", "utf8");
    }

    const rel = path.relative(WORKSPACE_ROOT, resolvedVault);
    const storedVault = rel && !rel.startsWith("..") ? rel : resolvedVault;
    writeState({ ...state, vault: storedVault });
    console.log(`Configured Obsidian vault at: ${resolvedVault}`);
    console.log(`- Diagrams directory: ${vizDir}`);
    console.log(`- Obsidian attachmentFolderPath set to "viz" in ${appJsonPath}`);
    return;
  }

  if (command === "link") {
    const rawPath = positional.join(" ").trim() || flags.file;
    if (!rawPath) {
      console.error("Usage: node md_log.mjs link <filepath> [--create]");
      process.exit(1);
    }
    const resolved = resolveVaultNotePath(rawPath, vaultRoot);
    if (!fs.existsSync(resolved)) {
      if (flags.create === "true") {
        fs.mkdirSync(path.dirname(resolved), { recursive: true });
        fs.writeFileSync(resolved, "", "utf8");
      } else {
        console.error(`File does not exist: ${resolved} (pass --create to create it)`);
        process.exit(1);
      }
    }
    const relVault = state.vault || path.relative(WORKSPACE_ROOT, vaultRoot);
    writeState({ vault: relVault, file: resolved });
    console.log(`Linked markdown log: ${resolved}`);
    return;
  }

  if (command === "unlink") {
    const prev = state.file;
    writeState({ ...state, file: null });
    console.log(prev ? `Unlinked: ${prev}` : "No file was linked.");
    return;
  }

  const logFile = flags.log ? resolveVaultNotePath(flags.log, vaultRoot) : state.file;

  if (command === "user") {
    const text = flags.text ?? readStdinIfPiped();
    if (!text) process.exit(0);
    appendToFile(logFile, userBlock(text));
    console.log(`Logged user block to ${path.basename(logFile)}`);
    return;
  }

  if (command === "assistant") {
    const text = flags.text ?? readStdinIfPiped();
    if (!text) process.exit(0);
    appendToFile(logFile, assistantBlock(text));
    console.log(`Logged assistant block to ${path.basename(logFile)}`);
    return;
  }

  if (command === "question") {
    const label = flags.kind === "quiz" ? "Quiz" : "Question";
    const question = flags.question || "";
    const context = flags.context || undefined;
    let options = [];
    if (flags.options) {
      try {
        options = JSON.parse(flags.options);
      } catch {
        options = flags.options.split("|").map((s) => s.trim());
      }
    }
    appendToFile(logFile, questionCallout(label, question, context, options));
    console.log(`Logged ${label} callout to ${path.basename(logFile)}`);
    return;
  }

  if (command === "quiz-answer") {
    const block = answerCalloutQuiz({
      status: flags.status || "correct",
      selected: flags.selected,
      correct: flags.correct,
      note: flags.note,
      explanation: flags.explanation ?? readStdinIfPiped(),
    });
    appendToFile(logFile, block);
    console.log(`Logged quiz-answer callout to ${path.basename(logFile)}`);
    return;
  }

  if (command === "ask-answer") {
    const text = flags.answer ?? readStdinIfPiped();
    appendToFile(logFile, answerCalloutAsk(text));
    console.log(`Logged ask-answer callout to ${path.basename(logFile)}`);
    return;
  }

  console.error(`Unknown command: ${command}`);
  process.exit(1);
}

main();
