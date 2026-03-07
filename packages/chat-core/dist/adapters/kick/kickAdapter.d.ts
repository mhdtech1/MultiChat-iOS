import type { ChatAdapter, ChatAdapterOptions, ChatAdapterStatus, ChatMessage } from "../../types";
export type KickAuth = {
    accessToken?: string;
    username?: string;
    guest?: boolean;
};
export declare class KickAdapter implements ChatAdapter {
    private emitter;
    private socket;
    private reconnectTimer;
    private reconnectAttempts;
    private chatroomId;
    private broadcasterUserId;
    private status;
    private readonly channel;
    private readonly auth;
    private accessToken;
    private readonly chatroomResolver?;
    private readonly refreshAccessToken?;
    private readonly logger?;
    constructor(options: ChatAdapterOptions & {
        auth?: KickAuth;
        resolveChatroomId?: (channel: string) => Promise<number>;
        refreshAccessToken?: () => Promise<string | null>;
    });
    onMessage(handler: (message: ChatMessage) => void): void;
    onStatus(handler: (status: ChatAdapterStatus) => void): void;
    private setStatus;
    private extractChatroomId;
    private extractBroadcasterUserId;
    private resolveChatroomId;
    private createSocketUrl;
    private normalizeKickMessage;
    private normalizeKickModerationEvent;
    private handleSocketMessage;
    private scheduleReconnect;
    private connectSocketOnly;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    private resolveBroadcasterUserId;
    sendMessage(message: string): Promise<void>;
    private ensureAccessToken;
    private refreshKickTokenOrThrow;
}
