#!/usr/bin/env bun

/**
 * Setup the appropriate branch based on the event type:
 * - For PRs: Checkout the PR branch
 * - For Issues: Create a new branch
 */

import { $ } from "bun";
import { execFileSync } from "child_process";
import type { ParsedGitHubContext } from "../context";
import type { GitHubPullRequest } from "../types";
import type { GitHubClient } from "../api/client";
import type { FetchDataResult } from "../data/fetcher";
import { generateBranchName } from "../../utils/branch-template";

/**
 * Extracts the first label from GitHub data, or returns undefined if no labels exist
 */
function extractFirstLabel(githubData: FetchDataResult): string | undefined {
  const labels = githubData.contextData.labels?.nodes;
  return labels && labels.length > 0 ? labels[0]?.name : undefined;
}

/**
 * Validates a git branch name against a strict whitelist pattern.
 * This prevents command injection by ensuring only safe characters are used.
 *
 * Valid branch names:
 * - Start with alphanumeric character (not dash, to prevent option injection)
 * - Contain only alphanumeric, forward slash, hyphen, underscore, or period
 * - Do not start or end with a period
 * - Do not end with a slash
 * - Do not contain '..' (path traversal)
 * - Do not contain '//' (consecutive slashes)
 * - Do not end with '.lock'
 * - Do not contain '@{'
 * - Do not contain control characters or special git characters (~^:?*[\])
 */
export function validateBranchName(branchName: string): void {
  // Check for empty or whitespace-only names
  if (!branchName || branchName.trim().length === 0) {
    throw new Error("Branch name cannot be empty");
  }

  // Check for leading dash (prevents option injection like --help, -x)
  if (branchName.startsWith("-")) {
    throw new Error(
      `Invalid branch name: "${branchName}". Branch names cannot start with a dash.`,
    );
  }

  // Check for control characters and special git characters (~^:?*[\])
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F ~^:?*[\]\\]/.test(branchName)) {
    throw new Error(
      `Invalid branch name: "${branchName}". Branch names cannot contain control characters, spaces, or special git characters (~^:?*[\\]).`,
    );
  }

  // Strict whitelist pattern: alphanumeric start, then alphanumeric/slash/hyphen/underscore/period
  const validPattern = /^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/;

  if (!validPattern.test(branchName)) {
    throw new Error(
      `Invalid branch name: "${branchName}". Branch names must start with an alphanumeric character and contain only alphanumeric characters, forward slashes, hyphens, underscores, or periods.`,
    );
  }

  // Check for leading/trailing periods
  if (branchName.startsWith(".") || branchName.endsWith(".")) {
    throw new Error(
      `Invalid branch name: "${branchName}". Branch names cannot start or end with a period.`,
    );
  }

  // Check for trailing slash
  if (branchName.endsWith("/")) {
    throw new Error(
      `Invalid branch name: "${branchName}". Branch names cannot end with a slash.`,
    );
  }

  // Check for consecutive slashes
  if (branchName.includes("//")) {
    throw new Error(
      `Invalid branch name: "${branchName}". Branch names cannot contain consecutive slashes.`,
    );
  }

  // Additional git-specific validations
  if (branchName.includes("..")) {
    throw new Error(
      `Invalid branch name: "${branchName}". Branch names cannot contain '..'`,
    );
  }

  if (branchName.endsWith(".lock")) {
    throw new Error(
      `Invalid branch name: "${branchName}". Branch names cannot end with '.lock'`,
    );
  }

  if (branchName.includes("@{")) {
    throw new Error(
      `Invalid branch name: "${branchName}". Branch names cannot contain '@{'`,
    );
  }
}

/**
 * Executes a git command safely using execFileSync to avoid shell interpolation.
 *
 * Security: execFileSync passes arguments directly to the git binary without
 * invoking a shell, preventing command injection attacks where malicious input
 * could be interpreted as shell commands (e.g., branch names containing `;`, `|`, `&&`).
 *
 * @param args - Git command arguments (e.g., ["checkout", "branch-name"])
 */
