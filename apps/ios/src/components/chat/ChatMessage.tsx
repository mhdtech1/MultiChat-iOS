/**
 * Chat Message Component with:
 * - P1 Recommendation #6: Message grouping by time and timestamps
 * - P1 Recommendation #9: Platform-specific features (raids, super chats, etc.)
 * - P2 Recommendation #14: Performance optimizations (memoization)
 * - P2 Recommendation #15: Accessibility features
 */

import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet, Image, Pressable, AccessibilityInfo } from 'react-native';
import { colors, spacing, borderRadius, typography, accessibility } from '../../constants/theme';
import type {
  EnhancedChatMessage,
  MessageSegment,
  PlatformId,
  RenderBadge,
} from '../../types';
import { PLATFORM_COLORS } from '../../constants/config';
import { formatTimestamp, segmentMessageWithEmotes } from '../../utils/helpers';

interface ChatMessageProps {
  message: EnhancedChatMessage;
  showTimestamp?: boolean;
  emoteMap: Record<string, string>;
  badgeMap: Record<string, string>;
  onAuthorPress?: (author: string) => void;
  onMessageLongPress?: (message: EnhancedChatMessage) => void;
}

// P2 Recommendation #14: Memoized message component
export const ChatMessage = memo(function ChatMessage({
  message,
  showTimestamp = false,
  emoteMap,
  badgeMap,
  onAuthorPress,
  onMessageLongPress,
}: ChatMessageProps) {
  const platform = message.platform as PlatformId;
  const segments = useMemo(
    () => segmentMessageWithEmotes(message.message, emoteMap),
    [message.message, emoteMap]
  );

  // Parse badges
  const badges: RenderBadge[] = useMemo(() => {
    if (!message.badges) return [];
    return message.badges.map((badge) => {
      const badgeKey = typeof badge === 'string' ? badge : badge.id || '';
      return {
        key: badgeKey,
        label: typeof badge === 'object' ? badge.label : badgeKey,
        imageUri: badgeMap[badgeKey] || (typeof badge === 'object' ? badge.imageUrl : undefined),
      };
    }).filter(b => b.key);
  }, [message.badges, badgeMap]);

  // Check for special message types (P1 Recommendation #9)
  const isSpecialMessage = useMemo(() => {
    const { twitchMeta, youtubeMeta, kickMeta } = message;
    return (
      twitchMeta?.isRaid ||
      twitchMeta?.isBits ||
      twitchMeta?.isSubscription ||
      youtubeMeta?.isSuperChat ||
      youtubeMeta?.isMembership ||
      kickMeta?.isGift ||
      kickMeta?.isHost
    );
  }, [message]);

  // P2 Recommendation #15: Accessibility label
  const accessibilityLabel = useMemo(() => {
    let label = `Message from ${message.author}`;
    if (message.twitchMeta?.isRaid) label += ', raid notification';
    if (message.youtubeMeta?.isSuperChat) label += `, super chat ${message.youtubeMeta.superChatAmount}`;
    label += `: ${message.message}`;
    return label;
  }, [message]);

  return (
    <View>
      {/* Timestamp separator - P1 Recommendation #6 */}
      {showTimestamp && (
        <View style={styles.timestampContainer}>
          <View style={styles.timestampLine} />
          <Text style={styles.timestampText}>
            {formatTimestamp(message.timestamp, true)}
          </Text>
          <View style={styles.timestampLine} />
        </View>
      )}

      {/* Special message wrapper for platform-specific events */}
      {isSpecialMessage && <SpecialMessageBanner message={message} />}

      <Pressable
        style={[
          styles.messageContainer,
          isSpecialMessage && styles.specialMessageContainer,
        ]}
        onLongPress={() => onMessageLongPress?.(message)}
        accessible={true}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="text"
        // P2 Recommendation #15: Minimum touch target
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {/* Platform indicator */}
        <View
          style={[
            styles.platformIndicator,
            { backgroundColor: PLATFORM_COLORS[platform] },
          ]}
        />

        <View style={styles.messageContent}>
          {/* Author row */}
          <View style={styles.authorRow}>
            {/* Badges */}
            {badges.length > 0 && (
              <View style={styles.badgesContainer}>
                {badges.slice(0, 5).map((badge, index) => (
                  <BadgeImage key={`${badge.key}-${index}`} badge={badge} />
                ))}
              </View>
            )}

            {/* Author name */}
            <Pressable
              onPress={() => onAuthorPress?.(message.author)}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Text
                style={[
                  styles.authorName,
                  { color: message.authorColor || colors.text.primary },
                ]}
              >
                {message.author}
              </Text>
            </Pressable>

            {/* Time */}
            <Text style={styles.messageTime}>
              {formatTimestamp(message.timestamp)}
            </Text>
          </View>

          {/* Message content */}
          <View style={styles.messageTextContainer}>
            {segments.map((segment, index) => (
              <MessageSegmentView key={index} segment={segment} />
            ))}
          </View>
        </View>
      </Pressable>
    </View>
  );
});

