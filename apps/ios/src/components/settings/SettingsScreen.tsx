/**
 * P1 Recommendation #5: Improve settings discoverability (dedicated screen)
 * Includes:
 * - P2 Recommendation #12: Notification preferences and controls
 * - Account management
 * - App preferences
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  Image,
  Alert,
} from 'react-native';
import { colors, spacing, borderRadius, typography, shadows, accessibility } from '../../constants/theme';
import type { PlatformId, NotificationPreferences } from '../../types';
import { PLATFORM_LOGOS, PLATFORM_NAMES, PLATFORM_COLORS } from '../../constants/config';

interface SettingsScreenProps {
  // Account state
  twitchUsername: string;
  twitchToken: string;
  kickUsername: string;
  kickToken: string;
  youtubeUsername: string;
  youtubeAccessToken: string;
  youtubeRefreshToken: string;
  // Notification preferences
  notificationPreferences: NotificationPreferences;
  onNotificationPreferencesChange: (prefs: NotificationPreferences) => void;
  // Auth actions
  onConnectTwitch: () => void;
  onConnectKick: () => void;
  onConnectYouTube: () => void;
  onDisconnectTwitch: () => void;
  onDisconnectKick: () => void;
  onDisconnectYouTube: () => void;
  // Other actions
  onResetOnboarding: () => void;
  onClearCache: () => void;
}

export function SettingsScreen({
  twitchUsername,
  twitchToken,
  kickUsername,
  kickToken,
  youtubeUsername,
  youtubeAccessToken,
  youtubeRefreshToken,
  notificationPreferences,
  onNotificationPreferencesChange,
  onConnectTwitch,
  onConnectKick,
  onConnectYouTube,
  onDisconnectTwitch,
  onDisconnectKick,
  onDisconnectYouTube,
  onResetOnboarding,
  onClearCache,
}: SettingsScreenProps) {
  const updateNotificationPref = (key: keyof NotificationPreferences, value: any) => {
    onNotificationPreferencesChange({
      ...notificationPreferences,
      [key]: value,
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      {/* Connected Accounts Section */}
      <SectionHeader title="Connected Accounts" icon="🔗" />
      <View style={styles.section}>
        <AccountRow
          platform="twitch"
          connected={Boolean(twitchToken.trim())}
          username={twitchUsername}
          onConnect={onConnectTwitch}
          onDisconnect={onDisconnectTwitch}
        />
        <AccountRow
          platform="kick"
          connected={Boolean(kickToken.trim())}
          username={kickUsername}
          onConnect={onConnectKick}
          onDisconnect={onDisconnectKick}
        />
        <AccountRow
          platform="youtube"
          connected={Boolean(youtubeAccessToken.trim() || youtubeRefreshToken.trim())}
          username={youtubeUsername}
          onConnect={onConnectYouTube}
          onDisconnect={onDisconnectYouTube}
        />
      </View>

      {/* Notifications Section - P2 Recommendation #12 */}
      <SectionHeader title="Notifications" icon="🔔" />
      <View style={styles.section}>
        <SettingRow
          title="Enable Notifications"
          description="Receive notifications when the app is in background"
        >
          <Switch
            value={notificationPreferences.enabled}
            onValueChange={(v) => updateNotificationPref('enabled', v)}
            trackColor={{ false: colors.border.default, true: colors.accent.primary }}
            thumbColor={colors.text.primary}
          />
        </SettingRow>

        {notificationPreferences.enabled && (
          <>
            <SettingRow
              title="Mentions"
              description="Notify when someone mentions your username"
            >
              <Switch
                value={notificationPreferences.mentions}
                onValueChange={(v) => updateNotificationPref('mentions', v)}
                trackColor={{ false: colors.border.default, true: colors.accent.primary }}
                thumbColor={colors.text.primary}
              />
            </SettingRow>

            <SettingRow title="Subscriptions" description="New subscriber notifications">
              <Switch
                value={notificationPreferences.subscriptions}
                onValueChange={(v) => updateNotificationPref('subscriptions', v)}
                trackColor={{ false: colors.border.default, true: colors.accent.primary }}
                thumbColor={colors.text.primary}
              />
            </SettingRow>

            <SettingRow title="Raids" description="Incoming raid notifications">
              <Switch
                value={notificationPreferences.raids}
                onValueChange={(v) => updateNotificationPref('raids', v)}
                trackColor={{ false: colors.border.default, true: colors.accent.primary }}
                thumbColor={colors.text.primary}
              />
            </SettingRow>

            <SettingRow title="Super Chats" description="YouTube Super Chat notifications">
              <Switch
                value={notificationPreferences.superChats}
                onValueChange={(v) => updateNotificationPref('superChats', v)}
                trackColor={{ false: colors.border.default, true: colors.accent.primary }}
                thumbColor={colors.text.primary}
              />
            </SettingRow>

            <SettingRow title="Bits" description="Twitch Bits notifications">
              <Switch
                value={notificationPreferences.bits}
                onValueChange={(v) => updateNotificationPref('bits', v)}
                trackColor={{ false: colors.border.default, true: colors.accent.primary }}
                thumbColor={colors.text.primary}
              />
            </SettingRow>

            <View style={styles.divider} />

            <SettingRow title="Sound" description="Play sound with notifications">
              <Switch
                value={notificationPreferences.sound}
                onValueChange={(v) => updateNotificationPref('sound', v)}
                trackColor={{ false: colors.border.default, true: colors.accent.primary }}
                thumbColor={colors.text.primary}
              />
            </SettingRow>

            <SettingRow title="Vibration" description="Vibrate with notifications">
              <Switch
                value={notificationPreferences.vibration}
                onValueChange={(v) => updateNotificationPref('vibration', v)}
                trackColor={{ false: colors.border.default, true: colors.accent.primary }}
                thumbColor={colors.text.primary}
              />
            </SettingRow>
          </>
        )}
      </View>

      {/* Data & Storage Section */}
      <SectionHeader title="Data & Storage" icon="🗄️" />
      <View style={styles.section}>
        <Pressable
          style={styles.actionRow}
          onPress={() => {
            Alert.alert(
              'Clear Cache',
              'This will clear cached emotes and badges. They will be re-downloaded when needed.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear', style: 'destructive', onPress: onClearCache },
              ]
            );
          }}
        >
          <Text style={styles.actionRowText}>Clear Cache</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      </View>

      {/* About Section */}
      <SectionHeader title="About" icon="ℹ️" />
      <View style={styles.section}>
        <SettingRow title="Version" description="">
          <Text style={styles.valueText}>1.0.0</Text>
        </SettingRow>
        <Pressable
          style={styles.actionRow}
          onPress={onResetOnboarding}
        >
          <Text style={styles.actionRowText}>Show Onboarding</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      </View>

      {/* Bottom spacing */}
      <View style={styles.bottomSpacing} />
    </ScrollView>
  );
}

