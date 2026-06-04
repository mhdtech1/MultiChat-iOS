import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TwitchAdapter } from "../../../src/adapters/twitch/twitchAdapter";
import { MockWebSocket } from "../../helpers/mockWebSocket";
import type { ChatMessage } from "../../../src/types";

describe("TwitchAdapter", () => {
  beforeEach(() => {
    MockWebSocket.reset();
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("connects, joins channel, responds to ping, and emits normalized chat messages", async () => {
    const adapter = new TwitchAdapter({ channel: "mychannel" });
    const statuses: string[] = [];
    const messages: ChatMessage[] = [];

    adapter.onStatus((status) => statuses.push(status));
    adapter.onMessage((message) => messages.push(message));

    await adapter.connect();
    const socket = MockWebSocket.instances[0];
    expect(socket).toBeDefined();

    socket.emit("open", {});
    vi.advanceTimersByTime(1200);

    expect(socket.sent).toContain("CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership");
    expect(socket.sent.some((entry) => entry.startsWith("PASS "))).toBe(true);
    expect(socket.sent.some((entry) => entry.startsWith("NICK "))).toBe(true);
    expect(socket.sent).toContain("JOIN #mychannel");

    socket.emit("message", { data: "PING :tmi.twitch.tv\r\n" });
    expect(socket.sent).toContain("PONG :tmi.twitch.tv");

    socket.emit("message", {
      data:
        "@display-name=TestUser;id=m1;tmi-sent-ts=1710000000000 " +
        ":testuser!testuser@testuser.tmi.twitch.tv PRIVMSG #mychannel :hello world\r\n",
    });

    expect(messages.at(-1)).toMatchObject({
      platform: "twitch",
      channel: "mychannel",
      username: "testuser",
      displayName: "TestUser",
      message: "hello world",
    });
    expect(statuses).toContain("connecting");
    expect(statuses).toContain("connected");
  });

  it("sends local echo for authenticated sendMessage", async () => {
    const adapter = new TwitchAdapter({
      channel: "mychannel",
      auth: { token: "abc", username: "sender" },
    });
    const messages: ChatMessage[] = [];
    adapter.onMessage((message) => messages.push(message));

    await adapter.connect();
    const socket = MockWebSocket.instances[0];
    socket.emit("open", {});
    vi.advanceTimersByTime(1200);

    await adapter.sendMessage("hello from me");

    expect(socket.sent).toContain("PRIVMSG #mychannel :hello from me");
    expect(messages.at(-1)).toMatchObject({
      platform: "twitch",
      channel: "mychannel",
      username: "sender",
      message: "hello from me",
      raw: {
        localEcho: true,
        parsedBadges: [],
      },
    });
  });
});
