/**
 * Storage utilities for persisting app state
 */

import * as FileSystemLegacy from 'expo-file-system/legacy';
import { APP_STATE_FILENAME, OBS_SAVED_CONNECTIONS_FILENAME } from '../constants/config';
import type {
  PersistedAppStateV1,
  ChatSource,
  ChatTab,
  PlatformId,
  MobileSection,
  ObsDetailTab,
  ObsSavedConnection,
  MessageFilter,
  NotificationPreferences,
} from '../types';
import { makeId, asRecord } from './helpers';

export const getAppStateUri = () => {
  const baseDirectory = FileSystemLegacy.documentDirectory;
  if (!baseDirectory) return null;
  return `${baseDirectory}${APP_STATE_FILENAME}`;
};

export const getObsSavedConnectionsUri = () => {
  const baseDirectory = FileSystemLegacy.documentDirectory;
  if (!baseDirectory) return null;
  return `${baseDirectory}${OBS_SAVED_CONNECTIONS_FILENAME}`;
};

export const normalizePlatformId = (value: unknown): PlatformId => {
  if (value === 'kick' || value === 'youtube') return value;
  return 'twitch';
};

export const normalizeMobileSection = (value: unknown): MobileSection => {
  if (value === 'add' || value === 'obs' || value === 'settings') return value;
  return 'chats';
};

export const normalizeObsDetailTab = (value: unknown): ObsDetailTab => {
  if (value === 'audio') return 'audio';
  return 'sceneItems';
};

export const normalizePersistedSources = (value: unknown): ChatSource[] => {
  if (!Array.isArray(value)) return [];
  const seenByChannel = new Set<string>();
  const seenIds = new Set<string>();
  const next: ChatSource[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const platform = normalizePlatformId(record.platform);
    const channel = typeof record.channel === 'string' ? record.channel.trim().toLowerCase() : '';
    if (!channel) continue;

    const channelKey = `${platform}:${channel}`;
    if (seenByChannel.has(channelKey)) continue;
    seenByChannel.add(channelKey);

    let id = typeof record.id === 'string' && record.id.trim() ? record.id.trim() : makeId();
    while (seenIds.has(id)) {
      id = makeId();
    }
    seenIds.add(id);

    next.push({ id, platform, channel });
  }

  return next;
};

export const normalizePersistedTabs = (value: unknown, sources: ChatSource[]): ChatTab[] => {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const seenIds = new Set<string>();
  const sourceWithStandaloneTab = new Set<string>();
  const next: ChatTab[] = [];

  if (Array.isArray(value)) {
    for (const entry of value) {
      if (!entry || typeof entry !== 'object') continue;
      const record = entry as Record<string, unknown>;
      const sourceIdsRaw = Array.isArray(record.sourceIds)
        ? record.sourceIds
            .map((candidate) => (typeof candidate === 'string' ? candidate.trim() : ''))
            .filter(Boolean)
        : [];
      const legacySourceId = typeof record.sourceId === 'string' ? record.sourceId.trim() : '';
      if (sourceIdsRaw.length === 0 && legacySourceId) {
        sourceIdsRaw.push(legacySourceId);
      }
      if (sourceIdsRaw.length === 0) continue;

      const sourceIds = Array.from(new Set(sourceIdsRaw.filter((candidate) => sourceById.has(candidate))));
      if (sourceIds.length === 0) continue;
      if (sourceIds.length === 1 && sourceWithStandaloneTab.has(sourceIds[0])) continue;

      let id = typeof record.id === 'string' && record.id.trim() ? record.id.trim() : makeId();
      while (seenIds.has(id)) {
        id = makeId();
      }
      seenIds.add(id);

      const defaultLabel =
        sourceIds.length === 1
          ? (() => {
              const source = sourceById.get(sourceIds[0]);
              return source ? `${source.platform}/${source.channel}` : 'Chat';
            })()
          : `Merged (${sourceIds.length})`;
      const label = typeof record.label === 'string' && record.label.trim() ? record.label.trim() : defaultLabel;
      if (sourceIds.length === 1) {
        sourceWithStandaloneTab.add(sourceIds[0]);
      }
      next.push({ id, sourceIds, label });
    }
  }

  for (const source of sources) {
    if (sourceWithStandaloneTab.has(source.id)) continue;
    let id = makeId();
    while (seenIds.has(id)) {
      id = makeId();
    }
    seenIds.add(id);
    next.push({
      id,
      sourceIds: [source.id],
      label: `${source.platform}/${source.channel}`,
    });
  }

  return next;
};

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

