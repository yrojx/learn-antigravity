---
name: visualize
description: >-
  Add a correct, minimal visual to a lesson — a diagram or geometric picture — that renders inline
  in both Antigravity and the Obsidian md-log file. Use when an idea is genuinely clearer as a picture:
  a dependency graph, system/flow, sequence, state machine, tree, comparison, or a spatial/geometric
  thing (coordinate geometry, number line, vectors, a plot, a physical layout). Outsources authoring,
  rendering, and visual verification to a maker subagent that inspects the rendered PNG with view_file.
---

# Visualize (Antigravity Edition)

A picture earns its place only when it shows something words can't — shape, structure, direction, relationship, geometry. This skill produces ONE such picture, guarantees it is **correct** (the maker renders it to PNG and visually inspects it with `view_file` before returning), and drops it into the lesson so it renders inline in both Antigravity and the Obsidian `md-log` file.

You are the **creative director**. You decide the exact idea and distill it to its fewest carrying elements. A **maker subagent** does the authoring, rendering, visual verification, and saving, then returns a filename and path.

## When to visualize (and when not to)

This teaching system builds a **dependency graph in the learner's head** — axioms at the root, derived facts hanging off them. A visual is powerful exactly when it makes that structure (or a geometry) visible. Reach for one when:

- The idea is a **structure or relationship**: dependencies, a system with parts and arrows, a flow/pipeline, a sequence of exchanges, a state machine, a tree/hierarchy, a comparison, a containment (what's inside vs outside).
- The idea is **spatial or geometric**: coordinate geometry, a number line, vectors, a function's shape, a physical arrangement.

Do NOT visualize when prose or a single equation already carries it. A decorative diagram that just restates the sentence next to it adds noise and a chance to be wrong. When in doubt, don't — a missing visual is cheaper than a false one.

## Choose the maker

Two maker workflows, documented in `.agents/skills/visualize/references/`:

- **`mermaid-maker`** ([references/mermaid-maker.md](./references/mermaid-maker.md)) — structural/relational visuals: dependency graphs, flowcharts, sequence/state/ER/class diagrams, trees, mindmaps, timelines. This is the default and fits the dependency-graph pedagogy directly.
- **`svg-maker`** ([references/svg-maker.md](./references/svg-maker.md)) — spatial/geometric visuals Mermaid can't lay out: exact coordinates, geometry figures, number lines, vectors, plots, custom shapes.

Rule of thumb: if it's *nodes-and-edges / relationships*, use `mermaid-maker`. If it's *positions-and-shapes / geometry*, use `svg-maker`.

*(Optional Antigravity Bonus: If the learner would benefit from an **interactive** simulation or draggable widget in the chat, you can also use the built-in `generative_ui` skill alongside the static PNG for Obsidian!)*

## Brief the maker well: one idea, fewest elements

The most common failure is **cramming** — every extra label makes the picture harder to read AND harder to lay out correctly. Before briefing, prune to the fewest elements that carry the idea, and for each ask: *"if I delete this, is the idea still clear?"* If yes, delete it.

Give the maker the concept AND the concrete elements you want — not a vague topic, and not a long checklist.

- BAD: "make a diagram about how TCP works"
- GOOD: "graph TD: a node 'packet' at the top; arrows down to 'ordering' and 'retransmit on loss'; both arrows down into 'reliable stream'. No title. Show that reliability is built FROM packets, not alongside them."

Keep the idea intact but trust the maker to compose; if your brief lists more than ~5–7 elements, cut it first.

## Invoke the Maker Subagent in Antigravity

Dispatch the maker using `invoke_subagent` with `TypeName: "self"` (so it has access to `run_command` to run [render_viz.mjs](./scripts/render_viz.mjs) and `view_file` to visually inspect the rendered PNG):

```json
{
  "Subagents": [
    {
      "TypeName": "self",
      "Role": "Mermaid Maker",
      "Prompt": "Read and strictly follow .agents/skills/visualize/references/mermaid-maker.md.\n\nBrief:\n<your minimal, concrete brief>"
    }
  ]
}
```
Or for SVG:
```json
{
  "Subagents": [
    {
      "TypeName": "self",
      "Role": "SVG Maker",
      "Prompt": "Read and strictly follow .agents/skills/visualize/references/svg-maker.md.\n\nBrief:\n<your minimal, concrete brief>"
    }
  ]
}
```

The maker uses [scripts/render_viz.mjs](./scripts/render_viz.mjs) to author the source, render it to a 2x Retina PNG, **visually inspect the PNG using `view_file` and iterate until it is correct and clean**, publish it into `<vault>/viz/` with a unique filename, and return:

```text
RESULT:
filename: viz-<slug>-<timestamp>.png
path: <absolute-path-to-vault>/viz/viz-<slug>-<timestamp>.png
```

If it returns `RESULT: NONE`, it couldn't make a correct picture of the brief — simplify or rethink, or decide the visual isn't worth it. Never hand-author or fake an unverified diagram yourself; correctness depends on the maker's render-and-inspect loop.

## Embed it in the lesson

1. **In your Obsidian `md-log` entry** (via `md_log.mjs assistant`), include Obsidian's wikilink embed with the returned **filename** and a display width:
   ```markdown
   ![[viz-<slug>-<timestamp>.png|500]]
   ```
2. **In your Antigravity chat response**, link or display the diagram clearly using the returned `path`.

Introduce the visual in a sentence, then let it carry the idea — don't narrate every element back in prose.