// Section Header Component
function SectionHeader({ title, icon }: { title: string; icon: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionIcon}>{icon}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

// Account Row Component
function AccountRow({
  platform,
  connected,
  username,
  onConnect,
  onDisconnect,
}: {
  platform: PlatformId;
  connected: boolean;
  username: string;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const isConnected = connected;
  const shownUsername = username.trim() || 'Connected account';

  return (
    <View style={styles.accountRow}>
      <Image source={{ uri: PLATFORM_LOGOS[platform] }} style={styles.platformLogo} />
      <View style={styles.accountInfo}>
        <Text style={styles.platformName}>{PLATFORM_NAMES[platform]}</Text>
        {isConnected ? (
          <Text style={styles.username}>{shownUsername}</Text>
        ) : (
          <Text style={styles.notConnected}>Not connected</Text>
        )}
      </View>
      {isConnected ? (
        <Pressable
          style={[styles.accountButton, styles.disconnectButton]}
          onPress={() => {
            Alert.alert(
              `Disconnect ${PLATFORM_NAMES[platform]}`,
              'You will need to reconnect to send messages.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Disconnect', style: 'destructive', onPress: onDisconnect },
              ]
            );
          }}
        >
          <Text style={styles.disconnectButtonText}>Disconnect</Text>
        </Pressable>
      ) : (
        <Pressable
          style={[styles.accountButton, { backgroundColor: PLATFORM_COLORS[platform] }]}
          onPress={onConnect}
        >
          <Text style={styles.connectButtonText}>Connect</Text>
        </Pressable>
      )}
    </View>
  );
}

// Setting Row Component
function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingInfo}>
        <Text style={styles.settingTitle}>{title}</Text>
        {description && <Text style={styles.settingDescription}>{description}</Text>}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  content: {
    padding: spacing.lg,
  },
  header: {
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: typography.fontSize.xxxl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionIcon: {
    fontSize: 18,
    marginRight: spacing.sm,
  },
  sectionTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  section: {
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    ...shadows.sm,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
    minHeight: accessibility.minTouchTarget,
  },
  platformLogo: {
    width: 32,
    height: 32,
    marginRight: spacing.md,
  },
  accountInfo: {
    flex: 1,
  },
  platformName: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
  },
  username: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  notConnected: {
    fontSize: typography.fontSize.sm,
    color: colors.text.muted,
    fontStyle: 'italic',
  },
  accountButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    minHeight: 36,
    justifyContent: 'center',
  },
  disconnectButton: {
    backgroundColor: colors.background.elevated,
  },
  connectButtonText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  disconnectButtonText: {
    color: colors.text.muted,
    fontSize: typography.fontSize.sm,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
    minHeight: accessibility.minTouchTarget,
  },
  settingInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  settingTitle: {
    fontSize: typography.fontSize.md,
    color: colors.text.primary,
  },
  settingDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.text.muted,
    marginTop: 2,
  },
  valueText: {
    fontSize: typography.fontSize.md,
    color: colors.text.muted,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
    minHeight: accessibility.minTouchTarget,
  },
  actionRowText: {
    fontSize: typography.fontSize.md,
    color: colors.text.primary,
  },
  chevron: {
    fontSize: typography.fontSize.xl,
    color: colors.text.muted,
  },
  divider: {
    height: spacing.sm,
    backgroundColor: colors.background.primary,
  },
  bottomSpacing: {
    height: spacing.xxxl,
  },
});

export default SettingsScreen;