export const normalizePersistedAppState = (value: unknown): PersistedAppStateV1 | null => {
  const record = asRecord(value);
  if (!record) return null;

  const sources = normalizePersistedSources(record.sources);
  const tabs = normalizePersistedTabs(record.tabs, sources);
  const activeTabCandidate = typeof record.activeTabId === 'string' ? record.activeTabId.trim() : '';
  const hasActiveTab = activeTabCandidate && tabs.some((tab) => tab.id === activeTabCandidate);

  return {
    version: 1,
    platformInput: normalizePlatformId(record.platformInput),
    channelInput: typeof record.channelInput === 'string' ? record.channelInput : '',
    mobileSection: normalizeMobileSection(record.mobileSection),
    sources,
    tabs,
    activeTabId: hasActiveTab ? activeTabCandidate : tabs[0]?.id ?? null,
    twitchUsername: typeof record.twitchUsername === 'string' ? record.twitchUsername : '',
    twitchToken: typeof record.twitchToken === 'string' ? record.twitchToken : '',
    kickUsername: typeof record.kickUsername === 'string' ? record.kickUsername : '',
    kickToken: typeof record.kickToken === 'string' ? record.kickToken : '',
    kickRefreshToken: typeof record.kickRefreshToken === 'string' ? record.kickRefreshToken : '',
    youtubeAccessToken: typeof record.youtubeAccessToken === 'string' ? record.youtubeAccessToken : '',
    youtubeRefreshToken: typeof record.youtubeRefreshToken === 'string' ? record.youtubeRefreshToken : '',
    youtubeTokenExpiry:
      typeof record.youtubeTokenExpiry === 'number' && Number.isFinite(record.youtubeTokenExpiry)
        ? record.youtubeTokenExpiry
        : 0,
    youtubeUsername: typeof record.youtubeUsername === 'string' ? record.youtubeUsername : '',
    obsHost: typeof record.obsHost === 'string' && record.obsHost.trim() ? record.obsHost.trim() : '127.0.0.1',
    obsPort: typeof record.obsPort === 'string' && record.obsPort.trim() ? record.obsPort.trim() : '4455',
    obsPassword: typeof record.obsPassword === 'string' ? record.obsPassword : '',
    obsSavedName: typeof record.obsSavedName === 'string' ? record.obsSavedName : '',
    obsDetailTab: normalizeObsDetailTab(record.obsDetailTab),
    hasCompletedOnboarding: typeof record.hasCompletedOnboarding === 'boolean' ? record.hasCompletedOnboarding : false,
    messageFilters: record.messageFilters ? { ...defaultMessageFilters, ...(record.messageFilters as any) } : defaultMessageFilters,
    notificationPreferences: record.notificationPreferences ? { ...defaultNotificationPreferences, ...(record.notificationPreferences as any) } : defaultNotificationPreferences,
  };
};

export const normalizeObsSavedConnections = (value: unknown): ObsSavedConnection[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const host = typeof record.host === 'string' ? record.host.trim() : '';
      const port = typeof record.port === 'string' ? record.port.trim() : '';
      if (!host || !port) return null;

      const id = typeof record.id === 'string' && record.id.trim() ? record.id.trim() : makeId();
      const name = typeof record.name === 'string' && record.name.trim() ? record.name.trim() : host;
      const password = typeof record.password === 'string' && record.password.trim() ? record.password : undefined;
      return { id, name, host, port, password } satisfies ObsSavedConnection;
    })
    .filter(Boolean) as ObsSavedConnection[];
};

export const loadAppState = async (): Promise<PersistedAppStateV1 | null> => {
  const uri = getAppStateUri();
  if (!uri) return null;
  
  try {
    const info = await FileSystemLegacy.getInfoAsync(uri);
    if (!info.exists) return null;
    
    const content = await FileSystemLegacy.readAsStringAsync(uri);
    const parsed = JSON.parse(content);
    return normalizePersistedAppState(parsed);
  } catch {
    return null;
  }
};

export const saveAppState = async (state: PersistedAppStateV1): Promise<boolean> => {
  const uri = getAppStateUri();
  if (!uri) return false;
  
  try {
    await FileSystemLegacy.writeAsStringAsync(uri, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
};

export const loadObsConnections = async (): Promise<ObsSavedConnection[]> => {
  const uri = getObsSavedConnectionsUri();
  if (!uri) return [];
  
  try {
    const info = await FileSystemLegacy.getInfoAsync(uri);
    if (!info.exists) return [];
    
    const content = await FileSystemLegacy.readAsStringAsync(uri);
    const parsed = JSON.parse(content);
    return normalizeObsSavedConnections(parsed);
  } catch {
    return [];
  }
};

export const saveObsConnections = async (connections: ObsSavedConnection[]): Promise<boolean> => {
  const uri = getObsSavedConnectionsUri();
  if (!uri) return false;
  
  try {
    await FileSystemLegacy.writeAsStringAsync(uri, JSON.stringify(connections));
    return true;
  } catch {
    return false;
  }
};
