import EventEmitter from "eventemitter3";
const KICK_REAUTH_REQUIRED_MESSAGE = "Kick session expired. Sign in to Kick again.";
const KICK_PUSHER_WS_URL = "wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679";
const decodeKickEmotes = (input) => input.replace(/\[emote:\d+:([^[\]]+)\]/g, "$1");
const asRecord = (value) => {
    if (!value || typeof value !== "object")
        return null;
    return value;
};
const readFirstString = (record, keys) => {
    for (const key of keys) {
        const value = record[key];
        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
    }
    return "";
};
const readFirstNumber = (record, keys) => {
    for (const key of keys) {
        const value = record[key];
        if (typeof value === "number" && Number.isFinite(value)) {
            return value;
        }
        if (typeof value === "string") {
            const parsed = Number.parseInt(value, 10);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }
    }
    return null;
};
const includesAnyToken = (value, tokens) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized)
        return false;
    return tokens.some((token) => normalized.includes(token));
};
const resolveKickModerationKind = (eventName, payload) => {
    const type = typeof payload.type === "string" ? payload.type : "";
    const eventType = typeof payload.eventType === "string" ? payload.eventType : "";
    const payloadEvent = typeof payload.event === "string" ? payload.event : "";
    const haystack = `${eventName} ${type} ${eventType} ${payloadEvent}`.toLowerCase();
    if (includesAnyToken(haystack, ["unban", "unbanned"]))
        return "unban";
    if (includesAnyToken(haystack, ["chat_clear", "chat-cleared", "chat cleared", "chatcleared"]))
        return "chat_clear";
    if (includesAnyToken(haystack, ["delete", "deleted", "removed", "remove_message", "message_removed"]))
        return "delete";
    if (includesAnyToken(haystack, ["timeout", "timedout", "timed_out", "muted", "temporary_ban", "temporary ban"])) {
        return "timeout";
    }
    if (includesAnyToken(haystack, ["ban", "banned"]))
        return "ban";
    return null;
};
const readKickTargetUsername = (payload) => {
    const direct = readFirstString(payload, [
        "targetUsername",
        "target_username",
        "username",
        "login",
        "slug",
        "user_login",
        "display_name",
        "displayName"
    ]);
    if (direct)
        return direct;
    const nestedKeys = ["user", "target_user", "target", "sender", "message", "chat_message", "banned_user"];
    for (const key of nestedKeys) {
        const nested = asRecord(payload[key]);
        if (!nested)
            continue;
        const nestedUsername = readFirstString(nested, ["username", "slug", "login", "display_name", "displayName", "name"]);
        if (nestedUsername)
            return nestedUsername;
    }
    return "";
};
const readKickTargetMessageId = (payload) => {
    const direct = readFirstString(payload, [
        "targetMessageId",
        "target_message_id",
        "target-msg-id",
        "message_id",
        "chat_message_id",
        "chat_entry_id",
        "id"
    ]);
    if (direct)
        return direct;
    const nestedKeys = ["message", "chat_message", "target_message"];
    for (const key of nestedKeys) {
        const nested = asRecord(payload[key]);
        if (!nested)
            continue;
        const nestedId = readFirstString(nested, ["id", "message_id", "chat_entry_id"]);
        if (nestedId)
            return nestedId;
    }
    return "";
};
const readKickDurationSeconds = (payload) => {
    const direct = readFirstNumber(payload, [
        "durationSeconds",
        "duration_seconds",
        "duration",
        "ban_duration",
        "timeout",
        "seconds"
    ]);
    if (direct && direct > 0)
        return direct;
    const nestedKeys = ["metadata", "user", "target_user"];
    for (const key of nestedKeys) {
        const nested = asRecord(payload[key]);
        if (!nested)
            continue;
        const nestedDuration = readFirstNumber(nested, ["durationSeconds", "duration_seconds", "duration", "ban_duration", "timeout"]);
        if (nestedDuration && nestedDuration > 0)
            return nestedDuration;
    }
    return null;
};
const parseJson = (raw) => {
    try {
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
};
const parseKickBadges = (badges) => {
    if (!Array.isArray(badges))
        return [];
    return badges
        .map((badge) => {
        if (typeof badge === "string")
            return badge;
        if (!badge || typeof badge !== "object")
            return "";
        const record = badge;
        const type = typeof record.type === "string" ? record.type : "";
        const text = typeof record.text === "string" ? record.text : "";
        const count = typeof record.count === "number" ? `:${record.count}` : "";
        return `${type || text}${count}`.trim();
    })
        .filter(Boolean);
};
export class KickAdapter {
    emitter = new EventEmitter();
    socket = null;
    reconnectTimer = null;
    reconnectAttempts = 0;
    chatroomId = null;
    broadcasterUserId = null;
    status = "disconnected";
    channel;
    auth;
    accessToken;
    chatroomResolver;
    refreshAccessToken;
    logger;
    constructor(options) {
        this.channel = options.channel;
        this.auth = options.auth ?? {};
        this.accessToken = this.auth.accessToken?.trim() ?? "";
        this.chatroomResolver = options.resolveChatroomId;
        this.refreshAccessToken = options.refreshAccessToken;
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
    extractChatroomId(payload) {
        if (!payload || typeof payload !== "object")
            return null;
        const record = payload;
        if (typeof record.chatroom?.id === "number")
            return record.chatroom.id;
        if (typeof record.chatroom_id === "number")
            return record.chatroom_id;
        if (Array.isArray(record.data)) {
            for (const item of record.data) {
                const found = this.extractChatroomId(item);
                if (found)
                    return found;
            }
        }
        else if (record.data && typeof record.data === "object") {
            const found = this.extractChatroomId(record.data);
            if (found)
                return found;
        }
        return null;
    }
    extractBroadcasterUserId(payload) {
        if (!payload || typeof payload !== "object")
            return null;
        const record = payload;
        if (typeof record.broadcaster_user_id === "number")
            return record.broadcaster_user_id;
        if (typeof record.user_id === "number")
            return record.user_id;
        const user = record.user;
        if (user && typeof user === "object") {
            const userId = user.id;
            if (typeof userId === "number")
                return userId;
        }
        if (Array.isArray(record.data)) {
            for (const item of record.data) {
                const found = this.extractBroadcasterUserId(item);
                if (found)
                    return found;
            }
        }
        else if (record.data && typeof record.data === "object") {
            const found = this.extractBroadcasterUserId(record.data);
            if (found)
                return found;
        }
        return null;
    }
    async resolveChatroomId() {
        if (this.chatroomResolver) {
            const resolved = await this.chatroomResolver(this.channel);
            if (Number.isFinite(resolved) && resolved > 0) {
                return resolved;
            }
        }
        const endpoint = `https://kick.com/api/v2/channels/${encodeURIComponent(this.channel)}`;
        const response = await fetch(endpoint, {
            headers: {
                Accept: "application/json, text/plain, */*"
            }
        });
        const text = await response.text();
        const payload = text ? parseJson(text) : null;
        if (!response.ok || !payload) {
            const detail = typeof payload === "object" && payload && "message" in payload && typeof payload.message === "string"
                ? payload.message
                : `Kick channel lookup failed (${response.status})`;
            throw new Error(detail);
        }
        const chatroomId = this.extractChatroomId(payload);
        if (!chatroomId) {
            throw new Error("Kick chatroom lookup failed. Kick may be blocking automated requests; try again in a few minutes.");
        }
        return chatroomId;
    }
    createSocketUrl() {
        const url = new URL(KICK_PUSHER_WS_URL);
        url.searchParams.set("protocol", "7");
        url.searchParams.set("client", "js");
        url.searchParams.set("version", "8.4.0");
        url.searchParams.set("flash", "false");
        return url.toString();
    }
    normalizeKickMessage(data) {
        const rawContent = typeof data.content === "string" ? data.content : "";
        if (!rawContent)
            return null;
        const sender = data.sender ?? {};
        const username = sender.username || sender.slug || "kick-user";
        const identity = sender.identity ?? {};
        const badges = parseKickBadges(identity.badges);
        return {
            id: typeof data.id === "string" || typeof data.id === "number" ? String(data.id) : `${Date.now()}`,
            platform: "kick",
            channel: this.channel,
            username,
            displayName: username,
            message: decodeKickEmotes(rawContent),
            timestamp: data.created_at ?? new Date().toISOString(),
            badges,
            color: identity.color,
            raw: data
        };
    }
    normalizeKickModerationEvent(eventName, payload) {
        const eventKind = resolveKickModerationKind(eventName, payload);
        if (!eventKind)
            return null;
        const targetUsername = readKickTargetUsername(payload);
        const targetMessageId = readKickTargetMessageId(payload);
        const durationSeconds = readKickDurationSeconds(payload);
        let content = "A moderation event occurred.";
        if (eventKind === "delete") {
            content = targetUsername
                ? `A moderator deleted ${targetUsername}'s message.`
                : "A moderator deleted a message.";
        }
        else if (eventKind === "timeout") {
            const targetLabel = targetUsername || "A user";
            content = durationSeconds ? `${targetLabel} was timed out for ${durationSeconds}s.` : `${targetLabel} was timed out.`;
        }
        else if (eventKind === "ban") {
            const targetLabel = targetUsername || "A user";
            content = `${targetLabel} was banned.`;
        }
        else if (eventKind === "unban") {
            const targetLabel = targetUsername || "A user";
            content = `${targetLabel} was unbanned.`;
        }
        else if (eventKind === "chat_clear") {
            content = "Chat was cleared by a moderator.";
        }
        return {
            id: `event-${eventKind}-${targetMessageId || Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            platform: "kick",
            channel: this.channel,
            username: "system",
            displayName: "System",
            message: content,
            timestamp: new Date().toISOString(),
            badges: [],
            color: "#f08a65",
            raw: {
                ...payload,
                eventType: eventKind,
                eventName,
                targetUsername: targetUsername || undefined,
                targetMessageId: targetMessageId || undefined,
                durationSeconds: durationSeconds ?? undefined
            }
        };
    }
    handleSocketMessage(raw) {
        const envelope = parseJson(raw);
        if (!envelope?.event)
            return;
        if (envelope.event === "pusher:ping") {
            this.socket?.send(JSON.stringify({ event: "pusher:pong", data: {} }));
            return;
        }
        if (envelope.event.startsWith("pusher:") || envelope.event.startsWith("pusher_internal:"))
            return;
        const payload = typeof envelope.data === "string"
            ? parseJson(envelope.data)
            : asRecord(envelope.data);
        if (!payload)
            return;
        if (envelope.event === "App\\Events\\ChatMessageEvent") {
            const message = this.normalizeKickMessage(payload);
            if (message) {
                this.emitter.emit("message", message);
            }
            return;
        }
        const moderationEvent = this.normalizeKickModerationEvent(envelope.event, payload);
        if (moderationEvent) {
            this.emitter.emit("message", moderationEvent);
        }
    }
    scheduleReconnect() {
        if (this.status === "disconnected")
            return;
        if (!this.chatroomId)
            return;
        const delay = Math.min(30_000, 1000 * 2 ** this.reconnectAttempts);
        this.reconnectAttempts += 1;
        this.setStatus("connecting");
        this.reconnectTimer = globalThis.setTimeout(() => {
            this.reconnectTimer = null;
            void this.connectSocketOnly();
        }, delay);
    }
    async connectSocketOnly() {
        if (!this.chatroomId)
            return;
        if (this.socket)
            return;
        const socket = new WebSocket(this.createSocketUrl());
        this.socket = socket;
        socket.addEventListener("open", () => {
            this.reconnectAttempts = 0;
            this.setStatus("connected");
            socket.send(JSON.stringify({
                event: "pusher:subscribe",
                data: { auth: "", channel: `chatrooms.${this.chatroomId}.v2` }
            }));
            this.logger?.(`Kick connected to ${this.channel} (chatroom ${this.chatroomId}).`);
        });
        socket.addEventListener("message", (event) => {
            this.handleSocketMessage(String(event.data));
        });
        socket.addEventListener("close", () => {
            this.socket = null;
            this.logger?.("Kick websocket closed.");
            this.scheduleReconnect();
        });
        socket.addEventListener("error", () => {
            this.setStatus("error");
            this.logger?.("Kick websocket error.");
        });
    }
    async connect() {
        if (this.socket || this.status === "connecting")
            return;
        this.setStatus("connecting");
        this.logger?.("Connecting to Kick chat...");
        if (!this.chatroomId) {
            this.chatroomId = await this.resolveChatroomId();
        }
        await this.connectSocketOnly();
    }
    async disconnect() {
        this.setStatus("disconnected");
        if (this.reconnectTimer) {
            globalThis.clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.reconnectAttempts = 0;
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
    }
    async resolveBroadcasterUserId() {
        if (this.broadcasterUserId) {
            return this.broadcasterUserId;
        }
        if (this.auth.guest) {
            throw new Error("Kick send requires a signed-in account.");
        }
        let token = await this.ensureAccessToken();
        const params = new URLSearchParams();
        params.append("slug", this.channel);
        let response = await fetch(`https://api.kick.com/public/v1/channels?${params.toString()}`, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json"
            }
        });
        if ((response.status === 401 || response.status === 403) && this.refreshAccessToken) {
            token = await this.refreshKickTokenOrThrow();
            response = await fetch(`https://api.kick.com/public/v1/channels?${params.toString()}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/json"
                }
            });
        }
        const text = await response.text();
        const payload = text ? parseJson(text) : null;
        let broadcasterUserId = response.ok && payload ? this.extractBroadcasterUserId(payload) : null;
        if (!broadcasterUserId) {
            // Fallback to public website channel payload when API auth is restricted.
            const fallback = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(this.channel)}`, {
                headers: {
                    Accept: "application/json, text/plain, */*"
                }
            });
            const fallbackText = await fallback.text();
            const fallbackPayload = fallbackText ? parseJson(fallbackText) : null;
            broadcasterUserId = fallback.ok && fallbackPayload ? this.extractBroadcasterUserId(fallbackPayload) : null;
        }
        if (!broadcasterUserId) {
            throw new Error(`Kick broadcaster ID lookup failed (${response.status}).`);
        }
        this.broadcasterUserId = broadcasterUserId;
        return broadcasterUserId;
    }
    async sendMessage(message) {
        const content = message.trim();
        if (!content)
            return;
        if (content.length > 500) {
            throw new Error("Message is too long.");
        }
        if (this.auth.guest) {
            throw new Error("Kick send requires a signed-in account.");
        }
        let token = await this.ensureAccessToken();
        const broadcasterUserId = await this.resolveBroadcasterUserId();
        let response = await fetch("https://api.kick.com/public/v1/chat", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
                Accept: "application/json"
            },
            body: JSON.stringify({
                broadcaster_user_id: broadcasterUserId,
                content,
                type: "user"
            })
        });
        if ((response.status === 401 || response.status === 403) && this.refreshAccessToken) {
            token = await this.refreshKickTokenOrThrow();
            response = await fetch("https://api.kick.com/public/v1/chat", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                    Accept: "application/json"
                },
                body: JSON.stringify({
                    broadcaster_user_id: broadcasterUserId,
                    content,
                    type: "user"
                })
            });
        }
        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                throw new Error(KICK_REAUTH_REQUIRED_MESSAGE);
            }
            const text = await response.text();
            const parsed = text ? parseJson(text) : null;
            const messageText = parsed && typeof parsed.message === "string"
                ? parsed.message
                : `Kick message send failed (${response.status}).`;
            throw new Error(messageText);
        }
    }
    async ensureAccessToken() {
        if (this.accessToken) {
            return this.accessToken;
        }
        return this.refreshKickTokenOrThrow();
    }
    async refreshKickTokenOrThrow() {
        if (!this.refreshAccessToken) {
            throw new Error(KICK_REAUTH_REQUIRED_MESSAGE);
        }
        const nextToken = (await this.refreshAccessToken())?.trim() ?? "";
        if (!nextToken) {
            throw new Error(KICK_REAUTH_REQUIRED_MESSAGE);
        }
        this.accessToken = nextToken;
        return nextToken;
    }
}
