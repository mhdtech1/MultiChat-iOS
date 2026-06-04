import { describe, expect, it, vi } from "vitest";
import { TikTokAdapter, type TikTokTransportEvent } from "../../../src/adapters/tiktok/tiktokAdapter";
import type { ChatAdapterStatus, ChatMessage } from "../../../src/types";

const mockTransport = () => {
  let eventHandler: ((event: TikTokTransportEvent) => void) | null = null;

  return {
    connect: vi.fn().mockResolvedValue({
      connectionId: "test-conn-1",
      roomId: "test-room-1",
    }),
    disconnect: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    onEvent: vi.fn((handler: (event: TikTokTransportEvent) => void) => {
      eventHandler = handler;
      return () => {
        eventHandler = null;
      };
    }),
    emitEvent: (event: TikTokTransportEvent) => {
      eventHandler?.(event);
    },
  };
};

describe("TikTokAdapter", () => {
  it("connects and sets status correctly", async () => {
    const transport = mockTransport();
    const adapter = new TikTokAdapter({ channel: "testchannel", transport });
    const statuses: ChatAdapterStatus[] = [];
    adapter.onStatus((status) => statuses.push(status));

    await adapter.connect();

    expect(transport.connect).toHaveBeenCalledWith({ channel: "testchannel" });
    expect(statuses).toContain("connecting");
    expect(statuses).toContain("connected");
  });

  it("handles transport connected and disconnected events", async () => {
    const transport = mockTransport();
    const adapter = new TikTokAdapter({ channel: "testchannel", transport });
    const statuses: ChatAdapterStatus[] = [];
    adapter.onStatus((status) => statuses.push(status));

    await adapter.connect();

    transport.emitEvent({ connectionId: "test-conn-1", type: "disconnected" });
    expect(statuses).toContain("disconnected");

    transport.emitEvent({ connectionId: "test-conn-1", type: "connected" });
    expect(statuses[statuses.length - 1]).toBe("connected");
  });

  it("handles error events", async () => {
    const transport = mockTransport();
    const adapter = new TikTokAdapter({ channel: "testchannel", transport });
    const statuses: ChatAdapterStatus[] = [];
    adapter.onStatus((status) => statuses.push(status));

    await adapter.connect();

    transport.emitEvent({
      connectionId: "test-conn-1",
      type: "error",
      error: "test error",
    });
    expect(statuses[statuses.length - 1]).toBe("error");
  });

  it("emits chat messages", async () => {
    const transport = mockTransport();
    const adapter = new TikTokAdapter({ channel: "testchannel", transport });
    const messages: ChatMessage[] = [];
    adapter.onMessage((message) => messages.push(message));

    await adapter.connect();

    const mockMessage: ChatMessage = {
      id: "tiktok-msg-1",
      platform: "tiktok",
      channel: "testchannel",
      username: "testuser",
      displayName: "testuser",
      message: "hello tiktok",
      timestamp: "2026-01-01T00:00:00.000Z",
    };

    transport.emitEvent({
      connectionId: "test-conn-1",
      type: "chat",
      message: mockMessage,
    });

    expect(messages).toEqual([mockMessage]);
  });

  it("disconnects and unbinds events", async () => {
    const transport = mockTransport();
    const adapter = new TikTokAdapter({ channel: "testchannel", transport });
    const statuses: ChatAdapterStatus[] = [];
    adapter.onStatus((status) => statuses.push(status));

    await adapter.connect();
    await adapter.disconnect();

    expect(transport.disconnect).toHaveBeenCalledWith({
      connectionId: "test-conn-1",
    });
    expect(statuses[statuses.length - 1]).toBe("disconnected");

    transport.emitEvent({ connectionId: "test-conn-1", type: "error" });
    expect(statuses[statuses.length - 1]).toBe("disconnected");
  });

  it("sends a message correctly", async () => {
    const transport = mockTransport();
    const adapter = new TikTokAdapter({ channel: "testchannel", transport });

    await adapter.connect();
    await adapter.sendMessage("hello from adapter");

    expect(transport.sendMessage).toHaveBeenCalledWith({
      connectionId: "test-conn-1",
      message: "hello from adapter",
    });
  });

  it("ignores empty messages", async () => {
    const transport = mockTransport();
    const adapter = new TikTokAdapter({ channel: "testchannel", transport });

    await adapter.connect();
    await adapter.sendMessage("   ");

    expect(transport.sendMessage).not.toHaveBeenCalled();
  });

  it("throws error when sending a message before connecting", async () => {
    const transport = mockTransport();
    const adapter = new TikTokAdapter({ channel: "testchannel", transport });

    await expect(adapter.sendMessage("hello")).rejects.toThrow("TikTok connection is not ready.");
  });

  it("throws error when transport does not support sending messages", async () => {
    const transport = mockTransport();
    const { sendMessage, ...readOnlyTransport } = transport;
    void sendMessage;
    const adapter = new TikTokAdapter({
      channel: "testchannel",
      transport: readOnlyTransport,
    });

    await adapter.connect();

    await expect(adapter.sendMessage("hello")).rejects.toThrow("TikTok sending is not enabled for this alpha build.");
  });

  it("ignores events from other connections", async () => {
    const transport = mockTransport();
    const adapter = new TikTokAdapter({ channel: "testchannel", transport });
    const statuses: ChatAdapterStatus[] = [];
    adapter.onStatus((status) => statuses.push(status));

    await adapter.connect();

    transport.emitEvent({ connectionId: "other-conn", type: "disconnected" });
    expect(statuses[statuses.length - 1]).toBe("connected");
  });
});
