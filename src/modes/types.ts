import type { GitHubContext } from "../github/context";

export type ModeName = "tag" | "agent";

export type ModeContext = {
  mode: ModeName;
  githubContext: GitHubContext;
  commentId?: number;
  baseBranch?: string;
  claudeBranch?: string;
};

export type ModeData = {
  commentId?: number;
  baseBranch?: string;
  claudeBranch?: string;
};

export type Mode = {
  name: ModeName;
  description: string;
  shouldTrigger(context: GitHubContext): boolean;
  prepareContext(context: GitHubContext, data?: ModeData): ModeContext;
  getAllowedTools(): string[];
  getDisallowedTools(): string[];
  shouldCreateTrackingComment(): boolean;
};
