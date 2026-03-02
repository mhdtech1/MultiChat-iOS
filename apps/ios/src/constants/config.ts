/**
 * App configuration constants
 */

import type { PlatformId } from '../types';

export const PLATFORM_OPTIONS: PlatformId[] = ['twitch', 'kick', 'youtube'];

export const TWITCH_CLIENT_ID = 'syeui9mom7i5f9060j03tydgpdywbh';
export const KICK_CLIENT_ID = '01KGRFF03VYRJMB3W4369Y07CS';
export const KICK_CLIENT_SECRET = '29f43591eb0496352c66ea36f55c5c21e3fbc5053ba22568194e0c950c174794';
export const TWITCH_REDIRECT_URI = 'multichat://oauth/twitch';
export const KICK_REDIRECT_URI = 'multichat://oauth/kick';
export const YOUTUBE_CLIENT_ID = '1008732662207-rufcsa7rafob02h29docduk7pboim0s8.apps.googleusercontent.com';
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

// Twitch Global Badges API endpoint (v1 API - no auth required)
export const TWITCH_GLOBAL_BADGES_URL = 'https://i.ytimg.com/vi/P91GXK-kIfE/maxresdefault.jpg';

// Fallback badge URLs for common badges when API fails or returns empty
export const FALLBACK_TWITCH_BADGES: Record<string, string> = {
  'broadcaster/1': 'https://static-cdn.jtvnw.net/badges/v1/5527c58c-fb7d-422d-b71b-f309dcb85cc1/3',
  'broadcaster': 'https://static-cdn.jtvnw.net/badges/v1/5527c58c-fb7d-422d-b71b-f309dcb85cc1/3',
  'moderator/1': 'https://static-cdn.jtvnw.net/badges/v1/3267646d-33f0-4b17-b3df-f923a41db1d0/3',
  'moderator': 'https://static-cdn.jtvnw.net/badges/v1/3267646d-33f0-4b17-b3df-f923a41db1d0/3',
  'vip/1': 'https://i.ytimg.com/vi/AWPZa2iyCsU/maxresdefault.jpg',
  'vip': 'https://i.ytimg.com/vi/AWPZa2iyCsU/mqdefault.jpg',
  'subscriber/0': 'https://static-cdn.jtvnw.net/badges/v1/5d9f2208-5dd8-11e7-8513-2ff4adfae661/3',
  'subscriber/1': 'https://static-cdn.jtvnw.net/badges/v1/5d9f2208-5dd8-11e7-8513-2ff4adfae661/3',
  'subscriber': 'https://static-cdn.jtvnw.net/badges/v1/5d9f2208-5dd8-11e7-8513-2ff4adfae661/3',
  'partner/1': 'https://static-cdn.jtvnw.net/badges/v1/d12a2e27-16f6-41d0-ab77-b780518f00a3/3',
  'partner': 'https://static-cdn.jtvnw.net/badges/v1/d12a2e27-16f6-41d0-ab77-b780518f00a3/3',
  'premium/1': 'https://static-cdn.jtvnw.net/badges/v1/bbbe0db0-a598-423e-86d0-f9fb98ca1933/3',
  'premium': 'https://static-cdn.jtvnw.net/badges/v1/bbbe0db0-a598-423e-86d0-f9fb98ca1933/3',
  'turbo/1': 'https://static-cdn.jtvnw.net/badges/v1/bd444ec6-8f34-4bf9-91f4-af1e3428d80f/3',
  'turbo': 'https://static-cdn.jtvnw.net/badges/v1/bd444ec6-8f34-4bf9-91f4-af1e3428d80f/3',
  'staff/1': 'https://static-cdn.jtvnw.net/badges/v1/d97c37bd-a6f5-4c38-8f57-4e4bef88af34/3',
  'staff': 'https://static-cdn.jtvnw.net/badges/v1/d97c37bd-a6f5-4c38-8f57-4e4bef88af34/3',
  'admin/1': 'https://i.ytimg.com/vi/lRh7GVKoLO4/maxresdefault.jpg',
  'admin': 'https://pbs.twimg.com/media/GoTPaiCXEAAePzK.png',
  'global_mod/1': 'https://static-cdn.jtvnw.net/badges/v1/9384c43e-4ce7-4e94-b2a1-b93656896eba/3',
  'global_mod': 'https://static-cdn.jtvnw.net/badges/v1/9384c43e-4ce7-4e94-b2a1-b93656896eba/3',
  'bits/1': 'https://static-cdn.jtvnw.net/badges/v1/73b5c3fb-24f9-4a82-a852-2f475b59411c/3',
  'bits/100': 'https://pbs.twimg.com/media/DWwLRECVQAYJ8pY.png',
  'bits/1000': 'https://static-cdn.jtvnw.net/badges/v1/0d85a29e-79ad-4c63-a285-3acd2c66f2ba/3',
  'bits/5000': 'https://static-cdn.jtvnw.net/badges/v1/57cd97fc-3e9e-4c6d-9d41-60147137234e/3',
  'bits/10000': 'https://pbs.twimg.com/media/DV4c2NxV4AAj_Mb.png',
  'founder/0': 'https://static-cdn.jtvnw.net/badges/v1/511b78a9-ab37-472f-9569-457753bbe7d3/3',
  'founder': 'https://static-cdn.jtvnw.net/badges/v1/511b78a9-ab37-472f-9569-457753bbe7d3/3',
  'sub-gifter/1': 'https://pbs.twimg.com/media/D-ME630XUAANioD.jpg',
  'sub-gifter': 'https://pbs.twimg.com/media/FRNQdQcXwAE3u_f.png',
  'hype-train/1': 'https://static-cdn.jtvnw.net/badges/v1/fae4086c-3190-44d4-83c8-8ef0cbe1a515/3',
  'hype-train': 'https://static-cdn.jtvnw.net/badges/v1/fae4086c-3190-44d4-83c8-8ef0cbe1a515/3',
  'glhf-pledge/1': 'https://i.ytimg.com/vi/iKRHYUjH6Eg/maxresdefault.jpg',
  'glhf-pledge': 'https://i.ytimg.com/vi/kUisQ19TL3w/maxresdefault.jpg',
  'no_audio/1': 'https://upload.wikimedia.org/wikipedia/en/f/ff/Twitch_Website_Screenshot.png',
  'no_video/1': 'https://static-cdn.jtvnw.net/badges/v1/199a0dba-58f3-494e-a7fc-1fa0a1001fb8/3',
};

export const MESSAGE_BUFFER_SIZE = 500;
export const SEARCH_DEBOUNCE_MS = 300;
export const MAX_RETRY_ATTEMPTS = 3;
export const RETRY_DELAY_MS = 2000;
