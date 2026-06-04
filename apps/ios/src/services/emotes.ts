/**
 * Emote engine ported from the Chatrix desktop renderer
 * (apps/desktop/src/renderer/ui/utils/emotes.ts) and adapted for React Native.
 *
 * Two responsibilities:
 *  1. Fetch third-party emote sets (7TV, BetterTTV, Kick) — global and, where a
 *     Twitch user id is available, per-channel — into a `name -> url` map.
 *  2. Segment a chat message into ordered text / emote pieces for rendering,
 *     honouring the native emotes that already ship with each message
 *     (Twitch IRC emote ranges and Kick `[emote:id:name]` inline markup) before
 *     falling back to third-party name matching.
 */

import type { ChatMessage } from '@multichat/chat-core';
import type { MessageSegment } from '../types';

export type EmoteMap = Record<string, string>;
type EmoteResolver = (token: string) => string | undefined;

export const TWITCH_EMOTE_URL = (id: string) =>
  `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/2.0`;
export const BTTV_EMOTE_URL = (id: string) => `https://cdn.betterttv.net/emote/${id}/2x`;
export const SEVENTV_EMOTE_URL = (id: string) => `https://cdn.7tv.app/emote/${id}/2x.webp`;
export const KICK_EMOTE_URL = (id: string) => `https://files.kick.com/emotes/${id}/fullsize`;

const KICK_GLOBAL_EMOTE_URL = 'https://kick.com/emotes/eddie';
const KICK_NATIVE_EMOTE_REGEX = /\[emote:(\d+):([^\[\]]+)\]/g;

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
};

