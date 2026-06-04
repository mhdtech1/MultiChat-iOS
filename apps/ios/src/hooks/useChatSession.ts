import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatAdapter, ChatAdapterStatus, ChatMessage } from '@multichat/chat-core';
import { KickAdapter, TwitchAdapter, YouTubeAdapter } from '@multichat/chat-core';
import type { ChatSource, ChatTab, CredentialSnapshot, EnhancedChatMessage, PlatformId } from '../types';
import { MESSAGE_BUFFER_SIZE } from '../constants/config';
import { isWritable, makeId, normalizeTabSourceSignature } from '../utils/helpers';
import { normalizeChannelInput } from '../utils/channelInput';

type UseChatSessionOptions = {
  sources: ChatSource[];
  tabs: ChatTab[];
  activeTabId: string | null;
  credentials: CredentialSnapshot;
  youtubeApiKey: string;
  onSourcesChange: (sources: ChatSource[]) => void;
  onTabsChange: (tabs: ChatTab[]) => void;
  onActiveTabChange: (tabId: string | null) => void;
  onConnectionStatus: (sourceId: string, status: ChatAdapterStatus) => void;
  showNotice: (message: string) => void;
};

const messageTimestamp = (message: ChatMessage) => {
  const parsed = Date.parse(message.timestamp);
  return Number.isFinite(parsed) ? parsed : Date.now();
};

