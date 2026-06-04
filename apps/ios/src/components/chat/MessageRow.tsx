/**
 * Rich chat message row used by the live app shell.
 *
 * Renders Twitch/Kick badges as images (with a compact text fallback) and the
 * message body with inline emotes resolved via the Chatrix-derived emote engine
 * (7TV / BetterTTV / Kick global emotes plus native Twitch/Kick emotes).
 *
 * Styling deliberately matches the dark card look used in App.tsx so it can be
 * dropped straight into the existing chat FlatList.
 */

import React, { memo, useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { ChatMessage } from '@multichat/chat-core';
import { buildMessageChunks, type EmoteMap } from '../../services/emotes';
import { resolveMessageBadges, type BadgeMap } from '../../services/badges';
import { compactBadgeLabel } from '../../utils/helpers';

type PlatformId = 'twitch' | 'kick' | 'youtube' | 'tiktok';

const platformTag = (platform: string) => {
  if (platform === 'twitch') return 'TW';
  if (platform === 'kick') return 'KI';
  if (platform === 'tiktok') return 'TT';
  return 'YT';
};

const formatClock = (timestamp: string) => {
  const value = Date.parse(timestamp);
  if (Number.isNaN(value)) return '--:--';
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const MAX_BADGES = 6;

type MessageRowProps = {
  message: ChatMessage;
  emoteMap: EmoteMap;
  twitchBadgeMap: BadgeMap;
};

function MessageRowComponent({
  message,
  emoteMap,
  twitchBadgeMap,
}: MessageRowProps) {
  const chunks = useMemo(
    () => buildMessageChunks(message, (token) => emoteMap[token]),
    [message, emoteMap]
  );

  const badges = useMemo(
    () => resolveMessageBadges(message, twitchBadgeMap),
    [message, twitchBadgeMap]
  );

  const author = message.displayName || message.username;
  const authorColor =
    typeof message.color === 'string' && message.color.trim()
      ? message.color.trim()
      : '#d5e4f7';

  return (
    <View style={styles.messageCard}>
      <View style={styles.messageMetaRow}>
        <Text style={styles.messageMeta}>
          {platformTag(message.platform as PlatformId)} #{message.channel}
        </Text>
        <Text style={styles.messageMeta}>{formatClock(message.timestamp)}</Text>
      </View>

      <View style={styles.authorRow}>
        {badges.length > 0 ? (
          <View style={styles.badgeRow}>
            {badges.slice(0, MAX_BADGES).map((badge, index) =>
              badge.imageUri ? (
                <Image
                  key={`${badge.key}-${index}`}
                  source={{ uri: badge.imageUri }}
                  style={styles.badgeImage}
                  accessibilityLabel={badge.label || 'Badge'}
                />
              ) : (
                <View key={`${badge.key}-${index}`} style={styles.badgeFallback}>
                  <Text style={styles.badgeFallbackText}>
                    {compactBadgeLabel(badge.label || badge.key)}
                  </Text>
                </View>
              )
            )}
          </View>
        ) : null}
        <Text style={[styles.messageAuthor, { color: authorColor }]} numberOfLines={1}>
          {author}
        </Text>
      </View>

      <View style={styles.messageBody}>
        {chunks.map((chunk, index) =>
          chunk.type === 'emote' ? (
            <Image
              key={`emote-${index}`}
              source={{ uri: chunk.url }}
              style={styles.inlineEmote}
              accessibilityLabel={`${chunk.name} emote`}
            />
          ) : (
            <Text key={`text-${index}`} style={styles.messageText}>
              {chunk.value}
            </Text>
          )
        )}
      </View>
    </View>
  );
}

export const MessageRow = memo(MessageRowComponent);

const styles = StyleSheet.create({
  messageCard: {
    borderWidth: 1,
    borderColor: '#1f2a3a',
    borderRadius: 8,
    backgroundColor: '#0b1220',
    padding: 8,
    gap: 3,
  },
  messageMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  messageMeta: {
    color: '#8aa1bd',
    fontSize: 11,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  badgeImage: {
    width: 18,
    height: 18,
    borderRadius: 3,
  },
  badgeFallback: {
    backgroundColor: '#1c2839',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  badgeFallbackText: {
    color: '#9fb3cd',
    fontSize: 9,
    fontWeight: '700',
  },
  messageAuthor: {
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
  },
  messageBody: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  messageText: {
    color: '#edf3ff',
    fontSize: 14,
    lineHeight: 22,
  },
  inlineEmote: {
    width: 24,
    height: 24,
    marginHorizontal: 1,
  },
});

export default MessageRow;
