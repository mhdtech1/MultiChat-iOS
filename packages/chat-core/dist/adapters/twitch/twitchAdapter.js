import EventEmitter from "eventemitter3";
import { parseIrcMessage } from "./ircParser";
import { normalizeTwitchMessage } from "./normalize";
const TWITCH_IRC_URL = "wss://irc-ws.chat.twitch.tv:443";
export class TwitchAdapter {
    emitter = new EventEmitter();
    socket = null;
    status = "disconnected";
    reconnectAttempts = 0;
    selfBadges = [];
    selfColor;
    selfDisplayName;
    channel;
    auth;
    logger;
    joinQueue = [];
    joinTimer = null;
    constructor(options) {
        this.channel = options.channel;
        this.auth = options.auth ?? {};
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
        if (this.socket)
            return;
        this.setStatus("connecting");
        this.logger?.("Connecting to Twitch IRC...");
        const socket = new WebSocket(TWITCH_IRC_URL);
        this.socket = socket;
        socket.addEventListener("open", () => {
            this.reconnectAttempts = 0;
            this.setStatus("connected");
            socket.send("CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership");
            const token = this.auth.token ? `oauth:${this.auth.token.replace(/^oauth:/, "")}` : "SCHMOOPIIE";
            const nick = this.auth.username || `justinfan${Math.floor(Math.random() * 100000)}`;
            socket.send(`PASS ${token}`);
            socket.send(`NICK ${nick}`);
            this.queueJoin(this.channel);
        });
        socket.addEventListener("message", (event) => {
            const data = String(event.data);
            data.split("\r\n").forEach((line) => {
                if (!line)
                    return;
                if (line.startsWith("PING")) {
                    socket.send(`PONG ${line.slice(5)}`);
                    return;
                }
                const parsed = parseIrcMessage(line);
                if (!parsed)
                    return;
                if (parsed.command === "USERSTATE") {
                    const channel = parsed.params[0]?.replace(/^#/, "") || this.channel;
                    const username = this.auth.username || parsed.tags["display-name"] || "twitch-user";
                    const displayName = parsed.tags["display-name"] || username;
                    const badges = parsed.tags.badges ? parsed.tags.badges.split(",").filter(Boolean) : [];
                    this.selfBadges = badges;
                    this.selfColor = parsed.tags.color || undefined;
                    this.selfDisplayName = displayName;
                    this.emitter.emit("message", {
                        id: `selfstate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                        platform: "twitch",
                        channel,
                        username,
                        displayName,
                        message: "",
                        timestamp: new Date().toISOString(),
                        badges,
                        color: this.selfColor,
                        raw: {
                            ...parsed.tags,
                            selfRoleState: true,
                            hidden: true
                        }
                    });
                    return;
                }
                const normalized = normalizeTwitchMessage(parsed);
                if (normalized) {
                    this.emitter.emit("message", normalized);
                }
            });
        });
        socket.addEventListener("close", () => {
            this.logger?.("Twitch IRC disconnected.");
            this.cleanupSocket();
            this.scheduleReconnect();
        });
        socket.addEventListener("error", () => {
            this.setStatus("error");
            this.logger?.("Twitch IRC error.");
        });
    }
    queueJoin(channel) {
        this.joinQueue.push(channel);
        if (this.joinTimer)
            return;
        this.joinTimer = globalThis.setInterval(() => {
            if (!this.socket || this.socket.readyState !== WebSocket.OPEN)
                return;
            const next = this.joinQueue.shift();
            if (next) {
                this.socket.send(`JOIN #${next}`);
            }
            if (this.joinQueue.length === 0 && this.joinTimer) {
                globalThis.clearInterval(this.joinTimer);
                this.joinTimer = null;
            }
        }, 1200);
    }
    scheduleReconnect() {
        if (this.status === "disconnected")
            return;
        const delay = Math.min(30000, 1000 * 2 ** this.reconnectAttempts);
        this.reconnectAttempts += 1;
        this.setStatus("connecting");
        globalThis.setTimeout(() => {
            this.socket = null;
            this.connect();
        }, delay);
    }
    cleanupSocket() {
        this.socket = null;
        if (this.joinTimer) {
            globalThis.clearInterval(this.joinTimer);
            this.joinTimer = null;
        }
    }
    async disconnect() {
        this.setStatus("disconnected");
        if (this.socket) {
            this.socket.close();
        }
        this.cleanupSocket();
    }
    async sendMessage(message) {
        const content = message.trim();
        if (!content)
            return;
        if (content.length > 500) {
            throw new Error("Message is too long.");
        }
        if (!this.auth.token || !this.auth.username || this.auth.username.startsWith("justinfan")) {
            throw new Error("Twitch send requires an authenticated account.");
        }
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            throw new Error("Twitch connection is not ready.");
        }
        this.socket.send(`PRIVMSG #${this.channel} :${content}`);
        // Local echo so sent messages show immediately even if Twitch does not echo PRIVMSG back.
        this.emitter.emit("message", {
            id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            platform: "twitch",
            channel: this.channel,
            username: this.auth.username,
            displayName: this.selfDisplayName || this.auth.username,
            message: content,
            timestamp: new Date().toISOString(),
            badges: [...this.selfBadges],
            color: this.selfColor,
            raw: { localEcho: true }
        });
    }
}
