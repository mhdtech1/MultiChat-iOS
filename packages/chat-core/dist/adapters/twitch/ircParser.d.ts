export type IrcMessage = {
    tags: Record<string, string>;
    prefix?: string;
    command: string;
    params: string[];
    trailing?: string;
};
export declare const parseIrcMessage: (line: string) => IrcMessage | null;
