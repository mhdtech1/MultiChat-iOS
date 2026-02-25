/**
 * MultiChat iOS - Refactored App.tsx
 * 
 * This is the main application file, refactored from a 152KB monolithic file
 * into a clean, modular architecture implementing all 15 recommendations:
 * 
 * P0 - Critical:
 * 1. First-run onboarding flow (OnboardingWizard component)
 * 2. Empty states with CTAs (EmptyStates components)
 * 3. Graceful error handling (ErrorHandling components)
 * 4. Loading states and skeleton UI (LoadingStates components)
 * 
 * P1 - High Priority:
 * 5. Settings discoverability (SettingsScreen component)
 * 6. Message grouping by time (ChatMessage component)
 * 7. Connection status indicators (ConnectionStatus component)
 * 8. Search functionality (SearchOverlay component)
 * 9. Platform-specific features (ChatMessage component)
 * 
 * P2 - Nice to Have:
 * 10. Keyboard shortcuts (useKeyboardShortcuts hook)
 * 11. Message filtering (FilterSettings component)
 * 12. Notification preferences (SettingsScreen component)
 * 13. Performance optimization (memoization, virtualized lists)
 * 14. Accessibility features (proper labels, touch targets)
 * 15. Design system (theme constants)
 */

import React, { useEffect, useMemo, useRef, useState, useCallback, memo } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Crypto from 'expo-crypto';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform as RNPlatform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  AccessibilityInfo,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { ChatAdapter, ChatAdapterStatus, ChatMessage as ChatMessageType } from '@multichat/chat-core';
import { KickAdapter, TwitchAdapter, YouTubeAdapter } from '@multichat/chat-core';

// Import components
import { OnboardingWizard } from './src/components/onboarding';
import { ChatList } from './src/components/chat';
import { SettingsScreen, FilterSettings } from './src/components/settings';
import { SearchOverlay } from './src/components/search';
import {
  FullScreenLoading,
  LoadingSpinner,
  TabSkeleton,
  ConnectionStatusBar,
  ConnectionStatusBadge,
  ErrorBanner,
  NoChatEmptyState,
  ObsNotConnectedEmptyState,
} from './src/components/common';

// Import design system and utilities
import { colors, spacing, borderRadius, typography, shadows, accessibility } from './src/constants/theme';
import {
  PLATFORM_OPTIONS,
  TWITCH_CLIENT_ID,
  KICK_CLIENT_ID,
  KICK_CLIENT_SECRET,
  TWITCH_REDIRECT_URI,
  KICK_REDIRECT_URI,
  YOUTUBE_CLIENT_ID,
  YOUTUBE_REDIRECT_URI,
  TWITCH_SCOPES,
  KICK_SCOPES,
  YOUTUBE_SCOPES,
  PLATFORM_LOGOS,
  PLATFORM_NAMES,
  PLATFORM_COLORS,
  APP_STATE_FILENAME,
  OBS_SAVED_CONNECTIONS_FILENAME,
  TWITCH_GLOBAL_BADGES_URL,
  FALLBACK_TWITCH_BADGES,
} from './src/constants/config';
import type {
  PlatformId,
  ChatSource,
  ChatTab,
  TabMessageItem,
  EnhancedChatMessage,
  MobileSection,
  ObsDetailTab,
  AppError,
  MessageFilter,
  NotificationPreferences,
  ObsSavedConnection,
  ObsReachability,
  ObsSceneItem,
  ObsAudioInput,
  ObsStats,
} from './src/types';
import {
  makeId,
  formatClock,
  formatObsDuration,
  statusLabel,
  platformTag,
  isWritable,
  expandBadgeLookupKeys,
  parseSevenTvEmoteMap,
  parseTwitchBadgeMap,
  readPossibleImageUri,
  segmentMessageWithEmotes,
  randomToken,
  toBase64Url,
  asRecord,
  readNumber,
  clamp01,
  getMessageAuthor,
  getMessageAuthorColor,
} from './src/utils/helpers';
import {
  getAppStateUri,
  getObsSavedConnectionsUri,
  normalizePersistedAppState,
  normalizeObsSavedConnections,
  normalizePlatformId,
  normalizeMobileSection,
} from './src/utils/storage';
import { useSearch } from './src/hooks/useSearch';
import { useKeyboardShortcuts, formatShortcut } from './src/hooks/useKeyboardShortcuts';

WebBrowser.maybeCompleteAuthSession();

// ============================================================================
// Types retained from original for OBS functionality
// ============================================================================

type CredentialSnapshot = {
  twitchToken: string;
  twitchUsername: string;
  kickToken: string;
  kickUsername: string;
  youtubeAccessToken: string;
  youtubeRefreshToken: string;
};

