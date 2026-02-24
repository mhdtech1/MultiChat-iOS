/**
 * Main App Context - State management for the application
 * Provides centralized state management for all app features
 */

import React, { createContext, useContext, useReducer, useCallback, useEffect, ReactNode } from 'react';
import type {
  PlatformId,
  ChatSource,
  ChatTab,
  MobileSection,
  ObsDetailTab,
  AppError,
  MessageFilter,
  NotificationPreferences,
  ConnectionStatus,
} from '../types';
import { loadAppState, saveAppState } from '../utils/storage';
import { makeId } from '../utils/helpers';

// State type
interface AppState {
  // App loading state
  isInitialized: boolean;
  isLoading: boolean;
  
  // Onboarding
  hasCompletedOnboarding: boolean;
  
  // Navigation
  mobileSection: MobileSection;
  
  // Chat sources and tabs
  sources: ChatSource[];
  tabs: ChatTab[];
  activeTabId: string | null;
  
  // Add channel form
  platformInput: PlatformId;
  channelInput: string;
  
  // Credentials
  twitchUsername: string;
  twitchToken: string;
  kickUsername: string;
  kickToken: string;
  kickRefreshToken: string;
  youtubeAccessToken: string;
  youtubeRefreshToken: string;
  youtubeTokenExpiry: number;
  youtubeUsername: string;
  
  // OBS
  obsHost: string;
  obsPort: string;
  obsPassword: string;
  obsSavedName: string;
  obsDetailTab: ObsDetailTab;
  
  // Errors (P0 Recommendation #3)
  errors: AppError[];
  
  // Filters (P2 Recommendation #11)
  messageFilters: MessageFilter;
  
  // Notifications (P2 Recommendation #12)
  notificationPreferences: NotificationPreferences;
  
  // Search (P1 Recommendation #8)
  searchQuery: string;
  isSearchOpen: boolean;
  
  // Connection status (P1 Recommendation #7)
  connectionStatuses: Record<string, ConnectionStatus>;
}

// Action types
type AppAction =
  | { type: 'INITIALIZE'; payload: Partial<AppState> }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'COMPLETE_ONBOARDING' }
  | { type: 'SET_MOBILE_SECTION'; payload: MobileSection }
  | { type: 'SET_PLATFORM_INPUT'; payload: PlatformId }
  | { type: 'SET_CHANNEL_INPUT'; payload: string }
  | { type: 'ADD_SOURCE'; payload: ChatSource }
  | { type: 'REMOVE_SOURCE'; payload: string }
  | { type: 'ADD_TAB'; payload: ChatTab }
  | { type: 'REMOVE_TAB'; payload: string }
  | { type: 'SET_ACTIVE_TAB'; payload: string | null }
  | { type: 'UPDATE_TABS'; payload: ChatTab[] }
  | { type: 'SET_TWITCH_CREDENTIALS'; payload: { username: string; token: string } }
  | { type: 'SET_KICK_CREDENTIALS'; payload: { username: string; token: string; refreshToken: string } }
  | { type: 'SET_YOUTUBE_CREDENTIALS'; payload: { username: string; accessToken: string; refreshToken: string; expiry: number } }
  | { type: 'CLEAR_TWITCH_CREDENTIALS' }
  | { type: 'CLEAR_KICK_CREDENTIALS' }
  | { type: 'CLEAR_YOUTUBE_CREDENTIALS' }
  | { type: 'SET_OBS_CONFIG'; payload: { host: string; port: string; password: string; name: string } }
  | { type: 'SET_OBS_DETAIL_TAB'; payload: ObsDetailTab }
  | { type: 'ADD_ERROR'; payload: AppError }
  | { type: 'REMOVE_ERROR'; payload: string }
  | { type: 'CLEAR_ERRORS' }
  | { type: 'SET_MESSAGE_FILTERS'; payload: MessageFilter }
  | { type: 'SET_NOTIFICATION_PREFERENCES'; payload: NotificationPreferences }
  | { type: 'SET_SEARCH_QUERY'; payload: string }
  | { type: 'TOGGLE_SEARCH'; payload: boolean }
  | { type: 'UPDATE_CONNECTION_STATUS'; payload: { sourceId: string; status: ConnectionStatus } };

// Default state
const defaultMessageFilters: MessageFilter = {
  platforms: ['twitch', 'kick', 'youtube'],
  users: [],
  keywords: [],
  showSubscriptions: true,
  showRaids: true,
  showSuperChats: true,
  showBits: true,
};

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

const initialState: AppState = {
  isInitialized: false,
  isLoading: true,
  hasCompletedOnboarding: false,
  mobileSection: 'chats',
  sources: [],
  tabs: [],
  activeTabId: null,
  platformInput: 'twitch',
  channelInput: '',
  twitchUsername: '',
  twitchToken: '',
  kickUsername: '',
  kickToken: '',
  kickRefreshToken: '',
  youtubeAccessToken: '',
  youtubeRefreshToken: '',
  youtubeTokenExpiry: 0,
  youtubeUsername: '',
  obsHost: '127.0.0.1',
  obsPort: '4455',
  obsPassword: '',
  obsSavedName: '',
  obsDetailTab: 'sceneItems',
  errors: [],
  messageFilters: defaultMessageFilters,
  notificationPreferences: defaultNotificationPreferences,
  searchQuery: '',
  isSearchOpen: false,
  connectionStatuses: {},
};