export function useChatSession({
  sources,
  tabs,
  activeTabId,
  credentials,
  youtubeApiKey,
  onSourcesChange,
  onTabsChange,
  onActiveTabChange,
  onConnectionStatus,
  showNotice,
}: UseChatSessionOptions) {
  const [messagesBySource, setMessagesBySource] = useState<Record<string, ChatMessage[]>>({});
  const [statusBySource, setStatusBySource] = useState<Record<string, ChatAdapterStatus>>({});
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [composerText, setComposerText] = useState('');
  const [sendTargetId, setSendTargetId] = useState<'__all__' | string>('__all__');

  const adaptersRef = useRef<Map<string, ChatAdapter>>(new Map());
  const reconnectingRef = useRef(false);

  const sourceById = useMemo(() => new Map(sources.map((source) => [source.id, source])), [sources]);

  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId) ?? null, [activeTabId, tabs]);

  const activeChatSources = useMemo(() => {
    if (!activeTab) return [];
    return activeTab.sourceIds.map((id) => sourceById.get(id)).filter(Boolean) as ChatSource[];
  }, [activeTab, sourceById]);

  const activeMessages = useMemo((): EnhancedChatMessage[] => {
    if (!activeTab) return [];
    const merged = activeTab.sourceIds.flatMap((sourceId) => messagesBySource[sourceId] ?? []);
    return merged
      .sort((left, right) => messageTimestamp(left) - messageTimestamp(right))
      .map((message) => message as EnhancedChatMessage);
  }, [activeTab, messagesBySource]);

  const writableActiveSources = useMemo(
    () => activeChatSources.filter((source) => isWritable(source.platform, credentials)),
    [activeChatSources, credentials]
  );

  const activeWritable = writableActiveSources.length > 0;

  const buildAdapter = useCallback(
    (platform: PlatformId, channel: string): ChatAdapter => {
      if (platform === 'twitch') {
        return new TwitchAdapter({
          channel,
          auth: credentials.twitchToken.trim()
            ? { token: credentials.twitchToken.trim(), username: credentials.twitchUsername.trim() }
            : undefined,
        });
      }

      if (platform === 'kick') {
        return new KickAdapter({
          channel,
          auth: {
            accessToken: credentials.kickToken.trim() || undefined,
            username: credentials.kickUsername.trim() || undefined,
            guest: !credentials.kickToken.trim(),
          },
        });
      }

      if (!youtubeApiKey.trim()) {
        throw new Error('YouTube API key is required for read-only chat.');
      }

      return new YouTubeAdapter({
        channel,
        auth: {
          apiKey: youtubeApiKey.trim(),
          liveChatId: channel,
        },
      });
    },
    [credentials, youtubeApiKey]
  );

  const attachAdapter = useCallback(
    (sourceId: string, adapter: ChatAdapter) => {
      adapter.onStatus((status) => {
        setStatusBySource((previous) => ({ ...previous, [sourceId]: status }));
        onConnectionStatus(sourceId, status);
      });

      adapter.onMessage((message) => {
        setMessagesBySource((previous) => {
          const current = previous[sourceId] ?? [];
          const next = [...current, message];
          if (next.length > MESSAGE_BUFFER_SIZE) {
            next.splice(0, next.length - MESSAGE_BUFFER_SIZE);
          }
          return { ...previous, [sourceId]: next };
        });
      });

      adaptersRef.current.set(sourceId, adapter);
    },
    [onConnectionStatus]
  );

  const connectSource = useCallback(
    async (source: ChatSource) => {
      const existing = adaptersRef.current.get(source.id);
      adaptersRef.current.delete(source.id);
      if (existing) {
        await existing.disconnect().catch(() => undefined);
      }

      const adapter = buildAdapter(source.platform, source.channel);
      attachAdapter(source.id, adapter);
      setStatusBySource((previous) => ({ ...previous, [source.id]: 'connecting' }));
      onConnectionStatus(source.id, 'connecting');
      await adapter.connect();
    },
    [attachAdapter, buildAdapter, onConnectionStatus]
  );

  const reconnectAllSources = useCallback(async () => {
    if (reconnectingRef.current) return;
    reconnectingRef.current = true;
    for (const source of sources) {
      try {
        await connectSource(source);
      } catch (error) {
        setStatusBySource((previous) => ({ ...previous, [source.id]: 'error' }));
        onConnectionStatus(source.id, 'error');
        showNotice(error instanceof Error ? error.message : String(error));
      }
    }
    reconnectingRef.current = false;
  }, [connectSource, onConnectionStatus, showNotice, sources]);

  const openChatTab = useCallback(
    async (platform: PlatformId, rawChannel: string) => {
      const channel = normalizeChannelInput(platform, rawChannel);
      if (!channel) {
        showNotice('Enter a channel first.');
        return;
      }

      const existingSource = sources.find((source) => source.platform === platform && source.channel === channel);
      const source: ChatSource =
        existingSource ?? { id: makeId(), platform, channel };

      const existingSingleTab = tabs.find(
        (tab) => tab.sourceIds.length === 1 && tab.sourceIds[0] === source.id
      );
      if (existingSingleTab) {
        onActiveTabChange(existingSingleTab.id);
        showNotice('That chat is already open.');
        return;
      }

      const nextTab: ChatTab = {
        id: makeId(),
        sourceIds: [source.id],
        label: `${platform}/${channel}`,
      };

      if (!existingSource) {
        onSourcesChange([...sources, source]);
      }
      onTabsChange([...tabs, nextTab]);
      onActiveTabChange(nextTab.id);

      if (!adaptersRef.current.has(source.id)) {
        setBusy(true);
        try {
          await connectSource(source);
        } catch (error) {
          setStatusBySource((previous) => ({ ...previous, [source.id]: 'error' }));
          onConnectionStatus(source.id, 'error');
          showNotice(error instanceof Error ? error.message : String(error));
        } finally {
          setBusy(false);
        }
      }
    },
    [
      connectSource,
      onActiveTabChange,
      onConnectionStatus,
      onSourcesChange,
      onTabsChange,
      showNotice,
      sources,
      tabs,
    ]
  );

  const openCombinedTab = useCallback(() => {
    const sourceIds = Array.from(new Set(sources.map((source) => source.id)));
    if (sourceIds.length < 2) {
      showNotice('Open at least two chats before combining.');
      return;
    }

    const signature = normalizeTabSourceSignature(sourceIds);
    const existing = tabs.find(
      (tab) => tab.sourceIds.length > 1 && normalizeTabSourceSignature(tab.sourceIds) === signature
    );
    if (existing) {
      onActiveTabChange(existing.id);
      return;
    }

    const combinedTab: ChatTab = {
      id: makeId(),
      sourceIds,
      label: `combined/${sourceIds.length} chats`,
    };
    onTabsChange([...tabs, combinedTab]);
    onActiveTabChange(combinedTab.id);
  }, [onActiveTabChange, onTabsChange, showNotice, sources, tabs]);

  const closeTab = useCallback(
    async (tabId: string) => {
      const tab = tabs.find((candidate) => candidate.id === tabId);
      if (!tab) return;

      const nextTabs = tabs.filter((candidate) => candidate.id !== tabId);
      onTabsChange(nextTabs);
      if (activeTabId === tabId) {
        onActiveTabChange(nextTabs[0]?.id ?? null);
      }

      const stillUsedSourceIds = new Set(nextTabs.flatMap((candidate) => candidate.sourceIds));
      const orphanedSourceIds = tab.sourceIds.filter((sourceId) => !stillUsedSourceIds.has(sourceId));

      for (const sourceId of orphanedSourceIds) {
        const adapter = adaptersRef.current.get(sourceId);
        adaptersRef.current.delete(sourceId);
        if (adapter) {
          await adapter.disconnect().catch(() => undefined);
        }
        setMessagesBySource((previous) => {
          const next = { ...previous };
          delete next[sourceId];
          return next;
        });
        setStatusBySource((previous) => {
          const next = { ...previous };
          delete next[sourceId];
          return next;
        });
      }

      if (orphanedSourceIds.length > 0) {
        onSourcesChange(sources.filter((source) => !orphanedSourceIds.includes(source.id)));
      }
    },
    [activeTabId, onActiveTabChange, onSourcesChange, onTabsChange, sources, tabs]
  );

  const sendActiveMessage = useCallback(async () => {
    if (!activeTab) return;
    const content = composerText.trim();
    if (!content) return;

    const targetSources =
      sendTargetId === '__all__'
        ? writableActiveSources
        : writableActiveSources.filter((source) => source.id === sendTargetId);

    if (targetSources.length === 0) {
      showNotice('No writable chats selected.');
      return;
    }

    setSending(true);
    const results = await Promise.allSettled(
      targetSources.map(async (source) => {
        const adapter = adaptersRef.current.get(source.id);
        if (!adapter) {
          throw new Error(`${source.platform}/${source.channel} is not connected yet.`);
        }
        await adapter.sendMessage(content);
      })
    );

    if (results.some((result) => result.status === 'fulfilled')) {
      setComposerText('');
    }

    const failures = results
      .map((result, index) => {
        if (result.status === 'fulfilled') return null;
        const source = targetSources[index];
        const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
        return `${source.platform}/${source.channel}: ${reason}`;
      })
      .filter(Boolean) as string[];

    if (failures.length > 0) {
      const suffix = failures.length > 1 ? ` (+${failures.length - 1} more)` : '';
      showNotice(`Send failed: ${failures[0]}${suffix}`);
    }

    setSending(false);
  }, [activeTab, composerText, sendTargetId, showNotice, writableActiveSources]);

  useEffect(() => {
    if (!activeTab) {
      setSendTargetId('__all__');
      return;
    }
    if (writableActiveSources.length === 1) {
      setSendTargetId(writableActiveSources[0].id);
      return;
    }
    if (writableActiveSources.some((source) => source.id === sendTargetId)) {
      return;
    }
    setSendTargetId('__all__');
  }, [activeTab, sendTargetId, writableActiveSources]);

  const sendTargets = useMemo(() => {
    if (!activeTab) return [];
    const targets: Array<{ id: '__all__' | string; label: string }> = [];
    if (writableActiveSources.length > 1) {
      targets.push({ id: '__all__', label: `All writable (${writableActiveSources.length})` });
    }
    for (const source of writableActiveSources) {
      targets.push({ id: source.id, label: `${source.platform}/${source.channel}` });
    }
    return targets;
  }, [activeTab, writableActiveSources]);

  const cleanupChat = useCallback(() => {
    for (const adapter of adaptersRef.current.values()) {
      void adapter.disconnect();
    }
    adaptersRef.current.clear();
  }, []);

  return {
    messagesBySource,
    statusBySource,
    busy,
    sending,
    composerText,
    setComposerText,
    sendTargetId,
    setSendTargetId,
    activeTab,
    activeChatSources,
    activeMessages,
    activeWritable,
    writableActiveSources,
    sendTargets,
    openChatTab,
    openCombinedTab,
    closeTab,
    sendActiveMessage,
    connectSource,
    reconnectAllSources,
    cleanupChat,
  };
}
