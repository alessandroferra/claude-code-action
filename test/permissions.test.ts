import { describe, expect, test, beforeEach, afterEach, spyOn } from "bun:test";
import * as core from "@actions/core";
import { checkWritePermissions } from "../src/github/validation/permissions";
import type { ParsedGitHubContext } from "../src/github/context";

const baseContext: ParsedGitHubContext = {
  runId: "123",
  eventName: "issue_comment",
  eventAction: "created",
  repository: {
    owner: "owner",
    repo: "repo",
    full_name: "owner/repo",
  },
  actor: "tester",
  payload: {
    action: "created",
    issue: { number: 1, body: "", title: "", user: { login: "owner" } },
    comment: { id: 1, body: "@claude ping", user: { login: "tester" } },
  } as any,
  entityNumber: 1,
  isPR: false,
  inputs: {
    mode: "tag",
    triggerPhrase: "@claude",
    assigneeTrigger: "",
    labelTrigger: "",
    allowedTools: [],
    disallowedTools: [],
    customInstructions: "",
    directPrompt: "",
    overridePrompt: "",
    branchPrefix: "claude/",
    useStickyComment: false,
    additionalPermissions: new Map(),
    useCommitSigning: false,
  },
};

describe("checkWritePermissions", () => {
  let infoSpy: any;

  beforeEach(() => {
    infoSpy = spyOn(core, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
  });

  test("returns true when token has push permission", async () => {
    const mockApi = {
      getRepo: async () => ({ data: { permissions: { admin: false, push: true, pull: true } } }),
    } as any;

    const result = await checkWritePermissions(mockApi, baseContext);
    expect(result).toBe(true);
  });

  test("returns true when token has admin permission", async () => {
    const mockApi = {
      getRepo: async () => ({ data: { permissions: { admin: true, push: false, pull: true } } }),
    } as any;

    const result = await checkWritePermissions(mockApi, baseContext);
    expect(result).toBe(true);
  });

  test("returns false when token lacks write access", async () => {
    const warnSpy = spyOn(core, "warning").mockImplementation(() => {});
    const mockApi = {
      getRepo: async () => ({ data: { permissions: { admin: false, push: false, pull: true } } }),
    } as any;

    const result = await checkWritePermissions(mockApi, baseContext);
    expect(result).toBe(false);
    warnSpy.mockRestore();
  });

  test("returns true when permissions field is missing (Gitea workflow token)", async () => {
    const mockApi = {
      getRepo: async () => ({ data: { full_name: "owner/repo" } }),
    } as any;

    const result = await checkWritePermissions(mockApi, baseContext);
    expect(result).toBe(true);
  });

  test("throws when API call fails", async () => {
    const errorSpy = spyOn(core, "error").mockImplementation(() => {});
    const mockApi = {
      getRepo: async () => { throw new Error("connection refused"); },
    } as any;

    expect(checkWritePermissions(mockApi, baseContext)).rejects.toThrow(
      "Failed to check permissions for tester",
    );
    errorSpy.mockRestore();
  });
});
