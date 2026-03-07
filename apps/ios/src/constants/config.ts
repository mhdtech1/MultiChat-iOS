/**
 * App configuration constants
 *
 * Sensitive values (client IDs, secrets) are read from environment variables
 * injected at build time via Expo's `extra` config or a `.env` file.
 * Fallback strings are empty so the app won't accidentally ship with stale
 * credentials when the environment is not configured.
 */

import type { PlatformId } from '../types';
import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

export const PLATFORM_OPTIONS: PlatformId[] = ['twitch', 'kick', 'youtube'];

export const TWITCH_CLIENT_ID = extra.TWITCH_CLIENT_ID ?? process.env.TWITCH_CLIENT_ID ?? '';
export const KICK_CLIENT_ID = extra.KICK_CLIENT_ID ?? process.env.KICK_CLIENT_ID ?? '';
export const KICK_CLIENT_SECRET = extra.KICK_CLIENT_SECRET ?? process.env.KICK_CLIENT_SECRET ?? '';
export const TWITCH_REDIRECT_URI = 'multichat://oauth/twitch';
export const KICK_REDIRECT_URI = 'multichat://oauth/kick';
export const YOUTUBE_CLIENT_ID = extra.YOUTUBE_CLIENT_ID ?? process.env.YOUTUBE_CLIENT_ID ?? '';
// Google OAuth native redirects typically require a dotted custom scheme.
export const YOUTUBE_REDIRECT_URI = 'com.mhdtech.multichatios:/oauth/youtube';

export const TWITCH_SCOPES = [
  'chat:read',
  'chat:edit',
  'moderator:manage:banned_users',
  'moderator:manage:chat_messages',
  'moderator:read:moderators',
];

export const KICK_SCOPES = [
  'user:read',
  'channel:read',
  'chat:write',
  'moderation:ban',
  'moderation:chat_message:manage',
];

export const YOUTUBE_SCOPES = ['https://www.googleapis.com/auth/youtube.force-ssl'];

export const PLATFORM_LOGOS: Record<PlatformId, string> = {
  twitch: 'https://static.twitchcdn.net/assets/favicon-32-e29e246c157142c94346.png',
  kick: 'https://play-lh.googleusercontent.com/zEMwKW77990UYUC6aJrJhJmnKdHpr_56Y4W1n7C9xrk2a2gSTT62_Lk1uaLek-cYH4UBl12pc8Au4444oYQK=w240-h480-rw',
  youtube: 'https://www.youtube.com/favicon.ico',
};

export const PLATFORM_NAMES: Record<PlatformId, string> = {
  twitch: 'Twitch',
  kick: 'Kick',
  youtube: 'YouTube',
};

export const PLATFORM_COLORS: Record<PlatformId, string> = {
  twitch: '#9146ff',
  kick: '#53fc18',
  youtube: '#ff0000',
};

export const APP_STATE_FILENAME = 'mobile-app-state-v1.json';
export const OBS_SAVED_CONNECTIONS_FILENAME = 'obs-saved-connections.json';
export const OBS_PREVIEW_TARGET_INTERVAL_MS = Math.round(1000 / 24);
export const OBS_SCENE_TILE_ROW_GAP = 10;
export const TWITCH_GLOBAL_BADGES_URL = 'https://badges.twitch.tv/v1/badges/global/display?language=en';

export const MESSAGE_BUFFER_SIZE = 500;
export const SEARCH_DEBOUNCE_MS = 300;
export const MAX_RETRY_ATTEMPTS = 3;
export const RETRY_DELAY_MS = 2000;
