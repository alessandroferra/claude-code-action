import * as core from "@actions/core";
import type { ParsedGitHubContext } from "../context";
import type { GiteaApiClient } from "../api/gitea-client";

export async function checkWritePermissions(
  api: GiteaApiClient,
  context: ParsedGitHubContext,
): Promise<boolean> {
  const { repository, actor } = context;

  try {
    const response = await api.getRepo(repository.owner, repository.repo);
    const perms = response.data.permissions;

    // Gitea workflow tokens (GITHUB_TOKEN) omit the permissions field entirely.
    // When permissions is missing, the token can still write (Gitea Actions tokens
    // always get full repo access regardless of the workflow permissions: block).
    if (!perms) {
      core.info(`No permissions field in repo response (Gitea workflow token); assuming write access for ${actor}`);
      return true;
    }

    if (perms.admin || perms.push) {
      core.info(`Actor ${actor} has write access (admin=${perms.admin}, push=${perms.push})`);
      return true;
    }

    core.warning(`Actor ${actor} lacks write access: ${JSON.stringify(perms)}`);
    return false;
  } catch (error) {
    core.error(`Failed to check permissions for ${actor}: ${error}`);
    throw new Error(`Failed to check permissions for ${actor}: ${error}`);
  }
}
