#!/usr/bin/env node
// Local Git Operations MCP Server
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execFileSync } from "child_process";

// Get repository information from environment variables
const REPO_OWNER = process.env.REPO_OWNER;
const REPO_NAME = process.env.REPO_NAME;
const BRANCH_NAME = process.env.BRANCH_NAME;
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITEA_API_URL = process.env.GITEA_API_URL;
if (!GITEA_API_URL) {
  throw new Error("GITEA_API_URL environment variable is required for local git operations");
}

console.log(`[LOCAL-GIT-MCP] Starting Local Git Operations MCP Server`);
console.log(`[LOCAL-GIT-MCP] REPO_OWNER: ${REPO_OWNER}`);
console.log(`[LOCAL-GIT-MCP] REPO_NAME: ${REPO_NAME}`);
console.log(`[LOCAL-GIT-MCP] BRANCH_NAME: ${BRANCH_NAME}`);
console.log(`[LOCAL-GIT-MCP] REPO_DIR: ${REPO_DIR}`);
console.log(`[LOCAL-GIT-MCP] GITEA_API_URL: ${GITEA_API_URL}`);
console.log(
  `[LOCAL-GIT-MCP] GITHUB_TOKEN: ${GITHUB_TOKEN ? "***" : "undefined"}`,
);

if (!REPO_OWNER || !REPO_NAME || !BRANCH_NAME) {
  console.error(
    "[LOCAL-GIT-MCP] Error: REPO_OWNER, REPO_NAME, and BRANCH_NAME environment variables are required",
  );
  process.exit(1);
}

const server = new McpServer({
  name: "Local Git Operations Server",
  version: "0.0.1",
});

// Helper function to run git commands safely (using execFileSync to prevent command injection)
function runGitCommand(args: string[]): string {
  try {
    console.log(`[LOCAL-GIT-MCP] Running git command: git ${args.join(" ")}`);
    console.log(`[LOCAL-GIT-MCP] Working directory: ${REPO_DIR}`);
    const result = execFileSync("git", args, {
      cwd: REPO_DIR,
      encoding: "utf8",
      stdio: ["inherit", "pipe", "pipe"],
    });
    console.log(`[LOCAL-GIT-MCP] Git command result: ${result.trim()}`);
    return result.trim();
  } catch (error: any) {
    console.error(`[LOCAL-GIT-MCP] Git command failed: git ${args.join(" ")}`);
    console.error(`[LOCAL-GIT-MCP] Error: ${error.message}`);
    if (error.stdout) console.error(`[LOCAL-GIT-MCP] Stdout: ${error.stdout}`);
    if (error.stderr) console.error(`[LOCAL-GIT-MCP] Stderr: ${error.stderr}`);
    throw error;
  }
}

// Helper function to ensure git user is configured
function ensureGitUserConfigured(): void {
  const gitName = process.env.CLAUDE_GIT_NAME || "Claude";
  const gitEmail = process.env.CLAUDE_GIT_EMAIL || "claude@anthropic.com";

  try {
    // Check if user.email is already configured
    runGitCommand(["config", "user.email"]);
    console.log(`[LOCAL-GIT-MCP] Git user.email already configured`);
  } catch (error) {
    console.log(
      `[LOCAL-GIT-MCP] Git user.email not configured, setting to: ${gitEmail}`,
    );
    runGitCommand(["config", "user.email", gitEmail]);
  }

  try {
    // Check if user.name is already configured
    runGitCommand(["config", "user.name"]);
    console.log(`[LOCAL-GIT-MCP] Git user.name already configured`);
  } catch (error) {
    console.log(
      `[LOCAL-GIT-MCP] Git user.name not configured, setting to: ${gitName}`,
    );
    runGitCommand(["config", "user.name", gitName]);
  }
}

