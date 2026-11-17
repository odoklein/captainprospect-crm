## graphify

### Setup (once per machine)

```bash
pip install "graphifyy[sql]"      # CLI on PATH as `graphify`
graphify extract . --code-only    # first build, ~1 min, local AST only, no API key
graphify cluster-only .           # GRAPH_REPORT.md + graph.html
graphify hook install             # git hooks rebuild the graph after commit/checkout/merge
```

- `graphify-out/` is gitignored (graph.json is ~20 MB); each clone builds its own.
- What gets indexed is controlled by `.graphifyignore`; query defaults live in `.graphifyrc`.
- `/graphify .` in Claude Code does a full build that also reads the Markdown docs (uses subagents, costs tokens).
- The hooks in `.claude/settings.json` call `graphify`; without it installed they never block anything, but Claude Code shows a hook error notice, so install it.

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. When the answer is under a Markdown heading, `graphify section "<heading>"` prints that section's text, so the .md need not be opened. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
