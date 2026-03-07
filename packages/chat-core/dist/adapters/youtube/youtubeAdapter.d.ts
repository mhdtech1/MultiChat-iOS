import type { ChatAdapter, ChatAdapterOptions, ChatAdapterStatus, ChatMessage } from "../../types";
export type YouTubeAuth = {
    apiKey?: string;
    liveChatId?: string;
};
export type YouTubeFetchPayload = {
    liveChatId: string;
    pageToken?: string;
};
export type YouTubeFetchResult = {
    nextPageToken?: string;
    pollingIntervalMillis?: number;
    items?: unknown[];
};
type YouTubeTransport = {
    fetchMessages?: (payload: YouTubeFetchPayload) => Promise<YouTubeFetchResult>;
    sendMessage?: (payload: {
        liveChatId: string;
        message: string;
    }) => Promise<void>;
};
export declare class YouTubeAdapter implements ChatAdapter {
    private emitter;
    private status;
    private readonly channel;
    private readonly auth;
    private readonly transport;
    private readonly logger?;
    private pollTimer;
    private nextPageToken;
    private pollIntervalMs;
    private seenIds;
    private stopped;
    constructor(options: ChatAdapterOptions & {
        auth?: YouTubeAuth;
        transport?: YouTubeTransport;
    });
    onMessage(handler: (message: ChatMessage) => void): void;
    onStatus(handler: (status: ChatAdapterStatus) => void): void;
    private setStatus;
    connect(): Promise<void>;
    private clampPollingInterval;
    private fetchPage;
    private asMessageItem;
    private toMessage;
    private fetchAndEmit;
    private scheduleNextPoll;
    private pollLoop;
    disconnect(): Promise<void>;
    sendMessage(message: string): Promise<void>;
}
export {};
