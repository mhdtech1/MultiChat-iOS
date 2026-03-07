import type { ChatAdapter, ChatAdapterOptions, ChatAdapterStatus, ChatMessage } from "../../types";
export type TwitchAuth = {
    token?: string;
    username?: string;
};
export declare class TwitchAdapter implements ChatAdapter {
    private emitter;
    private socket;
    private status;
    private reconnectAttempts;
    private selfBadges;
    private selfColor;
    private selfDisplayName;
    private readonly channel;
    private readonly auth;
    private readonly logger?;
    private joinQueue;
    private joinTimer;
    constructor(options: ChatAdapterOptions & {
        auth?: TwitchAuth;
    });
    onMessage(handler: (message: ChatMessage) => void): void;
    onStatus(handler: (status: ChatAdapterStatus) => void): void;
    private setStatus;
    connect(): Promise<void>;
    private queueJoin;
    private scheduleReconnect;
    private cleanupSocket;
    disconnect(): Promise<void>;
    sendMessage(message: string): Promise<void>;
}
