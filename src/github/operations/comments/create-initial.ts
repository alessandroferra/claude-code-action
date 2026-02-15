#!/usr/bin/env bun

/**
 * Create the initial tracking comment when Claude Code starts working
 * This comment shows the working status and includes a link to the job run
 */

import { appendFileSync } from "fs";
import { createJobRunLink, createCommentBody } from "./common";
import {
  isPullRequestReviewCommentEvent,
  type ParsedGitHubContext,
} from "../../context";
import type { GiteaApiClient } from "../../api/gitea-client";

// HACK: Gitea's list/preview view does not render inline HTML and shows raw <img> tags as text.
// To work around this, we create the comment with a plain-text placeholder first, then
// immediately edit it to the actual working status body (which renders correctly in full view).
// The preview caches the initial text, so it stays clean in the list.
// Remove this once Gitea supports HTML rendering in comment previews.
const PREVIEW_PLACEHOLDER = "Claude Code is working on a response.";

export async function createInitialComment(
  api: GiteaApiClient,
  context: ParsedGitHubContext,
) {
  const { owner, repo } = context.repository;

  const jobRunLink = createJobRunLink(owner, repo, context.runId);
  const workingBody = createCommentBody(jobRunLink);

  try {
    let response;

    console.log(
      `Creating comment for ${context.isPR ? "PR" : "issue"} #${context.entityNumber}`,
    );
    console.log(`Repository: ${owner}/${repo}`);

    // Only use createReplyForReviewComment if it's a PR review comment AND we have a comment_id
    if (isPullRequestReviewCommentEvent(context)) {
      console.log(`Creating PR review comment reply`);
      response = await api.customRequest(
        "POST",
        `/repos/${owner}/${repo}/pulls/${context.entityNumber}/comments/${context.payload.comment.id}/replies`,
        {
          body: PREVIEW_PLACEHOLDER,
        },
      );
    } else {
      // For all other cases (issues, issue comments, or missing comment_id)
      console.log(`Creating issue comment via API`);
      response = await api.createIssueComment(
        owner,
        repo,
        context.entityNumber,
        PREVIEW_PLACEHOLDER,
      );
    }

    const commentId = response.data.id;

    // Immediately edit the comment to the actual working status body
    await api.updateIssueComment(owner, repo, commentId, workingBody);

    // Output the comment ID for downstream steps using GITHUB_OUTPUT
    const githubOutput = process.env.GITHUB_OUTPUT!;
    appendFileSync(githubOutput, `claude_comment_id=${commentId}\n`);
    console.log(`✅ Created initial comment with ID: ${commentId}`);
    return commentId;
  } catch (error) {
    console.error("Error in initial comment:", error);

    // Always fall back to regular issue comment if anything fails
    try {
      const response = await api.createIssueComment(
        owner,
        repo,
        context.entityNumber,
        PREVIEW_PLACEHOLDER,
      );

      const commentId = response.data.id;
      await api.updateIssueComment(owner, repo, commentId, workingBody).catch(() => {});

      const githubOutput = process.env.GITHUB_OUTPUT!;
      appendFileSync(githubOutput, `claude_comment_id=${commentId}\n`);
      console.log(`✅ Created fallback comment with ID: ${commentId}`);
      return commentId;
    } catch (fallbackError) {
      console.error("Error creating fallback comment:", fallbackError);
      throw fallbackError;
    }
  }
}
