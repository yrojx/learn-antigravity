#!/usr/bin/env node
/**
 * render_viz.mjs — Authoring & rendering CLI for Antigravity's visualize skill
 * (mermaid-maker and svg-maker subagents).
 *
 * Automatically detects the user's configured Obsidian vault (via `.agents/md-log-state.json`
 * or any subfolder containing `.obsidian/`, defaulting to `vault/`) and publishes
 * verified PNG diagrams into `<vault>/viz/`.
 */

import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = resolve(SCRIPT_DIR, "../../../..");
const STATE_FILE = join(WORKSPACE_ROOT, ".agents", "md-log-state.json");
const MMDC_BIN = join(SCRIPT_DIR, "node_modules", ".bin", "mmdc");
const STAGING_ROOT = join(tmpdir(), "agy-visual-tools");

const EXTRA_PATH = [
  "/opt/local/bin",
  "/usr/local/bin",
  "/opt/homebrew/bin",
  join(homedir(), "Library", "pnpm"),
  join(homedir(), ".local", "share", "pnpm"),
];

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

function expandHome(p) {
  if (!p) return p;
  if (p === "~") return homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return join(homedir(), p.slice(2));
  }
  return p;
}

function detectVaultRoot() {
  try {
    if (existsSync(STATE_FILE)) {
      const state = JSON.parse(readFileSync(STATE_FILE, "utf8"));
      if (state?.vault) {
        const expanded = expandHome(state.vault);
        const resolved = isAbsolute(expanded) ? expanded : resolve(WORKSPACE_ROOT, expanded);
        if (existsSync(resolved)) return resolved;
      }
    }
  } catch {
    // ignore
  }
  try {
    const entries = readdirSync(WORKSPACE_ROOT, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        const candidate = join(WORKSPACE_ROOT, entry.name);
        if (existsSync(join(candidate, ".obsidian"))) {
          return candidate;
        }
      }
    }
  } catch {
    // ignore
  }
  return join(WORKSPACE_ROOT, "vault");
}

function findChrome() {
  for (const c of CHROME_CANDIDATES) {
    if (c && existsSync(c)) return c;
  }
  return undefined;
}

function runCmd(cmd, args, opts = {}) {
  return new Promise((resolveRun) => {
    const augmentedPath = [...EXTRA_PATH, process.env.PATH ?? ""].join(":");
    const child = spawn(cmd, args, {
      cwd: opts.cwd || SCRIPT_DIR,
      env: { ...process.env, ...(opts.env ?? {}), PATH: augmentedPath },
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeoutMs ?? 60_000);
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      resolveRun({ code: null, stdout, stderr: stderr + String(err), timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolveRun({ code, stdout, stderr, timedOut });
    });
  });
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args[0];
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
    }
  }
  return { command, flags };
}

function getSessionPaths(type, sessionId = "default") {
  if (type !== "mermaid" && type !== "svg") {
    throw new Error(`Invalid --type "${type}". Expected "mermaid" or "svg".`);
  }
  const workDir = join(STAGING_ROOT, `${type}-${sessionId}`);
  mkdirSync(workDir, { recursive: true });
  const bodyFile = type === "mermaid" ? "diagram.mmd" : "diagram.svg";
  const bodyPath = join(workDir, bodyFile);
  return { workDir, bodyPath };
}

function applyEdit(current, oldText, newText) {
  if (!oldText) throw new Error("`--old` must be non-empty.");
  if (oldText === newText) throw new Error("`--old` and `--new` are identical.");
  const first = current.indexOf(oldText);
  if (first === -1) {
    throw new Error("`--old` not found in the current source — match it exactly.");
  }
  const second = current.indexOf(oldText, first + 1);
  if (second !== -1) {
    let n = 0;
    let idx = current.indexOf(oldText);
    while (idx !== -1) {
      n++;
      idx = current.indexOf(oldText, idx + oldText.length);
    }
    throw new Error(`\`--old\` appears ${n} times — include surrounding context to make it unique.`);
  }
  const updated = current.slice(0, first) + newText + current.slice(first + oldText.length);
  return { updated, index: first };
}

function publishPng(pngPath, slug) {
  const vaultRoot = detectVaultRoot();
  const vizDir = join(vaultRoot, "viz");
  mkdirSync(vizDir, { recursive: true });
  const clean =
    String(slug)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "viz";
  const filename = `viz-${clean}-${Date.now()}.png`;
  const dest = join(vizDir, filename);
  copyFileSync(pngPath, dest);
  return { filename, path: dest };
}

async function renderMermaid(bodyPath, outPath, workDir) {
  const chrome = findChrome();
  const cfgPath = join(workDir, "puppeteer.json");
  writeFileSync(
    cfgPath,
    JSON.stringify(
      chrome
        ? { executablePath: chrome, args: ["--no-sandbox", "--disable-setuid-sandbox"] }
        : { args: ["--no-sandbox", "--disable-setuid-sandbox"] },
    ),
    "utf8",
  );
  const res = await runCmd(
    MMDC_BIN,
    ["-i", bodyPath, "-o", outPath, "-p", cfgPath, "-s", "2", "-b", "white"],
    { cwd: workDir, timeoutMs: 120_000, env: { PUPPETEER_SKIP_DOWNLOAD: "1" } },
  );
  return { ok: res.code === 0 && existsSync(outPath), res };
}

