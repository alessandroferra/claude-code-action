---
name: gitea-ci
description: >-
  Generate Gitea Actions CI workflow files for claude-code-action. Interactively
  configures and writes workflow YAML to .gitea/workflows/. Use to add Claude CI
  workflows, set up Gitea Actions with Claude, or generate workflow files.
  Triggers on "add a CI workflow", "set up Claude for Gitea", "generate a
  workflow", or "add gitea-ci". Do NOT use for editing existing workflows or
  non-Gitea platforms.
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Write, Bash(git status), Bash(ls *)
argument-hint: "[workflow-type] [--bot-name <name>] [--bot-email <email>]"
metadata:
  version: 0.1.0
  author: alessandroferra
  category: [ci-workflows]
  tags: [gitea, gitea-actions, ci, workflow-generator, claude-code-action]
---

Task: Generate a Gitea Actions workflow for $ARGUMENTS

## Workflow Types

Available templates in `assets/`:

| Type | Template | Description |
|------|----------|-------------|
| `assistant` | `claude-assistant.yml` | Interactive @claude trigger (tag mode) |
| `auto-review` | `auto-review.yml` | Automatic PR review on open/sync |
| `path-review` | `path-filtered-review.yml` | PR review filtered by file paths |
| `author-review` | `author-filtered-review.yml` | PR review filtered by author |
| `ci-fix` | `ci-auto-fix.yml` | Auto-fix CI failures |
| `test-analysis` | `test-analysis.yml` | Flaky test detection and auto-retry |
| `issue-triage` | `issue-triage.yml` | Auto-label and categorize issues |
| `issue-dedup` | `issue-dedup.yml` | Detect duplicate issues |
| `code-analysis` | `code-analysis.yml` | Manual on-demand commit analysis |

## Step 1: Gather Context

- Existing workflows: !`ls .gitea/workflows/ 2>/dev/null || echo "No .gitea/workflows/ directory"`
- Project files for language detection (check for `package.json`, `Cargo.toml`,
  `go.mod`, `pyproject.toml`, `pom.xml`, `build.gradle`, etc.)

## Step 2: Select Workflow Type

If $ARGUMENTS specifies a workflow type from the table above, use it directly.

Otherwise, use AskUserQuestion to ask which workflow to generate. Present
the options from the Workflow Types table. Allow the user to pick one.

## Step 3: Configure the Workflow

Use AskUserQuestion to prompt for configuration that was NOT already provided
via $ARGUMENTS. Adapt questions to the selected workflow type.

**Common options** (ask for all types):
- Bot identity: custom `claude_git_name` / `claude_git_email` for Claude's
  commits? (default: "Claude" / "claude@anthropic.com")
- Timeout minutes (default: 60)
- Custom Gitea server URL? (needed if Gitea runs behind a reverse proxy or
  in a container with an internal URL)

**Type-specific options**:
- `assistant`: trigger phrase (default: `@claude`), execution mode (tag/agent)
- `auto-review`: review focus areas (security, quality, performance, all)
- `path-review`: which file path patterns to filter on
- `author-review`: which author usernames to filter on
- `ci-fix`: which CI workflow name to monitor (default: "CI"), allowed build
  tools (bun/npm/yarn/cargo/go)
- `test-analysis`: which CI workflow name to monitor (default: "CI")
- `issue-triage`: which labels are available in the repo
- `issue-dedup`: no extra config needed
- `code-analysis`: no extra config needed

Present sensible defaults so the user can accept quickly.

## Step 4: Generate and Write

1. Read the selected template from `assets/<template>.yml`
2. Customize based on user answers:
   - Replace placeholder values (trigger phrase, path patterns, author list, etc.)
   - If bot identity provided, uncomment and set `claude_git_name` / `claude_git_email`
   - If custom Gitea URL provided, uncomment and set `GITEA_SERVER_URL` env
   - Adapt `direct_prompt` content if the user specified focus areas
3. Write to `.gitea/workflows/<name>.yml`
4. If the file already exists, use AskUserQuestion to ask whether to overwrite
   or suggest an alternative filename

## Step 5: Setup Checklist

After writing the file, present this checklist:

**Required secrets** (Gitea repo Settings > Actions > Secrets):
- `GITEA_TOKEN` — Personal access token with repository read/write and
  issue/PR permissions
- `ANTHROPIC_API_KEY` — Anthropic API key for Claude

**Optional**:
- `GITEA_SERVER_URL` — Set in the workflow `env:` block if Gitea runs in a
  container and the internal URL differs from the public URL
- Bot identity — Uncomment `claude_git_name` / `claude_git_email` in the
  workflow to customize how Claude's commits appear

**Test it**:
- For `assistant`: Create an issue or PR comment mentioning the trigger phrase
- For `auto-review` / filtered reviews: Open a pull request
- For `ci-fix` / `test-analysis`: Wait for a CI failure (or trigger one)
- For `issue-triage` / `issue-dedup`: Open a new issue
- For `code-analysis`: Run the workflow manually from the Actions tab

For the full list of action inputs, see [references/action-inputs.md](references/action-inputs.md).