// Badge component
const BadgeImage = memo(function BadgeImage({ badge }: { badge: RenderBadge }) {
  if (badge.imageUri) {
    return (
      <Image
        source={{ uri: badge.imageUri }}
        style={styles.badge}
        accessibilityLabel={badge.label || 'Badge'}
      />
    );
  }
  if (badge.label) {
    return (
      <View style={styles.badgeText}>
        <Text style={styles.badgeTextLabel}>{badge.label.slice(0, 2)}</Text>
      </View>
    );
  }
  return null;
});

// Message segment component (text or emote)
const MessageSegmentView = memo(function MessageSegmentView({ segment }: { segment: MessageSegment }) {
  if (segment.type === 'emote') {
    return (
      <Image
        source={{ uri: segment.uri }}
        style={styles.emote}
        accessibilityLabel={`${segment.value} emote`}
      />
    );
  }
  return <Text style={styles.messageText}>{segment.value}</Text>;
});

// P1 Recommendation #9: Platform-specific special message banner
const SpecialMessageBanner = memo(function SpecialMessageBanner({
  message,
}: {
  message: EnhancedChatMessage;
}) {
  const { twitchMeta, youtubeMeta, kickMeta } = message;

  // Twitch Raid
  if (twitchMeta?.isRaid) {
    return (
      <View style={[styles.specialBanner, { backgroundColor: colors.raid + '30' }]}>
        <Text style={styles.specialBannerIcon}>⚡</Text>
        <Text style={styles.specialBannerText}>
          Raid! {twitchMeta.raidViewerCount} viewers incoming
        </Text>
      </View>
    );
  }

  // Twitch Bits
  if (twitchMeta?.isBits) {
    return (
      <View style={[styles.specialBanner, { backgroundColor: colors.bits + '30' }]}>
        <Text style={styles.specialBannerIcon}>💎</Text>
        <Text style={styles.specialBannerText}>
          {twitchMeta.bitsAmount} Bits cheered!
        </Text>
      </View>
    );
  }

  // Twitch Subscription
  if (twitchMeta?.isSubscription) {
    return (
      <View style={[styles.specialBanner, { backgroundColor: colors.subscription + '30' }]}>
        <Text style={styles.specialBannerIcon}>⭐</Text>
        <Text style={styles.specialBannerText}>
          {twitchMeta.subscriptionMonths
            ? `${twitchMeta.subscriptionMonths} month sub!`
            : 'New Subscriber!'}
        </Text>
      </View>
    );
  }

  // YouTube Super Chat
  if (youtubeMeta?.isSuperChat) {
    const amount = youtubeMeta.superChatAmount || '';
    const tier = getSuperChatTier(amount);
    return (
      <View style={[styles.specialBanner, styles.superChatBanner, { backgroundColor: tier.color + '30' }]}>
        <Text style={styles.specialBannerIcon}>💵</Text>
        <View>
          <Text style={[styles.specialBannerText, { color: tier.color }]}>Super Chat</Text>
          <Text style={styles.superChatAmount}>
            {youtubeMeta.superChatCurrency}{youtubeMeta.superChatAmount}
          </Text>
        </View>
      </View>
    );
  }

  // YouTube Membership
  if (youtubeMeta?.isMembership) {
    return (
      <View style={[styles.specialBanner, { backgroundColor: colors.subscription + '30' }]}>
        <Text style={styles.specialBannerIcon}>🎖️</Text>
        <Text style={styles.specialBannerText}>New Member!</Text>
      </View>
    );
  }

  // Kick Gift/Host
  if (kickMeta?.isGift) {
    return (
      <View style={[styles.specialBanner, { backgroundColor: colors.platform.kick + '30' }]}>
        <Text style={styles.specialBannerIcon}>🎁</Text>
        <Text style={styles.specialBannerText}>
          {kickMeta.giftAmount} Gift Sub{(kickMeta.giftAmount || 1) > 1 ? 's' : ''}!
        </Text>
      </View>
    );
  }

  if (kickMeta?.isHost) {
    return (
      <View style={[styles.specialBanner, { backgroundColor: colors.platform.kick + '30' }]}>
        <Text style={styles.specialBannerIcon}>🏠</Text>
        <Text style={styles.specialBannerText}>
          Host! {kickMeta.hostViewerCount} viewers
        </Text>
      </View>
    );
  }

  return null;
});

