import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform as RNPlatform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { ChatAdapterStatus } from '@multichat/chat-core';
import { AppProvider, useApp } from '../context/AppContext';
import { ChatList } from '../components/chat';
import { ObsControllerPanel } from '../components/obs/ObsControllerPanel';
import { ObsSavedConnections } from '../components/obs/ObsSavedConnections';
import { SettingsScreen } from '../components/settings/SettingsScreen';
import { FilterSettings } from '../components/settings/FilterSettings';
import { OnboardingWizard } from '../components/onboarding/OnboardingWizard';
import { SearchOverlay } from '../components/search/SearchOverlay';
import { FullScreenLoading } from '../components/common/LoadingStates';
import { PLATFORM_OPTIONS } from '../constants/config';
import { colors, spacing, typography, borderRadius } from '../constants/theme';
import { useSearch } from '../hooks/useSearch';
import { useChatSession } from '../hooks/useChatSession';
import { useGlobalBadgeMap } from '../hooks/useGlobalBadgeMap';
import { useEmoteMaps } from '../hooks/useEmoteMaps';
import { useObsController } from '../hooks/useObsController';
import { usePlatformAuth } from '../hooks/usePlatformAuth';
import type { ChatSource, ChatTab, CredentialSnapshot, EnhancedChatMessage, PlatformId } from '../types';
import { platformTag, statusLabel } from '../utils/helpers';

