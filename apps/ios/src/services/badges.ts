/**
 * Badge resolution for chat messages.
 *
 * Twitch global badges are fetched from the public (auth-free) badges endpoint
 * and parsed into a `setId/version` -> image-url map. Kick badge assets are
 * resolved from a static mapping ported from the Chatrix desktop renderer
 * (apps/desktop/src/renderer/utils/badges.ts).
 */

import type { ChatMessage } from '@multichat/chat-core';
import { expandBadgeLookupKeys, parseTwitchBadgeMap } from '../utils/helpers';
import type { RenderBadge } from '../types';

export type BadgeMap = Record<string, string>;

const TWITCH_GLOBAL_BADGES_URL =
  'https://badges.twitch.tv/v1/badges/global/display';

/**
 * Fetches Twitch's global badge set (subscriber, moderator, vip, turbo, ...).
 * Returns an empty map on any failure so the caller can fall back to text.
 */
export const fetchTwitchGlobalBadges = async (): Promise<BadgeMap> => {
  try {
    const response = await fetch(TWITCH_GLOBAL_BADGES_URL);
    if (!response.ok) return {};
    const payload = (await response.json()) as unknown;
    return parseTwitchBadgeMap(payload);
  } catch {
    return {};
  }
};

// --- Kick badge assets (ported from Chatrix desktop renderer) ---

type KickBadgeAsset = {
  key: string;
  title: string;
  imageUrl: string;
};

const normalizeKickBadgeAssetKey = (rawBadge: string) =>
  rawBadge
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const buildKickBadgeAsset = (
  key: string,
  title: string,
  slug = key
): KickBadgeAsset => ({
  key: `kick:${key}`,
  title,
  imageUrl: `https://www.kickdatabase.com/kickBadges/${slug}.svg`,
});

const KICK_BADGE_ASSET_BY_CANONICAL_KEY: Record<string, KickBadgeAsset> = {
  trainwreckstv: buildKickBadgeAsset('trainwreckstv', 'Trainwreckstv'),
  staff: buildKickBadgeAsset('staff', 'Staff'),
  verified: buildKickBadgeAsset('verified', 'Verified'),
  sidekick: buildKickBadgeAsset('sidekick', 'Sidekick'),
  broadcaster: buildKickBadgeAsset('broadcaster', 'Broadcaster'),
  moderator: buildKickBadgeAsset('moderator', 'Moderator'),
  vip: buildKickBadgeAsset('vip', 'VIP'),
  og: buildKickBadgeAsset('og', 'OG'),
  founder: buildKickBadgeAsset('founder', 'Founder'),
  subscriber: buildKickBadgeAsset('subscriber', 'Subscriber'),
  subgifter: buildKickBadgeAsset('subgifter', 'Gift Sub Gifter', 'subGifter'),
  subgifter25: buildKickBadgeAsset('subgifter25', '25 Gift Subs', 'subGifter25'),
  subgifter50: buildKickBadgeAsset('subgifter50', '50 Gift Subs', 'subGifter50'),
  subgifter100: buildKickBadgeAsset(
    'subgifter100',
    '100 Gift Subs',
    'subGifter100'
  ),
  subgifter200: buildKickBadgeAsset(
    'subgifter200',
    '200 Gift Subs',
    'subGifter200'
  ),
};

const KICK_BADGE_CANONICAL_BY_KEY: Record<string, string> = {
  admin: 'staff',
  broadcaster: 'broadcaster',
  founder: 'founder',
  globalmod: 'moderator',
  mod: 'moderator',
  moderator: 'moderator',
  og: 'og',
  owner: 'broadcaster',
  partner: 'verified',
  sidekick: 'sidekick',
  staff: 'staff',
  streamer: 'broadcaster',
  sub: 'subscriber',
  subscriber: 'subscriber',
  subgift: 'subgifter',
  subgifter: 'subgifter',
  subgifter1: 'subgifter',
  subgifter25: 'subgifter25',
  subgifter50: 'subgifter50',
  subgifter100: 'subgifter100',
  subgifter200: 'subgifter200',
  trainwreckstv: 'trainwreckstv',
  verified: 'verified',
  vip: 'vip',
};

export const resolveKickBadgeAsset = (key: string): KickBadgeAsset | null => {
  // Kick badge strings can carry a `:count` suffix (e.g. "subscriber:12").
  const base = key.split(':')[0] ?? key;
  const canonicalKey =
    KICK_BADGE_CANONICAL_BY_KEY[normalizeKickBadgeAssetKey(base)];
  if (!canonicalKey) return null;
  return KICK_BADGE_ASSET_BY_CANONICAL_KEY[canonicalKey] ?? null;
};

const readBadgeKey = (rawBadge: unknown): string => {
  if (typeof rawBadge === 'string') return rawBadge;
  if (rawBadge && typeof rawBadge === 'object' && 'id' in rawBadge) {
    const id = (rawBadge as { id?: unknown }).id;
    if (typeof id === 'string') return id;
  }
  return '';
};

/**
 * Resolves a message's raw badge list into renderable badges (image when
 * available, otherwise a short text label). Twitch badges resolve against the
 * fetched global badge map; Kick badges resolve against the static asset table.
 */
export const resolveMessageBadges = (
  message: ChatMessage,
  twitchBadgeMap: BadgeMap
): RenderBadge[] => {
  const rawBadges = Array.isArray(message.badges) ? message.badges : [];
  const resolved: RenderBadge[] = [];
  const seenKeys = new Set<string>();

  for (const rawBadge of rawBadges as unknown[]) {
    const badgeKey = readBadgeKey(rawBadge);
    if (!badgeKey) continue;

    if (message.platform === 'kick') {
      const asset = resolveKickBadgeAsset(badgeKey);
      const resolvedKey = asset?.key ?? badgeKey.toLowerCase();
      if (seenKeys.has(resolvedKey)) continue;
      seenKeys.add(resolvedKey);
      resolved.push({
        key: resolvedKey,
        label: asset?.title ?? badgeKey,
        imageUri: asset?.imageUrl,
      });
      continue;
    }

    const lookupKeys = expandBadgeLookupKeys(badgeKey);
    const imageUri = lookupKeys
      .map((lookupKey) => twitchBadgeMap[lookupKey])
      .find((value) => typeof value === 'string' && value.length > 0);
    const resolvedKey = lookupKeys[0] || badgeKey;
    if (seenKeys.has(resolvedKey)) continue;
    seenKeys.add(resolvedKey);
    resolved.push({ key: resolvedKey, label: badgeKey, imageUri });
  }

  return resolved;
};
