import EventEmitter from "eventemitter3";
export class TikTokAdapter {
    emitter = new EventEmitter();
    status = "disconnected";
    channel;
    transport;
    logger;
    connectionId = null;
    unsubscribeTransport = null;
    constructor(options) {
        this.channel = options.channel;
        this.transport = options.transport;
        this.logger = options.logger;
    }
    onMessage(handler) {
        this.emitter.on("message", handler);
    }
    onStatus(handler) {
        this.emitter.on("status", handler);
    }
    setStatus(status) {
        this.status = status;
        this.emitter.emit("status", status);
    }
    bindTransportEvents() {
        if (this.unsubscribeTransport)
            return;
        this.unsubscribeTransport = this.transport.onEvent((event) => {
            if (!this.connectionId || event.connectionId !== this.connectionId)
                return;
            if (event.type === "chat" && event.message) {
                this.emitter.emit("message", event.message);
                return;
            }
            if (event.type === "connected") {
                if (this.status !== "connected")
                    this.setStatus("connected");
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
        if (this.connectionId)
            return;
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
            }
            catch (error) {
                this.logger?.(`TikTok disconnect failed: ${String(error)}`);
            }
        }
        if (this.unsubscribeTransport) {
            this.unsubscribeTransport();
            this.unsubscribeTransport = null;
        }
        this.setStatus("disconnected");
    }
    async sendMessage(message) {
        const content = message.trim();
        if (!content)
            return;
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
