/**
 * Emote engine ported from the Chatrix desktop renderer
 * (apps/desktop/src/renderer/ui/utils/emotes.ts) and adapted for React Native.
 *
 * Resolves third-party emotes (7TV, BetterTTV, Kick global) plus the native
 * inline emotes that Twitch and Kick send in their message payloads, then
 * tokenizes a chat message into text + emote chunks for rich rendering.
 *
 * This build is read-only (no OAuth), so only auth-free sources are used:
 * global emote sets for every platform and the native emote data that already
 * arrives with each message. Channel-scoped third-party emotes would require a
 * Twitch user-id lookup (and a client id / token) and are intentionally left
 * out here.
 */

import type { ChatMessage } from '@multichat/chat-core';

export type EmoteMap = Record<string, string>;
export type EmoteResolver = (token: string) => string | undefined;

export type MessageChunk =
  | { type: 'text'; value: string }
  | { type: 'emote'; name: string; url: string };

export type TwitchNativeRange = {
  start: number;
  end: number;
  emoteId: string;
  name: string;
};

export const TWITCH_EMOTE_URL = (id: string) =>
  `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/2.0`;
export const BTTV_EMOTE_URL = (id: string) =>
  `https://cdn.betterttv.net/emote/${id}/2x`;
export const SEVENTV_EMOTE_URL = (id: string) =>
  `https://cdn.7tv.app/emote/${id}/2x.webp`;
export const KICK_EMOTE_URL = (id: string) =>
  `https://files.kick.com/emotes/${id}/fullsize`;

export const KICK_GLOBAL_EMOTE_URL = 'https://kick.com/emotes/eddie';
const KICK_NATIVE_EMOTE_REGEX = /\[emote:(\d+):([^\[\]]+)\]/g;

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
};

const fetchJsonSafe = async (
  url: string,
  init?: RequestInit
): Promise<unknown> => {
  try {
    const response = await fetch(url, init);
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
};

export const pushBttvList = (target: EmoteMap, list: unknown) => {
  if (!Array.isArray(list)) return;
  for (const item of list) {
    const record = asRecord(item);
    const id = typeof record?.id === 'string' ? record.id : '';
    const code = typeof record?.code === 'string' ? record.code : '';
    if (!id || !code) continue;
    target[code] = BTTV_EMOTE_URL(id);
  }
};

export const pushSevenTvList = (target: EmoteMap, list: unknown) => {
  if (!Array.isArray(list)) return;
  for (const item of list) {
    const record = asRecord(item);
    const data = asRecord(record?.data);
    const id =
      typeof record?.id === 'string'
        ? record.id
        : typeof data?.id === 'string'
          ? data.id
          : '';
    const name = typeof record?.name === 'string' ? record.name : '';
    if (!id || !name) continue;
    target[name] = SEVENTV_EMOTE_URL(id);
  }
};

export const pushKickList = (target: EmoteMap, value: unknown) => {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    const record = asRecord(item);
    const name = typeof record?.name === 'string' ? record.name.trim() : '';
    const id = record?.id;
    const emoteId =
      typeof id === 'string'
        ? id.trim()
        : typeof id === 'number'
          ? String(id)
          : '';
    if (!name || !emoteId || target[name]) continue;
    target[name] = KICK_EMOTE_URL(emoteId);
  }
};

export const fetchBttvGlobalEmotes = async (): Promise<EmoteMap> => {
  const payload = await fetchJsonSafe(
    'https://api.betterttv.net/3/cached/emotes/global'
  );
  const map: EmoteMap = {};
  pushBttvList(map, payload);
  return map;
};

export const fetchSevenTvGlobalEmotes = async (): Promise<EmoteMap> => {
  const payload = await fetchJsonSafe('https://7tv.io/v3/emote-sets/global');
  const map: EmoteMap = {};
  const record = asRecord(payload);
  pushSevenTvList(map, record?.emotes);
  return map;
};

export const fetchKickGlobalEmotes = async (): Promise<EmoteMap> => {
  const payload = await fetchJsonSafe(KICK_GLOBAL_EMOTE_URL);
  const map: EmoteMap = {};

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const record = asRecord(item);
      pushKickList(map, record?.emotes);
    }
    return map;
  }

  const record = asRecord(payload);
  pushKickList(map, record?.emotes);
  if (Array.isArray(record?.data)) {
    for (const item of record.data) {
      const nestedRecord = asRecord(item);
      pushKickList(map, nestedRecord?.emotes);
    }
  }
  return map;
};

/**
 * Fetches every auth-free global emote set in parallel and merges them into a
 * single name -> url map. Failures for any single source are swallowed so a
 * flaky CDN never blocks the rest.
 */
export const fetchGlobalEmotes = async (): Promise<EmoteMap> => {
  const [sevenTv, bttv, kick] = await Promise.all([
    fetchSevenTvGlobalEmotes(),
    fetchBttvGlobalEmotes(),
    fetchKickGlobalEmotes(),
  ]);
  // 7TV last so its variants win on collisions, matching desktop behaviour.
  return { ...kick, ...bttv, ...sevenTv };
};

