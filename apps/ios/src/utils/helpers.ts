/**
 * Utility helper functions
 */

import * as Crypto from 'expo-crypto';
import type { ChatAdapterStatus } from '@multichat/chat-core';
import type { PlatformId, CredentialSnapshot, MessageSegment } from '../types';

export const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const randomToken = () => `${Crypto.randomUUID().replace(/-/g, '')}${Date.now().toString(36)}`;

export const toBase64Url = (value: string) =>
  value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

export const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
};

export const readNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export const formatClock = (timestamp: string) => {
  const value = Date.parse(timestamp);
  if (Number.isNaN(value)) return '--:--';
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
};

// P1 Recommendation #6: Message grouping by time
export const formatTimestamp = (timestamp: string, includeDate = false) => {
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return '';
  
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const isYesterday = new Date(now.getTime() - 86400000).toDateString() === date.toDateString();
  
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  if (!includeDate) return time;
  
  if (isToday) return `Today at ${time}`;
  if (isYesterday) return `Yesterday at ${time}`;
  
  return date.toLocaleDateString([], { 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const shouldShowTimestamp = (currentTime: string, previousTime: string | null, minuteGap = 5) => {
  if (!previousTime) return true;
  const current = new Date(currentTime).getTime();
  const previous = new Date(previousTime).getTime();
  return current - previous > minuteGap * 60 * 1000;
};

export const formatObsDuration = (durationMs: number | null) => {
  const safeMs = durationMs && Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
  const totalSeconds = Math.floor(safeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export const statusLabel = (status: ChatAdapterStatus | undefined): string => {
  if (!status) return 'disconnected';
  return status;
};

export const platformTag = (platform: string) => {
  if (platform === 'twitch') return 'TW';
  if (platform === 'kick') return 'KI';
  if (platform === 'tiktok') return 'TT';
  return 'YT';
};

export const getMessageAuthor = (message: {
  author?: string;
  displayName?: string;
  username?: string;
}) => {
  const directAuthor = typeof message.author === 'string' ? message.author.trim() : '';
  if (directAuthor) return directAuthor;

  const displayName = typeof message.displayName === 'string' ? message.displayName.trim() : '';
  if (displayName) return displayName;

  const username = typeof message.username === 'string' ? message.username.trim() : '';
  if (username) return username;

  return 'unknown';
};

export const getMessageAuthorColor = (message: { authorColor?: string; color?: string }) => {
  const authorColor = typeof message.authorColor === 'string' ? message.authorColor.trim() : '';
  if (authorColor) return authorColor;

  const color = typeof message.color === 'string' ? message.color.trim() : '';
  if (color) return color;

  return undefined;
};

export const isWritable = (platform: PlatformId, credentials: CredentialSnapshot) => {
  if (platform === 'twitch') {
    return Boolean(credentials.twitchToken.trim() && credentials.twitchUsername.trim());
  }
  if (platform === 'kick') {
    return Boolean(credentials.kickToken.trim());
  }
  return Boolean(credentials.youtubeAccessToken.trim() || credentials.youtubeRefreshToken.trim());
};

export const normalizeTabSourceSignature = (sourceIds: string[]) =>
  Array.from(new Set(sourceIds)).sort().join(',');

// Emote parsing
export const segmentMessageWithEmotes = (
  message: string,
  emoteMap: Record<string, string>
): MessageSegment[] => {
  if (!message) return [];
  const parts = message.split(/(\s+)/);
  const segments: MessageSegment[] = [];
  
  for (const part of parts) {
    if (part.length === 0) continue;
    const emoteUri = emoteMap[part];
    if (emoteUri && !/^\s+$/.test(part)) {
      segments.push({ type: 'emote', value: part, uri: emoteUri });
    } else {
      segments.push({ type: 'text', value: part });
    }
  }
  return segments;
};

// Badge parsing
export const parseSevenTvEmoteMap = (value: unknown): Record<string, string> => {
  const root = asRecord(value);
  if (!root) return {};

  const nestedSet = asRecord(root.emote_set);
  const nestedEmotes = nestedSet && Array.isArray(nestedSet.emotes) ? nestedSet.emotes : [];
  const emoteArray = Array.isArray(root.emotes) ? root.emotes : nestedEmotes;

  const next: Record<string, string> = {};
  for (const entry of emoteArray) {
    const record = asRecord(entry);
    if (!record) continue;
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    if (!id || !name) continue;
    next[name] = `https://lh3.googleusercontent.com/IM4kB0ErJr5JVFEtuI91cQzM2baf5n1GeSSZqjTh8QYAkTrOD80O5Ag6_b1hyViqDQkg-G2BGGCej3sIDTKezeyaaw=s1280-w1280-h800`;
  }
  return next;
};

export const parseTwitchBadgeMap = (value: unknown): Record<string, string> => {
  const root = asRecord(value);
  if (!root) return {};

  const next: Record<string, string> = {};

  const ingestBadgeSet = (setIdRaw: string, versionsValue: unknown) => {
    const setId = setIdRaw.trim().toLowerCase();
    if (!setId) return;

    const versionsArray: Array<[string, Record<string, unknown>]> = [];
    if (Array.isArray(versionsValue)) {
      for (const version of versionsValue) {
        const versionRecord = asRecord(version);
        if (!versionRecord) continue;
        const versionId = typeof versionRecord.id === 'string' ? versionRecord.id.trim() : '';
        if (!versionId) continue;
        versionsArray.push([versionId, versionRecord]);
      }
    } else {
      const versionsObject = asRecord(versionsValue);
      if (!versionsObject) return;
      for (const [versionIdRaw, versionValue] of Object.entries(versionsObject)) {
        const versionRecord = asRecord(versionValue);
        const versionId = versionIdRaw.trim();
        if (!versionRecord || !versionId) continue;
        versionsArray.push([versionId, versionRecord]);
      }
    }

    let defaultImage = '';
    for (const [versionIdRaw, versionRecord] of versionsArray) {
      const versionId = versionIdRaw.toLowerCase();
      const imageUrl =
        (typeof versionRecord.image_url_2x === 'string' && versionRecord.image_url_2x.trim()) ||
        (typeof versionRecord.image_url_1x === 'string' && versionRecord.image_url_1x.trim()) ||
        (typeof versionRecord.image_url_4x === 'string' && versionRecord.image_url_4x.trim()) ||
        '';
      if (!imageUrl) continue;
      if (!defaultImage || versionId === '1') defaultImage = imageUrl;
      next[`${setId}/${versionId}`] = imageUrl;
      next[`${setId}:${versionId}`] = imageUrl;
    }
    if (defaultImage) {
      next[setId] = defaultImage;
    }
  };

  const legacyBadgeSets = asRecord(root.badge_sets);
  if (legacyBadgeSets) {
    for (const [setId, setValue] of Object.entries(legacyBadgeSets)) {
      const setRecord = asRecord(setValue);
      if (!setRecord) continue;
      ingestBadgeSet(setId, setRecord.versions);
    }
  }

  const helixBadgeSets = Array.isArray(root.data) ? root.data : [];
  for (const entry of helixBadgeSets) {
    const record = asRecord(entry);
    if (!record) continue;
    const setId = typeof record.set_id === 'string' ? record.set_id : '';
    if (!setId) continue;
    ingestBadgeSet(setId, record.versions);
  }

  return next;
};

export const readPossibleImageUri = (record: Record<string, unknown>): string => {
  const directKeys = [
    'image', 'image_url', 'imageUrl', 'icon', 'icon_url', 'iconUrl',
    'src', 'url', 'badge_image', 'badgeImage', 'thumbnail', 'small', 'tiny',
  ];
  for (const key of directKeys) {
    const value = record[key];
    if (typeof value === 'string' && /^https?:\/\//i.test(value.trim())) {
      return value.trim();
    }
    const nested = asRecord(value);
    if (!nested) continue;
    for (const nestedKey of ['1x', '2x', '4x', 'url', 'src', 'small', 'tiny']) {
      const nestedValue = nested[nestedKey];
      if (typeof nestedValue === 'string' && /^https?:\/\//i.test(nestedValue.trim())) {
        return nestedValue.trim();
      }
    }
  }
  return '';
};

export const compactBadgeLabel = (value: string) => {
  const normalized = value.trim();
  if (!normalized) return '';
  const first = normalized.split(/[/:\s]/)[0] ?? normalized;
  return first.slice(0, 4).toUpperCase();
};

export const normalizeBadgeKey = (value: string) => value.trim().toLowerCase();

export const expandBadgeLookupKeys = (rawKey: string): string[] => {
  const normalized = normalizeBadgeKey(rawKey);
  if (!normalized) return [];

  const keys = new Set<string>();
  keys.add(normalized);

  const slashParts = normalized.split('/');
  const colonParts = normalized.split(':');
  const parts = slashParts.length >= 2 ? slashParts : colonParts.length >= 2 ? colonParts : [];

  if (parts.length >= 2) {
    const setId = parts[0]?.trim();
    const version = parts[1]?.trim();
    if (setId && version) {
      keys.add(`${setId}/${version}`);
      keys.add(`${setId}:${version}`);
      keys.add(setId);
    }
  } else {
    keys.add(`${normalized}/1`);
    keys.add(`${normalized}/0`);
  }

  return Array.from(keys);
};
