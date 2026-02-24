/**
 * P0 Recommendation #3: Graceful error handling with inline errors, retry actions, and troubleshooting tips
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { colors, spacing, borderRadius, typography, shadows } from '../../constants/theme';
import type { AppError, PlatformId } from '../../types';
import { PLATFORM_NAMES } from '../../constants/config';

interface ErrorBannerProps {
  error: AppError;
  onDismiss: () => void;
  onRetry?: () => void;
}

// Inline error banner
export function ErrorBanner({ error, onDismiss, onRetry }: ErrorBannerProps) {
  return (
    <View style={styles.banner}>
      <View style={styles.bannerContent}>
        <Text style={styles.bannerIcon}>⚠️</Text>
        <View style={styles.bannerTextContainer}>
          <Text style={styles.bannerMessage}>{error.message}</Text>
          {getTroubleshootingTip(error) && (
            <Text style={styles.bannerTip}>{getTroubleshootingTip(error)}</Text>
          )}
        </View>
      </View>
      <View style={styles.bannerActions}>
        {error.retryable && onRetry && (
          <Pressable style={styles.retryButton} onPress={onRetry}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        )}
        <Pressable style={styles.dismissButton} onPress={onDismiss}>
          <Text style={styles.dismissButtonText}>✕</Text>
        </Pressable>
      </View>
    </View>
  );
}

// Connection error component
interface ConnectionErrorProps {
  platform: PlatformId;
  channel: string;
  errorMessage: string;
  onRetry: () => void;
  onRemove: () => void;
}

export function ConnectionError({ platform, channel, errorMessage, onRetry, onRemove }: ConnectionErrorProps) {
  return (
    <View style={styles.connectionError}>
      <View style={styles.connectionErrorHeader}>
        <Text style={styles.connectionErrorTitle}>
          Failed to connect to {PLATFORM_NAMES[platform]}/{channel}
        </Text>
      </View>
      <Text style={styles.connectionErrorMessage}>{errorMessage}</Text>
      <View style={styles.connectionErrorTips}>
        <Text style={styles.tipTitle}>Troubleshooting:</Text>
        {getConnectionTroubleshootingTips(platform).map((tip, index) => (
          <Text key={index} style={styles.tipItem}>• {tip}</Text>
        ))}
      </View>
      <View style={styles.connectionErrorActions}>
        <Pressable style={styles.primaryAction} onPress={onRetry}>
          <Text style={styles.primaryActionText}>Try Again</Text>
        </Pressable>
        <Pressable style={styles.secondaryAction} onPress={onRemove}>
          <Text style={styles.secondaryActionText}>Remove Channel</Text>
        </Pressable>
      </View>
    </View>
  );
}

// Authentication error
interface AuthErrorProps {
  platform: PlatformId;
  onReauthenticate: () => void;
  onDismiss: () => void;
}

export function AuthError({ platform, onReauthenticate, onDismiss }: AuthErrorProps) {
  return (
    <View style={styles.authError}>
      <Text style={styles.authErrorIcon}>🔒</Text>
      <Text style={styles.authErrorTitle}>{PLATFORM_NAMES[platform]} Session Expired</Text>
      <Text style={styles.authErrorMessage}>
        Your {PLATFORM_NAMES[platform]} session has expired. Please reconnect to continue sending messages.
      </Text>
      <Pressable style={styles.reauthButton} onPress={onReauthenticate}>
        <Text style={styles.reauthButtonText}>Reconnect {PLATFORM_NAMES[platform]}</Text>
      </Pressable>
      <Pressable style={styles.dismissLink} onPress={onDismiss}>
        <Text style={styles.dismissLinkText}>Dismiss</Text>
      </Pressable>
    </View>
  );
}

// Network error
interface NetworkErrorProps {
  onRetry: () => void;
}

export function NetworkError({ onRetry }: NetworkErrorProps) {
  return (
    <View style={styles.networkError}>
      <Text style={styles.networkErrorIcon}>📡</Text>
      <Text style={styles.networkErrorTitle}>No Internet Connection</Text>
      <Text style={styles.networkErrorMessage}>
        Please check your connection and try again.
      </Text>
      <Pressable style={styles.retryNetworkButton} onPress={onRetry}>
        <Text style={styles.retryNetworkButtonText}>Retry Connection</Text>
      </Pressable>
    </View>
  );
}

// Error list for multiple errors
interface ErrorListProps {
  errors: AppError[];
  onDismiss: (id: string) => void;
  onRetry: (error: AppError) => void;
}

export function ErrorList({ errors, onDismiss, onRetry }: ErrorListProps) {
  if (errors.length === 0) return null;

  return (
    <ScrollView style={styles.errorList} horizontal showsHorizontalScrollIndicator={false}>
      {errors.map((error) => (
        <ErrorBanner
          key={error.id}
          error={error}
          onDismiss={() => onDismiss(error.id)}
          onRetry={error.retryable ? () => onRetry(error) : undefined}
        />
      ))}
    </ScrollView>
  );
}

// Helper functions
function getTroubleshootingTip(error: AppError): string | null {
  switch (error.type) {
    case 'connection':
      return 'Check if the channel name is correct and the stream is live.';
    case 'authentication':
      return 'Your session may have expired. Try reconnecting your account.';
    case 'network':
      return 'Check your internet connection and try again.';
    default:
      return null;
  }
}

function getConnectionTroubleshootingTips(platform: PlatformId): string[] {
  const commonTips = [
    'Verify the channel name is spelled correctly',
    'Check your internet connection',
  ];

  switch (platform) {
    case 'twitch':
      return [
        ...commonTips,
        'The channel might be in subscriber-only or follower-only mode',
        'Try reconnecting your Twitch account',
      ];
    case 'kick':
      return [
        ...commonTips,
        'Kick connections may require authentication',
        'The stream might be offline',
      ];
    case 'youtube':
      return [
        ...commonTips,
        'For YouTube, use the video ID or channel handle',
        'The stream must be currently live',
        'Try reconnecting your YouTube account',
      ];
    default:
      return commonTips;
  }
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.status.error + '20',
    borderLeftWidth: 4,
    borderLeftColor: colors.status.error,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
  },
  bannerIcon: {
    fontSize: 18,
    marginRight: spacing.sm,
  },
  bannerTextContainer: {
    flex: 1,
  },
  bannerMessage: {
    color: colors.text.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  bannerTip: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.xs,
    marginTop: spacing.xs,
  },
  bannerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  retryButton: {
    backgroundColor: colors.status.error,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  retryButtonText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  dismissButton: {
    padding: spacing.xs,
  },
  dismissButtonText: {
    color: colors.text.muted,
    fontSize: typography.fontSize.md,
  },
  connectionError: {
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    margin: spacing.md,
    ...shadows.md,
  },
  connectionErrorHeader: {
    marginBottom: spacing.sm,
  },
  connectionErrorTitle: {
    color: colors.status.error,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  connectionErrorMessage: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.md,
  },
  connectionErrorTips: {
    backgroundColor: colors.background.elevated,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  tipTitle: {
    color: colors.text.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.sm,
  },
  tipItem: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.xs,
  },
  connectionErrorActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  primaryAction: {
    flex: 1,
    backgroundColor: colors.accent.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  primaryActionText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  secondaryAction: {
    flex: 1,
    backgroundColor: colors.background.elevated,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  secondaryActionText: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.md,
  },
  authError: {
    alignItems: 'center',
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    margin: spacing.md,
    ...shadows.md,
  },
  authErrorIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  authErrorTitle: {
    color: colors.text.primary,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.sm,
  },
  authErrorMessage: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.md,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  reauthButton: {
    backgroundColor: colors.accent.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
  },
  reauthButtonText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  dismissLink: {
    padding: spacing.sm,
  },
  dismissLinkText: {
    color: colors.text.muted,
    fontSize: typography.fontSize.sm,
  },
  networkError: {
    alignItems: 'center',
    padding: spacing.xl,
  },
  networkErrorIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  networkErrorTitle: {
    color: colors.text.primary,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.sm,
  },
  networkErrorMessage: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.md,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  retryNetworkButton: {
    backgroundColor: colors.accent.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  retryNetworkButtonText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  errorList: {
    maxHeight: 100,
  },
});
