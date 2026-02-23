import EventEmitter from "eventemitter3";
import type { ChatAdapter, ChatAdapterOptions, ChatAdapterStatus, ChatMessage } from "../../types";

type TikTokTransportEvent = {
  connectionId: string;
  type: "connected" | "disconnected" | "chat" | "error";
  roomId?: string;
  message?: ChatMessage;
  error?: string;
};

type TikTokTransport = {
  connect: (payload: { channel: string }) => Promise<{ connectionId: string; roomId?: string }>;
  disconnect: (payload: { connectionId: string }) => Promise<void>;
  sendMessage?: (payload: { connectionId: string; message: string }) => Promise<void>;
  onEvent: (handler: (event: TikTokTransportEvent) => void) => () => void;
};

export class TikTokAdapter implements ChatAdapter {
  private emitter = new EventEmitter();
  private status: ChatAdapterStatus = "disconnected";
  private readonly channel: string;
  private readonly transport: TikTokTransport;
  private readonly logger?: (message: string) => void;
  private connectionId: string | null = null;
  private unsubscribeTransport: (() => void) | null = null;

  constructor(options: ChatAdapterOptions & { transport: TikTokTransport }) {
    this.channel = options.channel;
    this.transport = options.transport;
    this.logger = options.logger;
  }

  onMessage(handler: (message: ChatMessage) => void) {
    this.emitter.on("message", handler);
  }

  onStatus(handler: (status: ChatAdapterStatus) => void) {
    this.emitter.on("status", handler);
  }

  private setStatus(status: ChatAdapterStatus) {
    this.status = status;
    this.emitter.emit("status", status);
  }

  private bindTransportEvents() {
    if (this.unsubscribeTransport) return;
    this.unsubscribeTransport = this.transport.onEvent((event) => {
      if (!this.connectionId || event.connectionId !== this.connectionId) return;
      if (event.type === "chat" && event.message) {
        this.emitter.emit("message", event.message);
        return;
      }
      if (event.type === "connected") {
        if (this.status !== "connected") this.setStatus("connected");
        return;
      }
      if (event.type === "disconnected") {
        this.setStatus("disconnected");
        return;
      }
      if (event.type === "error") {
        this.setStatus("error");
        if (event.error) {
          this.logger?.(`TikTok error: ${event.error}`);
        }
      }
    });
  }

  async connect() {
    if (this.connectionId) return;
    this.setStatus("connecting");
    this.logger?.(`Connecting to TikTok LIVE chat for @${this.channel}...`);
    this.bindTransportEvents();

    const result = await this.transport.connect({ channel: this.channel });
    this.connectionId = result.connectionId;
    this.setStatus("connected");
    if (result.roomId) {
      this.logger?.(`TikTok connected to @${this.channel} (room ${result.roomId}).`);
    }
  }

  async disconnect() {
    if (this.connectionId) {
      const id = this.connectionId;
      this.connectionId = null;
      try {
        await this.transport.disconnect({ connectionId: id });
      } catch (error) {
        this.logger?.(`TikTok disconnect failed: ${String(error)}`);
      }
    }
    if (this.unsubscribeTransport) {
      this.unsubscribeTransport();
      this.unsubscribeTransport = null;
    }
    this.setStatus("disconnected");
  }

  async sendMessage(message: string) {
    const content = message.trim();
    if (!content) return;
    if (!this.connectionId) {
      throw new Error("TikTok connection is not ready.");
    }
    if (!this.transport.sendMessage) {
      throw new Error("TikTok sending is not enabled for this alpha build.");
    }
    await this.transport.sendMessage({
      connectionId: this.connectionId,
      message: content
    });
  }
}
