/**
 * P0 Recommendation #2: Empty states with clear CTAs for all screens
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { colors, spacing, borderRadius, typography, shadows } from '../../constants/theme';
import type { PlatformId } from '../../types';
import { PLATFORM_LOGOS, PLATFORM_NAMES } from '../../constants/config';

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon,
  secondaryActionLabel,
  onSecondaryAction,
}: EmptyStateProps) {
  return (
    <View style={styles.container}>
      {icon && <View style={styles.iconContainer}>{icon}</View>}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {actionLabel && onAction && (
        <Pressable style={styles.primaryButton} onPress={onAction}>
          <Text style={styles.primaryButtonText}>{actionLabel}</Text>
        </Pressable>
      )}
      {secondaryActionLabel && onSecondaryAction && (
        <Pressable style={styles.secondaryButton} onPress={onSecondaryAction}>
          <Text style={styles.secondaryButtonText}>{secondaryActionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

// Empty state for no chats
export function NoChatEmptyState({ onAddChannel }: { onAddChannel: () => void }) {
  return (
    <EmptyState
      icon={
        <View style={styles.chatIconContainer}>
          <Text style={styles.chatIcon}>💬</Text>
        </View>
      }
      title="No Chats Yet"
      description="Add your first chat channel to start monitoring your streams across Twitch, Kick, and YouTube."
      actionLabel="Add Your First Chat"
      onAction={onAddChannel}
    />
  );
}

// Empty state for search results
export function NoSearchResultsEmptyState({ query, onClearSearch }: { query: string; onClearSearch: () => void }) {
  return (
    <EmptyState
      icon={
        <View style={styles.searchIconContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
        </View>
      }
      title="No Results Found"
      description={`We couldn't find any messages matching "${query}". Try a different search term.`}
      actionLabel="Clear Search"
      onAction={onClearSearch}
    />
  );
}

// Empty state for OBS not connected
export function ObsNotConnectedEmptyState({ onConnect, onLearnMore }: { onConnect: () => void; onLearnMore: () => void }) {
  return (
    <EmptyState
      icon={
        <View style={styles.obsIconContainer}>
          <Text style={styles.obsIcon}>🎥</Text>
        </View>
      }
      title="Connect to OBS"
      description="Control your OBS Studio remotely. Start/stop streaming, switch scenes, and manage audio."
      actionLabel="Connect OBS"
      onAction={onConnect}
      secondaryActionLabel="How to Set Up OBS WebSocket"
      onSecondaryAction={onLearnMore}
    />
  );
}

// Empty state for no accounts connected
export function NoAccountsEmptyState({ onConnectAccount }: { onConnectAccount: (platform: PlatformId) => void }) {
  return (
    <View style={styles.container}>
      <View style={styles.accountsIconContainer}>
        <Text style={styles.accountsIcon}>🔗</Text>
      </View>
      <Text style={styles.title}>Connect Your Accounts</Text>
      <Text style={styles.description}>
        Link your streaming accounts to send messages, moderate chats, and access more features.
      </Text>
      <View style={styles.platformButtons}>
        {(['twitch', 'kick', 'youtube'] as PlatformId[]).map((platform) => (
          <Pressable
            key={platform}
            style={[styles.platformButton, { borderColor: colors.platform[platform] }]}
            onPress={() => onConnectAccount(platform)}
          >
            <Image source={{ uri: PLATFORM_LOGOS[platform] }} style={styles.platformLogo} />
            <Text style={styles.platformButtonText}>{PLATFORM_NAMES[platform]}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// Empty state for filtered messages
export function NoFilteredMessagesEmptyState({ onClearFilters }: { onClearFilters: () => void }) {
  return (
    <EmptyState
      icon={
        <View style={styles.filterIconContainer}>
          <Text style={styles.filterIcon}>📝</Text>
        </View>
      }
      title="No Messages Match Filters"
      description="Your current filters are hiding all messages. Try adjusting your filter settings."
      actionLabel="Clear Filters"
      onAction={onClearFilters}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxl,
  },
  iconContainer: {
    marginBottom: spacing.lg,
  },
  chatIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.background.elevated,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.md,
  },
  chatIcon: {
    fontSize: 40,
  },
  searchIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.background.elevated,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.md,
  },
  searchIcon: {
    fontSize: 40,
  },
  obsIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.background.elevated,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.md,
  },
  obsIcon: {
    fontSize: 40,
  },
  accountsIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.background.elevated,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
    ...shadows.md,
  },
  accountsIcon: {
    fontSize: 40,
  },
  filterIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.background.elevated,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.md,
  },
  filterIcon: {
    fontSize: 40,
  },
  title: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  description: {
    fontSize: typography.fontSize.md,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  primaryButton: {
    backgroundColor: colors.accent.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    ...shadows.md,
  },
  primaryButtonText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  secondaryButton: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  secondaryButtonText: {
    color: colors.accent.highlight,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  platformButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  platformButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.elevated,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    ...shadows.sm,
  },
  platformLogo: {
    width: 20,
    height: 20,
    marginRight: spacing.sm,
  },
  platformButtonText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
});