// Helper function for Super Chat tier colors
function getSuperChatTier(amount: string): { color: string; tier: number } {
  const value = parseFloat(amount.replace(/[^0-9.]/g, ''));
  if (value >= 100) return { color: colors.superChat.tier5, tier: 5 };
  if (value >= 50) return { color: colors.superChat.tier4, tier: 4 };
  if (value >= 20) return { color: colors.superChat.tier3, tier: 3 };
  if (value >= 5) return { color: colors.superChat.tier2, tier: 2 };
  return { color: colors.superChat.tier1, tier: 1 };
}

const styles = StyleSheet.create({
  timestampContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  timestampLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border.default,
  },
  timestampText: {
    color: colors.text.muted,
    fontSize: typography.fontSize.xs,
    marginHorizontal: spacing.md,
  },
  messageContainer: {
    flexDirection: 'row',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    minHeight: accessibility.minTouchTarget,
  },
  specialMessageContainer: {
    backgroundColor: colors.background.elevated,
  },
  platformIndicator: {
    width: 3,
    borderRadius: 1.5,
    marginRight: spacing.sm,
    marginTop: spacing.xs,
    height: 16,
  },
  messageContent: {
    flex: 1,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
    flexWrap: 'wrap',
  },
  badgesContainer: {
    flexDirection: 'row',
    marginRight: spacing.xs,
  },
  badge: {
    width: 18,
    height: 18,
    marginRight: 2,
  },
  badgeText: {
    backgroundColor: colors.background.tertiary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 4,
    paddingVertical: 1,
    marginRight: 2,
  },
  badgeTextLabel: {
    color: colors.text.secondary,
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
  },
  authorName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    marginRight: spacing.sm,
  },
  messageTime: {
    color: colors.text.muted,
    fontSize: typography.fontSize.xs,
    marginLeft: 'auto',
  },
  messageTextContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  messageText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.md,
    lineHeight: 22,
  },
  emote: {
    width: 24,
    height: 24,
    marginHorizontal: 1,
  },
  specialBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    borderRadius: borderRadius.md,
  },
  superChatBanner: {
    paddingVertical: spacing.sm,
  },
  specialBannerIcon: {
    fontSize: 16,
    marginRight: spacing.sm,
  },
  specialBannerText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  superChatAmount: {
    color: colors.text.primary,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
});

export default ChatMessage;