function AppShell() {
  const { state, dispatch, actions } = useApp();
  const [notice, setNotice] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourcesReconnectedRef = useRef(false);

  const activeFilterCount = useMemo(() => {
    const filter = state.messageFilters;
    return (
      (filter.platforms.length < 3 ? 1 : 0) +
      (filter.users.length > 0 ? 1 : 0) +
      (filter.keywords.length > 0 ? 1 : 0) +
      (!filter.showSubscriptions ? 1 : 0) +
      (!filter.showRaids ? 1 : 0) +
      (!filter.showSuperChats ? 1 : 0) +
      (!filter.showBits ? 1 : 0)
    );
  }, [state.messageFilters]);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 5000);
  }, []);

  const obs = useObsController(showNotice);
  const auth = usePlatformAuth(showNotice);
  const { badgeMap } = useGlobalBadgeMap();

  const credentials = useMemo<CredentialSnapshot>(
    () => ({
      twitchUsername: state.twitchUsername,
      twitchToken: state.twitchToken,
      kickUsername: state.kickUsername,
      kickToken: state.kickToken,
      youtubeAccessToken: state.youtubeAccessToken,
      youtubeRefreshToken: state.youtubeRefreshToken,
    }),
    [state]
  );

  const setSources = useCallback(
    (nextSources: ChatSource[]) => {
      const nextIds = new Set(nextSources.map((s) => s.id));
      for (const source of state.sources) {
        if (!nextIds.has(source.id)) {
          dispatch({ type: 'REMOVE_SOURCE', payload: source.id });
        }
      }
      for (const source of nextSources) {
        if (!state.sources.some((existing) => existing.id === source.id)) {
          dispatch({ type: 'ADD_SOURCE', payload: source });
        }
      }
    },
    [dispatch, state.sources]
  );

  const setTabs = useCallback((tabs: ChatTab[]) => dispatch({ type: 'UPDATE_TABS', payload: tabs }), [dispatch]);

  const onConnectionStatus = useCallback(
    (sourceId: string, status: ChatAdapterStatus) => {
      const source = state.sources.find((s) => s.id === sourceId);
      if (!source) return;
      dispatch({
        type: 'UPDATE_CONNECTION_STATUS',
        payload: {
          sourceId,
          status: {
            status,
            platform: source.platform,
            channel: source.channel,
            retryCount: 0,
          },
        },
      });
    },
    [dispatch, state.sources]
  );

  const chat = useChatSession({
    sources: state.sources,
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    credentials,
    youtubeApiKey: state.youtubeApiKey,
    onSourcesChange: setSources,
    onTabsChange: setTabs,
    onActiveTabChange: (tabId) => dispatch({ type: 'SET_ACTIVE_TAB', payload: tabId }),
    onConnectionStatus,
    showNotice,
  });

  const emoteMap = useEmoteMaps(chat.activeChatSources, state.twitchToken);

  useEffect(() => {
    if (!state.isInitialized || sourcesReconnectedRef.current) return;
    if (state.sources.length === 0) {
      sourcesReconnectedRef.current = true;
      return;
    }
    sourcesReconnectedRef.current = true;
    void chat.reconnectAllSources();
  }, [state.isInitialized, state.sources.length, chat]);

  const obsConfigSyncedRef = useRef(false);
  useEffect(() => {
    if (!state.isInitialized || obsConfigSyncedRef.current) return;
    obsConfigSyncedRef.current = true;
    obs.applyObsConfig({
      host: state.obsHost,
      port: state.obsPort,
      password: state.obsPassword,
    });
  }, [state.isInitialized, state.obsHost, state.obsPort, state.obsPassword, obs]);

  useEffect(() => {
    return () => {
      chat.cleanupChat();
      obs.cleanupObs();
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, [chat, obs]);

  const handleSignInTwitch = () => {
    void auth.signInTwitch(async (token, username) => {
      dispatch({ type: 'SET_TWITCH_CREDENTIALS', payload: { token, username } });
      await chat.reconnectAllSources();
      await auth.openOwnChannelAfterSignIn('twitch', username, chat.openChatTab);
    });
  };

  const handleSignInKick = () => {
    void auth.signInKick(async (token, refreshToken, username) => {
      dispatch({ type: 'SET_KICK_CREDENTIALS', payload: { token, refreshToken, username } });
      await chat.reconnectAllSources();
      if (username) {
        await auth.openOwnChannelAfterSignIn('kick', username, chat.openChatTab);
      }
    });
  };

  const searchMessages = useMemo(() => {
    const map = new Map<string, EnhancedChatMessage[]>();
    for (const [sourceId, messages] of Object.entries(chat.messagesBySource)) {
      map.set(sourceId, messages as EnhancedChatMessage[]);
    }
    return map;
  }, [chat.messagesBySource]);

  const search = useSearch(searchMessages);

  const channelPlaceholder =
    state.platformInput === 'youtube' ? 'YouTube live chat ID' : `Enter ${state.platformInput} channel username`;

  if (!state.isInitialized || state.isLoading) {
    return <FullScreenLoading message="Loading MultiChat..." />;
  }

  if (!state.hasCompletedOnboarding) {
    return (
      <OnboardingWizard
        onComplete={() => actions.completeOnboarding()}
        onSkip={() => actions.completeOnboarding()}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={RNPlatform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>MultiChat</Text>
            <Text style={styles.subtitle}>Chatrix features · iOS</Text>
          </View>
          {state.mobileSection === 'chats' ? (
            <View style={styles.headerActions}>
              <Pressable onPress={() => setShowFilters(true)} style={styles.searchButton}>
                <Text style={styles.searchButtonText}>
                  {activeFilterCount > 0 ? `Filters (${activeFilterCount})` : 'Filters'}
                </Text>
              </Pressable>
              <Pressable onPress={() => dispatch({ type: 'TOGGLE_SEARCH', payload: !state.isSearchOpen })} style={styles.searchButton}>
                <Text style={styles.searchButtonText}>Search</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <View style={styles.content}>
          {state.mobileSection === 'chats' ? (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsStrip}>
                <View style={styles.tabsRow}>
                  {state.tabs.map((tab) => {
                    const active = tab.id === state.activeTabId;
                    const tabStatus =
                      tab.sourceIds.length === 1
                        ? statusLabel(chat.statusBySource[tab.sourceIds[0]])
                        : `${tab.sourceIds.filter((id) => chat.statusBySource[id] === 'connected').length}/${tab.sourceIds.length} live`;

                    return (
                      <View key={tab.id} style={[styles.tabCard, active && styles.tabCardActive]}>
                        <Pressable onPress={() => dispatch({ type: 'SET_ACTIVE_TAB', payload: tab.id })} style={styles.tabSelect}>
                          <Text style={styles.tabTag}>
                            {tab.sourceIds.length > 1
                              ? 'COMBO'
                              : platformTag(state.sources.find((s) => s.id === tab.sourceIds[0])?.platform ?? 'twitch')}
                          </Text>
                          <Text style={styles.tabLabel}>{tab.label}</Text>
                          <Text style={styles.tabStatus}>{tabStatus}</Text>
                        </Pressable>
                        <Pressable onPress={() => void chat.closeTab(tab.id)} style={styles.tabClose}>
                          <Text style={styles.tabCloseText}>×</Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>

              {chat.activeTab ? (
                <>
                  <View style={styles.metaRow}>
                    <Text style={styles.meta}>
                      {chat.activeChatSources.length === 1
                        ? `${chat.activeChatSources[0].platform}/${chat.activeChatSources[0].channel}`
                        : `${chat.activeChatSources.length} chats combined`}
                    </Text>
                    <Text style={styles.meta}>{chat.activeWritable ? 'Writable' : 'Read-only'}</Text>
                  </View>
                  <ChatList
                    messages={chat.activeMessages}
                    isLoading={chat.busy && chat.activeMessages.length === 0}
                    emoteMap={emoteMap}
                    badgeMap={badgeMap}
                    filter={state.messageFilters}
                    onAddChannel={() => actions.setSection('add')}
                    onClearFilters={() =>
                      dispatch({
                        type: 'SET_MESSAGE_FILTERS',
                        payload: { ...state.messageFilters, keywords: [], users: [] },
                      })
                    }
                  />
                  {chat.sendTargets.length > 1 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.targetStrip}>
                      {chat.sendTargets.map((target) => {
                        const active = target.id === chat.sendTargetId;
                        return (
                          <Pressable
                            key={String(target.id)}
                            onPress={() => chat.setSendTargetId(target.id)}
                            style={[styles.targetPill, active && styles.targetPillActive]}
                          >
                            <Text style={[styles.targetPillText, active && styles.targetPillTextActive]}>{target.label}</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  ) : null}
                  <View style={styles.composerRow}>
                    <TextInput
                      value={chat.composerText}
                      onChangeText={chat.setComposerText}
                      placeholder={chat.activeWritable ? 'Type a message' : 'Sign in to send'}
                      placeholderTextColor={colors.text.muted}
                      editable={chat.activeWritable}
                      style={[styles.input, styles.grow]}
                    />
                    <Pressable
                      onPress={() => void chat.sendActiveMessage()}
                      disabled={!chat.activeWritable || chat.sending || !chat.composerText.trim()}
                      style={[styles.sendButton, (!chat.activeWritable || chat.sending) && styles.sendButtonDisabled]}
                    >
                      <Text style={styles.sendButtonText}>{chat.sending ? '...' : 'Send'}</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>No chats yet</Text>
                  <Text style={styles.emptyText}>Go to Add and open your first channel.</Text>
                </View>
              )}
            </>
          ) : null}

          {state.mobileSection === 'add' ? (
            <View style={styles.addCard}>
              <Text style={styles.sectionTitle}>Add Chat</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.platformRow}>
                {PLATFORM_OPTIONS.map((platform) => {
                  const active = state.platformInput === platform;
                  return (
                    <Pressable
                      key={platform}
                      onPress={() => dispatch({ type: 'SET_PLATFORM_INPUT', payload: platform })}
                      style={[styles.platformPill, active && styles.platformPillActive]}
                    >
                      <Text style={[styles.platformPillText, active && styles.platformPillTextActive]}>{platform}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <View style={styles.row}>
                <TextInput
                  value={state.channelInput}
                  onChangeText={(value) => dispatch({ type: 'SET_CHANNEL_INPUT', payload: value })}
                  placeholder={channelPlaceholder}
                  placeholderTextColor={colors.text.muted}
                  autoCapitalize="none"
                  style={[styles.input, styles.grow]}
                />
                <Pressable
                  onPress={() => {
                    actions.setSection('chats');
                    void chat.openChatTab(state.platformInput, state.channelInput).then(() =>
                      dispatch({ type: 'SET_CHANNEL_INPUT', payload: '' })
                    );
                  }}
                  disabled={chat.busy}
                  style={styles.sendButton}
                >
                  <Text style={styles.sendButtonText}>{chat.busy ? '...' : 'Open'}</Text>
                </Pressable>
              </View>
              <Pressable onPress={() => { actions.setSection('chats'); chat.openCombinedTab(); }} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Combine Open Chats</Text>
              </Pressable>
            </View>
          ) : null}

          {state.mobileSection === 'obs' ? (
            <View style={styles.obsSection}>
            <ObsSavedConnections
              currentHost={obs.obsHost}
              currentPort={obs.obsPort}
              currentPassword={obs.obsPassword}
              onApply={obs.applyObsConfig}
              onConnect={obs.connectObs}
              showNotice={showNotice}
            />
            <ObsControllerPanel
              obsHost={obs.obsHost}
              obsPort={obs.obsPort}
              obsPassword={obs.obsPassword}
              obsConnected={obs.obsConnected}
              obsConnecting={obs.obsConnecting}
              obsStatusText={obs.obsStatusText}
              obsScenes={obs.obsScenes}
              obsCurrentScene={obs.obsCurrentScene}
              obsSceneItems={obs.obsSceneItems}
              obsAudioInputs={obs.obsAudioInputs}
              obsStats={obs.obsStats}
              obsStreamActive={obs.obsStreamActive}
              obsRecordActive={obs.obsRecordActive}
              onHostChange={obs.setObsHost}
              onPortChange={obs.setObsPort}
              onPasswordChange={obs.setObsPassword}
              onConnect={obs.connectObs}
              onDisconnect={() => obs.disconnectObs()}
              onRefresh={() => void obs.refreshObsState()}
              onSwitchScene={(scene) => void obs.switchObsScene(scene)}
              onToggleStream={() => void obs.toggleObsStream()}
              onToggleRecord={() => void obs.toggleObsRecord()}
              onToggleSceneItem={(item) => void obs.toggleObsSceneItem(item)}
              onToggleMute={(input) => void obs.toggleObsInputMute(input)}
              onAdjustVolume={(input, delta) => void obs.adjustObsInputVolume(input, delta)}
            />
            </View>
          ) : null}

          {state.mobileSection === 'settings' ? (
            <SettingsScreen
              twitchUsername={state.twitchUsername}
              twitchToken={state.twitchToken}
              kickUsername={state.kickUsername}
              kickToken={state.kickToken}
              youtubeUsername={state.youtubeUsername}
              youtubeAccessToken={state.youtubeAccessToken}
              youtubeRefreshToken={state.youtubeRefreshToken}
              notificationPreferences={state.notificationPreferences}
              onNotificationPreferencesChange={(prefs) =>
                dispatch({ type: 'SET_NOTIFICATION_PREFERENCES', payload: prefs })
              }
              onConnectTwitch={handleSignInTwitch}
              onConnectKick={handleSignInKick}
              onConnectYouTube={() => showNotice('YouTube OAuth coming soon. Use API key below for read-only.')}
              onDisconnectTwitch={() => {
                dispatch({ type: 'CLEAR_TWITCH_CREDENTIALS' });
                void chat.reconnectAllSources();
                showNotice('Signed out of Twitch.');
              }}
              onDisconnectKick={() => {
                dispatch({ type: 'CLEAR_KICK_CREDENTIALS' });
                void chat.reconnectAllSources();
                showNotice('Signed out of Kick.');
              }}
              onDisconnectYouTube={() => {
                dispatch({ type: 'CLEAR_YOUTUBE_CREDENTIALS' });
                void chat.reconnectAllSources();
                showNotice('Signed out of YouTube.');
              }}
              youtubeApiKey={state.youtubeApiKey}
              onYouTubeApiKeyChange={(value) => dispatch({ type: 'SET_YOUTUBE_API_KEY', payload: value })}
              onResetOnboarding={() => dispatch({ type: 'RESET_ONBOARDING' })}
              onClearCache={() => showNotice('Cache cleared.')}
            />
          ) : null}
        </View>

        <View style={styles.bottomNav}>
          {(['chats', 'add', 'obs', 'settings'] as const).map((section) => (
            <Pressable
              key={section}
              onPress={() => {
                actions.setSection(section);
                if (section === 'chats' && !state.activeTabId && state.tabs[0]) {
                  dispatch({ type: 'SET_ACTIVE_TAB', payload: state.tabs[0].id });
                }
              }}
              style={[styles.bottomNavItem, state.mobileSection === section && styles.bottomNavItemActive]}
            >
              <Text style={[styles.bottomNavText, state.mobileSection === section && styles.bottomNavTextActive]}>
                {section === 'chats' ? 'Chats' : section === 'add' ? 'Add' : section === 'obs' ? 'OBS' : 'Settings'}
              </Text>
            </Pressable>
          ))}
        </View>

        {notice ? (
          <View style={styles.noticeBar}>
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}

        <FilterSettings
          isVisible={showFilters}
          onClose={() => setShowFilters(false)}
          filter={state.messageFilters}
          onFilterChange={(filter) => dispatch({ type: 'SET_MESSAGE_FILTERS', payload: filter })}
        />

        <SearchOverlay
          isVisible={state.isSearchOpen}
          query={search.query.text}
          results={search.results}
          isSearching={search.isSearching}
          onSearch={(text) => {
            dispatch({ type: 'SET_SEARCH_QUERY', payload: text });
            search.search(text);
          }}
          onClose={() => {
            dispatch({ type: 'TOGGLE_SEARCH', payload: false });
            search.clearSearch();
          }}
          onResultPress={() => dispatch({ type: 'TOGGLE_SEARCH', payload: false })}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default function MainApp() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <AppShell />
      </AppProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background.primary },
  container: { flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  title: { color: colors.text.primary, fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold },
  subtitle: { color: colors.text.muted, fontSize: typography.fontSize.xs },
  headerActions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  searchButton: { borderWidth: 1, borderColor: colors.border.default, borderRadius: borderRadius.md, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  searchButtonText: { color: colors.text.secondary, fontSize: typography.fontSize.xs },
  content: { flex: 1, minHeight: 0 },
  tabsStrip: { marginBottom: spacing.sm },
  tabsRow: { flexDirection: 'row', gap: spacing.sm },
  tabCard: { flexDirection: 'row', borderWidth: 1, borderColor: colors.border.default, borderRadius: borderRadius.lg, backgroundColor: colors.background.card, minWidth: 200 },
  tabCardActive: { borderColor: colors.accent.highlight },
  tabSelect: { flex: 1, padding: spacing.sm },
  tabTag: { color: colors.accent.highlight, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold },
  tabLabel: { color: colors.text.primary, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold },
  tabStatus: { color: colors.text.muted, fontSize: 10, textTransform: 'capitalize' },
  tabClose: { paddingHorizontal: spacing.sm, justifyContent: 'center' },
  tabCloseText: { color: colors.text.muted, fontSize: 18 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  meta: { color: colors.text.muted, fontSize: typography.fontSize.xs },
  composerRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background.secondary,
    color: colors.text.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  grow: { flex: 1 },
  sendButton: { backgroundColor: colors.accent.primary, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, justifyContent: 'center' },
  sendButtonDisabled: { opacity: 0.45 },
  sendButtonText: { color: colors.text.primary, fontWeight: typography.fontWeight.bold, fontSize: typography.fontSize.sm },
  targetStrip: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  targetPill: { borderWidth: 1, borderColor: colors.border.default, borderRadius: borderRadius.full, paddingVertical: 4, paddingHorizontal: 10 },
  targetPillActive: { borderColor: colors.accent.highlight, backgroundColor: colors.background.tertiary },
  targetPillText: { color: colors.text.secondary, fontSize: typography.fontSize.xs },
  targetPillTextActive: { color: colors.text.primary },
  addCard: { borderWidth: 1, borderColor: colors.border.default, borderRadius: borderRadius.lg, padding: spacing.md, gap: spacing.md, backgroundColor: colors.background.card },
  obsSection: { flex: 1, gap: spacing.sm },
  sectionTitle: { color: colors.text.primary, fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.bold },
  platformRow: { flexDirection: 'row', gap: spacing.sm },
  platformPill: { borderWidth: 1, borderColor: colors.border.default, borderRadius: borderRadius.full, paddingVertical: 4, paddingHorizontal: 12 },
  platformPillActive: { borderColor: colors.accent.primary, backgroundColor: colors.background.tertiary },
  platformPillText: { color: colors.text.secondary, textTransform: 'capitalize' },
  platformPillTextActive: { color: colors.text.primary },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  secondaryButton: { borderWidth: 1, borderColor: colors.border.default, borderRadius: borderRadius.md, padding: spacing.sm, alignSelf: 'flex-start' },
  secondaryButtonText: { color: colors.text.secondary },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: colors.text.primary, fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold },
  emptyText: { color: colors.text.muted },
  bottomNav: { flexDirection: 'row', marginTop: spacing.sm, borderWidth: 1, borderColor: colors.border.default, borderRadius: borderRadius.lg, padding: 4, backgroundColor: colors.background.card },
  bottomNavItem: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: borderRadius.md },
  bottomNavItemActive: { backgroundColor: colors.background.tertiary },
  bottomNavText: { color: colors.text.muted, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium },
  bottomNavTextActive: { color: colors.text.primary },
  noticeBar: { position: 'absolute', left: spacing.md, right: spacing.md, bottom: spacing.md, backgroundColor: colors.background.tertiary, borderRadius: borderRadius.md, padding: spacing.sm, borderWidth: 1, borderColor: colors.accent.primary },
  noticeText: { color: colors.text.primary, fontSize: typography.fontSize.xs },
});
