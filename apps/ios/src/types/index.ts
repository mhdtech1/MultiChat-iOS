/**
 * Type definitions for MultiChat iOS
 */

import type { ChatMessage, ChatAdapterStatus } from '@multichat/chat-core';

export type PlatformId = 'twitch' | 'kick' | 'youtube';

export type ChatSource = {
  id: string;
  platform: PlatformId;
  channel: string;
};

export type ChatTab = {
  id: string;
  sourceIds: string[];
  label: string;
};

export type TabMessageItem = {
  sourceId: string;
  message: ChatMessage;
};

export type RenderBadge = {
  key: string;
  label?: string;
  imageUri?: string;
};

export type CredentialSnapshot = {
  twitchToken: string;
  twitchUsername: string;
  kickToken: string;
  kickUsername: string;
  youtubeAccessToken: string;
  youtubeRefreshToken: string;
};

export type ConnectionStatus = {
  status: ChatAdapterStatus;
  platform: PlatformId;
  channel: string;
  lastConnected?: Date;
  errorMessage?: string;
  retryCount: number;
};

// Platform-specific message types (P1 Recommendation #9)
export type TwitchMessageMeta = {
  isRaid?: boolean;
  raidViewerCount?: number;
  isBits?: boolean;
  bitsAmount?: number;
  isSubscription?: boolean;
  subscriptionTier?: string;
  subscriptionMonths?: number;
};

export type YouTubeMessageMeta = {
  isSuperChat?: boolean;
  superChatAmount?: string;
  superChatCurrency?: string;
  isMembership?: boolean;
  membershipTier?: string;
};

export type KickMessageMeta = {
  isGift?: boolean;
  giftAmount?: number;
  isHost?: boolean;
  hostViewerCount?: number;
};

export type EnhancedChatMessage = ChatMessage & {
  twitchMeta?: TwitchMessageMeta;
  youtubeMeta?: YouTubeMessageMeta;
  kickMeta?: KickMessageMeta;
};

export type MessageSegment =
  | { type: 'text'; value: string }
  | { type: 'emote'; value: string; uri: string };

// Filter types (P2 Recommendation #11)
export type MessageFilter = {
  platforms: PlatformId[];
  users: string[];
  keywords: string[];
  showSubscriptions: boolean;
  showRaids: boolean;
  showSuperChats: boolean;
  showBits: boolean;
};

// Notification preferences (P2 Recommendation #12)
export type NotificationPreferences = {
  enabled: boolean;
  mentions: boolean;
  keywords: string[];
  subscriptions: boolean;
  raids: boolean;
  superChats: boolean;
  bits: boolean;
  sound: boolean;
  vibration: boolean;
};

// OBS Types
export type ObsSceneItem = {
  sceneItemId: number;
  sourceName: string;
  enabled: boolean;
};

export type ObsAudioInput = {
  inputName: string;
  muted: boolean;
  volumeMul: number;
};

export type ObsStats = {
  cpuUsage: number | null;
  activeFps: number | null;
  outputSkippedFrames: number | null;
  outputTotalFrames: number | null;
};

export type ObsSavedConnection = {
  id: string;
  name: string;
  host: string;
  port: string;
  password?: string;
};

export type ObsReachability = 'checking' | 'reachable' | 'offline';

export type MobileSection = 'chats' | 'add' | 'obs' | 'settings';
export type ObsDetailTab = 'sceneItems' | 'audio';

// Persisted state
export type PersistedAppStateV1 = {
  version: number;
  platformInput: PlatformId;
  channelInput: string;
  mobileSection: MobileSection;
  sources: ChatSource[];
  tabs: ChatTab[];
  activeTabId: string | null;
  twitchUsername: string;
  twitchToken: string;
  kickUsername: string;
  kickToken: string;
  kickRefreshToken: string;
  youtubeAccessToken: string;
  youtubeRefreshToken: string;
  youtubeTokenExpiry: number;
  youtubeUsername: string;
  obsHost: string;
  obsPort: string;
  obsPassword: string;
  obsSavedName: string;
  obsDetailTab: ObsDetailTab;
  // New fields
  hasCompletedOnboarding: boolean;
  messageFilters: MessageFilter;
  notificationPreferences: NotificationPreferences;
};

// Error types (P0 Recommendation #3)
export type AppError = {
  id: string;
  type: 'connection' | 'authentication' | 'network' | 'unknown';
  message: string;
  platform?: PlatformId;
  retryable: boolean;
  retryAction?: () => Promise<void>;
  timestamp: Date;
};

// Loading states (P0 Recommendation #4)
export type LoadingState = {
  isLoading: boolean;
  message?: string;
};

// Search types (P1 Recommendation #8)
export type SearchResult = {
  message: EnhancedChatMessage;
  sourceId: string;
  matchedText: string;
  timestamp: Date;
};

export type SearchQuery = {
  text: string;
  platforms?: PlatformId[];
  users?: string[];
  dateRange?: { start: Date; end: Date };
};