// Reducer
function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'INITIALIZE':
      return { ...state, ...action.payload, isInitialized: true, isLoading: false };
    
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    
    case 'COMPLETE_ONBOARDING':
      return { ...state, hasCompletedOnboarding: true };
    
    case 'SET_MOBILE_SECTION':
      return { ...state, mobileSection: action.payload };
    
    case 'SET_PLATFORM_INPUT':
      return { ...state, platformInput: action.payload };
    
    case 'SET_CHANNEL_INPUT':
      return { ...state, channelInput: action.payload };
    
    case 'ADD_SOURCE':
      return { ...state, sources: [...state.sources, action.payload] };
    
    case 'REMOVE_SOURCE':
      return {
        ...state,
        sources: state.sources.filter((s) => s.id !== action.payload),
        tabs: state.tabs
          .map((t) => ({ ...t, sourceIds: t.sourceIds.filter((id) => id !== action.payload) }))
          .filter((t) => t.sourceIds.length > 0),
      };
    
    case 'ADD_TAB':
      return { ...state, tabs: [...state.tabs, action.payload] };
    
    case 'REMOVE_TAB':
      const remainingTabs = state.tabs.filter((t) => t.id !== action.payload);
      return {
        ...state,
        tabs: remainingTabs,
        activeTabId: state.activeTabId === action.payload
          ? remainingTabs[0]?.id ?? null
          : state.activeTabId,
      };
    
    case 'SET_ACTIVE_TAB':
      return { ...state, activeTabId: action.payload };
    
    case 'UPDATE_TABS':
      return { ...state, tabs: action.payload };
    
    case 'SET_TWITCH_CREDENTIALS':
      return {
        ...state,
        twitchUsername: action.payload.username,
        twitchToken: action.payload.token,
      };
    
    case 'SET_KICK_CREDENTIALS':
      return {
        ...state,
        kickUsername: action.payload.username,
        kickToken: action.payload.token,
        kickRefreshToken: action.payload.refreshToken,
      };
    
    case 'SET_YOUTUBE_CREDENTIALS':
      return {
        ...state,
        youtubeUsername: action.payload.username,
        youtubeAccessToken: action.payload.accessToken,
        youtubeRefreshToken: action.payload.refreshToken,
        youtubeTokenExpiry: action.payload.expiry,
      };
    
    case 'CLEAR_TWITCH_CREDENTIALS':
      return { ...state, twitchUsername: '', twitchToken: '' };
    
    case 'CLEAR_KICK_CREDENTIALS':
      return { ...state, kickUsername: '', kickToken: '', kickRefreshToken: '' };
    
    case 'CLEAR_YOUTUBE_CREDENTIALS':
      return { ...state, youtubeUsername: '', youtubeAccessToken: '', youtubeRefreshToken: '', youtubeTokenExpiry: 0 };
    
    case 'SET_OBS_CONFIG':
      return {
        ...state,
        obsHost: action.payload.host,
        obsPort: action.payload.port,
        obsPassword: action.payload.password,
        obsSavedName: action.payload.name,
      };
    
    case 'SET_OBS_DETAIL_TAB':
      return { ...state, obsDetailTab: action.payload };
    
    case 'ADD_ERROR':
      return { ...state, errors: [...state.errors, action.payload] };
    
    case 'REMOVE_ERROR':
      return { ...state, errors: state.errors.filter((e) => e.id !== action.payload) };
    
    case 'CLEAR_ERRORS':
      return { ...state, errors: [] };
    
    case 'SET_MESSAGE_FILTERS':
      return { ...state, messageFilters: action.payload };
    
    case 'SET_NOTIFICATION_PREFERENCES':
      return { ...state, notificationPreferences: action.payload };
    
    case 'SET_SEARCH_QUERY':
      return { ...state, searchQuery: action.payload };
    
    case 'TOGGLE_SEARCH':
      return { ...state, isSearchOpen: action.payload, searchQuery: action.payload ? state.searchQuery : '' };
    
    case 'UPDATE_CONNECTION_STATUS':
      return {
        ...state,
        connectionStatuses: {
          ...state.connectionStatuses,
          [action.payload.sourceId]: action.payload.status,
        },
      };
    
    default:
      return state;
  }
}

// Context type
interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  actions: {
    initialize: () => Promise<void>;
    completeOnboarding: () => void;
    setSection: (section: MobileSection) => void;
    addChannel: (platform: PlatformId, channel: string) => void;
    removeChannel: (sourceId: string) => void;
    addError: (error: Omit<AppError, 'id' | 'timestamp'>) => void;
    removeError: (id: string) => void;
    persistState: () => Promise<void>;
  };
}

