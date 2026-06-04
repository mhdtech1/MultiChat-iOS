import { describe, expect, it } from "vitest";
import {
  normalizeTwitchMessage,
  parseTwitchBadges,
} from "../../../src/adapters/twitch/normalize";
import { parseIrcMessage } from "../../../src/adapters/twitch/ircParser";

describe("parseTwitchBadges", () => {
  it("parses valid badges array", () => {
    const result = parseTwitchBadges(["admin/1", "subscriber/3000"]);

    expect(result).toEqual([
      { setId: "admin", versionId: "1", key: "admin/1" },
      { setId: "subscriber", versionId: "3000", key: "subscriber/3000" },
    ]);
  });

  it("handles raw badges string", () => {
    const result = parseTwitchBadges([], "moderator/1,premium/1");

    expect(result).toEqual([
      { setId: "moderator", versionId: "1", key: "moderator/1" },
      { setId: "premium", versionId: "1", key: "premium/1" },
    ]);
  });

  it("deduplicates badges from array and string", () => {
    const result = parseTwitchBadges(["admin/1"], "admin/1,subscriber/12");

    expect(result).toEqual([
      { setId: "admin", versionId: "1", key: "admin/1" },
      { setId: "subscriber", versionId: "12", key: "subscriber/12" },
    ]);
  });

  it("handles malformed badges", () => {
    const result = parseTwitchBadges(["admin", "subscriber/", "/1", ""]);

    expect(result).toEqual([]);
  });

  it("trims whitespace and normalizes case for setId", () => {
    const result = parseTwitchBadges([" Admin / 1 "]);

    expect(result).toEqual([{ setId: "admin", versionId: "1", key: "admin/1" }]);
  });

  it("handles non-string inputs safely", () => {
    const result = parseTwitchBadges([null, undefined, 123] as unknown as string[]);

    expect(result).toEqual([]);
  });
});

describe("normalizeTwitchMessage", () => {
  describe("PRIVMSG", () => {
    it("normalizes standard message with tags", () => {
      const line =
        "@badges=subscriber/3;color=#FF0000;display-name=TestUser;id=msg-123;user-id=12345 " +
        ":testuser!testuser@testuser.tmi.twitch.tv PRIVMSG #channel :Hello world";
      const parsed = parseIrcMessage(line);
      const result = parsed ? normalizeTwitchMessage(parsed) : null;

      expect(result).toMatchObject({
        platform: "twitch",
        channel: "channel",
        username: "testuser",
        displayName: "TestUser",
        message: "Hello world",
        badges: ["subscriber/3"],
        color: "#FF0000",
      });
      expect(result?.id).toBe("msg-123");
      expect(result?.raw?.parsedBadges).toEqual([
        { setId: "subscriber", versionId: "3", key: "subscriber/3" },
      ]);
    });

    it("handles messages without optional tags", () => {
      const line = ":user!user@user.tmi.twitch.tv PRIVMSG #channel :Hello";
      const parsed = parseIrcMessage(line);
      const result = parsed ? normalizeTwitchMessage(parsed) : null;

      expect(result?.username).toBe("user");
      expect(result?.displayName).toBe("user");
      expect(result?.badges).toEqual([]);
    });

    it("handles messages with emotes", () => {
      const line = "@emotes=25:0-4,6-10 :user!user@user.tmi.twitch.tv PRIVMSG #channel :Kappa Kappa";
      const parsed = parseIrcMessage(line);
      const result = parsed ? normalizeTwitchMessage(parsed) : null;

      expect(result?.message).toBe("Kappa Kappa");
    });
  });

  describe("CLEARCHAT", () => {
    it("normalizes timeout event", () => {
      const line = "@ban-duration=600;target-user-id=12345 :tmi.twitch.tv CLEARCHAT #channel :targetuser";
      const parsed = parseIrcMessage(line);
      const result = parsed ? normalizeTwitchMessage(parsed) : null;

      expect(result?.raw?.eventType).toBe("timeout");
      expect(result?.raw?.targetUsername).toBe("targetuser");
    });

    it("normalizes ban event without duration", () => {
      const line = "@target-user-id=12345 :tmi.twitch.tv CLEARCHAT #channel :targetuser";
      const parsed = parseIrcMessage(line);
      const result = parsed ? normalizeTwitchMessage(parsed) : null;

      expect(result?.raw?.eventType).toBe("ban");
    });
  });

  describe("CLEARMSG", () => {
    it("normalizes message deletion", () => {
      const line = "@login=baduser;target-msg-id=deleted-msg-123 :tmi.twitch.tv CLEARMSG #channel :Deleted message";
      const parsed = parseIrcMessage(line);
      const result = parsed ? normalizeTwitchMessage(parsed) : null;

      expect(result?.raw?.eventType).toBe("delete");
      expect(result?.raw?.targetMessageId).toBe("deleted-msg-123");
    });
  });
});
