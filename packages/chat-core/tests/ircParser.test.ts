import { describe, expect, it } from "vitest";
import { parseIrcMessage } from "../src/adapters/twitch/ircParser";
import { normalizeTwitchMessage } from "../src/adapters/twitch/normalize";

describe("parseIrcMessage", () => {
  it("parses tag-prefixed PRIVMSG", () => {
    const line = "@badge-info=;badges=moderator/1;color=#1E90FF;display-name=TestUser;emotes=;id=abc-123;mod=1;tmi-sent-ts=1710000000000 :testuser!testuser@testuser.tmi.twitch.tv PRIVMSG #twitch :hello world";
    const parsed = parseIrcMessage(line);
    expect(parsed?.tags["display-name"]).toBe("TestUser");
    expect(parsed?.command).toBe("PRIVMSG");
    expect(parsed?.params[0]).toBe("#twitch");
    expect(parsed?.trailing).toBe("hello world");
  });

  it("parses PING without tags", () => {
    const parsed = parseIrcMessage("PING :tmi.twitch.tv");
    expect(parsed?.command).toBe("PING");
    expect(parsed?.trailing).toBe("tmi.twitch.tv");
  });
});

describe("normalizeTwitchMessage", () => {
  it("normalizes PRIVMSG into ChatMessage", () => {
    const line = "@badges=subscriber/3;color=#00FF00;display-name=Cat;id=msg1;tmi-sent-ts=1710000000000 :cat!cat@cat.tmi.twitch.tv PRIVMSG #twitch :meow";
    const parsed = parseIrcMessage(line);
    const message = parsed ? normalizeTwitchMessage(parsed) : null;
    expect(message?.platform).toBe("twitch");
    expect(message?.channel).toBe("twitch");
    expect(message?.displayName).toBe("Cat");
    expect(message?.message).toBe("meow");
  });

  it("normalizes CLEARMSG into a delete event", () => {
    const line =
      "@login=cat;target-msg-id=msg-123;tmi-sent-ts=1710000001000 :tmi.twitch.tv CLEARMSG #twitch :meow";
    const parsed = parseIrcMessage(line);
    const message = parsed ? normalizeTwitchMessage(parsed) : null;

    expect(message?.platform).toBe("twitch");
    expect(message?.username).toBe("system");
    expect(message?.message).toContain("deleted");
    expect(message?.raw?.eventType).toBe("delete");
    expect(message?.raw?.targetUsername).toBe("cat");
    expect(message?.raw?.targetMessageId).toBe("msg-123");
  });

  it("normalizes CLEARCHAT timeout into a timeout event", () => {
    const line =
      "@ban-duration=600;tmi-sent-ts=1710000002000 :tmi.twitch.tv CLEARCHAT #twitch :cat";
    const parsed = parseIrcMessage(line);
    const message = parsed ? normalizeTwitchMessage(parsed) : null;

    expect(message?.platform).toBe("twitch");
    expect(message?.username).toBe("system");
    expect(message?.message).toContain("timed out");
    expect(message?.raw?.eventType).toBe("timeout");
    expect(message?.raw?.targetUsername).toBe("cat");
    expect(message?.raw?.durationSeconds).toBe(600);
  });

  it("normalizes CLEARCHAT ban into a ban event", () => {
    const line = "@tmi-sent-ts=1710000003000 :tmi.twitch.tv CLEARCHAT #twitch :cat";
    const parsed = parseIrcMessage(line);
    const message = parsed ? normalizeTwitchMessage(parsed) : null;

    expect(message?.platform).toBe("twitch");
    expect(message?.username).toBe("system");
    expect(message?.message).toContain("banned");
    expect(message?.raw?.eventType).toBe("ban");
    expect(message?.raw?.targetUsername).toBe("cat");
  });
});