const fetchJsonSafe = async (url: string, init?: RequestInit): Promise<unknown> => {
  try {
    const response = await fetch(url, init);
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
};

// --- third-party emote list parsers ---

const pushBttvList = (target: EmoteMap, list: unknown) => {
  if (!Array.isArray(list)) return;
  for (const item of list) {
    const record = asRecord(item);
    const id = typeof record?.id === 'string' ? record.id : '';
    const code = typeof record?.code === 'string' ? record.code : '';
    if (!id || !code) continue;
    target[code] = BTTV_EMOTE_URL(id);
  }
};

const pushSevenTvList = (target: EmoteMap, list: unknown) => {
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

const pushKickList = (target: EmoteMap, value: unknown) => {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    const record = asRecord(item);
    const name = typeof record?.name === 'string' ? record.name.trim() : '';
    const id = record?.id;
    const emoteId =
      typeof id === 'string' ? id.trim() : typeof id === 'number' ? String(id) : '';
    if (!name || !emoteId || target[name]) continue;
    target[name] = KICK_EMOTE_URL(emoteId);
  }
};

// --- global fetchers (no auth) ---

export const fetchBttvGlobalEmotes = async (): Promise<EmoteMap> => {
  const payload = await fetchJsonSafe('https://api.betterttv.net/3/cached/emotes/global');
  const map: EmoteMap = {};
  pushBttvList(map, payload);
  return map;
};

export const fetchSevenTvGlobalEmotes = async (): Promise<EmoteMap> => {
  const payload = await fetchJsonSafe('https://7tv.io/v3/emote-sets/global');
  const map: EmoteMap = {};
  pushSevenTvList(map, asRecord(payload)?.emotes);
  return map;
};

export const fetchKickGlobalEmotes = async (): Promise<EmoteMap> => {
  const payload = await fetchJsonSafe(KICK_GLOBAL_EMOTE_URL);
  const map: EmoteMap = {};

  if (Array.isArray(payload)) {
    for (const item of payload) pushKickList(map, asRecord(item)?.emotes);
    return map;
  }

  const record = asRecord(payload);
  pushKickList(map, record?.emotes);
  if (Array.isArray(record?.data)) {
    for (const item of record.data) pushKickList(map, asRecord(item)?.emotes);
  }
  return map;
};

/** Fetches all auth-free global emote sets and merges them (7TV wins on collision). */
export const fetchGlobalEmotes = async (): Promise<EmoteMap> => {
  const [sevenTv, bttv, kick] = await Promise.all([
    fetchSevenTvGlobalEmotes(),
    fetchBttvGlobalEmotes(),
    fetchKickGlobalEmotes(),
  ]);
  return { ...kick, ...bttv, ...sevenTv };
};

// --- per-channel fetchers ---

const extractTwitchUserId = (payload: unknown): string => {
  const record = asRecord(payload);
  if (!record || !Array.isArray(record.data) || record.data.length === 0) return '';
  const first = asRecord(record.data[0]);
  return typeof first?.id === 'string' ? first.id : '';
};

/**
 * Resolves a Twitch login to its numeric user id via Helix. Requires a client
 * id + user token, so this only succeeds when the user is signed in to Twitch.
 */
export const resolveTwitchUserId = async (
  login: string,
  clientId: string,
  token: string
): Promise<string> => {
  const trimmedLogin = login.trim().toLowerCase();
  const trimmedToken = token.replace(/^oauth:/i, '').trim();
  if (!trimmedLogin || !clientId.trim() || !trimmedToken) return '';
  const payload = await fetchJsonSafe(
    `https://api.twitch.tv/helix/users?login=${encodeURIComponent(trimmedLogin)}`,
    {
      headers: {
        'Client-ID': clientId.trim(),
        Authorization: `Bearer ${trimmedToken}`,
      },
    }
  );
  return extractTwitchUserId(payload);
};

/** Fetches 7TV + BetterTTV channel emotes for a Twitch numeric user id. */
export const fetchTwitchChannelEmotes = async (userId: string): Promise<EmoteMap> => {
  if (!userId.trim()) return {};
  const [bttvPayload, sevenTvPayload] = await Promise.all([
    fetchJsonSafe(`https://api.betterttv.net/3/cached/users/twitch/${encodeURIComponent(userId)}`),
    fetchJsonSafe(`https://7tv.io/v3/users/twitch/${encodeURIComponent(userId)}`),
  ]);

  const map: EmoteMap = {};
  const bttvRecord = asRecord(bttvPayload);
  pushBttvList(map, bttvRecord?.channelEmotes);
  pushBttvList(map, bttvRecord?.sharedEmotes);

  const sevenTvSet = asRecord(asRecord(sevenTvPayload)?.emote_set);
  pushSevenTvList(map, sevenTvSet?.emotes);
  return map;
};

// --- message segmentation ---

type Chunk = { type: 'text'; value: string } | { type: 'emote'; name: string; url: string };

const toSegments = (chunks: Chunk[]): MessageSegment[] =>
  chunks.map((chunk) =>
    chunk.type === 'emote'
      ? { type: 'emote', value: chunk.name, uri: chunk.url }
      : { type: 'text', value: chunk.value }
  );

const compact = (chunks: Chunk[]): Chunk[] => {
  const out: Chunk[] = [];
  for (const chunk of chunks) {
    const previous = out[out.length - 1];
    if (chunk.type === 'text' && previous?.type === 'text') {
      previous.value += chunk.value;
      continue;
    }
    out.push(chunk);
  }
  return out;
};

const tokenizeText = (text: string, resolveEmote: EmoteResolver): Chunk[] => {
  if (!text) return [];
  const chunks: Chunk[] = [];
  for (const token of text.split(/(\s+)/)) {
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
    const punctuationMatch = token.match(/^([(\[{'"`]*)(.+?)([)\]}.,!?;:'"`]*)$/);
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
  return compact(chunks);
};

type TwitchRange = { start: number; end: number; emoteId: string; name: string };

const parseTwitchNativeRanges = (message: ChatMessage): TwitchRange[] => {
  const emotesTag = typeof asRecord(message.raw)?.emotes === 'string'
    ? (asRecord(message.raw)!.emotes as string)
    : '';
  if (!emotesTag) return [];

  const ranges: TwitchRange[] = [];
  for (const item of emotesTag.split('/')) {
    const [emoteId, positions] = item.split(':');
    if (!emoteId || !positions) continue;
    for (const position of positions.split(',')) {
      const [startText, endText] = position.split('-');
      const start = Number(startText);
      const end = Number(endText);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      if (start < 0 || end < start || end >= message.message.length) continue;
      ranges.push({ start, end, emoteId, name: message.message.slice(start, end + 1) });
    }
  }

  ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  const cleaned: TwitchRange[] = [];
  let lastEnd = -1;
  for (const range of ranges) {
    if (range.start <= lastEnd) continue;
    cleaned.push(range);
    lastEnd = range.end;
  }
  return cleaned;
};

const parseKickNativeChunks = (rawContent: string, resolveEmote: EmoteResolver): Chunk[] => {
  if (!rawContent) return [];
  const chunks: Chunk[] = [];
  let lastIndex = 0;
  let matched = false;
  KICK_NATIVE_EMOTE_REGEX.lastIndex = 0;

  for (let match = KICK_NATIVE_EMOTE_REGEX.exec(rawContent); match; match = KICK_NATIVE_EMOTE_REGEX.exec(rawContent)) {
    matched = true;
    const [full, emoteId, emoteName] = match;
    if (match.index > lastIndex) {
      chunks.push(...tokenizeText(rawContent.slice(lastIndex, match.index), resolveEmote));
    }
    chunks.push({ type: 'emote', name: emoteName, url: KICK_EMOTE_URL(emoteId) });
    lastIndex = match.index + full.length;
  }

  if (!matched) return [];
  if (lastIndex < rawContent.length) {
    chunks.push(...tokenizeText(rawContent.slice(lastIndex), resolveEmote));
  }
  return compact(chunks);
};

/**
 * Segments a chat message into text + emote pieces. Native Twitch/Kick emotes
 * take priority; remaining text is matched against the third-party `emoteMap`.
 */
export const buildMessageSegments = (
  message: ChatMessage,
  emoteMap: EmoteMap
): MessageSegment[] => {
  const resolveEmote: EmoteResolver = (token) => emoteMap[token];

  if (message.platform === 'twitch') {
    const ranges = parseTwitchNativeRanges(message);
    if (ranges.length > 0) {
      const chunks: Chunk[] = [];
      let cursor = 0;
      for (const range of ranges) {
        if (range.start > cursor) {
          chunks.push(...tokenizeText(message.message.slice(cursor, range.start), resolveEmote));
        }
        chunks.push({ type: 'emote', name: range.name, url: TWITCH_EMOTE_URL(range.emoteId) });
        cursor = range.end + 1;
      }
      if (cursor < message.message.length) {
        chunks.push(...tokenizeText(message.message.slice(cursor), resolveEmote));
      }
      return toSegments(compact(chunks));
    }
  }

  if (message.platform === 'kick') {
    const rawContent =
      typeof asRecord(message.raw)?.content === 'string'
        ? (asRecord(message.raw)!.content as string)
        : '';
    const kickChunks = parseKickNativeChunks(rawContent, resolveEmote);
    if (kickChunks.length > 0) return toSegments(kickChunks);
  }

  return toSegments(tokenizeText(message.message, resolveEmote));
};
