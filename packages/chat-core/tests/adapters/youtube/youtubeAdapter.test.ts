import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { YouTubeAdapter } from "../../../src/adapters/youtube/youtubeAdapter";
import type { ChatAdapterStatus, ChatMessage } from "../../../src/types";

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("YouTubeAdapter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("fails to connect if liveChatId is missing", async () => {
    const adapter = new YouTubeAdapter({ channel: "mychannel" });
    const statuses: ChatAdapterStatus[] = [];
    adapter.onStatus((status) => statuses.push(status));

    await expect(adapter.connect()).rejects.toThrow("YouTube adapter requires a Live Chat ID.");
    expect(statuses).toContain("error");
  });

  it("fails to connect if both transport.fetchMessages and apiKey are missing", async () => {
    const adapter = new YouTubeAdapter({
      channel: "mychannel",
      auth: { liveChatId: "live_id_123" },
    });
    const statuses: ChatAdapterStatus[] = [];
    adapter.onStatus((status) => statuses.push(status));

    await expect(adapter.connect()).rejects.toThrow("YouTube adapter requires OAuth transport or API key for polling.");
    expect(statuses).toContain("error");
  });

  it("connects with API key, fetches initial messages, and polls using fetch API", async () => {
    const adapter = new YouTubeAdapter({
      channel: "mychannel",
      auth: { liveChatId: "live_id_123", apiKey: "api_key_456" },
    });

    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        nextPageToken: "token2",
        pollingIntervalMillis: 3000,
        items: [
          {
            id: "msg1",
            snippet: {
              displayMessage: "hello world",
              publishedAt: "2024-01-01T00:00:00Z",
            },
            authorDetails: {
              channelId: "author1",
              displayName: "Author One",
              isChatOwner: true,
            },
          },
        ],
      }),
    } as Response);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        nextPageToken: "token3",
        pollingIntervalMillis: 5000,
        items: [
          {
            id: "msg2",
            snippet: { displayMessage: "second message" },
            authorDetails: {
              channelId: "author2",
              displayName: "Author Two",
              isChatModerator: true,
            },
          },
        ],
      }),
    } as Response);

    const statuses: ChatAdapterStatus[] = [];
    const messages: ChatMessage[] = [];
    adapter.onStatus((status) => statuses.push(status));
    adapter.onMessage((message) => messages.push(message));

    await adapter.connect();

    expect(statuses).toContain("connecting");
    expect(statuses).toContain("connected");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url1 = fetchMock.mock.calls[0][0] as string;
    expect(url1).toContain("liveChatId=live_id_123");
    expect(url1).toContain("key=api_key_456");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      platform: "youtube",
      channel: "mychannel",
      username: "author1",
      displayName: "Author One",
      message: "hello world",
      timestamp: "2024-01-01T00:00:00Z",
      badges: ["owner"],
    });

    vi.advanceTimersByTime(3000);
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const url2 = fetchMock.mock.calls[1][0] as string;
    expect(url2).toContain("pageToken=token2");
    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({
      platform: "youtube",
      channel: "mychannel",
      username: "author2",
      displayName: "Author Two",
      message: "second message",
      badges: ["moderator"],
    });

    await adapter.disconnect();
    expect(statuses).toContain("disconnected");
  });

  it("connects and polls using provided transport", async () => {
    const mockFetchMessages = vi
      .fn()
      .mockResolvedValueOnce({
        nextPageToken: "token_t1",
        pollingIntervalMillis: 4000,
        items: [
          {
            id: "t_msg1",
            snippet: { displayMessage: "transport message" },
            authorDetails: { channelId: "t_author", isChatSponsor: true },
          },
        ],
      })
      .mockResolvedValueOnce({
        nextPageToken: "token_t2",
        pollingIntervalMillis: 4000,
        items: [],
      });

    const adapter = new YouTubeAdapter({
      channel: "mychannel",
      auth: { liveChatId: "live_id_789" },
      transport: { fetchMessages: mockFetchMessages },
    });

    const messages: ChatMessage[] = [];
    adapter.onMessage((message) => messages.push(message));

    await adapter.connect();

    expect(mockFetchMessages).toHaveBeenCalledTimes(1);
    expect(mockFetchMessages).toHaveBeenCalledWith({
      liveChatId: "live_id_789",
      pageToken: undefined,
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      platform: "youtube",
      channel: "mychannel",
      username: "t_author",
      message: "transport message",
      badges: ["member"],
    });

    vi.advanceTimersByTime(4000);
    await flushPromises();

    expect(mockFetchMessages).toHaveBeenCalledTimes(2);
    expect(mockFetchMessages).toHaveBeenCalledWith({
      liveChatId: "live_id_789",
      pageToken: "token_t1",
    });

    await adapter.disconnect();
  });

  it("sends message using provided transport", async () => {
    const mockSendMessage = vi.fn().mockResolvedValue(undefined);
    const mockFetchMessages = vi.fn().mockResolvedValue({ items: [] });

    const adapter = new YouTubeAdapter({
      channel: "mychannel",
      auth: { liveChatId: "live_id_send" },
      transport: {
        fetchMessages: mockFetchMessages,
        sendMessage: mockSendMessage,
      },
    });

    await adapter.connect();

    await adapter.sendMessage("   hello sending!   ");
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockSendMessage).toHaveBeenCalledWith({
      liveChatId: "live_id_send",
      message: "hello sending!",
    });
  });

  it("fails to send message if transport.sendMessage is missing", async () => {
    const mockFetchMessages = vi.fn().mockResolvedValue({ items: [] });
    const adapter = new YouTubeAdapter({
      channel: "mychannel",
      auth: { liveChatId: "live_id_send" },
      transport: { fetchMessages: mockFetchMessages },
    });

    await adapter.connect();

    await expect(adapter.sendMessage("hello")).rejects.toThrow("Sending YouTube chat messages requires OAuth sign-in.");
  });

  it("fails to send message if liveChatId is missing", async () => {
    const adapter = new YouTubeAdapter({
      channel: "mychannel",
      auth: { apiKey: "api_key" },
    });

    await expect(adapter.sendMessage("hello")).rejects.toThrow("YouTube live chat id is missing.");
  });
});
