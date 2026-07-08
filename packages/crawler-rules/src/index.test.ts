import { describe, expect, it } from "vitest";
import { matchUserAgent } from "./index";

describe("matchUserAgent", () => {
  it.each([
    ["GPTBot", "OpenAI", "GPTBot"],
    ["OAI-SearchBot/1.0", "OpenAI", "OAI-SearchBot"],
    ["ChatGPT-User", "OpenAI", "ChatGPT-User"],
    ["ClaudeBot", "Anthropic", "ClaudeBot"],
    ["Claude-SearchBot", "Anthropic", "Claude-SearchBot"],
    ["Bytespider", "ByteDance", "Bytespider"]
  ])("matches %s", (userAgent, operator, bot) => {
    expect(matchUserAgent(userAgent)).toMatchObject({ operator, bot });
  });

  it("ignores empty or unknown user agents", () => {
    expect(matchUserAgent("-")).toBeNull();
    expect(matchUserAgent("Mozilla/5.0")).toBeNull();
  });
});