type ObsPendingRequest = {
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

const extractBadgeImageMapFromUnknown = (value: unknown, next: Record<string, string>) => {
  if (Array.isArray(value)) {
    for (const entry of value) {
      extractBadgeImageMapFromUnknown(entry, next);
    }
    return;
  }

  const record = asRecord(value);
  if (!record) return;

  const imageUri = readPossibleImageUri(record);
  if (imageUri) {
    const directKeys = ['set_id', 'setId', 'type', 'badge', 'text', 'label', 'name', 'slug', 'id'];
    const rawCandidates: string[] = [];
    for (const key of directKeys) {
      const candidate = record[key];
      if (typeof candidate === 'string' && candidate.trim()) {
        rawCandidates.push(candidate.trim());
      }
    }

    const setIdRaw =
      (typeof record.set_id === 'string' && record.set_id.trim()) ||
      (typeof record.setId === 'string' && record.setId.trim()) ||
      (typeof record.type === 'string' && record.type.trim()) ||
      '';
    const versionRaw =
      (typeof record.version === 'string' && record.version.trim()) ||
      (typeof record.id === 'string' && record.id.trim()) ||
      '';
    if (setIdRaw && versionRaw && setIdRaw.toLowerCase() !== versionRaw.toLowerCase()) {
      rawCandidates.push(`${setIdRaw}/${versionRaw}`);
    }

    for (const rawCandidate of rawCandidates) {
      for (const expanded of expandBadgeLookupKeys(rawCandidate)) {
        if (!next[expanded]) {
          next[expanded] = imageUri;
        }
      }
    }
  }

  if ('badges' in record) extractBadgeImageMapFromUnknown(record.badges, next);
  if ('badge' in record) extractBadgeImageMapFromUnknown(record.badge, next);
  if ('identity' in record) extractBadgeImageMapFromUnknown(record.identity, next);
  if ('sender' in record) extractBadgeImageMapFromUnknown(record.sender, next);
  if ('authorDetails' in record) extractBadgeImageMapFromUnknown(record.authorDetails, next);
};

const extractBadgeImageMapFromMessage = (message: ChatMessageType) => {
  const discovered: Record<string, string> = {};
  extractBadgeImageMapFromUnknown(message.raw, discovered);
  return discovered;
};

const fetchTwitchGlobalBadgeMap = async (token?: string): Promise<Record<string, string>> => {
  const attempts: Array<{ url: string; headers?: Record<string, string> }> = [];
  const trimmedToken = token?.trim() ?? '';
  if (trimmedToken && TWITCH_CLIENT_ID.trim()) {
    attempts.push({
      url: 'https://api.twitch.tv/helix/chat/badges/global',
      headers: {
        Authorization: `Bearer ${trimmedToken}`,
        'Client-Id': TWITCH_CLIENT_ID,
      },
    });
  }
  attempts.push({ url: TWITCH_GLOBAL_BADGES_URL });

  for (const attempt of attempts) {
    try {
      const response = await fetch(attempt.url, { headers: attempt.headers });
      if (!response.ok) continue;
      const raw = await response.text();
      if (!raw.trim().startsWith('{')) continue;
      const parsed = JSON.parse(raw);
      const badges = parseTwitchBadgeMap(parsed);
      if (Object.keys(badges).length > 0) {
        // Merge API badges with fallback badges (API takes priority)
        return { ...FALLBACK_TWITCH_BADGES, ...badges };
      }
    } catch {
      // Ignore and continue fallback chain.
    }
  }

  // Return fallback badges when all API attempts fail
  console.log('Using fallback Twitch badges - API requests failed');
  return { ...FALLBACK_TWITCH_BADGES };
};

const fetchTwitchChannelBadgeMap = async (roomId: string, token?: string): Promise<Record<string, string>> => {
  const normalizedRoomId = roomId.trim();
  if (!normalizedRoomId) return {};

  const attempts: Array<{ url: string; headers?: Record<string, string> }> = [];
  const trimmedToken = token?.trim() ?? '';
  if (trimmedToken && TWITCH_CLIENT_ID.trim()) {
    attempts.push({
      url: `https://api.twitch.tv/helix/chat/badges?broadcaster_id=${encodeURIComponent(normalizedRoomId)}`,
      headers: {
        Authorization: `Bearer ${trimmedToken}`,
        'Client-Id': TWITCH_CLIENT_ID,
      },
    });
  }
  attempts.push({
    url: `https://badges.twitch.tv/v1/badges/channels/${encodeURIComponent(normalizedRoomId)}/display?language=en`,
  });

  for (const attempt of attempts) {
    try {
      const response = await fetch(attempt.url, { headers: attempt.headers });
      if (!response.ok) continue;
      const raw = await response.text();
      if (!raw.trim().startsWith('{')) continue;
      const parsed = JSON.parse(raw);
      const badges = parseTwitchBadgeMap(parsed);
      if (Object.keys(badges).length > 0) {
        return badges;
      }
    } catch {
      // Try next fallback source.
    }
  }

  // Channel badges not found - this is expected for channels without custom badges
  return {};
};

const resolveTwitchUserId = async (loginRaw: string, token?: string): Promise<string> => {
  const login = loginRaw.trim().toLowerCase();
  if (!login) return '';
  const trimmedToken = token?.trim() ?? '';
  if (!trimmedToken || !TWITCH_CLIENT_ID.trim()) return '';

  try {
    const response = await fetch(
      `https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`,
      {
        headers: {
          Authorization: `Bearer ${trimmedToken}`,
          'Client-Id': TWITCH_CLIENT_ID,
        },
      }
    );
    if (!response.ok) return '';
    const raw = await response.text();
    if (!raw.trim().startsWith('{')) return '';
    const parsed = JSON.parse(raw) as { data?: Array<{ id?: string }> };
    const id = parsed.data?.[0]?.id;
    return typeof id === 'string' ? id.trim() : '';
  } catch {
    return '';
  }
};

const parseAuthParamsFromCallbackUrl = (callbackUrl: string) => {
  const hashIndex = callbackUrl.indexOf('#');
  const baseWithQuery = hashIndex >= 0 ? callbackUrl.slice(0, hashIndex) : callbackUrl;
  const fragment = hashIndex >= 0 ? callbackUrl.slice(hashIndex + 1) : '';
  const queryIndex = baseWithQuery.indexOf('?');
  const query = queryIndex >= 0 ? baseWithQuery.slice(queryIndex + 1) : '';

  const params = new URLSearchParams(query);
  if (fragment) {
    const fragmentParams = new URLSearchParams(fragment);
    fragmentParams.forEach((value, key) => {
      if (!params.has(key)) {
        params.set(key, value);
      }
    });
  }
  return params;
};

const summarizeHttpError = (status: number, body: string, fallback: string) => {
  let detail = fallback;
  try {
    const parsed = JSON.parse(body) as { error?: string; error_description?: string; message?: string };
    detail = parsed.error_description || parsed.message || parsed.error || fallback;
  } catch {
    if (body.trim()) {
      detail = body.trim().slice(0, 180);
    }
  }
  return `${fallback} (${status}): ${detail}`;
};

const OBS_AUDIO_DB_TICKS = [0, -5, -10, -15, -20, -25, -30, -35, -40, -45, -50, -55, -60] as const;
const OBS_MIXER_TRACK_HEIGHT = 200;
const OBS_MIXER_THUMB_HEIGHT = 28;

const obsVolumeToDb = (volumeMul: number) => {
  if (!Number.isFinite(volumeMul) || volumeMul <= 0.0001) return -60;
  return Math.max(-60, Math.min(12, 20 * Math.log10(volumeMul)));
};

const formatObsDbValue = (volumeMul: number) => `${obsVolumeToDb(volumeMul).toFixed(1)} dB`;

// ============================================================================
// Main App Component
// ============================================================================

export default function App() {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // ============================================================================
  // State Management
  // ============================================================================
  
  // Loading and initialization state (P0 Recommendation #4)
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Onboarding state (P0 Recommendation #1)
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  
  // Navigation state
  const [mobileSection, setMobileSection] = useState<MobileSection>('chats');
  
  // Chat state
  const [sources, setSources] = useState<ChatSource[]>([]);
  const [tabs, setTabs] = useState<ChatTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [messagesBySource, setMessagesBySource] = useState<Map<string, EnhancedChatMessage[]>>(new Map());
  
  // Add channel form state
  const [platformInput, setPlatformInput] = useState<PlatformId>('twitch');
  const [channelInput, setChannelInput] = useState('');
  
  // Credentials state
  const [twitchUsername, setTwitchUsername] = useState('');
  const [twitchToken, setTwitchToken] = useState('');
  const [kickUsername, setKickUsername] = useState('');
  const [kickToken, setKickToken] = useState('');
  const [kickRefreshToken, setKickRefreshToken] = useState('');
  const [youtubeAccessToken, setYoutubeAccessToken] = useState('');
  const [youtubeRefreshToken, setYoutubeRefreshToken] = useState('');
  const [youtubeTokenExpiry, setYoutubeTokenExpiry] = useState(0);
  const [youtubeUsername, setYoutubeUsername] = useState('');
  
  // OBS state
  const [obsHost, setObsHost] = useState('127.0.0.1');
  const [obsPort, setObsPort] = useState('4455');
  const [obsPassword, setObsPassword] = useState('');
  const [obsSavedName, setObsSavedName] = useState('');
  const [obsDetailTab, setObsDetailTab] = useState<ObsDetailTab>('sceneItems');
  const [obsConnected, setObsConnected] = useState(false);
  const [obsConnecting, setObsConnecting] = useState(false);
  const [obsStatusText, setObsStatusText] = useState('Disconnected');
  const [obsScenes, setObsScenes] = useState<string[]>([]);
  const [obsActiveScene, setObsActiveScene] = useState<string | null>(null);
  const [obsPreviewUri, setObsPreviewUri] = useState<string | null>(null);
  const [obsSceneItems, setObsSceneItems] = useState<ObsSceneItem[]>([]);
  const [obsAudioInputs, setObsAudioInputs] = useState<ObsAudioInput[]>([]);
  const [obsStats, setObsStats] = useState<ObsStats>({ cpuUsage: null, activeFps: null, outputSkippedFrames: null, outputTotalFrames: null });
  const [obsStreaming, setObsStreaming] = useState(false);
  const [obsRecording, setObsRecording] = useState(false);
  const [obsStreamTimecode, setObsStreamTimecode] = useState<number | null>(null);
  const [obsRecordTimecode, setObsRecordTimecode] = useState<number | null>(null);
  const [obsSavedConnections, setObsSavedConnections] = useState<ObsSavedConnection[]>([]);
  const [obsReachabilityMap, setObsReachabilityMap] = useState<Map<string, ObsReachability>>(new Map());
  
  // Emotes and badges
  const [globalEmoteMap, setGlobalEmoteMap] = useState<Record<string, string>>({});
  const [channelEmoteMaps, setChannelEmoteMaps] = useState<Map<string, Record<string, string>>>(new Map());
  const [globalBadgeMap, setGlobalBadgeMap] = useState<Record<string, string>>({});
  
  // Error state (P0 Recommendation #3)
  const [errors, setErrors] = useState<AppError[]>([]);
  
  // Filter state (P2 Recommendation #11)
  const defaultMessageFilter: MessageFilter = {
    platforms: ['twitch', 'kick', 'youtube'],
    users: [],
    keywords: [],
    showSubscriptions: true,
    showRaids: true,
    showSuperChats: true,
    showBits: true,
  };
  const [messageFilters, setMessageFilters] = useState<MessageFilter>(defaultMessageFilter);
  const [showFilterModal, setShowFilterModal] = useState(false);
  
  // Notification preferences (P2 Recommendation #12)
  const defaultNotificationPreferences: NotificationPreferences = {
    enabled: false,
    mentions: true,
    keywords: [],
    subscriptions: true,
    raids: true,
    superChats: true,
    bits: true,
    sound: true,
    vibration: true,
  };
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(defaultNotificationPreferences);
  
  // Search state (P1 Recommendation #8)
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // Camera permission for OBS QR scanning
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [showQrScanner, setShowQrScanner] = useState(false);
  
  // Connection status state (P1 Recommendation #7)
  const [connectionStatuses, setConnectionStatuses] = useState<Map<string, ChatAdapterStatus>>(new Map());
  
  // Refs
  const adaptersRef = useRef<Map<string, ChatAdapter>>(new Map());
  const obsSocketRef = useRef<WebSocket | null>(null);
  const obsPendingRequestsRef = useRef<Map<string, ObsPendingRequest>>(new Map());
  const obsRequestIdRef = useRef(1);
  const obsRpcVersionRef = useRef(1);
  const obsRefreshInFlightRef = useRef(false);
  const twitchBadgeRoomsLoadingRef = useRef<Set<string>>(new Set());
  const twitchBadgeRoomsLoadedRef = useRef<Set<string>>(new Set());
  const twitchChannelLookupLoadingRef = useRef<Set<string>>(new Set());
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // ============================================================================
  // Computed Values
  // ============================================================================
  
  const activeTab = useMemo(() => tabs.find((t) => t.id === activeTabId) ?? null, [tabs, activeTabId]);
  
  const activeMessages = useMemo(() => {
    if (!activeTab) return [];
    const messages: EnhancedChatMessage[] = [];
    for (const sourceId of activeTab.sourceIds) {
      const sourceMessages = messagesBySource.get(sourceId) ?? [];
      messages.push(...sourceMessages);
    }
    // Sort by timestamp
    messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return messages;
  }, [activeTab, messagesBySource]);
  
  const combinedEmoteMap = useMemo(() => {
    const combined = { ...globalEmoteMap };
    channelEmoteMaps.forEach((map) => {
      Object.assign(combined, map);
    });
    return combined;
  }, [globalEmoteMap, channelEmoteMaps]);
  
  const credentialSnapshot: CredentialSnapshot = useMemo(
    () => ({
      twitchToken,
      twitchUsername,
      kickToken,
      kickUsername,
      youtubeAccessToken,
      youtubeRefreshToken,
    }),
    [twitchToken, twitchUsername, kickToken, kickUsername, youtubeAccessToken, youtubeRefreshToken]
  );
  
  const connectionStatusArray = useMemo(() => {
    return sources.map((source) => ({
      sourceId: source.id,
      platform: source.platform,
      channel: source.channel,
      status: connectionStatuses.get(source.id) ?? 'disconnected' as ChatAdapterStatus,
    }));
  }, [sources, connectionStatuses]);
  
  // ============================================================================
  // Keyboard Shortcuts (P2 Recommendation #10)
  // ============================================================================
  
  useKeyboardShortcuts([
    { key: '1', modifiers: ['meta'], action: () => setMobileSection('chats'), description: 'Go to Chats' },
    { key: '2', modifiers: ['meta'], action: () => setMobileSection('add'), description: 'Add Channel' },
    { key: '3', modifiers: ['meta'], action: () => setMobileSection('obs'), description: 'OBS Control' },
    { key: '4', modifiers: ['meta'], action: () => setMobileSection('settings'), description: 'Settings' },
    { key: 'f', modifiers: ['meta'], action: () => setIsSearchOpen(true), description: 'Search' },
  ]);
  
  // ============================================================================
  // Persistence Functions
  // ============================================================================
  
  const persistState = useCallback(async () => {
    const uri = getAppStateUri();
    if (!uri) return;
    
    try {
      const state = {
        version: 1,
        platformInput,
        channelInput,
        mobileSection,
        sources,
        tabs,
        activeTabId,
        twitchUsername,
        twitchToken,
        kickUsername,
        kickToken,
        kickRefreshToken,
        youtubeAccessToken,
        youtubeRefreshToken,
        youtubeTokenExpiry,
        youtubeUsername,
        obsHost,
        obsPort,
        obsPassword,
        obsSavedName,
        obsDetailTab,
        hasCompletedOnboarding,
        messageFilters,
        notificationPreferences,
      };
      await FileSystemLegacy.writeAsStringAsync(uri, JSON.stringify(state));
    } catch (e) {
      console.error('Failed to persist state:', e);
    }
  }, [
    platformInput, channelInput, mobileSection, sources, tabs, activeTabId,
    twitchUsername, twitchToken, kickUsername, kickToken, kickRefreshToken,
    youtubeAccessToken, youtubeRefreshToken, youtubeTokenExpiry, youtubeUsername,
    obsHost, obsPort, obsPassword, obsSavedName, obsDetailTab,
    hasCompletedOnboarding, messageFilters, notificationPreferences,
  ]);
  
  // Auto-persist with debouncing
  useEffect(() => {
    if (!isInitialized) return;
    
    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
    }
    persistTimeoutRef.current = setTimeout(() => {
      persistState();
    }, 500);
    
    return () => {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
      }
    };
  }, [isInitialized, persistState]);
  
  // ============================================================================
  // Initialization
  // ============================================================================
  
  useEffect(() => {
    const initialize = async () => {
      try {
        let restoredTwitchToken = '';
        // Load app state
        const uri = getAppStateUri();
        if (uri) {
          try {
            const info = await FileSystemLegacy.getInfoAsync(uri);
            if (info.exists) {
              const content = await FileSystemLegacy.readAsStringAsync(uri);
              const parsed = JSON.parse(content);
              const state = normalizePersistedAppState(parsed);
              if (state) {
                setPlatformInput(state.platformInput);
                setChannelInput(state.channelInput);
                setMobileSection(state.mobileSection);
                setSources(state.sources);
                setTabs(state.tabs);
                setActiveTabId(state.activeTabId);
                setTwitchUsername(state.twitchUsername);
                setTwitchToken(state.twitchToken);
                restoredTwitchToken = state.twitchToken;
                setKickUsername(state.kickUsername);
                setKickToken(state.kickToken);
                setKickRefreshToken(state.kickRefreshToken);
                setYoutubeAccessToken(state.youtubeAccessToken);
                setYoutubeRefreshToken(state.youtubeRefreshToken);
                setYoutubeTokenExpiry(state.youtubeTokenExpiry);
                setYoutubeUsername(state.youtubeUsername);
                setObsHost(state.obsHost);
                setObsPort(state.obsPort);
                setObsPassword(state.obsPassword);
                setObsSavedName(state.obsSavedName);
                setObsDetailTab(state.obsDetailTab);
                setHasCompletedOnboarding(state.hasCompletedOnboarding);
                if (state.messageFilters) setMessageFilters(state.messageFilters);
                if (state.notificationPreferences) setNotificationPreferences(state.notificationPreferences);
              }
            }
          } catch (e) {
            console.error('Failed to load app state:', e);
          }
        }
        
        // Load OBS saved connections
        const obsUri = getObsSavedConnectionsUri();
        if (obsUri) {
          try {
            const info = await FileSystemLegacy.getInfoAsync(obsUri);
            if (info.exists) {
              const content = await FileSystemLegacy.readAsStringAsync(obsUri);
              const parsed = JSON.parse(content);
              const connections = normalizeObsSavedConnections(parsed);
              setObsSavedConnections(connections);
            }
          } catch (e) {
            console.error('Failed to load OBS connections:', e);
          }
        }
        
        // Load global badges
        try {
          const badges = await fetchTwitchGlobalBadgeMap(restoredTwitchToken);
          if (Object.keys(badges).length > 0) {
            setGlobalBadgeMap(badges);
          }
        } catch {
          // Non-fatal; global badges are optional.
        }
        
        setIsInitialized(true);
        setIsLoading(false);
      } catch (e) {
        console.error('Initialization error:', e);
        setIsLoading(false);
        setIsInitialized(true);
      }
    };
    
    initialize();
  }, []);

  useEffect(() => {
    if (!twitchToken.trim()) return;
    let cancelled = false;
    const load = async () => {
      const badges = await fetchTwitchGlobalBadgeMap(twitchToken);
      if (cancelled || Object.keys(badges).length === 0) return;
      setGlobalBadgeMap((prev) => ({ ...prev, ...badges }));
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [twitchToken]);

  const ensureTwitchRoomBadges = useCallback(async (roomIdRaw: string) => {
    const roomId = roomIdRaw.trim();
    if (!roomId) return;
    if (twitchBadgeRoomsLoadedRef.current.has(roomId) || twitchBadgeRoomsLoadingRef.current.has(roomId)) {
      return;
    }

    twitchBadgeRoomsLoadingRef.current.add(roomId);
    try {
      const badges = await fetchTwitchChannelBadgeMap(roomId, twitchToken);
      if (Object.keys(badges).length === 0) return;
      twitchBadgeRoomsLoadedRef.current.add(roomId);
      setGlobalBadgeMap((prev) => ({ ...prev, ...badges }));
    } finally {
      twitchBadgeRoomsLoadingRef.current.delete(roomId);
    }
  }, [twitchToken]);

  useEffect(() => {
    const twitchSources = sources.filter((source) => source.platform === 'twitch');
    if (twitchSources.length === 0) return;

    let cancelled = false;
    const preload = async () => {
      for (const source of twitchSources) {
        const channel = source.channel.trim().toLowerCase();
        if (!channel) continue;
        if (twitchChannelLookupLoadingRef.current.has(channel)) continue;
        twitchChannelLookupLoadingRef.current.add(channel);
        try {
          const roomId = await resolveTwitchUserId(channel, twitchToken);
          if (!roomId || cancelled) continue;
          await ensureTwitchRoomBadges(roomId);
        } finally {
          twitchChannelLookupLoadingRef.current.delete(channel);
        }
      }
    };

    void preload();
    return () => {
      cancelled = true;
    };
  }, [ensureTwitchRoomBadges, sources, twitchToken]);
  
  // ============================================================================
  // Chat Adapter Management
  // ============================================================================
  
  const createAdapter = useCallback((source: ChatSource) => {
    let adapter: ChatAdapter;
    
    switch (source.platform) {
      case 'twitch':
        adapter = new TwitchAdapter({
          channel: source.channel,
          auth: twitchToken || twitchUsername
            ? { username: twitchUsername || undefined, token: twitchToken || undefined }
            : undefined,
        });
        break;
      case 'kick':
        adapter = new KickAdapter({
          channel: source.channel,
          auth: kickToken || kickUsername
            ? {
                accessToken: kickToken || undefined,
                username: kickUsername || undefined,
                guest: !kickToken,
              }
            : { guest: true },
        });
        break;
      case 'youtube':
        adapter = new YouTubeAdapter({
          channel: source.channel,
          auth: {
            liveChatId: source.channel,
          },
        });
        break;
      default:
        throw new Error(`Unknown platform: ${source.platform}`);
    }
    
    // Handle messages
    adapter.onMessage((message: ChatMessageType) => {
      const author = getMessageAuthor(message);
      const authorColor = getMessageAuthorColor(message);
      const discoveredBadgeMap = extractBadgeImageMapFromMessage(message);
      const enhanced: EnhancedChatMessage = {
        ...message,
        author,
        authorColor,
        // Add platform-specific metadata if available
        twitchMeta: message.platform === 'twitch' ? extractTwitchMeta(message) : undefined,
        youtubeMeta: message.platform === 'youtube' ? extractYouTubeMeta(message) : undefined,
        kickMeta: message.platform === 'kick' ? extractKickMeta(message) : undefined,
      };
      
      setMessagesBySource((prev) => {
        const next = new Map(prev);
        const existing = next.get(source.id) ?? [];
        // Keep last 500 messages per source
        const updated = [...existing, enhanced].slice(-500);
        next.set(source.id, updated);
        return next;
      });

      if (Object.keys(discoveredBadgeMap).length > 0) {
        setGlobalBadgeMap((prev) => {
          let changed = false;
          const merged = { ...prev };
          for (const [key, imageUri] of Object.entries(discoveredBadgeMap)) {
            if (!imageUri) continue;
            if (!merged[key]) {
              merged[key] = imageUri;
              changed = true;
            }
          }
          return changed ? merged : prev;
        });
      }

      if (message.platform === 'twitch') {
        const raw = asRecord(message.raw);
        const roomIdValue = raw?.['room-id'];
        const roomId =
          typeof roomIdValue === 'string'
            ? roomIdValue.trim()
            : typeof roomIdValue === 'number'
              ? String(roomIdValue)
              : '';
        if (roomId) {
          void ensureTwitchRoomBadges(roomId);
        }
      }
    });
    
    // Handle status changes (P1 Recommendation #7)
    adapter.onStatus((status: ChatAdapterStatus) => {
      setConnectionStatuses((prev) => {
        const next = new Map(prev);
        next.set(source.id, status);
        return next;
      });
      if (status === 'error') {
        setErrors((prev) => [
          ...prev.slice(-4),
          {
            id: makeId(),
            type: 'connection',
            message: `${PLATFORM_NAMES[source.platform]}/${source.channel}: Connection entered error state`,
            platform: source.platform,
            retryable: true,
            retryAction: async () => {
              await adapter.connect();
            },
            timestamp: new Date(),
          },
        ]);
      }
    });
    
    return adapter;
  }, [ensureTwitchRoomBadges, kickToken, kickUsername, twitchToken, twitchUsername]);
  
  // P1 Recommendation #9: Extract platform-specific metadata
  const extractTwitchMeta = (message: ChatMessageType) => {
    const raw = message.raw as any;
    if (!raw) return undefined;
    return {
      isRaid: raw.messageType === 'raid',
      raidViewerCount: raw.raidViewerCount,
      isBits: Boolean(raw.bits),
      bitsAmount: raw.bits,
      isSubscription: raw.messageType === 'subscription' || raw.messageType === 'resub',
      subscriptionTier: raw.subscriptionTier,
      subscriptionMonths: raw.subscriptionMonths,
    };
  };
  
  const extractYouTubeMeta = (message: ChatMessageType) => {
    const raw = message.raw as any;
    if (!raw) return undefined;
    return {
      isSuperChat: raw.isSuperChat || raw.type === 'superChat',
      superChatAmount: raw.superChatAmount || raw.amount,
      superChatCurrency: raw.superChatCurrency || raw.currency,
      isMembership: raw.isMembership || raw.type === 'membership',
      membershipTier: raw.membershipTier,
    };
  };
  
  const extractKickMeta = (message: ChatMessageType) => {
    const raw = message.raw as any;
    if (!raw) return undefined;
    return {
      isGift: raw.isGift || raw.type === 'gift',
      giftAmount: raw.giftAmount,
      isHost: raw.isHost || raw.type === 'host',
      hostViewerCount: raw.hostViewerCount,
    };
  };
  
  // Connect/disconnect adapters based on sources
  useEffect(() => {
    const currentAdapters = adaptersRef.current;
    const sourceIds = new Set(sources.map((s) => s.id));
    
    // Disconnect removed sources
    currentAdapters.forEach((adapter, id) => {
      if (!sourceIds.has(id)) {
        adapter.disconnect();
        currentAdapters.delete(id);
      }
    });
    
    // Connect new sources
    sources.forEach((source) => {
      if (!currentAdapters.has(source.id)) {
        try {
          const adapter = createAdapter(source);
          currentAdapters.set(source.id, adapter);
          void adapter.connect().catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            setErrors((prev) => [
              ...prev.slice(-4),
              {
                id: makeId(),
                type: 'connection',
                message: `${PLATFORM_NAMES[source.platform]}/${source.channel}: ${message}`,
                platform: source.platform,
                retryable: true,
                retryAction: async () => {
                  await adapter.connect();
                },
                timestamp: new Date(),
              },
            ]);
          });
          
          // Load channel emotes
          loadChannelEmotes(source);
        } catch (e) {
          console.error(`Failed to create adapter for ${source.platform}/${source.channel}:`, e);
        }
      }
    });
  }, [sources, createAdapter]);
  
  // Load 7TV emotes for a channel
  const loadChannelEmotes = async (source: ChatSource) => {
    if (source.platform !== 'twitch') return;
    
    try {
      const response = await fetch(`https://7tv.io/v3/users/twitch/${source.channel}`);
      if (response.ok) {
        const data = await response.json();
        const emotes = parseSevenTvEmoteMap(data);
        setChannelEmoteMaps((prev) => {
          const next = new Map(prev);
          next.set(source.id, emotes);
          return next;
        });
      }
    } catch (e) {
      // Silently fail for emote loading
    }
  };
  
  // ============================================================================
  // Channel Management
  // ============================================================================
  
  const addChannel = useCallback((platform: PlatformId, channel: string) => {
    const normalizedChannel = channel.trim().toLowerCase();
    if (!normalizedChannel) return;
    
    // Check for duplicate
    const exists = sources.some(
      (s) => s.platform === platform && s.channel === normalizedChannel
    );
    if (exists) {
      setErrors((prev) => [
        ...prev.slice(-4),
        {
          id: makeId(),
          type: 'unknown',
          message: `${PLATFORM_NAMES[platform]}/${normalizedChannel} is already added`,
          retryable: false,
          timestamp: new Date(),
        },
      ]);
      return;
    }
    
    const sourceId = makeId();
    const tabId = makeId();
    
    setSources((prev) => [...prev, { id: sourceId, platform, channel: normalizedChannel }]);
    setTabs((prev) => [
      ...prev,
      { id: tabId, sourceIds: [sourceId], label: `${platform}/${normalizedChannel}` },
    ]);
    setActiveTabId(tabId);
    setChannelInput('');
    setMobileSection('chats');
  }, [sources]);
  
  const removeChannel = useCallback((sourceId: string) => {
    // Disconnect adapter
    const adapter = adaptersRef.current.get(sourceId);
    if (adapter) {
      adapter.disconnect();
      adaptersRef.current.delete(sourceId);
    }
    
    // Remove from state
    setSources((prev) => prev.filter((s) => s.id !== sourceId));
    setTabs((prev) => {
      const updated = prev
        .map((t) => ({ ...t, sourceIds: t.sourceIds.filter((id) => id !== sourceId) }))
        .filter((t) => t.sourceIds.length > 0);
      return updated;
    });
    setMessagesBySource((prev) => {
      const next = new Map(prev);
      next.delete(sourceId);
      return next;
    });
    setConnectionStatuses((prev) => {
      const next = new Map(prev);
      next.delete(sourceId);
      return next;
    });
  }, []);
  
  const closeTab = useCallback((tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;
    
    // If it's a single-source tab, remove the source too
    if (tab.sourceIds.length === 1) {
      removeChannel(tab.sourceIds[0]);
    } else {
      // Just remove the tab
      setTabs((prev) => prev.filter((t) => t.id !== tabId));
    }
    
    // Update active tab
    if (activeTabId === tabId) {
      const remaining = tabs.filter((t) => t.id !== tabId);
      setActiveTabId(remaining[0]?.id ?? null);
    }
  }, [tabs, activeTabId, removeChannel]);
  
  // ============================================================================
  // Error Management (P0 Recommendation #3)
  // ============================================================================
  
  const removeError = useCallback((errorId: string) => {
    setErrors((prev) => prev.filter((e) => e.id !== errorId));
  }, []);
  
  // ============================================================================
  // Search Functionality (P1 Recommendation #8)
  // ============================================================================
  
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    
    setIsSearching(true);
    const searchText = query.toLowerCase();
    const results: any[] = [];
    
    messagesBySource.forEach((msgs, sourceId) => {
      for (const message of msgs) {
        const author = getMessageAuthor(message).toLowerCase();
        if (
          message.message.toLowerCase().includes(searchText) ||
          author.includes(searchText)
        ) {
          results.push({
            message,
            sourceId,
            matchedText: message.message,
            timestamp: new Date(message.timestamp),
          });
        }
      }
    });
    
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    setSearchResults(results.slice(0, 100));
    setIsSearching(false);
  }, [messagesBySource]);

  // ============================================================================
  // OBS Controller
  // ============================================================================

  const pushObsError = useCallback((message: string) => {
    setErrors((prev) => [
      ...prev.slice(-4),
      {
        id: makeId(),
        type: 'connection',
        message: `OBS: ${message}`,
        retryable: false,
        timestamp: new Date(),
      },
    ]);
  }, []);

  const rejectAllObsPending = useCallback((reason: string) => {
    const pendingEntries = Array.from(obsPendingRequestsRef.current.values());
    obsPendingRequestsRef.current.clear();
    for (const pending of pendingEntries) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error(reason));
    }
  }, []);

  const disconnectObs = useCallback((reason = 'Disconnected') => {
    const socket = obsSocketRef.current;
    obsSocketRef.current = null;
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      socket.close();
    }

    rejectAllObsPending(reason);
    setObsConnected(false);
    setObsConnecting(false);
    setObsStatusText(reason);
    setObsScenes([]);
    setObsActiveScene(null);
    setObsPreviewUri(null);
    setObsSceneItems([]);
    setObsAudioInputs([]);
    setObsStreaming(false);
    setObsRecording(false);
    setObsStreamTimecode(null);
    setObsRecordTimecode(null);
    setObsStats({
      cpuUsage: null,
      activeFps: null,
      outputSkippedFrames: null,
      outputTotalFrames: null,
    });
  }, [rejectAllObsPending]);

  const sendObsRequest = useCallback(
    async <T extends Record<string, unknown> = Record<string, unknown>>(
      requestType: string,
      requestData: Record<string, unknown> = {}
    ): Promise<T> => {
      const socket = obsSocketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        throw new Error('OBS is not connected.');
      }

      return new Promise<T>((resolve, reject) => {
        const requestId = `r-${Date.now()}-${obsRequestIdRef.current++}`;
        const timeoutId = setTimeout(() => {
          obsPendingRequestsRef.current.delete(requestId);
          reject(new Error(`${requestType} timed out.`));
        }, 8000);

        obsPendingRequestsRef.current.set(requestId, {
          resolve: (value) => resolve(value as T),
          reject,
          timeoutId,
        });

        socket.send(
          JSON.stringify({
            op: 6,
            d: {
              requestType,
              requestId,
              requestData,
            },
          })
        );
      });
    },
    []
  );

  const refreshObsPreview = useCallback(
    async (sceneNameOverride?: string) => {
      const socket = obsSocketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;

      const sceneName = (sceneNameOverride || obsActiveScene || '').trim();
      if (!sceneName) {
        setObsPreviewUri(null);
        return;
      }

      try {
        const previewResponse = await sendObsRequest('GetSourceScreenshot', {
          sourceName: sceneName,
          imageFormat: 'jpeg',
          imageWidth: 640,
          imageCompressionQuality: 65,
        });
        const imageData = typeof previewResponse.imageData === 'string' ? previewResponse.imageData : '';
        if (imageData) {
          setObsPreviewUri(imageData);
        }
      } catch {
        // Some scenes/sources cannot provide screenshots; keep previous preview.
      }
    },
    [obsActiveScene, sendObsRequest]
  );

  const refreshObsState = useCallback(
    async (options?: { force?: boolean }) => {
      const socket = obsSocketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        if (!options?.force) return;
        return;
      }
      if (obsRefreshInFlightRef.current) return;
      obsRefreshInFlightRef.current = true;

      try {
        const [sceneListResult, streamStatusResult, recordStatusResult, statsResult] = await Promise.allSettled([
          sendObsRequest('GetSceneList'),
          sendObsRequest('GetStreamStatus'),
          sendObsRequest('GetRecordStatus'),
          sendObsRequest('GetStats'),
        ]);

        let currentSceneName = '';

        if (sceneListResult.status === 'fulfilled') {
          const sceneList = sceneListResult.value;
          const scenesRaw = Array.isArray(sceneList.scenes) ? sceneList.scenes : [];
          const sceneNames = scenesRaw
            .map((item) => {
              const record = asRecord(item);
              return typeof record?.sceneName === 'string' ? record.sceneName : '';
            })
            .filter(Boolean);
          setObsScenes(sceneNames);

          currentSceneName =
            typeof sceneList.currentProgramSceneName === 'string' ? sceneList.currentProgramSceneName : '';
          setObsActiveScene(currentSceneName || null);
          if (currentSceneName) {
            void refreshObsPreview(currentSceneName);
          } else {
            setObsPreviewUri(null);
          }
        }

        if (streamStatusResult.status === 'fulfilled') {
          const streamStatus = streamStatusResult.value;
          setObsStreaming(streamStatus.outputActive === true);
          setObsStreamTimecode(readNumber(streamStatus.outputDuration));
        }

        if (recordStatusResult.status === 'fulfilled') {
          const recordStatus = recordStatusResult.value;
          setObsRecording(recordStatus.outputActive === true);
          setObsRecordTimecode(readNumber(recordStatus.outputDuration));
        }

        if (statsResult.status === 'fulfilled') {
          const statsResponse = statsResult.value;
          setObsStats({
            cpuUsage: readNumber(statsResponse.cpuUsage),
            activeFps: readNumber(statsResponse.activeFps),
            outputSkippedFrames: readNumber(statsResponse.outputSkippedFrames),
            outputTotalFrames: readNumber(statsResponse.outputTotalFrames),
          });
        }

        if (currentSceneName) {
          try {
            const sceneItemsResponse = await sendObsRequest('GetSceneItemList', {
              sceneName: currentSceneName,
            });
            const sceneItemsRaw = Array.isArray(sceneItemsResponse.sceneItems) ? sceneItemsResponse.sceneItems : [];
            const sceneItems: ObsSceneItem[] = sceneItemsRaw
              .map((item) => {
                const record = asRecord(item);
                const id = readNumber(record?.sceneItemId);
                const name = typeof record?.sourceName === 'string' ? record.sourceName : '';
                const enabled = record?.sceneItemEnabled === true;
                if (!id || !name) return null;
                return {
                  sceneItemId: id,
                  sourceName: name,
                  enabled,
                } satisfies ObsSceneItem;
              })
              .filter(Boolean) as ObsSceneItem[];
            setObsSceneItems(sceneItems);
          } catch {
            setObsSceneItems([]);
          }
        } else {
          setObsSceneItems([]);
        }

        try {
          const inputListResponse = await sendObsRequest('GetInputList');
          const inputRows = Array.isArray(inputListResponse.inputs) ? inputListResponse.inputs : [];
          const inputNames = inputRows
            .map((item) => {
              const row = asRecord(item);
              return typeof row?.inputName === 'string' ? row.inputName : '';
            })
            .filter(Boolean);
          const uniqueInputNames = Array.from(new Set(inputNames));

          const audioStates = await Promise.all(
            uniqueInputNames.map(async (inputName) => {
              try {
                const [muteResponse, volumeResponse] = await Promise.all([
                  sendObsRequest('GetInputMute', { inputName }),
                  sendObsRequest('GetInputVolume', { inputName }),
                ]);
                return {
                  inputName,
                  muted: muteResponse.inputMuted === true,
                  volumeMul: clamp01(readNumber(volumeResponse.inputVolumeMul) ?? 1),
                } satisfies ObsAudioInput;
              } catch {
                return null;
              }
            })
          );
          setObsAudioInputs(audioStates.filter(Boolean) as ObsAudioInput[]);
        } catch {
          setObsAudioInputs([]);
        }

        setObsStatusText('Connected');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setObsStatusText(message);
        pushObsError(message);
      } finally {
        obsRefreshInFlightRef.current = false;
      }
    },
    [asRecord, clamp01, pushObsError, readNumber, refreshObsPreview, sendObsRequest]
  );

  const handleObsMessage = useCallback(
    async (raw: string) => {
      let payload: unknown = null;
      try {
        payload = JSON.parse(raw);
      } catch {
        return;
      }

      const payloadRecord = asRecord(payload);
      if (!payloadRecord) return;
      if (typeof payloadRecord.op !== 'number') return;

      if (payloadRecord.op === 0) {
        const hello = asRecord(payloadRecord.d);
        const rpcVersion = typeof hello?.rpcVersion === 'number' ? hello.rpcVersion : 1;
        obsRpcVersionRef.current = rpcVersion;

        let authentication: string | undefined;
        const authBlock = asRecord(hello?.authentication);
        const challenge = typeof authBlock?.challenge === 'string' ? authBlock.challenge : '';
        const salt = typeof authBlock?.salt === 'string' ? authBlock.salt : '';
        if (challenge && salt) {
          if (!obsPassword.trim()) {
            throw new Error('OBS requires a password.');
          }
          const secret = await Crypto.digestStringAsync(
            Crypto.CryptoDigestAlgorithm.SHA256,
            `${obsPassword}${salt}`,
            { encoding: Crypto.CryptoEncoding.BASE64 }
          );
          authentication = await Crypto.digestStringAsync(
            Crypto.CryptoDigestAlgorithm.SHA256,
            `${secret}${challenge}`,
            { encoding: Crypto.CryptoEncoding.BASE64 }
          );
        }

        const socket = obsSocketRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        socket.send(
          JSON.stringify({
            op: 1,
            d: {
              rpcVersion,
              authentication,
              eventSubscriptions: 1023,
            },
          })
        );
        return;
      }

      if (payloadRecord.op === 2) {
        setObsConnected(true);
        setObsConnecting(false);
        setObsStatusText('Connected');
        void refreshObsState({ force: true });
        return;
      }

      if (payloadRecord.op === 5) {
        const eventPayload = asRecord(payloadRecord.d);
        const eventType = typeof eventPayload?.eventType === 'string' ? eventPayload.eventType : '';
        const eventData = asRecord(eventPayload?.eventData);

        if (eventType === 'CurrentProgramSceneChanged') {
          const sceneName = typeof eventData?.sceneName === 'string' ? eventData.sceneName : '';
          if (sceneName) {
            setObsActiveScene(sceneName);
            void refreshObsState({ force: true });
          }
        } else if (eventType === 'StreamStateChanged') {
          setObsStreaming(eventData?.outputActive === true);
          setObsStreamTimecode(readNumber(eventData?.outputDuration));
        } else if (eventType === 'RecordStateChanged') {
          setObsRecording(eventData?.outputActive === true);
          setObsRecordTimecode(readNumber(eventData?.outputDuration));
        } else if (eventType === 'SceneItemEnableStateChanged') {
          const sceneItemId = readNumber(eventData?.sceneItemId);
          const enabled = eventData?.sceneItemEnabled === true;
          if (!sceneItemId) return;
          setObsSceneItems((previous) =>
            previous.map((item) => (item.sceneItemId === sceneItemId ? { ...item, enabled } : item))
          );
        } else if (eventType === 'InputMuteStateChanged') {
          const inputName = typeof eventData?.inputName === 'string' ? eventData.inputName : '';
          const inputMuted = eventData?.inputMuted === true;
          if (!inputName) return;
          setObsAudioInputs((previous) =>
            previous.map((item) => (item.inputName === inputName ? { ...item, muted: inputMuted } : item))
          );
        } else if (eventType === 'InputVolumeChanged') {
          const inputName = typeof eventData?.inputName === 'string' ? eventData.inputName : '';
          const inputVolumeMul = clamp01(readNumber(eventData?.inputVolumeMul) ?? 1);
          if (!inputName) return;
          setObsAudioInputs((previous) =>
            previous.map((item) => (item.inputName === inputName ? { ...item, volumeMul: inputVolumeMul } : item))
          );
        } else if (
          eventType === 'SceneCreated' ||
          eventType === 'SceneRemoved' ||
          eventType === 'SceneNameChanged' ||
          eventType === 'SceneItemCreated' ||
          eventType === 'SceneItemRemoved' ||
          eventType === 'InputCreated' ||
          eventType === 'InputRemoved'
        ) {
          void refreshObsState({ force: true });
        }
        return;
      }

      if (payloadRecord.op === 7) {
        const responsePayload = asRecord(payloadRecord.d);
        if (!responsePayload) return;
        const requestId = typeof responsePayload.requestId === 'string' ? responsePayload.requestId : '';
        if (!requestId) return;

        const pending = obsPendingRequestsRef.current.get(requestId);
        if (!pending) return;
        obsPendingRequestsRef.current.delete(requestId);
        clearTimeout(pending.timeoutId);

        const requestStatus = asRecord(responsePayload.requestStatus);
        const ok = requestStatus?.result === true;
        if (!ok) {
          const comment =
            typeof requestStatus?.comment === 'string' && requestStatus.comment
              ? requestStatus.comment
              : 'OBS request failed.';
          pending.reject(new Error(comment));
          return;
        }

        const responseData = asRecord(responsePayload.responseData) ?? {};
        pending.resolve(responseData);
      }
    },
    [clamp01, obsPassword, readNumber, refreshObsState]
  );

  const connectObs = useCallback(() => {
    if (obsConnecting || obsConnected) return;

    const host = obsHost.trim();
    const port = obsPort.trim();
    if (!host || !port) {
      const message = 'OBS host and port are required.';
      setObsStatusText(message);
      pushObsError(message);
      return;
    }

    setObsConnecting(true);
    setObsStatusText('Connecting...');

    try {
      const socket = new WebSocket(`ws://${host}:${port}`);
      obsSocketRef.current = socket;

      socket.onopen = () => {
        setObsStatusText('Socket connected. Waiting for OBS handshake...');
      };

      socket.onmessage = (event) => {
        void handleObsMessage(String(event.data)).catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          setObsStatusText(message);
          pushObsError(message);
          disconnectObs('OBS authentication failed.');
        });
      };

      socket.onerror = () => {
        setObsStatusText('OBS socket error.');
      };

      socket.onclose = () => {
        rejectAllObsPending('OBS connection closed.');
        setObsConnected(false);
        setObsConnecting(false);
        setObsStatusText('Disconnected');
      };
    } catch (error) {
      setObsConnecting(false);
      setObsConnected(false);
      const message = error instanceof Error ? error.message : String(error);
      setObsStatusText(message);
      pushObsError(message);
    }
  }, [disconnectObs, handleObsMessage, obsConnected, obsConnecting, obsHost, obsPort, pushObsError, rejectAllObsPending]);

  const switchObsScene = useCallback(
    async (sceneName: string) => {
      if (!sceneName) return;
      try {
        await sendObsRequest('SetCurrentProgramScene', { sceneName });
        setObsActiveScene(sceneName);
        await refreshObsState({ force: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setObsStatusText(message);
        pushObsError(message);
      }
    },
    [pushObsError, refreshObsState, sendObsRequest]
  );

  const toggleObsStream = useCallback(async () => {
    try {
      await sendObsRequest(obsStreaming ? 'StopStream' : 'StartStream');
      await refreshObsState();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setObsStatusText(message);
      pushObsError(message);
    }
  }, [obsStreaming, pushObsError, refreshObsState, sendObsRequest]);

  const toggleObsRecord = useCallback(async () => {
    try {
      await sendObsRequest(obsRecording ? 'StopRecord' : 'StartRecord');
      await refreshObsState();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setObsStatusText(message);
      pushObsError(message);
    }
  }, [obsRecording, pushObsError, refreshObsState, sendObsRequest]);

  const toggleObsSceneItem = useCallback(
    async (sceneItem: ObsSceneItem) => {
      if (!obsActiveScene) return;
      try {
        await sendObsRequest('SetSceneItemEnabled', {
          sceneName: obsActiveScene,
          sceneItemId: sceneItem.sceneItemId,
          sceneItemEnabled: !sceneItem.enabled,
        });
        setObsSceneItems((previous) =>
          previous.map((item) =>
            item.sceneItemId === sceneItem.sceneItemId ? { ...item, enabled: !sceneItem.enabled } : item
          )
        );
        void refreshObsPreview();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setObsStatusText(message);
        pushObsError(message);
      }
    },
    [obsActiveScene, pushObsError, refreshObsPreview, sendObsRequest]
  );

  const toggleObsInputMute = useCallback(
    async (input: ObsAudioInput) => {
      try {
        await sendObsRequest('SetInputMute', {
          inputName: input.inputName,
          inputMuted: !input.muted,
        });
        setObsAudioInputs((previous) =>
          previous.map((item) => (item.inputName === input.inputName ? { ...item, muted: !input.muted } : item))
        );
        void refreshObsPreview();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setObsStatusText(message);
        pushObsError(message);
      }
    },
    [pushObsError, refreshObsPreview, sendObsRequest]
  );

  const adjustObsInputVolume = useCallback(
    async (input: ObsAudioInput, delta: number) => {
      try {
        const nextVolume = clamp01(input.volumeMul + delta);
        await sendObsRequest('SetInputVolume', {
          inputName: input.inputName,
          inputVolumeMul: nextVolume,
        });
        setObsAudioInputs((previous) =>
          previous.map((item) => (item.inputName === input.inputName ? { ...item, volumeMul: nextVolume } : item))
        );
        void refreshObsPreview();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setObsStatusText(message);
        pushObsError(message);
      }
    },
    [clamp01, pushObsError, refreshObsPreview, sendObsRequest]
  );

  const setObsInputVolume = useCallback(
    async (input: ObsAudioInput, nextVolumeRaw: number) => {
      const nextVolume = clamp01(nextVolumeRaw);
      setObsAudioInputs((previous) =>
        previous.map((item) => (item.inputName === input.inputName ? { ...item, volumeMul: nextVolume } : item))
      );
      try {
        await sendObsRequest('SetInputVolume', {
          inputName: input.inputName,
          inputVolumeMul: nextVolume,
        });
        void refreshObsPreview();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setObsStatusText(message);
        pushObsError(message);
      }
    },
    [clamp01, pushObsError, refreshObsPreview, sendObsRequest]
  );

  useEffect(() => {
    if (!obsConnected || mobileSection !== 'obs') return;
    void refreshObsState({ force: true });
  }, [mobileSection, obsConnected, refreshObsState]);

  useEffect(() => {
    return () => {
      disconnectObs('App closed.');
    };
  }, [disconnectObs]);
  
  // ============================================================================
  // Authentication Handlers
  // ============================================================================

  const pushAuthError = useCallback((platform: PlatformId, message: string) => {
    setErrors((prev) => [
      ...prev.slice(-4),
      {
        id: makeId(),
        type: 'authentication',
        message: `${PLATFORM_NAMES[platform]} sign-in failed: ${message}`,
        platform,
        retryable: false,
        timestamp: new Date(),
      },
    ]);
  }, []);
  
  const handleConnectTwitch = useCallback(async () => {
    try {
      if (!TWITCH_CLIENT_ID.trim()) {
        pushAuthError('twitch', 'Client ID is missing in this build.');
        return;
      }

      const state = randomToken();
      const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${encodeURIComponent(TWITCH_REDIRECT_URI)}&response_type=token&scope=${encodeURIComponent(TWITCH_SCOPES.join(' '))}&state=${state}`;
      
      const result = await WebBrowser.openAuthSessionAsync(authUrl, TWITCH_REDIRECT_URI);
      if (result.type !== 'success' || !result.url) {
        if (result.type !== 'cancel' && result.type !== 'dismiss') {
          pushAuthError('twitch', `Session did not complete (${result.type}).`);
        }
        return;
      }

      const params = parseAuthParamsFromCallbackUrl(result.url);
      const returnedState = params.get('state');
      if (returnedState && returnedState !== state) {
        pushAuthError('twitch', 'State validation failed. Please try again.');
        return;
      }

      const providerError = params.get('error_description') || params.get('error');
      if (providerError) {
        pushAuthError('twitch', providerError);
        return;
      }

      const token = params.get('access_token');
      if (!token) {
        pushAuthError('twitch', 'Missing access token in callback response.');
        return;
      }

      const response = await fetch('https://api.twitch.tv/helix/users', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Client-Id': TWITCH_CLIENT_ID,
        },
      });
      const rawBody = await response.text();
      if (!response.ok) {
        pushAuthError('twitch', summarizeHttpError(response.status, rawBody, 'Profile lookup failed'));
        return;
      }

      const data = JSON.parse(rawBody) as { data?: Array<{ login?: string }> };
      const username = typeof data.data?.[0]?.login === 'string' ? data.data[0].login : '';
      if (!username.trim()) {
        pushAuthError('twitch', 'Signed in, but username lookup returned empty.');
        return;
      }

      setTwitchToken(token);
      setTwitchUsername(username.trim());
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      pushAuthError('twitch', message);
    }
  }, [pushAuthError]);
  
  const handleConnectKick = useCallback(async () => {
    try {
      if (!KICK_CLIENT_ID.trim() || !KICK_CLIENT_SECRET.trim()) {
        pushAuthError('kick', 'Client ID or secret is missing in this build.');
        return;
      }

      const state = randomToken();
      const verifier = randomToken();
      const verifierHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
        encoding: Crypto.CryptoEncoding.BASE64,
      });
      const codeChallenge = toBase64Url(verifierHash);
      
      const authUrl = `https://id.kick.com/oauth/authorize?client_id=${KICK_CLIENT_ID}&redirect_uri=${encodeURIComponent(KICK_REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(KICK_SCOPES.join(' '))}&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
      
      const result = await WebBrowser.openAuthSessionAsync(authUrl, KICK_REDIRECT_URI);
      if (result.type !== 'success' || !result.url) {
        if (result.type !== 'cancel' && result.type !== 'dismiss') {
          pushAuthError('kick', `Session did not complete (${result.type}).`);
        }
        return;
      }

      const params = parseAuthParamsFromCallbackUrl(result.url);
      const providerError = params.get('error_description') || params.get('error');
      if (providerError) {
        pushAuthError('kick', providerError);
        return;
      }

      const returnedState = params.get('state');
      if (returnedState && returnedState !== state) {
        pushAuthError('kick', 'State validation failed. Please try again.');
        return;
      }

      const code = params.get('code');
      if (!code) {
        pushAuthError('kick', 'Missing authorization code in callback response.');
        return;
      }

      const tokenResponse = await fetch('https://id.kick.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: KICK_CLIENT_ID,
          client_secret: KICK_CLIENT_SECRET,
          redirect_uri: KICK_REDIRECT_URI,
          code_verifier: verifier,
          code,
        }).toString(),
      });
      const tokenRaw = await tokenResponse.text();
      if (!tokenResponse.ok) {
        pushAuthError('kick', summarizeHttpError(tokenResponse.status, tokenRaw, 'Token exchange failed'));
        return;
      }

      const tokenData = JSON.parse(tokenRaw) as { access_token?: string; refresh_token?: string };
      const accessToken = typeof tokenData.access_token === 'string' ? tokenData.access_token.trim() : '';
      if (!accessToken) {
        pushAuthError('kick', 'Token exchange succeeded but no access token was returned.');
        return;
      }

      setKickToken(accessToken);
      setKickRefreshToken(typeof tokenData.refresh_token === 'string' ? tokenData.refresh_token : '');

      // Best effort username lookup; token is still valid for auth even if profile endpoint fails.
      let resolvedUsername = '';
      try {
        const userInfoResponse = await fetch('https://id.kick.com/oauth/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (userInfoResponse.ok) {
          const raw = await userInfoResponse.text();
          const payload = asRecord(JSON.parse(raw));
          const preferred = payload && typeof payload.preferred_username === 'string'
            ? payload.preferred_username.trim()
            : '';
          if (preferred) {
            resolvedUsername = preferred;
          }
        }
      } catch {
        // Ignore and fall back to public profile endpoint.
      }

      if (!resolvedUsername) {
        try {
          const userResponse = await fetch('https://api.kick.com/public/v1/users', {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (userResponse.ok) {
            const raw = await userResponse.text();
            const payload = asRecord(JSON.parse(raw));
            const rows = payload && Array.isArray(payload.data) ? payload.data : [];
            const first = asRecord(rows[0]);
            const username = first && typeof first.username === 'string' ? first.username.trim() : '';
            if (username) {
              resolvedUsername = username;
            }
          }
        } catch {
          // No-op.
        }
      }

      if (resolvedUsername) {
        setKickUsername(resolvedUsername);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      pushAuthError('kick', message);
    }
  }, [pushAuthError]);
  
  const handleConnectYouTube = useCallback(async () => {
    try {
      if (!YOUTUBE_CLIENT_ID.trim()) {
        pushAuthError('youtube', 'Client ID is missing in this build.');
        return;
      }

      const state = randomToken();
      const verifier = randomToken();
      const verifierHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
        encoding: Crypto.CryptoEncoding.BASE64,
      });
      const codeChallenge = toBase64Url(verifierHash);
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${YOUTUBE_CLIENT_ID}&redirect_uri=${encodeURIComponent(YOUTUBE_REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(YOUTUBE_SCOPES.join(' '))}&access_type=offline&prompt=consent&include_granted_scopes=true&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
      
      const result = await WebBrowser.openAuthSessionAsync(authUrl, YOUTUBE_REDIRECT_URI);
      if (result.type !== 'success' || !result.url) {
        if (result.type !== 'cancel' && result.type !== 'dismiss') {
          pushAuthError('youtube', `Session did not complete (${result.type}).`);
        }
        return;
      }

      const params = parseAuthParamsFromCallbackUrl(result.url);
      const providerError = params.get('error_description') || params.get('error');
      if (providerError) {
        pushAuthError('youtube', providerError);
        return;
      }

      const returnedState = params.get('state');
      if (returnedState && returnedState !== state) {
        pushAuthError('youtube', 'State validation failed. Please try again.');
        return;
      }

      const code = params.get('code');
      if (!code) {
        pushAuthError('youtube', 'Missing authorization code in callback response.');
        return;
      }

      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: YOUTUBE_CLIENT_ID,
          redirect_uri: YOUTUBE_REDIRECT_URI,
          code_verifier: verifier,
          code,
        }).toString(),
      });
      const tokenRaw = await tokenResponse.text();
      if (!tokenResponse.ok) {
        pushAuthError('youtube', summarizeHttpError(tokenResponse.status, tokenRaw, 'Token exchange failed'));
        return;
      }

      const tokenData = JSON.parse(tokenRaw) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      };
      const accessToken = typeof tokenData.access_token === 'string' ? tokenData.access_token.trim() : '';
      if (!accessToken) {
        pushAuthError('youtube', 'Token exchange succeeded but no access token was returned.');
        return;
      }

      setYoutubeAccessToken(accessToken);
      setYoutubeRefreshToken(
        typeof tokenData.refresh_token === 'string' && tokenData.refresh_token.trim()
          ? tokenData.refresh_token
          : youtubeRefreshToken
      );
      setYoutubeTokenExpiry(Date.now() + (tokenData.expires_in ?? 3600) * 1000);

      // Best effort: resolve YouTube channel display name.
      try {
        const userResponse = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (userResponse.ok) {
          const raw = await userResponse.text();
          const userData = JSON.parse(raw) as { items?: Array<{ snippet?: { title?: string } }> };
          const username = typeof userData.items?.[0]?.snippet?.title === 'string'
            ? userData.items[0].snippet.title.trim()
            : '';
          if (username) {
            setYoutubeUsername(username);
          }
        }
      } catch {
        // Non-fatal for sign-in.
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      pushAuthError('youtube', message);
    }
  }, [pushAuthError, youtubeRefreshToken]);
  
  const handleDisconnectTwitch = useCallback(() => {
    setTwitchToken('');
    setTwitchUsername('');
  }, []);
  
  const handleDisconnectKick = useCallback(() => {
    setKickToken('');
    setKickRefreshToken('');
    setKickUsername('');
  }, []);
  
  const handleDisconnectYouTube = useCallback(() => {
    setYoutubeAccessToken('');
    setYoutubeRefreshToken('');
    setYoutubeTokenExpiry(0);
    setYoutubeUsername('');
  }, []);
  
  // ============================================================================
  // Onboarding Handlers (P0 Recommendation #1)
  // ============================================================================
  
  const handleOnboardingComplete = useCallback((platform: PlatformId, channel: string) => {
    addChannel(platform, channel);
    setHasCompletedOnboarding(true);
  }, [addChannel]);
  
  const handleOnboardingSkip = useCallback(() => {
    setHasCompletedOnboarding(true);
  }, []);
  
  const handleResetOnboarding = useCallback(() => {
    setHasCompletedOnboarding(false);
  }, []);
  
  // ============================================================================
  // Render
  // ============================================================================
  
  // Show loading screen while initializing (P0 Recommendation #4)
  if (isLoading) {
    return (
      <SafeAreaProvider>
        <FullScreenLoading message="Loading MultiChat..." />
        <StatusBar style="light" />
      </SafeAreaProvider>
    );
  }
  
  // Show onboarding for first-time users (P0 Recommendation #1)
  if (!hasCompletedOnboarding) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.container}>
          <OnboardingWizard
            onComplete={handleOnboardingComplete}
            onSkip={handleOnboardingSkip}
          />
        </SafeAreaView>
        <StatusBar style="light" />
      </SafeAreaProvider>
    );
  }
  
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        {/* Error banner (P0 Recommendation #3) */}
        {errors.length > 0 && (
          <View style={styles.errorContainer}>
            {errors.slice(-1).map((error) => (
              <ErrorBanner
                key={error.id}
                error={error}
                onDismiss={() => removeError(error.id)}
                onRetry={error.retryable ? error.retryAction : undefined}
              />
            ))}
          </View>
        )}
        
        {/* Connection status bar (P1 Recommendation #7) */}
        {connectionStatusArray.length > 0 && mobileSection === 'chats' && (
          <ConnectionStatusBar connections={connectionStatusArray} />
        )}
        
        {/* Main content */}
        <View style={styles.content}>
          {mobileSection === 'chats' && (
            <ChatsSection
              sources={sources}
              tabs={tabs}
              activeTabId={activeTabId}
              onSelectTab={setActiveTabId}
              onCloseTab={closeTab}
              messages={activeMessages}
              isLoading={!isInitialized}
              emoteMap={combinedEmoteMap}
              badgeMap={globalBadgeMap}
              filter={messageFilters}
              onAddChannel={() => setMobileSection('add')}
              onClearFilters={() => setMessageFilters(defaultMessageFilter)}
              connectionStatuses={connectionStatuses}
              onOpenSearch={() => setIsSearchOpen(true)}
              onOpenFilters={() => setShowFilterModal(true)}
            />
          )}
          
          {mobileSection === 'add' && (
            <AddChannelSection
              platformInput={platformInput}
              setPlatformInput={setPlatformInput}
              channelInput={channelInput}
              setChannelInput={setChannelInput}
              onAddChannel={() => addChannel(platformInput, channelInput)}
              sources={sources}
              onRemoveChannel={removeChannel}
            />
          )}
          
          {mobileSection === 'obs' && (
            <ObsSection
              obsConnected={obsConnected}
              obsConnecting={obsConnecting}
              obsStatusText={obsStatusText}
              obsHost={obsHost}
              setObsHost={setObsHost}
              obsPort={obsPort}
              setObsPort={setObsPort}
              obsPassword={obsPassword}
              setObsPassword={setObsPassword}
              obsScenes={obsScenes}
              obsActiveScene={obsActiveScene}
              obsPreviewUri={obsPreviewUri}
              obsSceneItems={obsSceneItems}
              obsAudioInputs={obsAudioInputs}
              obsStats={obsStats}
              obsStreaming={obsStreaming}
              obsRecording={obsRecording}
              obsStreamTimecode={obsStreamTimecode}
              obsRecordTimecode={obsRecordTimecode}
              onConnect={connectObs}
              onDisconnect={disconnectObs}
              onRefresh={refreshObsState}
              onSwitchScene={switchObsScene}
              onToggleStream={toggleObsStream}
              onToggleRecord={toggleObsRecord}
              onToggleSceneItem={toggleObsSceneItem}
              onToggleInputMute={toggleObsInputMute}
              onAdjustInputVolume={adjustObsInputVolume}
              onSetInputVolume={setObsInputVolume}
            />
          )}
          
          {mobileSection === 'settings' && (
            <SettingsScreen
              twitchUsername={twitchUsername}
              twitchToken={twitchToken}
              kickUsername={kickUsername}
              kickToken={kickToken}
              youtubeUsername={youtubeUsername}
              youtubeAccessToken={youtubeAccessToken}
              youtubeRefreshToken={youtubeRefreshToken}
              notificationPreferences={notificationPreferences}
              onNotificationPreferencesChange={setNotificationPreferences}
              onConnectTwitch={handleConnectTwitch}
              onConnectKick={handleConnectKick}
              onConnectYouTube={handleConnectYouTube}
              onDisconnectTwitch={handleDisconnectTwitch}
              onDisconnectKick={handleDisconnectKick}
              onDisconnectYouTube={handleDisconnectYouTube}
              onResetOnboarding={handleResetOnboarding}
              onClearCache={() => {}}
            />
          )}
        </View>
        
        {/* Bottom navigation */}
        <BottomNavigation
          activeSection={mobileSection}
          onSectionChange={setMobileSection}
        />
        
        {/* Search overlay (P1 Recommendation #8) */}
        <SearchOverlay
          isVisible={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          onSearch={handleSearch}
          results={searchResults}
          isSearching={isSearching}
          onResultPress={() => setIsSearchOpen(false)}
          query={searchQuery}
        />
        
        {/* Filter modal (P2 Recommendation #11) */}
        <FilterSettings
          isVisible={showFilterModal}
          onClose={() => setShowFilterModal(false)}
          filter={messageFilters}
          onFilterChange={setMessageFilters}
        />
        
        <StatusBar style="light" />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// ============================================================================
// Section Components
// ============================================================================

interface ChatsSectionProps {
  sources: ChatSource[];
  tabs: ChatTab[];
  activeTabId: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  messages: EnhancedChatMessage[];
  isLoading: boolean;
  emoteMap: Record<string, string>;
  badgeMap: Record<string, string>;
  filter: MessageFilter;
  onAddChannel: () => void;
  onClearFilters: () => void;
  connectionStatuses: Map<string, ChatAdapterStatus>;
  onOpenSearch: () => void;
  onOpenFilters: () => void;
}

const ChatsSection = memo(function ChatsSection({
  sources,
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  messages,
  isLoading,
  emoteMap,
  badgeMap,
  filter,
  onAddChannel,
  onClearFilters,
  connectionStatuses,
  onOpenSearch,
  onOpenFilters,
}: ChatsSectionProps) {
  const sourceById = useMemo(() => {
    const next = new Map<string, ChatSource>();
    for (const source of sources) {
      next.set(source.id, source);
    }
    return next;
  }, [sources]);

  if (tabs.length === 0) {
    return <NoChatEmptyState onAddChannel={onAddChannel} />;
  }
  
  return (
    <View style={styles.chatSection}>
      {/* Tab bar */}
      <View style={styles.tabBarContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBar}
        >
          {tabs.map((tab) => {
            const tabSources = tab.sourceIds
              .map((sourceId) => sourceById.get(sourceId))
              .filter((source): source is ChatSource => Boolean(source));
            const primarySource = tabSources[0];
            const firstSourceId = tab.sourceIds[0] ?? '';
            const labelFromTab = tab.label.includes('/') ? tab.label.split('/').slice(1).join('/') : tab.label;
            const labelFromSourceId = firstSourceId.includes(':')
              ? firstSourceId.split(':').slice(1).join(':')
              : firstSourceId.includes('/')
                ? firstSourceId.split('/').slice(1).join('/')
                : firstSourceId;
            const fallbackLabel = labelFromTab.trim() || labelFromSourceId.trim() || 'chat';
            const baseChannelLabel = primarySource?.channel?.trim() || fallbackLabel;
            const tabLabel = primarySource
              ? tabSources.length > 1
                ? `${baseChannelLabel} +${tabSources.length - 1}`
                : baseChannelLabel
              : fallbackLabel;

            return (
              <Pressable
                key={tab.id}
                style={[styles.tab, activeTabId === tab.id && styles.tabActive]}
                onPress={() => onSelectTab(tab.id)}
              >
                <View style={styles.tabContent}>
                  {primarySource && (
                    <Image source={{ uri: PLATFORM_LOGOS[primarySource.platform] }} style={styles.tabPlatformLogo} />
                  )}
                  <Text
                    style={[styles.tabText, activeTabId === tab.id && styles.tabTextActive]}
                    numberOfLines={1}
                  >
                    {tabLabel}
                  </Text>
                </View>
                {connectionStatuses.get(tab.sourceIds[0]) && (
                  <View style={styles.tabStatus}>
                    <ConnectionStatusBadge
                      status={connectionStatuses.get(tab.sourceIds[0]) || 'disconnected'}
                    />
                  </View>
                )}
                <Pressable
                  style={styles.tabClose}
                  onPress={() => onCloseTab(tab.id)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.tabCloseText}>×</Text>
                </Pressable>
              </Pressable>
            );
          })}
        </ScrollView>
        
        {/* Action buttons */}
        <View style={styles.tabActions}>
          <Pressable style={styles.tabActionButton} onPress={onOpenSearch}>
            <Text style={styles.tabActionIcon}>🔍</Text>
          </Pressable>
          <Pressable style={styles.tabActionButton} onPress={onOpenFilters}>
            <Text style={styles.tabActionIcon}>⚙️</Text>
          </Pressable>
        </View>
      </View>
      
      {/* Chat list */}
      <ChatList
        messages={messages}
        isLoading={isLoading}
        emoteMap={emoteMap}
        badgeMap={badgeMap}
        filter={filter}
        onAddChannel={onAddChannel}
        onClearFilters={onClearFilters}
      />
    </View>
  );
});

interface AddChannelSectionProps {
  platformInput: PlatformId;
  setPlatformInput: (platform: PlatformId) => void;
  channelInput: string;
  setChannelInput: (channel: string) => void;
  onAddChannel: () => void;
  sources: ChatSource[];
  onRemoveChannel: (id: string) => void;
}

const AddChannelSection = memo(function AddChannelSection({
  platformInput,
  setPlatformInput,
  channelInput,
  setChannelInput,
  onAddChannel,
  sources,
  onRemoveChannel,
}: AddChannelSectionProps) {
  return (
    <ScrollView style={styles.addSection} contentContainerStyle={styles.addSectionContent}>
      <Text style={styles.sectionTitle}>Add Channel</Text>
      
      {/* Platform selection */}
      <View style={styles.platformSelector}>
        {PLATFORM_OPTIONS.map((platform) => (
          <Pressable
            key={platform}
            style={[
              styles.platformOption,
              platformInput === platform && {
                backgroundColor: PLATFORM_COLORS[platform] + '30',
                borderColor: PLATFORM_COLORS[platform],
              },
            ]}
            onPress={() => setPlatformInput(platform)}
          >
            <Image source={{ uri: PLATFORM_LOGOS[platform] }} style={styles.platformLogo} />
            <Text style={styles.platformLabel}>{PLATFORM_NAMES[platform]}</Text>
          </Pressable>
        ))}
      </View>
      
      {/* Channel input */}
      <View style={styles.channelInputContainer}>
        <TextInput
          style={styles.channelInput}
          placeholder={`Enter ${PLATFORM_NAMES[platformInput]} channel...`}
          placeholderTextColor={colors.text.muted}
          value={channelInput}
          onChangeText={setChannelInput}
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={onAddChannel}
        />
        <Pressable
          style={[styles.addButton, !channelInput.trim() && styles.addButtonDisabled]}
          onPress={onAddChannel}
          disabled={!channelInput.trim()}
        >
          <Text style={styles.addButtonText}>Add</Text>
        </Pressable>
      </View>
      
      {/* Active channels list */}
      {sources.length > 0 && (
        <View style={styles.activeChannels}>
          <Text style={styles.subsectionTitle}>Active Channels</Text>
          {sources.map((source) => (
            <View key={source.id} style={styles.channelRow}>
              <View style={[styles.channelIndicator, { backgroundColor: PLATFORM_COLORS[source.platform] }]} />
              <Text style={styles.channelName}>{source.channel}</Text>
              <Text style={styles.channelPlatform}>{PLATFORM_NAMES[source.platform]}</Text>
              <Pressable style={styles.removeButton} onPress={() => onRemoveChannel(source.id)}>
                <Text style={styles.removeButtonText}>Remove</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
});

interface ObsSectionProps {
  obsConnected: boolean;
  obsConnecting: boolean;
  obsStatusText: string;
  obsHost: string;
  setObsHost: (value: string) => void;
  obsPort: string;
  setObsPort: (value: string) => void;
  obsPassword: string;
  setObsPassword: (value: string) => void;
  obsScenes: string[];
  obsActiveScene: string | null;
  obsPreviewUri: string | null;
  obsSceneItems: ObsSceneItem[];
  obsAudioInputs: ObsAudioInput[];
  obsStats: ObsStats;
  obsStreaming: boolean;
  obsRecording: boolean;
  obsStreamTimecode: number | null;
  obsRecordTimecode: number | null;
  onConnect: () => void;
  onDisconnect: (reason?: string) => void;
  onRefresh: () => Promise<void>;
  onSwitchScene: (sceneName: string) => Promise<void>;
  onToggleStream: () => Promise<void>;
  onToggleRecord: () => Promise<void>;
  onToggleSceneItem: (sceneItem: ObsSceneItem) => Promise<void>;
  onToggleInputMute: (input: ObsAudioInput) => Promise<void>;
  onAdjustInputVolume: (input: ObsAudioInput, delta: number) => Promise<void>;
  onSetInputVolume: (input: ObsAudioInput, volumeMul: number) => Promise<void>;
}

const ObsSection = memo(function ObsSection({
  obsConnected,
  obsConnecting,
  obsStatusText,
  obsHost,
  setObsHost,
  obsPort,
  setObsPort,
  obsPassword,
  setObsPassword,
  obsScenes,
  obsActiveScene,
  obsPreviewUri,
  obsSceneItems,
  obsAudioInputs,
  obsStats,
  obsStreaming,
  obsRecording,
  obsStreamTimecode,
  obsRecordTimecode,
  onConnect,
  onDisconnect,
  onRefresh,
  onSwitchScene,
  onToggleStream,
  onToggleRecord,
  onToggleSceneItem,
  onToggleInputMute,
  onAdjustInputVolume,
  onSetInputVolume,
}: ObsSectionProps) {
  const status = obsConnected ? 'connected' : obsConnecting ? 'connecting' : 'disconnected';
  const [obsScrollEnabled, setObsScrollEnabled] = useState(true);
  const [draggingInputName, setDraggingInputName] = useState<string | null>(null);

  const applyMixerTouch = useCallback(
    (input: ObsAudioInput, locationY: number) => {
      const clampedY = Math.max(0, Math.min(OBS_MIXER_TRACK_HEIGHT, locationY));
      const nextVolume = clamp01(1 - clampedY / OBS_MIXER_TRACK_HEIGHT);
      void onSetInputVolume(input, nextVolume);
    },
    [onSetInputVolume]
  );

  const droppedFramePercent =
    obsStats.outputSkippedFrames !== null &&
    obsStats.outputTotalFrames !== null &&
    obsStats.outputTotalFrames > 0
      ? (obsStats.outputSkippedFrames / obsStats.outputTotalFrames) * 100
      : null;

  return (
    <ScrollView
      style={styles.obsSection}
      contentContainerStyle={styles.obsSectionContent}
      scrollEnabled={obsScrollEnabled}
    >
      <Text style={styles.sectionTitle}>OBS Control</Text>
      <Text style={styles.obsSubtitle}>Connect to obs-websocket and control your stream.</Text>

      <View style={styles.obsConnectionCard}>
        <View style={styles.obsConnectionRow}>
          <TextInput
            value={obsHost}
            onChangeText={setObsHost}
            placeholder="Host"
            placeholderTextColor={colors.text.muted}
            autoCapitalize="none"
            style={[styles.obsInput, styles.obsHostInput]}
          />
          <TextInput
            value={obsPort}
            onChangeText={setObsPort}
            placeholder="Port"
            placeholderTextColor={colors.text.muted}
            keyboardType="number-pad"
            style={[styles.obsInput, styles.obsPortInput]}
          />
        </View>

        <TextInput
          value={obsPassword}
          onChangeText={setObsPassword}
          placeholder="Password (if set in OBS)"
          placeholderTextColor={colors.text.muted}
          secureTextEntry
          style={styles.obsInput}
        />

        <View style={styles.obsStatusRow}>
          <Text style={styles.obsStatusLabel}>Status: {status}</Text>
          <Text style={styles.obsStatusValue} numberOfLines={1}>
            {obsStatusText}
          </Text>
        </View>

        <View style={styles.obsActionsRow}>
          <Pressable
            onPress={obsConnected ? () => onDisconnect('Disconnected') : onConnect}
            style={[
              styles.obsPrimaryButton,
              obsConnected && styles.obsDangerButton,
              obsConnecting && styles.obsPrimaryButtonDisabled,
            ]}
            disabled={obsConnecting}
          >
            <Text style={styles.obsPrimaryButtonText}>
              {obsConnected ? 'Disconnect' : obsConnecting ? 'Connecting...' : 'Connect'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => void onRefresh()}
            style={[styles.obsSecondaryButton, !obsConnected && styles.obsSecondaryButtonDisabled]}
            disabled={!obsConnected}
          >
            <Text style={styles.obsSecondaryButtonText}>Refresh</Text>
          </Pressable>
        </View>
      </View>

      {!obsConnected ? (
        <ObsNotConnectedEmptyState onConnect={onConnect} onLearnMore={() => {}} />
      ) : (
        <>
          <View style={styles.obsActionsRow}>
            <Pressable onPress={() => void onToggleStream()} style={styles.obsPrimaryButton}>
              <Text style={styles.obsPrimaryButtonText}>
                {obsStreaming ? 'Stop Stream' : 'Start Stream'}
              </Text>
            </Pressable>
            <Pressable onPress={() => void onToggleRecord()} style={styles.obsPrimaryButton}>
              <Text style={styles.obsPrimaryButtonText}>
                {obsRecording ? 'Stop Record' : 'Start Record'}
              </Text>
            </Pressable>
          </View>

          <View style={styles.obsTimeRow}>
            <Text style={styles.obsTimeText}>Stream: {formatObsDuration(obsStreamTimecode)}</Text>
            <Text style={styles.obsTimeText}>Record: {formatObsDuration(obsRecordTimecode)}</Text>
          </View>

          <Text style={styles.obsBlockTitle}>Scenes</Text>
          {obsScenes.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.obsSceneStrip}>
              {obsScenes.map((scene) => {
                const active = scene === obsActiveScene;
                return (
                  <Pressable
                    key={scene}
                    onPress={() => void onSwitchScene(scene)}
                    style={[styles.obsScenePill, active && styles.obsScenePillActive]}
                  >
                    <Text style={[styles.obsScenePillText, active && styles.obsScenePillTextActive]}>
                      {scene}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : (
            <Text style={styles.obsHintText}>No scenes found yet. Tap Refresh.</Text>
          )}

          <Text style={styles.obsBlockTitle}>Active Preview</Text>
          <View style={styles.obsPreviewCard}>
            {obsPreviewUri ? (
              <Image source={{ uri: obsPreviewUri }} style={styles.obsPreviewImage} resizeMode="cover" />
            ) : (
              <Text style={styles.obsHintText}>Preview will appear once OBS provides a scene screenshot.</Text>
            )}
          </View>

          <Text style={styles.obsBlockTitle}>Scene Sources</Text>
          {obsSceneItems.length > 0 ? (
            <View style={styles.obsListCard}>
              {obsSceneItems.map((item) => (
                <View key={`${item.sceneItemId}-${item.sourceName}`} style={styles.obsListRow}>
                  <Text style={styles.obsListLabel}>{item.sourceName}</Text>
                  <Pressable
                    onPress={() => void onToggleSceneItem(item)}
                    style={[styles.obsSecondaryButton, item.enabled && styles.obsPrimaryButton]}
                  >
                    <Text style={[styles.obsSecondaryButtonText, item.enabled && styles.obsPrimaryButtonText]}>
                      {item.enabled ? 'Visible' : 'Hidden'}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.obsHintText}>No scene sources found for the current scene.</Text>
          )}

          <Text style={styles.obsBlockTitle}>Audio Inputs</Text>
          {obsAudioInputs.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.obsMixerStripRow}
              style={styles.obsMixerScroll}
            >
              {obsAudioInputs.map((input) => (
                <View key={input.inputName} style={styles.obsMixerStrip}>
                  <Text style={styles.obsMixerSourceName} numberOfLines={1}>
                    {input.inputName}
                  </Text>
                  <Text style={styles.obsMixerDbValue}>{formatObsDbValue(input.volumeMul)}</Text>

                  <View style={styles.obsMixerMetersRow}>
                    <View
                      style={[
                        styles.obsMixerFaderTrack,
                        draggingInputName === input.inputName && styles.obsMixerFaderTrackDragging,
                      ]}
                      onStartShouldSetResponder={() => true}
                      onMoveShouldSetResponder={() => true}
                      onResponderGrant={(event) => {
                        setDraggingInputName(input.inputName);
                        setObsScrollEnabled(false);
                        applyMixerTouch(input, event.nativeEvent.locationY);
                      }}
                      onResponderMove={(event) => {
                        applyMixerTouch(input, event.nativeEvent.locationY);
                      }}
                      onResponderRelease={() => {
                        setDraggingInputName(null);
                        setObsScrollEnabled(true);
                      }}
                      onResponderTerminate={() => {
                        setDraggingInputName(null);
                        setObsScrollEnabled(true);
                      }}
                    >
                      <View
                        style={[
                          styles.obsMixerFaderFill,
                          {
                            height: Math.max(2, Math.round(clamp01(input.volumeMul) * OBS_MIXER_TRACK_HEIGHT)),
                          },
                        ]}
                      />
                      <View
                        style={[
                          styles.obsMixerFaderThumb,
                          {
                            bottom: Math.round(
                              clamp01(input.volumeMul) * (OBS_MIXER_TRACK_HEIGHT - OBS_MIXER_THUMB_HEIGHT)
                            ),
                          },
                        ]}
                      />
                    </View>

                    <View style={styles.obsMixerLevelTrack}>
                      <View style={styles.obsMixerLevelZones}>
                        <View style={styles.obsMixerLevelZoneHigh} />
                        <View style={styles.obsMixerLevelZoneMid} />
                        <View style={styles.obsMixerLevelZoneLow} />
                      </View>
                      <View
                        style={[
                          styles.obsMixerLevelFill,
                          {
                            height: Math.max(3, Math.round(clamp01((obsVolumeToDb(input.volumeMul) + 60) / 60) * OBS_MIXER_TRACK_HEIGHT)),
                            backgroundColor:
                              obsVolumeToDb(input.volumeMul) > -10
                                ? '#ef4e5d'
                                : obsVolumeToDb(input.volumeMul) > -20
                                  ? '#c9a327'
                                  : '#52d766',
                          },
                        ]}
                      />
                    </View>

                    <View style={styles.obsMixerScaleCol}>
                      {OBS_AUDIO_DB_TICKS.map((tick) => (
                        <Text key={`${input.inputName}-${tick}`} style={styles.obsMixerScaleText}>
                          {tick}
                        </Text>
                      ))}
                    </View>
                  </View>

                  <View style={styles.obsMixerActionsRow}>
                    <Pressable
                      onPress={() => void onToggleInputMute(input)}
                      style={[styles.obsMixerMuteButton, input.muted && styles.obsMixerMuteButtonActive]}
                    >
                      <Text style={styles.obsMixerMuteButtonText}>{input.muted ? 'Unmute' : 'Mute'}</Text>
                    </Pressable>
                    <View style={styles.obsMixerGainButtons}>
                      <Pressable
                        onPress={() => void onAdjustInputVolume(input, -0.05)}
                        style={styles.obsMixerGainButton}
                      >
                        <Text style={styles.obsMixerGainButtonText}>-</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => void onAdjustInputVolume(input, 0.05)}
                        style={styles.obsMixerGainButton}
                      >
                        <Text style={styles.obsMixerGainButtonText}>+</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.obsHintText}>No audio inputs found.</Text>
          )}

          <Text style={styles.obsBlockTitle}>Live Stats</Text>
          <View style={styles.obsStatsRow}>
            <Text style={styles.obsStatText}>
              CPU: {obsStats.cpuUsage !== null ? `${obsStats.cpuUsage.toFixed(1)}%` : 'n/a'}
            </Text>
            <Text style={styles.obsStatText}>
              FPS: {obsStats.activeFps !== null ? obsStats.activeFps.toFixed(1) : 'n/a'}
            </Text>
            <Text style={styles.obsStatText}>
              Dropped: {droppedFramePercent !== null ? `${droppedFramePercent.toFixed(2)}%` : 'n/a'}
            </Text>
          </View>
        </>
      )}
    </ScrollView>
  );
});

// ============================================================================
// Bottom Navigation Component
// ============================================================================

interface BottomNavigationProps {
  activeSection: MobileSection;
  onSectionChange: (section: MobileSection) => void;
}

const BottomNavigation = memo(function BottomNavigation({
  activeSection,
  onSectionChange,
}: BottomNavigationProps) {
  const sections: { id: MobileSection; icon: string; label: string }[] = [
    { id: 'chats', icon: '💬', label: 'Chats' },
    { id: 'add', icon: '➕', label: 'Add' },
    { id: 'obs', icon: '🎥', label: 'OBS' },
    { id: 'settings', icon: '⚙️', label: 'Settings' },
  ];
  
  return (
    <View style={styles.bottomNav}>
      {sections.map((section) => (
        <Pressable
          key={section.id}
          style={[styles.navItem, activeSection === section.id && styles.navItemActive]}
          onPress={() => onSectionChange(section.id)}
          accessibilityLabel={section.label}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeSection === section.id }}
        >
          <Text style={styles.navIcon}>{section.icon}</Text>
          <Text style={[styles.navLabel, activeSection === section.id && styles.navLabelActive]}>
            {section.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
});

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  content: {
    flex: 1,
  },
  errorContainer: {
    zIndex: 100,
  },
  
  // Chat section
  chatSection: {
    flex: 1,
  },
  tabBarContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    flex: 1,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginRight: spacing.sm,
    minWidth: 132,
    maxWidth: 236,
  },
  tabActive: {
    backgroundColor: colors.accent.primary + '30',
    borderColor: colors.accent.primary,
    borderWidth: 1,
  },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    minWidth: 0,
  },
  tabPlatformLogo: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: spacing.xs,
  },
  tabText: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
    marginRight: spacing.xs,
    flexShrink: 1,
    minWidth: 30,
  },
  tabTextActive: {
    color: colors.text.primary,
    fontWeight: typography.fontWeight.medium,
  },
  tabStatus: {
    marginLeft: spacing.xs,
  },
  tabClose: {
    marginLeft: spacing.xs,
    padding: spacing.xs,
  },
  tabCloseText: {
    color: colors.text.muted,
    fontSize: typography.fontSize.lg,
  },
  tabActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: spacing.sm,
  },
  tabActionButton: {
    padding: spacing.sm,
  },
  tabActionIcon: {
    fontSize: 18,
  },
  
  // Add section
  addSection: {
    flex: 1,
  },
  addSectionContent: {
    padding: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    marginBottom: spacing.lg,
  },
  platformSelector: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  platformOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    borderWidth: 2,
    borderColor: colors.border.default,
  },
  platformLogo: {
    width: 24,
    height: 24,
    marginRight: spacing.sm,
  },
  platformLabel: {
    color: colors.text.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  channelInputContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  channelInput: {
    flex: 1,
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: typography.fontSize.md,
    color: colors.text.primary,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  addButton: {
    backgroundColor: colors.accent.primary,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
    ...shadows.md,
  },
  addButtonDisabled: {
    backgroundColor: colors.border.default,
  },
  addButtonText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  activeChannels: {
    marginTop: spacing.lg,
  },
  subsectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.secondary,
    marginBottom: spacing.md,
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  channelIndicator: {
    width: 4,
    height: 24,
    borderRadius: 2,
    marginRight: spacing.md,
  },
  channelName: {
    flex: 1,
    color: colors.text.primary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
  },
  channelPlatform: {
    color: colors.text.muted,
    fontSize: typography.fontSize.sm,
    marginRight: spacing.md,
  },
  removeButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  removeButtonText: {
    color: colors.status.error,
    fontSize: typography.fontSize.sm,
  },
  
  // OBS section
  obsSection: {
    flex: 1,
  },
  obsSectionContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  obsSubtitle: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.md,
    marginBottom: spacing.md,
  },
  obsConnectionCard: {
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  obsConnectionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  obsInput: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.default,
    color: colors.text.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.fontSize.md,
    marginBottom: spacing.sm,
  },
  obsHostInput: {
    flex: 1,
  },
  obsPortInput: {
    width: 90,
  },
  obsStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  obsStatusLabel: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
  },
  obsStatusValue: {
    flex: 1,
    textAlign: 'right',
    color: colors.text.primary,
    fontSize: typography.fontSize.sm,
  },
  obsActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  obsPrimaryButton: {
    flex: 1,
    backgroundColor: colors.accent.primary,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    minHeight: accessibility.minTouchTarget,
  },
  obsPrimaryButtonDisabled: {
    opacity: 0.6,
  },
  obsDangerButton: {
    backgroundColor: colors.status.error,
  },
  obsPrimaryButtonText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  obsSecondaryButton: {
    flex: 1,
    backgroundColor: colors.background.elevated,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.default,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    minHeight: accessibility.minTouchTarget,
  },
  obsSecondaryButtonDisabled: {
    opacity: 0.5,
  },
  obsSecondaryButtonText: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  obsTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  obsTimeText: {
    flex: 1,
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
  },
  obsBlockTitle: {
    color: colors.text.primary,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  obsSceneStrip: {
    paddingBottom: spacing.xs,
    gap: spacing.sm,
  },
  obsScenePill: {
    backgroundColor: colors.background.card,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: accessibility.minTouchTarget,
    justifyContent: 'center',
  },
  obsScenePillActive: {
    borderColor: colors.accent.primary,
    backgroundColor: colors.accent.primary + '22',
  },
  obsScenePillText: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  obsScenePillTextActive: {
    color: colors.text.primary,
  },
  obsPreviewCard: {
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    minHeight: 120,
    justifyContent: 'center',
  },
  obsPreviewImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background.elevated,
  },
  obsListCard: {
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  obsListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  obsListLabel: {
    flex: 1,
    color: colors.text.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  obsListSubLabel: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.xs,
  },
  obsMixerScroll: {
    marginBottom: spacing.sm,
  },
  obsMixerStripRow: {
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  obsMixerStrip: {
    width: 176,
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  obsMixerSourceName: {
    color: colors.text.primary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  obsMixerDbValue: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.medium,
  },
  obsMixerMetersRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
    minHeight: OBS_MIXER_TRACK_HEIGHT,
  },
  obsMixerFaderTrack: {
    width: 16,
    height: OBS_MIXER_TRACK_HEIGHT,
    borderRadius: 8,
    backgroundColor: '#222b48',
    position: 'relative',
    overflow: 'hidden',
  },
  obsMixerFaderTrackDragging: {
    borderWidth: 1,
    borderColor: '#8da1ff',
  },
  obsMixerFaderFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#4b6fff',
  },
  obsMixerFaderThumb: {
    position: 'absolute',
    left: -3,
    width: 22,
    height: OBS_MIXER_THUMB_HEIGHT,
    borderRadius: 11,
    backgroundColor: '#f2f3f7',
    borderWidth: 1,
    borderColor: '#cfd3df',
  },
  obsMixerLevelTrack: {
    width: 30,
    height: OBS_MIXER_TRACK_HEIGHT,
    borderRadius: borderRadius.sm,
    backgroundColor: '#171d34',
    overflow: 'hidden',
    justifyContent: 'flex-end',
    position: 'relative',
  },
  obsMixerLevelZones: {
    ...StyleSheet.absoluteFillObject,
  },
  obsMixerLevelZoneHigh: {
    flex: 16,
    backgroundColor: '#5f111f',
  },
  obsMixerLevelZoneMid: {
    flex: 14,
    backgroundColor: '#605115',
  },
  obsMixerLevelZoneLow: {
    flex: 70,
    backgroundColor: '#1d3f24',
  },
  obsMixerLevelFill: {
    position: 'absolute',
    left: 4,
    right: 4,
    bottom: 0,
    borderRadius: 2,
  },
  obsMixerScaleCol: {
    height: OBS_MIXER_TRACK_HEIGHT,
    justifyContent: 'space-between',
    paddingVertical: 1,
  },
  obsMixerScaleText: {
    color: colors.text.secondary,
    fontSize: 11,
    lineHeight: 12,
  },
  obsMixerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  obsMixerMuteButton: {
    flex: 1,
    minHeight: accessibility.minTouchTarget,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.background.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  obsMixerMuteButtonActive: {
    backgroundColor: '#6f2b38',
    borderColor: '#b84862',
  },
  obsMixerMuteButtonText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  obsMixerGainButtons: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  obsMixerGainButton: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.background.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  obsMixerGainButtonText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  obsHintText: {
    color: colors.text.muted,
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.sm,
  },
  obsStatsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  obsStatText: {
    flex: 1,
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
  },
  obsStatus: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.md,
  },
  
  // Bottom navigation
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: colors.background.secondary,
    borderTopWidth: 1,
    borderTopColor: colors.border.default,
    paddingBottom: spacing.sm,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    minHeight: accessibility.minTouchTarget,
  },
  navItemActive: {
    backgroundColor: colors.background.elevated,
  },
  navIcon: {
    fontSize: 20,
    marginBottom: spacing.xs,
  },
  navLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.text.muted,
  },
  navLabelActive: {
    color: colors.accent.primary,
    fontWeight: typography.fontWeight.medium,
  },
});
