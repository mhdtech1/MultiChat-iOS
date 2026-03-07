import EventEmitter from "eventemitter3";
const DEFAULT_POLL_INTERVAL_MS = 5000;
const MIN_POLL_INTERVAL_MS = 1000;
const MAX_POLL_INTERVAL_MS = 15000;
export class YouTubeAdapter {
    emitter = new EventEmitter();
    status = "disconnected";
    channel;
    auth;
    transport;
    logger;
    pollTimer = null;
    nextPageToken;
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS;
    seenIds = new Set();
    stopped = true;
    constructor(options) {
        this.channel = options.channel;
        this.auth = options.auth ?? {};
        this.transport = options.transport ?? {};
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
    async connect() {
        if (!this.auth.liveChatId) {
            const error = "YouTube adapter requires a Live Chat ID.";
            this.logger?.(error);
            this.setStatus("error");
            throw new Error(error);
        }
        if (!this.transport.fetchMessages && !this.auth.apiKey) {
            const error = "YouTube adapter requires OAuth transport or API key for polling.";
            this.logger?.(error);
            this.setStatus("error");
            throw new Error(error);
        }
        this.stopped = false;
        this.setStatus("connecting");
        this.logger?.("Connecting to YouTube Live Chat...");
        await this.fetchAndEmit();
        this.setStatus("connected");
        this.scheduleNextPoll();
    }
    clampPollingInterval(value) {
        if (!value || !Number.isFinite(value))
            return DEFAULT_POLL_INTERVAL_MS;
        return Math.max(MIN_POLL_INTERVAL_MS, Math.min(MAX_POLL_INTERVAL_MS, Math.floor(value)));
    }
    async fetchPage() {
        if (!this.auth.liveChatId) {
            throw new Error("YouTube live chat id is missing.");
        }
        if (this.transport.fetchMessages) {
            return this.transport.fetchMessages({
                liveChatId: this.auth.liveChatId,
                pageToken: this.nextPageToken
            });
        }
        if (!this.auth.apiKey) {
            throw new Error("No YouTube polling transport or API key is configured.");
        }
        const params = new URLSearchParams({
            part: "snippet,authorDetails",
            liveChatId: this.auth.liveChatId,
            key: this.auth.apiKey,
            maxResults: "200"
        });
        if (this.nextPageToken)
            params.set("pageToken", this.nextPageToken);
        const response = await fetch(`https://www.googleapis.com/youtube/v3/liveChat/messages?${params}`);
        if (!response.ok) {
            throw new Error(`YouTube polling request failed (${response.status}).`);
        }
        return (await response.json());
    }
    asMessageItem(item) {
        if (!item || typeof item !== "object")
            return null;
        return item;
    }
    toMessage(item) {
        const id = typeof item.id === "string" ? item.id : "";
        if (!id || this.seenIds.has(id))
            return null;
        const snippet = item.snippet ?? {};
        const author = item.authorDetails ?? {};
        const text = typeof snippet.displayMessage === "string" ? snippet.displayMessage : "";
        if (!text)
            return null;
        const badges = [];
        if (author.isChatOwner)
            badges.push("owner");
        if (author.isChatModerator)
            badges.push("moderator");
        if (author.isChatSponsor)
            badges.push("member");
        this.seenIds.add(id);
        if (this.seenIds.size > 5000) {
            const compact = Array.from(this.seenIds).slice(-3000);
            this.seenIds = new Set(compact);
        }
        return {
            id,
            platform: "youtube",
            channel: this.channel,
            username: author.channelId ?? "",
            displayName: author.displayName ?? "YouTube user",
            message: text,
            timestamp: snippet.publishedAt ?? new Date().toISOString(),
            badges,
            raw: item
        };
    }
    async fetchAndEmit() {
        const data = await this.fetchPage();
        this.nextPageToken = typeof data.nextPageToken === "string" ? data.nextPageToken : this.nextPageToken;
        this.pollIntervalMs = this.clampPollingInterval(data.pollingIntervalMillis);
        if (Array.isArray(data.items)) {
            for (const rawItem of data.items) {
                const item = this.asMessageItem(rawItem);
                if (!item)
                    continue;
                const message = this.toMessage(item);
                if (message) {
                    this.emitter.emit("message", message);
                }
            }
        }
    }
    scheduleNextPoll() {
        if (this.stopped)
            return;
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
        }
        this.pollTimer = setTimeout(() => {
            void this.pollLoop();
        }, this.pollIntervalMs);
    }
    async pollLoop() {
        if (this.stopped)
            return;
        try {
            await this.fetchAndEmit();
            if (this.status !== "connected") {
                this.setStatus("connected");
            }
        }
        catch (error) {
            this.logger?.(`YouTube polling error: ${String(error)}`);
            this.setStatus("error");
        }
        finally {
            this.scheduleNextPoll();
        }
    }
    async disconnect() {
        this.stopped = true;
        if (this.pollTimer)
            clearTimeout(this.pollTimer);
        this.pollTimer = null;
        this.nextPageToken = undefined;
        this.setStatus("disconnected");
    }
    async sendMessage(message) {
        const trimmed = message.trim();
        if (!trimmed)
            return;
        if (!this.auth.liveChatId) {
            throw new Error("YouTube live chat id is missing.");
        }
        if (!this.transport.sendMessage) {
            throw new Error("Sending YouTube chat messages requires OAuth sign-in.");
        }
        await this.transport.sendMessage({
            liveChatId: this.auth.liveChatId,
            message: trimmed
        });
    }
}