function execGit(args: string[]): void {
  execFileSync("git", args, { stdio: "inherit" });
}

export type BranchInfo = {
  baseBranch: string;
  claudeBranch?: string;
  currentBranch: string;
};

export async function setupBranch(
  client: GitHubClient,
  githubData: FetchDataResult,
  context: ParsedGitHubContext,
): Promise<BranchInfo> {
  const { owner, repo } = context.repository;
  const entityNumber = context.entityNumber;
  const { baseBranch } = context.inputs;
  const isPR = context.isPR;

  // Determine base branch - use baseBranch if provided, otherwise fetch default
  let sourceBranch: string;

  if (baseBranch) {
    // Use provided base branch for source
    sourceBranch = baseBranch;
  } else {
    // No base branch provided, fetch the default branch to use as source
    const repoResponse = await client.api.getRepo(owner, repo);
    sourceBranch = repoResponse.data.default_branch;
  }

  if (isPR) {
    const prData = githubData.contextData as GitHubPullRequest;
    const prState = prData.state;

    // Check if PR is closed or merged
    if (prState === "CLOSED" || prState === "MERGED") {
      console.log(
        `PR #${entityNumber} is ${prState}, will let Claude create a new branch when needed`,
      );

      // Check out the base branch and let Claude create branches as needed
      await $`git fetch origin --depth=1 ${sourceBranch}`;
      await $`git checkout ${sourceBranch}`;
      await $`git pull origin ${sourceBranch}`;

      return {
        baseBranch: sourceBranch,
        currentBranch: sourceBranch,
      };
    } else {
      // Handle open PR: Checkout the PR branch
      console.log("This is an open PR, checking out PR branch...");

      const branchName = prData.headRefName;

      // Execute git commands to checkout PR branch (shallow fetch for performance)
      // Fetch the branch with a depth of 20 to avoid fetching too much history, while still allowing for some context
      await $`git fetch origin --depth=20 ${branchName}`;
      await $`git checkout ${branchName}`;

      console.log(`Successfully checked out PR branch for PR #${entityNumber}`);

      // For open PRs, we need to get the base branch of the PR
      const baseBranch = prData.baseRefName;
      validateBranchName(baseBranch);

      return {
        baseBranch,
        currentBranch: branchName,
      };
    }
  }

  // For issues, check out the base branch and let Claude create branches as needed
  console.log(
    `Setting up base branch ${sourceBranch} for issue #${entityNumber}, Claude will create branch when needed...`,
  );

  try {
    // Ensure we're in the repository directory
    const repoDir = process.env.GITHUB_WORKSPACE || process.cwd();
    console.log(`Working in directory: ${repoDir}`);

    // Check if we're in a git repository
    console.log(`Checking if we're in a git repository...`);
    await $`git status`;

    // Ensure we have the latest version of the source branch
    console.log(`Fetching latest ${sourceBranch}...`);
    await $`git fetch origin --depth=1 ${sourceBranch}`;

    // Checkout the source branch
    console.log(`Checking out ${sourceBranch}...`);
    await $`git checkout ${sourceBranch}`;

    // Pull latest changes
    console.log(`Pulling latest changes for ${sourceBranch}...`);
    await $`git pull origin ${sourceBranch}`;

    // Verify the branch was checked out
    const currentBranch = await $`git branch --show-current`;
    const branchName = currentBranch.text().trim();
    console.log(`Current branch: ${branchName}`);

    if (branchName === sourceBranch) {
      console.log(`✅ Successfully checked out base branch: ${sourceBranch}`);
    } else {
      throw new Error(
        `Branch checkout failed. Expected ${sourceBranch}, got ${branchName}`,
      );
    }

    console.log(
      `Branch setup completed, ready for Claude to create branches as needed`,
    );

    // Set outputs for GitHub Actions
    core.setOutput("BASE_BRANCH", sourceBranch);
    return {
      baseBranch: sourceBranch,
      currentBranch: sourceBranch,
    };
  } catch (error) {
    console.error("Error setting up branch:", error);
    process.exit(1);
  }
}