const AppContext = createContext<AppContextType | null>(null);

// Provider component
export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Initialize app state from storage
  const initialize = useCallback(async () => {
    try {
      const savedState = await loadAppState();
      if (savedState) {
        dispatch({
          type: 'INITIALIZE',
          payload: {
            hasCompletedOnboarding: savedState.hasCompletedOnboarding,
            mobileSection: savedState.mobileSection,
            sources: savedState.sources,
            tabs: savedState.tabs,
            activeTabId: savedState.activeTabId,
            platformInput: savedState.platformInput,
            channelInput: savedState.channelInput,
            twitchUsername: savedState.twitchUsername,
            twitchToken: savedState.twitchToken,
            kickUsername: savedState.kickUsername,
            kickToken: savedState.kickToken,
            kickRefreshToken: savedState.kickRefreshToken,
            youtubeAccessToken: savedState.youtubeAccessToken,
            youtubeRefreshToken: savedState.youtubeRefreshToken,
            youtubeTokenExpiry: savedState.youtubeTokenExpiry,
            youtubeUsername: savedState.youtubeUsername,
            obsHost: savedState.obsHost,
            obsPort: savedState.obsPort,
            obsPassword: savedState.obsPassword,
            obsSavedName: savedState.obsSavedName,
            obsDetailTab: savedState.obsDetailTab,
            messageFilters: savedState.messageFilters,
            notificationPreferences: savedState.notificationPreferences,
          },
        });
      } else {
        dispatch({ type: 'INITIALIZE', payload: {} });
      }
    } catch (error) {
      console.error('Failed to initialize app state:', error);
      dispatch({ type: 'INITIALIZE', payload: {} });
    }
  }, []);

  // Persist state to storage
  const persistState = useCallback(async () => {
    try {
      await saveAppState({
        version: 1,
        hasCompletedOnboarding: state.hasCompletedOnboarding,
        mobileSection: state.mobileSection,
        sources: state.sources,
        tabs: state.tabs,
        activeTabId: state.activeTabId,
        platformInput: state.platformInput,
        channelInput: state.channelInput,
        twitchUsername: state.twitchUsername,
        twitchToken: state.twitchToken,
        kickUsername: state.kickUsername,
        kickToken: state.kickToken,
        kickRefreshToken: state.kickRefreshToken,
        youtubeAccessToken: state.youtubeAccessToken,
        youtubeRefreshToken: state.youtubeRefreshToken,
        youtubeTokenExpiry: state.youtubeTokenExpiry,
        youtubeUsername: state.youtubeUsername,
        obsHost: state.obsHost,
        obsPort: state.obsPort,
        obsPassword: state.obsPassword,
        obsSavedName: state.obsSavedName,
        obsDetailTab: state.obsDetailTab,
        messageFilters: state.messageFilters,
        notificationPreferences: state.notificationPreferences,
      });
    } catch (error) {
      console.error('Failed to persist app state:', error);
    }
  }, [state]);

  // Complete onboarding
  const completeOnboarding = useCallback(() => {
    dispatch({ type: 'COMPLETE_ONBOARDING' });
  }, []);

  // Set mobile section
  const setSection = useCallback((section: MobileSection) => {
    dispatch({ type: 'SET_MOBILE_SECTION', payload: section });
  }, []);

  // Add a channel
  const addChannel = useCallback((platform: PlatformId, channel: string) => {
    const sourceId = makeId();
    const tabId = makeId();
    
    dispatch({
      type: 'ADD_SOURCE',
      payload: { id: sourceId, platform, channel: channel.toLowerCase() },
    });
    
    dispatch({
      type: 'ADD_TAB',
      payload: { id: tabId, sourceIds: [sourceId], label: `${platform}/${channel}` },
    });
    
    dispatch({ type: 'SET_ACTIVE_TAB', payload: tabId });
    dispatch({ type: 'SET_CHANNEL_INPUT', payload: '' });
  }, []);

  // Remove a channel
  const removeChannel = useCallback((sourceId: string) => {
    dispatch({ type: 'REMOVE_SOURCE', payload: sourceId });
  }, []);

  // Add error (P0 Recommendation #3)
  const addError = useCallback((error: Omit<AppError, 'id' | 'timestamp'>) => {
    dispatch({
      type: 'ADD_ERROR',
      payload: { ...error, id: makeId(), timestamp: new Date() },
    });
  }, []);

  // Remove error
  const removeError = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_ERROR', payload: id });
  }, []);

  // Initialize on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Auto-persist state changes (debounced)
  useEffect(() => {
    if (!state.isInitialized) return;
    
    const timeoutId = setTimeout(() => {
      persistState();
    }, 500);
    
    return () => clearTimeout(timeoutId);
  }, [state, persistState]);

  const contextValue: AppContextType = {
    state,
    dispatch,
    actions: {
      initialize,
      completeOnboarding,
      setSection,
      addChannel,
      removeChannel,
      addError,
      removeError,
      persistState,
    },
  };

  return <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>;
}

// Hook to use the context
export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}

export default AppContext;