async function renderSvgViaPuppeteer(svgPath, outPath) {
  const chrome = findChrome();
  if (!chrome) {
    return { ok: false, error: "Google Chrome / Chromium not found for Puppeteer SVG fallback." };
  }
  try {
    const puppeteer = await import("puppeteer");
    const browser = await puppeteer.default.launch({
      executablePath: chrome,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      defaultViewport: { width: 1600, height: 1200, deviceScaleFactor: 2 },
    });
    try {
      const page = await browser.newPage();
      const svgContent = readFileSync(svgPath, "utf8");
      const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; background: white; display: inline-block; }
  #wrap { display: inline-block; background: white; }
  svg { display: block; }
</style>
</head>
<body><div id="wrap">${svgContent}</div></body>
</html>`;
      await page.setContent(html, { waitUntil: "networkidle0" });
      const el = await page.$("#wrap svg");
      if (!el) {
        return { ok: false, error: "No <svg> element found in document." };
      }
      await el.screenshot({ path: outPath, omitBackground: false });
      return { ok: existsSync(outPath), error: "" };
    } finally {
      await browser.close();
    }
  } catch (err) {
    return { ok: false, error: String(err?.stack || err) };
  }
}

async function renderSvg(bodyPath, outPath, workDir) {
  const rsvg = await runCmd("rsvg-convert", ["-z", "2", bodyPath, "-o", outPath], { cwd: workDir });
  if (rsvg.code === 0 && existsSync(outPath)) return { ok: true, res: rsvg };

  const magick = await runCmd("magick", ["-density", "192", "-background", "white", bodyPath, outPath], { cwd: workDir });
  if (magick.code === 0 && existsSync(outPath)) return { ok: true, res: magick };

  const pup = await renderSvgViaPuppeteer(bodyPath, outPath);
  if (pup.ok) return { ok: true, res: { code: 0, stdout: "Rendered via Puppeteer+Chrome", stderr: "", timedOut: false } };

  return {
    ok: false,
    res: {
      code: 1,
      stdout: "",
      stderr: `rsvg-convert: ${rsvg.stderr}\nmagick: ${magick.stderr}\npuppeteer: ${pup.error}`,
      timedOut: false,
    },
  };
}

async function main() {
  const { command, flags } = parseArgs(process.argv);
  const type = flags.type;
  const sessionId = flags.session || "default";

  if (!command || !["write", "edit", "render"].includes(command)) {
    console.error("Usage: node render_viz.mjs <write|edit|render> --type <mermaid|svg> [options]");
    process.exit(1);
  }

  const { workDir, bodyPath } = getSessionPaths(type, sessionId);

  if (command === "write") {
    let source = "";
    if (flags.file) {
      source = readFileSync(resolve(process.cwd(), flags.file), "utf8");
    } else if (flags.source) {
      source = flags.source;
    } else if (!process.stdin.isTTY) {
      source = readFileSync(0, "utf8");
    }
    source = source.trim();
    if (!source) {
      console.error("Error: `write` requires non-empty diagram source (via --source, --file, or stdin).");
      process.exit(1);
    }
    if (type === "svg" && !source.includes("<svg")) {
      console.error("Error: SVG source must contain a complete <svg>...</svg> document.");
      process.exit(1);
    }
    writeFileSync(bodyPath, source, "utf8");
    const lines = source.split("\n").length;
    console.log(`Wrote ${lines}-line ${type.toUpperCase()} source to ${bodyPath}`);
    console.log(`Next: run \`render\` to generate a PNG and inspect it with view_file.`);
    return;
  }

  if (command === "edit") {
    if (!existsSync(bodyPath)) {
      console.error(`Error: No ${type} source found at ${bodyPath}. Call \`write\` first.`);
      process.exit(1);
    }
    const current = readFileSync(bodyPath, "utf8");
    const { updated } = applyEdit(current, flags.old ?? "", flags.new ?? "");
    writeFileSync(bodyPath, updated, "utf8");
    console.log(`Applied edit to ${bodyPath}. Run \`render\` to generate a new PNG preview.`);
    return;
  }

  if (command === "render") {
    if (!existsSync(bodyPath)) {
      console.error(`Error: No ${type} source found at ${bodyPath}. Call \`write\` first.`);
      process.exit(1);
    }
    const outPath = join(workDir, `render-${Date.now()}.png`);
    const result =
      type === "mermaid"
        ? await renderMermaid(bodyPath, outPath, workDir)
        : await renderSvg(bodyPath, outPath, workDir);

    if (!result.ok) {
      console.error(`${type.toUpperCase()} render FAILED — no image produced.`);
      console.error(result.res.stderr || result.res.stdout || "Unknown error");
      process.exit(1);
    }

    if (flags["save-as"]) {
      const { filename, path } = publishPng(outPath, flags["save-as"]);
      console.log(`PUBLISHED_OK`);
      console.log(`filename: ${filename}`);
      console.log(`path: ${path}`);
      console.log(`IMPORTANT: View ${path} with view_file to visually verify before returning RESULT.`);
    } else {
      console.log(`PREVIEW_OK`);
      console.log(`preview_path: ${outPath}`);
      console.log(`IMPORTANT: View ${outPath} with view_file to verify layout, arrows, geometry, and labels.`);
    }
  }
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
