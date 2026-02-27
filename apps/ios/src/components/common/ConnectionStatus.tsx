/**
 * P1 Recommendation #7: Connection status indicators for each platform
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Pressable } from 'react-native';
import type { ChatAdapterStatus } from '@multichat/chat-core';
import { colors, spacing, borderRadius, typography } from '../../constants/theme';
import type { PlatformId, ConnectionStatus as ConnectionStatusType } from '../../types';
import { PLATFORM_NAMES, PLATFORM_COLORS } from '../../constants/config';

interface ConnectionStatusProps {
  status: ChatAdapterStatus;
  platform: PlatformId;
  channel: string;
  showDetails?: boolean;
  onRetry?: () => void;
}

export function ConnectionStatusIndicator({
  status,
  platform,
  channel,
  showDetails = false,
  onRetry,
}: ConnectionStatusProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (status === 'connecting') {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.5,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [status, pulseAnim]);

  const getStatusColor = () => {
    switch (status) {
      case 'connected':
        return colors.status.connected;
      case 'connecting':
        return colors.status.connecting;
      case 'disconnected':
      case 'error':
        return colors.status.disconnected;
      default:
        return colors.text.muted;
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'disconnected':
        return 'Disconnected';
      case 'error':
        return 'Error';
      default:
        return 'Unknown';
    }
  };

  if (!showDetails) {
    return (
      <Animated.View
        style={[
          styles.dot,
          { backgroundColor: getStatusColor(), opacity: pulseAnim },
        ]}
      />
    );
  }

  return (
    <View style={styles.detailedContainer}>
      <View style={styles.detailedHeader}>
        <View style={[styles.platformBadge, { backgroundColor: PLATFORM_COLORS[platform] + '30' }]}>
          <Animated.View
            style={[
              styles.statusDot,
              { backgroundColor: getStatusColor(), opacity: pulseAnim },
            ]}
          />
          <Text style={[styles.platformText, { color: PLATFORM_COLORS[platform] }]}>
            {PLATFORM_NAMES[platform]}
          </Text>
        </View>
        <Text style={styles.channelText}>{channel}</Text>
      </View>
      <View style={styles.statusRow}>
        <Text style={[styles.statusLabel, { color: getStatusColor() }]}>
          {getStatusLabel()}
        </Text>
        {(status === 'disconnected' || status === 'error') && onRetry && (
          <Pressable style={styles.retryButton} onPress={onRetry}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// Compact status badge for tabs
export function ConnectionStatusBadge({ status }: { status: ChatAdapterStatus }) {
  const getStatusColor = () => {
    switch (status) {
      case 'connected':
        return colors.status.connected;
      case 'connecting':
        return colors.status.connecting;
      default:
        return colors.status.disconnected;
    }
  };

  return <View style={[styles.badge, { backgroundColor: getStatusColor() }]} />;
}

// Status bar showing all connections
interface StatusBarProps {
  connections: Array<{
    sourceId: string;
    platform: PlatformId;
    channel: string;
    status: ChatAdapterStatus;
  }>;
}

export function ConnectionStatusBar({ connections }: StatusBarProps) {
  const connectedCount = connections.filter((c) => c.status === 'connected').length;
  const totalCount = connections.length;

  if (totalCount === 0) return null;

  const allConnected = connectedCount === totalCount;
  const someConnecting = connections.some((c) => c.status === 'connecting');
  const hasErrors = connections.some((c) => c.status === 'error');

  const getStatusSummary = () => {
    if (allConnected) return 'All connected';
    if (hasErrors) return `${totalCount - connectedCount} connection issue${totalCount - connectedCount > 1 ? 's' : ''}`;
    if (someConnecting) return 'Connecting...';
    return `${connectedCount}/${totalCount} connected`;
  };

  const getStatusColor = () => {
    if (allConnected) return colors.status.connected;
    if (hasErrors) return colors.status.error;
    if (someConnecting) return colors.status.connecting;
    return colors.status.warning;
  };

  return (
    <View style={[styles.statusBar, { borderLeftColor: getStatusColor() }]}>
      <View style={[styles.statusBarDot, { backgroundColor: getStatusColor() }]} />
      <Text style={styles.statusBarText}>{getStatusSummary()}</Text>
      <View style={styles.statusBarPlatforms}>
        {connections.map((conn) => (
          <View
            key={conn.sourceId}
            style={[
              styles.miniDot,
              {
                backgroundColor:
                  conn.status === 'connected'
                    ? colors.status.connected
                    : conn.status === 'connecting'
                    ? colors.status.connecting
                    : colors.status.disconnected,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  detailedContainer: {
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  detailedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  platformBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    marginRight: spacing.sm,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: spacing.xs,
  },
  platformText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  channelText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusLabel: {
    fontSize: typography.fontSize.xs,
  },
  retryButton: {
    backgroundColor: colors.accent.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  retryText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  badge: {
    width: 6,
    height: 6,
    borderRadius: 3,
    position: 'absolute',
    top: 2,
    right: 2,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.secondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderLeftWidth: 3,
  },
  statusBarDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  statusBarText: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
    flex: 1,
  },
  statusBarPlatforms: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  miniDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