// Create branch tool
server.tool(
  "create_branch",
  "Create a new branch from a base branch using local git operations",
  {
    branch_name: z.string().describe("Name of the branch to create"),
    base_branch: z
      .string()
      .describe("Base branch to create from (e.g., 'main')"),
  },
  async ({ branch_name, base_branch }) => {
    try {
      // Validate base branch name: no leading dash
      if (!/^[a-zA-Z0-9_\/][a-zA-Z0-9_\/-]*$/.test(base_branch)) {
        throw new Error(`Invalid base branch name: ${base_branch}`);
      }

      // Ensure we're on the base branch and it's up to date
      runGitCommand(["checkout", base_branch]);
      runGitCommand(["pull", "origin", base_branch]);

      // Validate branch name (alphanumeric, dash, underscore, slash only)
      // Validate branch name: no leading dash, alphanumeric + _/- only
      if (!/^[a-zA-Z0-9_\/][a-zA-Z0-9_\/-]*$/.test(branch_name)) {
        throw new Error(`Invalid branch name: ${branch_name}`);
      }

      // Create and checkout the new branch
      runGitCommand(["checkout", "-b", branch_name]);

      return {
        content: [
          {
            type: "text",
            text: `Successfully created and checked out branch: ${branch_name}`,
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error creating branch: ${errorMessage}`,
          },
        ],
        error: errorMessage,
        isError: true,
      };
    }
  },
);

// Checkout branch tool
server.tool(
  "checkout_branch",
  "Checkout an existing branch using local git operations",
  {
    branch_name: z.string().describe("Name of the existing branch to checkout"),
    create_if_missing: z
      .boolean()
      .optional()
      .describe(
        "Create branch if it doesn't exist locally (defaults to false)",
      ),
    fetch_remote: z
      .boolean()
      .optional()
      .describe(
        "Fetch from remote if branch doesn't exist locally (defaults to true)",
      ),
  },
  async ({ branch_name, create_if_missing = false, fetch_remote = true }) => {
    try {
      // Validate branch name
      // Validate branch name: no leading dash, alphanumeric + _/- only
      if (!/^[a-zA-Z0-9_\/][a-zA-Z0-9_\/-]*$/.test(branch_name)) {
        throw new Error(`Invalid branch name: ${branch_name}`);
      }

      // Check if branch exists locally
      let branchExists = false;
      try {
        runGitCommand(["rev-parse", "--verify", branch_name]);
        branchExists = true;
      } catch (error) {
        console.log(
          `[LOCAL-GIT-MCP] Branch ${branch_name} doesn't exist locally`,
        );
      }

      // If branch doesn't exist locally, try to fetch from remote
      if (!branchExists && fetch_remote) {
        try {
          console.log(
            `[LOCAL-GIT-MCP] Attempting to fetch ${branch_name} from remote`,
          );
          runGitCommand(["fetch", "origin", `${branch_name}:${branch_name}`]);
          branchExists = true;
        } catch (error) {
          console.log(
            `[LOCAL-GIT-MCP] Branch ${branch_name} doesn't exist on remote`,
          );
        }
      }

      // If branch still doesn't exist and create_if_missing is true, create it
      if (!branchExists && create_if_missing) {
        console.log(`[LOCAL-GIT-MCP] Creating new branch ${branch_name}`);
        runGitCommand(["checkout", "-b", branch_name]);
        return {
          content: [
            {
              type: "text",
              text: `Successfully created and checked out new branch: ${branch_name}`,
            },
          ],
        };
      }

      // If branch doesn't exist and we can't/won't create it, throw error
      if (!branchExists) {
        throw new Error(
          `Branch '${branch_name}' does not exist locally or on remote. Use create_if_missing=true to create it.`,
        );
      }

      // Checkout the existing branch
      runGitCommand(["checkout", branch_name]);

      return {
        content: [
          {
            type: "text",
            text: `Successfully checked out branch: ${branch_name}`,
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error checking out branch: ${errorMessage}`,
          },
        ],
        error: errorMessage,
        isError: true,
      };
    }
  },
);

// Commit files tool
server.tool(
  "commit_files",
  "Commit one or more files to the current branch using local git operations",
  {
    files: z
      .array(z.string())
      .describe(
        'Array of file paths relative to repository root (e.g. ["src/main.js", "README.md"]). All files must exist locally.',
      ),
    message: z.string().describe("Commit message"),
  },
  async ({ files, message }) => {
    console.log(
      `[LOCAL-GIT-MCP] commit_files called with files: ${JSON.stringify(files)}, message: ${message}`,
    );
    try {
      // Ensure git user is configured before committing
      ensureGitUserConfigured();

      // Add the specified files
      console.log(`[LOCAL-GIT-MCP] Adding ${files.length} files to git...`);
      for (const file of files) {
        const filePath = file.startsWith("/") ? file.slice(1) : file;
        console.log(`[LOCAL-GIT-MCP] Adding file: ${filePath}`);
        runGitCommand(["add", "--", filePath]);
      }

      // Commit the changes
      console.log(`[LOCAL-GIT-MCP] Committing with message: ${message}`);
      runGitCommand(["commit", "-m", message]);

      console.log(
        `[LOCAL-GIT-MCP] Successfully committed ${files.length} files`,
      );
      return {
        content: [
          {
            type: "text",
            text: `Successfully committed ${files.length} file(s): ${files.join(", ")}`,
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`[LOCAL-GIT-MCP] Error committing files: ${errorMessage}`);
      return {
        content: [
          {
            type: "text",
            text: `Error committing files: ${errorMessage}`,
          },
        ],
        error: errorMessage,
        isError: true,
      };
    }
  },
);

// Push branch tool
server.tool(
  "push_branch",
  "Push the current branch to remote origin",
  {
    force: z.boolean().optional().describe("Force push (use with caution)"),
  },
  async ({ force = false }) => {
    try {
      // Get current branch name
      const currentBranch = runGitCommand(["rev-parse", "--abbrev-ref", "HEAD"]);

      // Push the branch
      if (force) {
        runGitCommand(["push", "-f", "origin", currentBranch]);
      } else {
        runGitCommand(["push", "origin", currentBranch]);
      }

      return {
        content: [
          {
            type: "text",
            text: `Successfully pushed branch: ${currentBranch}`,
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error pushing branch: ${errorMessage}`,
          },
        ],
        error: errorMessage,
        isError: true,
      };
    }
  },
);

// Create pull request tool (uses Gitea API)
server.tool(
  "create_pull_request",
  "Create a pull request using Gitea API",
  {
    title: z.string().describe("Pull request title"),
    body: z.string().describe("Pull request body/description"),
    base_branch: z.string().describe("Base branch (e.g., 'main')"),
    head_branch: z
      .string()
      .optional()
      .describe("Head branch (defaults to current branch)"),
  },
  async ({ title, body, base_branch, head_branch }) => {
    try {
      if (!GITHUB_TOKEN) {
        throw new Error(
          "GITHUB_TOKEN environment variable is required for PR creation",
        );
      }

      // Get current branch if head_branch not specified
      const currentBranch =
        head_branch || runGitCommand(["rev-parse", "--abbrev-ref", "HEAD"]);

      // Create PR using Gitea API
      const response = await fetch(
        `${GITEA_API_URL}/repos/${REPO_OWNER}/${REPO_NAME}/pulls`,
        {
          method: "POST",
          headers: {
            Authorization: `token ${GITHUB_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title,
            body,
            base: base_branch,
            head: currentBranch,
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create PR: ${response.status} ${errorText}`);
      }

      const prData = await response.json();

      return {
        content: [
          {
            type: "text",
            text: `Successfully created pull request #${prData.number}: ${prData.html_url}`,
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error creating pull request: ${errorMessage}`,
          },
        ],
        error: errorMessage,
        isError: true,
      };
    }
  },
);

// Delete files tool
server.tool(
  "delete_files",
  "Delete one or more files and commit the deletion using local git operations",
  {
    files: z
      .array(z.string())
      .describe(
        'Array of file paths relative to repository root (e.g. ["src/old-file.js", "docs/deprecated.md"])',
      ),
    message: z.string().describe("Commit message for the deletion"),
  },
  async ({ files, message }) => {
    try {
      // Remove the specified files
      for (const file of files) {
        const filePath = file.startsWith("/") ? file.slice(1) : file;
        runGitCommand(["rm", "--", filePath]);
      }

      // Commit the deletions
      runGitCommand(["commit", "-m", message]);

      return {
        content: [
          {
            type: "text",
            text: `Successfully deleted and committed ${files.length} file(s): ${files.join(", ")}`,
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error deleting files: ${errorMessage}`,
          },
        ],
        error: errorMessage,
        isError: true,
      };
    }
  },
);

// Get git status tool
server.tool("git_status", "Get the current git status", {}, async () => {
  console.log(`[LOCAL-GIT-MCP] git_status called`);
  try {
    const status = runGitCommand(["status", "--porcelain"]);
    const currentBranch = runGitCommand(["rev-parse", "--abbrev-ref", "HEAD"]);

    console.log(`[LOCAL-GIT-MCP] Current branch: ${currentBranch}`);
    console.log(
      `[LOCAL-GIT-MCP] Git status: ${status || "Working tree clean"}`,
    );

    return {
      content: [
        {
          type: "text",
          text: `Current branch: ${currentBranch}\nStatus:\n${status || "Working tree clean"}`,
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[LOCAL-GIT-MCP] Error getting git status: ${errorMessage}`);
    return {
      content: [
        {
          type: "text",
          text: `Error getting git status: ${errorMessage}`,
        },
      ],
      error: errorMessage,
      isError: true,
    };
  }
});

async function runServer() {
  console.log(`[LOCAL-GIT-MCP] Starting MCP server transport...`);
  const transport = new StdioServerTransport();
  console.log(`[LOCAL-GIT-MCP] Connecting to transport...`);
  await server.connect(transport);
  console.log(`[LOCAL-GIT-MCP] MCP server connected and ready!`);
  process.on("exit", () => {
    console.log(`[LOCAL-GIT-MCP] Server shutting down...`);
    server.close();
  });
}

console.log(`[LOCAL-GIT-MCP] Calling runServer()...`);
runServer().catch((error) => {
  console.error(`[LOCAL-GIT-MCP] Server startup failed:`, error);
  process.exit(1);
});