export const compactMessageChunks = (
  chunks: MessageChunk[]
): MessageChunk[] => {
  const compacted: MessageChunk[] = [];
  for (const chunk of chunks) {
    const previous = compacted[compacted.length - 1];
    if (chunk.type === 'text' && previous?.type === 'text') {
      previous.value += chunk.value;
      continue;
    }
    compacted.push(chunk);
  }
  return compacted;
};

export const tokenizeTextWithExternalEmotes = (
  text: string,
  resolveEmote: EmoteResolver
): MessageChunk[] => {
  if (!text) return [];
  const tokens = text.split(/(\s+)/);
  const chunks: MessageChunk[] = [];

  for (const token of tokens) {
    if (!token) continue;
    if (/^\s+$/.test(token)) {
      chunks.push({ type: 'text', value: token });
      continue;
    }

    const directUrl = resolveEmote(token);
    if (directUrl) {
      chunks.push({ type: 'emote', name: token, url: directUrl });
      continue;
    }

    const punctuationMatch = token.match(
      /^([(\[{'"`]*)(.+?)([)\]}.,!?;:'"`]*)$/
    );
    if (punctuationMatch) {
      const [, prefix, core, suffix] = punctuationMatch;
      const coreUrl = resolveEmote(core);
      if (coreUrl) {
        if (prefix) chunks.push({ type: 'text', value: prefix });
        chunks.push({ type: 'emote', name: core, url: coreUrl });
        if (suffix) chunks.push({ type: 'text', value: suffix });
        continue;
      }
    }

    chunks.push({ type: 'text', value: token });
  }

  return compactMessageChunks(chunks);
};

export const parseTwitchNativeRanges = (
  message: ChatMessage
): TwitchNativeRange[] => {
  const raw = asRecord(message.raw);
  const emotesTag = typeof raw?.emotes === 'string' ? raw.emotes : '';
  if (!emotesTag) return [];

  const ranges: TwitchNativeRange[] = [];
  for (const item of emotesTag.split('/')) {
    const [emoteId, positions] = item.split(':');
    if (!emoteId || !positions) continue;

    for (const position of positions.split(',')) {
      const [startText, endText] = position.split('-');
      const start = Number(startText);
      const end = Number(endText);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      if (start < 0 || end < start || end >= message.message.length) continue;
      ranges.push({
        start,
        end,
        emoteId,
        name: message.message.slice(start, end + 1),
      });
    }
  }

  ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  const cleaned: TwitchNativeRange[] = [];
  let lastEnd = -1;
  for (const range of ranges) {
    if (range.start <= lastEnd) continue;
    cleaned.push(range);
    lastEnd = range.end;
  }
  return cleaned;
};

export const parseKickNativeChunks = (
  rawContent: string,
  resolveEmote: EmoteResolver
): MessageChunk[] => {
  if (!rawContent) return [];
  const chunks: MessageChunk[] = [];
  let lastIndex = 0;
  let matched = false;

  KICK_NATIVE_EMOTE_REGEX.lastIndex = 0;

  while (true) {
    const match = KICK_NATIVE_EMOTE_REGEX.exec(rawContent);
    if (!match) break;
    matched = true;

    const [full, emoteId, emoteName] = match;
    if (match.index > lastIndex) {
      chunks.push(
        ...tokenizeTextWithExternalEmotes(
          rawContent.slice(lastIndex, match.index),
          resolveEmote
        )
      );
    }

    chunks.push({
      type: 'emote',
      name: emoteName,
      url: KICK_EMOTE_URL(emoteId),
    });

    lastIndex = match.index + full.length;
  }

  if (!matched) return [];
  if (lastIndex < rawContent.length) {
    chunks.push(
      ...tokenizeTextWithExternalEmotes(
        rawContent.slice(lastIndex),
        resolveEmote
      )
    );
  }
  return compactMessageChunks(chunks);
};

/**
 * Converts a chat message into an ordered list of text / emote chunks.
 *
 * Native emotes (Twitch IRC emote ranges, Kick `[emote:id:name]` markup) take
 * priority, then any remaining text is scanned for third-party emotes via the
 * provided resolver.
 */
export const buildMessageChunks = (
  message: ChatMessage,
  resolveEmote: EmoteResolver
): MessageChunk[] => {
  if (message.platform === 'twitch') {
    const ranges = parseTwitchNativeRanges(message);
    if (ranges.length > 0) {
      const chunks: MessageChunk[] = [];
      let cursor = 0;
      for (const range of ranges) {
        if (range.start > cursor) {
          chunks.push(
            ...tokenizeTextWithExternalEmotes(
              message.message.slice(cursor, range.start),
              resolveEmote
            )
          );
        }
        chunks.push({
          type: 'emote',
          name: range.name,
          url: TWITCH_EMOTE_URL(range.emoteId),
        });
        cursor = range.end + 1;
      }
      if (cursor < message.message.length) {
        chunks.push(
          ...tokenizeTextWithExternalEmotes(
            message.message.slice(cursor),
            resolveEmote
          )
        );
      }
      return compactMessageChunks(chunks);
    }
  }

  if (message.platform === 'kick') {
    const raw = asRecord(message.raw);
    const rawContent = typeof raw?.content === 'string' ? raw.content : '';
    const kickChunks = parseKickNativeChunks(rawContent, resolveEmote);
    if (kickChunks.length > 0) return kickChunks;
  }

  return tokenizeTextWithExternalEmotes(message.message, resolveEmote);
};
