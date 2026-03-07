import type { ChatMessage } from "../../types";
import type { IrcMessage } from "./ircParser";
export declare const normalizeTwitchMessage: (message: IrcMessage) => ChatMessage | null;
