# Action Inputs Reference (Gitea)

Complete reference for `alessandroferra/claude-code-action@gitea` inputs.
Only Gitea-relevant inputs are documented here.

## Trigger & Routing

| Input | Description | Default |
|-------|-------------|---------|
| `trigger_phrase` | Phrase to look for in comments, issue/PR bodies, and titles | `@claude` |
| `assignee_trigger` | Username that triggers the action on assignment | - |
| `label_trigger` | Label that triggers the action | `claude` |
| `mode` | Execution mode: `tag` (responds to mentions) or `agent` (runs immediately) | `tag` |

## Branch & Base

| Input | Description | Default |
|-------|-------------|---------|
| `branch_prefix` | Prefix for Claude-created branches | `claude/` |
| `base_branch` | Branch to use as base when creating new branches | repo default |

## Authentication

| Input | Description |
|-------|-------------|
| `anthropic_api_key` | Anthropic API key (one auth method required) |
| `claude_code_oauth_token` | OAuth token (alternative to API key) |
| `gitea_token` | Gitea token with repo/PR permissions (defaults to `github.token`) |

## Claude Code Configuration

| Input | Description | Default |
|-------|-------------|---------|
| `model` | Model to use | - |
| `fallback_model` | Fallback model when primary is overloaded | - |
| `max_turns` | Maximum conversation turns | - |
| `timeout_minutes` | Execution timeout | `30` |
| `allowed_tools` | Additional tools (base Gitea tools always included) | `""` |
| `disallowed_tools` | Tools to prevent Claude from using | `""` |
| `custom_instructions` | Additional prompt instructions | `""` |
| `direct_prompt` | Direct instruction (bypasses trigger detection) | `""` |
| `override_prompt` | Complete prompt replacement with variable substitution | `""` |
| `settings` | Path to settings JSON or inline JSON string | `""` |
| `system_prompt` | Override system prompt | `""` |
| `append_system_prompt` | Append to system prompt | `""` |
| `claude_env` | Custom environment variables (YAML format) | `""` |
| `additional_permissions` | Extra permissions (e.g., `actions: read`) | `""` |

## Comment Filtering

| Input | Description | Default |
|-------|-------------|---------|
| `include_comments_by_actor` | Actors to include (supports wildcards) | `""` (all) |
| `exclude_comments_by_actor` | Actors to exclude (supports wildcards, takes priority) | `""` (none) |

## Git Identity

| Input | Description | Default |
|-------|-------------|---------|
| `claude_git_name` | Git user.name for Claude commits | `Claude` |
| `claude_git_email` | Git user.email for Claude commits | `claude@anthropic.com` |

## Override Prompt Variables

When using `override_prompt`, these variables are substituted:

`$REPOSITORY`, `$PR_NUMBER`, `$ISSUE_NUMBER`, `$PR_TITLE`, `$ISSUE_TITLE`,
`$PR_BODY`, `$ISSUE_BODY`, `$PR_COMMENTS`, `$ISSUE_COMMENTS`,
`$REVIEW_COMMENTS`, `$CHANGED_FILES`, `$TRIGGER_COMMENT`,
`$TRIGGER_USERNAME`, `$BRANCH_NAME`, `$BASE_BRANCH`, `$EVENT_TYPE`, `$IS_PR`

## Gitea-Specific Notes

- **Workflow directory**: `.gitea/workflows/` (not `.github/workflows/`)
- **PR comments**: Use `issue_comment` event (covers both issue and PR comments
  in Gitea). `pull_request_review_comment` has limited support.
- **Permissions**: Gitea workflow tokens get full repo access regardless of the
  `permissions:` block. The block is still recommended for documentation.
- **No `id-token: write`**: Not needed for Gitea (used for GitHub OIDC only).
- **`GITEA_SERVER_URL`**: Set this env var if Gitea runs in a container and the
  internal URL (e.g., `http://gitea:3000`) differs from the public URL
  (e.g., `https://gitea.example.com`). This ensures links in comments are correct.
- **`fetch-depth: 0`**: Recommended because Gitea uses local git operations
  instead of API-based file operations.
