import type { ChatAdapter, ChatAdapterOptions, ChatAdapterStatus, ChatMessage } from "../../types";
type TikTokTransportEvent = {
    connectionId: string;
    type: "connected" | "disconnected" | "chat" | "error";
    roomId?: string;
    message?: ChatMessage;
    error?: string;
};
type TikTokTransport = {
    connect: (payload: {
        channel: string;
    }) => Promise<{
        connectionId: string;
        roomId?: string;
    }>;
    disconnect: (payload: {
        connectionId: string;
    }) => Promise<void>;
    sendMessage?: (payload: {
        connectionId: string;
        message: string;
    }) => Promise<void>;
    onEvent: (handler: (event: TikTokTransportEvent) => void) => () => void;
};
export declare class TikTokAdapter implements ChatAdapter {
    private emitter;
    private status;
    private readonly channel;
    private readonly transport;
    private readonly logger?;
    private connectionId;
    private unsubscribeTransport;
    constructor(options: ChatAdapterOptions & {
        transport: TikTokTransport;
    });
    onMessage(handler: (message: ChatMessage) => void): void;
    onStatus(handler: (status: ChatAdapterStatus) => void): void;
    private setStatus;
    private bindTransportEvents;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    sendMessage(message: string): Promise<void>;
}
export {};
