import type { ChatMessage } from "../../types";
import type { IrcMessage } from "./ircParser";

const unescapeIrcTagValue = (value: string) =>
  value
    .replace(/\\s/g, " ")
    .replace(/\\:/g, ";")
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n")
    .replace(/\\\\/g, "\\");

const buildSystemMessage = (
  message: IrcMessage,
  timestampMs: number,
  content: string,
  extraRaw: Record<string, unknown>
): ChatMessage => {
  const channel = message.params[0]?.replace("#", "") ?? "";
  const suffix = Math.random().toString(36).slice(2, 8);
  const baseId = message.tags.id || message.tags["target-msg-id"] || `${timestampMs}`;
  return {
    id: `event-${baseId}-${suffix}`,
    platform: "twitch",
    channel,
    username: "system",
    displayName: "System",
    message: content,
    timestamp: new Date(timestampMs).toISOString(),
    badges: [],
    color: "#f08a65",
    raw: {
      ...message.tags,
      ...extraRaw
    }
  };
};

export const normalizeTwitchMessage = (message: IrcMessage): ChatMessage | null => {
  const channel = message.params[0]?.replace("#", "") ?? "";
  const username = message.prefix?.split("!")[0] ?? "";
  const displayName = message.tags["display-name"] || username || "Twitch";
  const badges = message.tags.badges ? message.tags.badges.split(",").filter(Boolean) : [];
  const timestampMs = message.tags["tmi-sent-ts"] ? Number(message.tags["tmi-sent-ts"]) : Date.now();

  if (message.command === "PRIVMSG" && message.trailing) {
    return {
      id: `${message.tags.id || `${timestampMs}-${username}`}`,
      platform: "twitch",
      channel,
      username,
      displayName,
      message: message.trailing,
      timestamp: new Date(timestampMs).toISOString(),
      badges,
      color: message.tags.color || undefined,
      raw: message.tags
    };
  }

  if (message.command === "USERNOTICE") {
    const systemTextRaw = message.tags["system-msg"] || "";
    const systemText = systemTextRaw ? unescapeIrcTagValue(systemTextRaw) : "";
    const content = (message.trailing || systemText).trim();
    if (!content) return null;

    return {
      id: `${message.tags.id || `${timestampMs}-${username || "notice"}`}`,
      platform: "twitch",
      channel,
      username: username || "twitch",
      displayName: displayName || "Twitch",
      message: content,
      timestamp: new Date(timestampMs).toISOString(),
      badges,
      color: message.tags.color || undefined,
      raw: {
        ...message.tags,
        eventType: "usernotice",
        msgId: message.tags["msg-id"] || undefined
      }
    };
  }

  if (message.command === "CLEARMSG") {
    const target = (message.tags.login || "").trim();
    const targetMsgId = (message.tags["target-msg-id"] || "").trim();
    const deletedSnippet = (message.trailing || "").trim();
    const content = target
      ? `A moderator deleted ${target}'s message.`
      : "A moderator deleted a message.";
    return buildSystemMessage(message, timestampMs, content, {
      eventType: "delete",
      msgId: "clearmsg",
      targetUsername: target || undefined,
      targetMessageId: targetMsgId || undefined,
      deletedMessage: deletedSnippet || undefined
    });
  }

  if (message.command === "CLEARCHAT") {
    const target = (message.trailing || "").trim();
    const durationRaw = (message.tags["ban-duration"] || "").trim();
    const durationSeconds = Number.parseInt(durationRaw, 10);
    const hasDuration = Number.isFinite(durationSeconds) && durationSeconds > 0;
    const content = target
      ? hasDuration
        ? `${target} was timed out for ${durationSeconds}s.`
        : `${target} was banned.`
      : "Chat was cleared by a moderator.";
    return buildSystemMessage(message, timestampMs, content, {
      eventType: target ? (hasDuration ? "timeout" : "ban") : "chat_clear",
      msgId: "clearchat",
      targetUsername: target || undefined,
      durationSeconds: hasDuration ? durationSeconds : undefined
    });
  }

  return null;
};
