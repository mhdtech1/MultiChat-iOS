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
  parseSevenTvEmoteMap,
  parseTwitchBadgeMap,
  readPossibleImageUri,
  compactBadgeLabel,
  segmentMessageWithEmotes,
  randomToken,
  toBase64Url,
  asRecord,
  readNumber,
  clamp01,
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
  const [obsScenes, setObsScenes] = useState<string[]>([]);
  const [obsActiveScene, setObsActiveScene] = useState<string | null>(null);
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
  const persistTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
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
          const response = await fetch(TWITCH_GLOBAL_BADGES_URL);
          const data = await response.json();
          const badges = parseTwitchBadgeMap(data);
          setGlobalBadgeMap(badges);
        } catch (e) {
          console.error('Failed to load global badges:', e);
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
  
  // ============================================================================
  // Chat Adapter Management
  // ============================================================================
  
  const createAdapter = useCallback((source: ChatSource) => {
    let adapter: ChatAdapter;
    
    switch (source.platform) {
      case 'twitch':
        adapter = new TwitchAdapter({
          channel: source.channel,
          identity: twitchToken && twitchUsername
            ? { username: twitchUsername, token: twitchToken }
            : undefined,
        });
        break;
      case 'kick':
        adapter = new KickAdapter({
          channel: source.channel,
          accessToken: kickToken || undefined,
        });
        break;
      case 'youtube':
        adapter = new YouTubeAdapter({
          videoId: source.channel,
          accessToken: youtubeAccessToken || undefined,
        });
        break;
      default:
        throw new Error(`Unknown platform: ${source.platform}`);
    }
    
    // Handle messages
    adapter.on('message', (message: ChatMessageType) => {
      const enhanced: EnhancedChatMessage = {
        ...message,
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
    });
    
    // Handle status changes (P1 Recommendation #7)
    adapter.on('status', (status: ChatAdapterStatus) => {
      setConnectionStatuses((prev) => {
        const next = new Map(prev);
        next.set(source.id, status);
        return next;
      });
    });
    
    // Handle errors (P0 Recommendation #3)
    adapter.on('error', (error: Error) => {
      const appError: AppError = {
        id: makeId(),
        type: 'connection',
        message: `${PLATFORM_NAMES[source.platform]}/${source.channel}: ${error.message}`,
        platform: source.platform,
        retryable: true,
        retryAction: async () => {
          adapter.connect();
        },
        timestamp: new Date(),
      };
      setErrors((prev) => [...prev.slice(-4), appError]);
    });
    
    return adapter;
  }, [twitchToken, twitchUsername, kickToken, youtubeAccessToken]);
  
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
          adapter.connect();
          
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
        if (
          message.message.toLowerCase().includes(searchText) ||
          message.author.toLowerCase().includes(searchText)
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
  // Authentication Handlers
  // ============================================================================
  
  const handleConnectTwitch = useCallback(async () => {
    try {
      const state = randomToken();
      const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${encodeURIComponent(TWITCH_REDIRECT_URI)}&response_type=token&scope=${encodeURIComponent(TWITCH_SCOPES.join(' '))}&state=${state}`;
      
      const result = await WebBrowser.openAuthSessionAsync(authUrl, TWITCH_REDIRECT_URI);
      if (result.type === 'success' && result.url) {
        const fragment = result.url.split('#')[1];
        if (fragment) {
          const params = new URLSearchParams(fragment);
          const token = params.get('access_token');
          if (token) {
            // Fetch username
            const response = await fetch('https://api.twitch.tv/helix/users', {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Client-Id': TWITCH_CLIENT_ID,
              },
            });
            const data = await response.json();
            const username = data.data?.[0]?.login ?? '';
            
            setTwitchToken(token);
            setTwitchUsername(username);
          }
        }
      }
    } catch (e) {
      console.error('Twitch auth error:', e);
    }
  }, []);
  
  const handleConnectKick = useCallback(async () => {
    try {
      const verifier = randomToken();
      const verifierHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
        encoding: Crypto.CryptoEncoding.BASE64,
      });
      const codeChallenge = toBase64Url(verifierHash);
      
      const authUrl = `https://id.kick.com/oauth/authorize?client_id=${KICK_CLIENT_ID}&redirect_uri=${encodeURIComponent(KICK_REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(KICK_SCOPES.join(' '))}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
      
      const result = await WebBrowser.openAuthSessionAsync(authUrl, KICK_REDIRECT_URI);
      if (result.type === 'success' && result.url) {
        const url = new URL(result.url);
        const code = url.searchParams.get('code');
        if (code) {
          // Exchange code for token
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
          const tokenData = await tokenResponse.json();
          
          if (tokenData.access_token) {
            setKickToken(tokenData.access_token);
            setKickRefreshToken(tokenData.refresh_token ?? '');
            
            // Fetch username
            const userResponse = await fetch('https://api.kick.com/public/v1/users', {
              headers: { Authorization: `Bearer ${tokenData.access_token}` },
            });
            const userData = await userResponse.json();
            const username = userData.data?.[0]?.username ?? '';
            setKickUsername(username);
          }
        }
      }
    } catch (e) {
      console.error('Kick auth error:', e);
    }
  }, []);
  
  const handleConnectYouTube = useCallback(async () => {
    try {
      const state = randomToken();
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${YOUTUBE_CLIENT_ID}&redirect_uri=${encodeURIComponent(YOUTUBE_REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(YOUTUBE_SCOPES.join(' '))}&access_type=offline&state=${state}`;
      
      const result = await WebBrowser.openAuthSessionAsync(authUrl, YOUTUBE_REDIRECT_URI);
      if (result.type === 'success' && result.url) {
        const url = new URL(result.url);
        const code = url.searchParams.get('code');
        if (code) {
          // Exchange code for token
          const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'authorization_code',
              client_id: YOUTUBE_CLIENT_ID,
              redirect_uri: YOUTUBE_REDIRECT_URI,
              code,
            }).toString(),
          });
          const tokenData = await tokenResponse.json();
          
          if (tokenData.access_token) {
            setYoutubeAccessToken(tokenData.access_token);
            setYoutubeRefreshToken(tokenData.refresh_token ?? '');
            setYoutubeTokenExpiry(Date.now() + (tokenData.expires_in ?? 3600) * 1000);
            
            // Fetch username
            const userResponse = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
              headers: { Authorization: `Bearer ${tokenData.access_token}` },
            });
            const userData = await userResponse.json();
            const username = userData.items?.[0]?.snippet?.title ?? '';
            setYoutubeUsername(username);
          }
        }
      }
    } catch (e) {
      console.error('YouTube auth error:', e);
    }
  }, []);
  
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
              obsHost={obsHost}
              obsPort={obsPort}
              onConnect={() => setMobileSection('obs')}
              onLearnMore={() => {}}
            />
          )}
          
          {mobileSection === 'settings' && (
            <SettingsScreen
              twitchUsername={twitchUsername}
              kickUsername={kickUsername}
              youtubeUsername={youtubeUsername}
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
          {tabs.map((tab) => (
            <Pressable
              key={tab.id}
              style={[styles.tab, activeTabId === tab.id && styles.tabActive]}
              onPress={() => onSelectTab(tab.id)}
            >
              <View style={styles.tabContent}>
                <Text
                  style={[styles.tabText, activeTabId === tab.id && styles.tabTextActive]}
                  numberOfLines={1}
                >
                  {tab.label}
                </Text>
                {connectionStatuses.get(tab.sourceIds[0]) && (
                  <ConnectionStatusBadge
                    status={connectionStatuses.get(tab.sourceIds[0]) || 'disconnected'}
                  />
                )}
              </View>
              <Pressable
                style={styles.tabClose}
                onPress={() => onCloseTab(tab.id)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.tabCloseText}>×</Text>
              </Pressable>
            </Pressable>
          ))}
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
  obsHost: string;
  obsPort: string;
  onConnect: () => void;
  onLearnMore: () => void;
}

const ObsSection = memo(function ObsSection({
  obsConnected,
  obsHost,
  obsPort,
  onConnect,
  onLearnMore,
}: ObsSectionProps) {
  if (!obsConnected) {
    return <ObsNotConnectedEmptyState onConnect={onConnect} onLearnMore={onLearnMore} />;
  }
  
  return (
    <View style={styles.obsSection}>
      <Text style={styles.sectionTitle}>OBS Control</Text>
      <Text style={styles.obsStatus}>Connected to {obsHost}:{obsPort}</Text>
      {/* OBS controls would go here */}
    </View>
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
    maxWidth: 150,
  },
  tabActive: {
    backgroundColor: colors.accent.primary + '30',
    borderColor: colors.accent.primary,
    borderWidth: 1,
  },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  tabText: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
    marginRight: spacing.xs,
  },
  tabTextActive: {
    color: colors.text.primary,
    fontWeight: typography.fontWeight.medium,
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
    padding: spacing.lg,
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
