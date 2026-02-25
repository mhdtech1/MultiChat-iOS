/**
 * Optimized Chat List Component
 * P2 Recommendation #14: Virtualized lists and memoization for performance
 */

import React, { memo, useCallback, useMemo, useRef, useState, useEffect } from 'react';
import {
  FlatList,
  View,
  Text,
  StyleSheet,
  Pressable,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { colors, spacing, borderRadius, typography } from '../../constants/theme';
import type { EnhancedChatMessage, MessageFilter } from '../../types';
import { ChatMessage } from './ChatMessage';
import { ChatListSkeleton } from '../common/LoadingStates';
import { NoChatEmptyState, NoFilteredMessagesEmptyState } from '../common/EmptyStates';
import { getMessageAuthor, shouldShowTimestamp } from '../../utils/helpers';

interface ChatListProps {
  messages: EnhancedChatMessage[];
  isLoading: boolean;
  emoteMap: Record<string, string>;
  badgeMap: Record<string, string>;
  filter?: MessageFilter;
  onAddChannel?: () => void;
  onClearFilters?: () => void;
  onAuthorPress?: (author: string) => void;
  onMessageLongPress?: (message: EnhancedChatMessage) => void;
}

// P2 Recommendation #14: Memoized list component
export const ChatList = memo(function ChatList({
  messages,
  isLoading,
  emoteMap,
  badgeMap,
  filter,
  onAddChannel,
  onClearFilters,
  onAuthorPress,
  onMessageLongPress,
}: ChatListProps) {
  const flatListRef = useRef<FlatList>(null);
  const userDraggingRef = useRef(false);
  const [followLatest, setFollowLatest] = useState(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const lastMessageCount = useRef(messages.length);

  // Filter messages based on filter settings
  const filteredMessages = useMemo(() => {
    if (!filter) return messages;

    return messages.filter((msg) => {
      // Platform filter
      if (filter.platforms.length > 0 && !filter.platforms.includes(msg.platform as any)) {
        return false;
      }

      // User filter
      const author = getMessageAuthor(msg).toLowerCase();
      if (filter.users.length > 0 && !filter.users.includes(author)) {
        return false;
      }

      // Keyword filter
      if (filter.keywords.length > 0) {
        const hasKeyword = filter.keywords.some((keyword) =>
          msg.message.toLowerCase().includes(keyword.toLowerCase())
        );
        if (!hasKeyword) return false;
      }

      // Special message type filters
      if (!filter.showSubscriptions && msg.twitchMeta?.isSubscription) return false;
      if (!filter.showRaids && msg.twitchMeta?.isRaid) return false;
      if (!filter.showSuperChats && msg.youtubeMeta?.isSuperChat) return false;
      if (!filter.showBits && msg.twitchMeta?.isBits) return false;

      return true;
    });
  }, [messages, filter]);

  const isNearBottom = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - (layoutMeasurement.height + contentOffset.y);
    return distanceFromBottom <= 72;
  }, []);

  // Auto-scroll to bottom when new messages arrive (unless user paused by scrolling)
  useEffect(() => {
    if (followLatest && messages.length > lastMessageCount.current) {
      requestAnimationFrame(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      });
    }
    lastMessageCount.current = messages.length;
  }, [messages.length, followLatest]);

  // Handle scroll events; only pause auto-follow when user manually drags away from bottom.
  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (isNearBottom(event)) {
      setFollowLatest(true);
      setShowScrollToBottom(false);
      return;
    }
    if (userDraggingRef.current) {
      setFollowLatest(false);
      setShowScrollToBottom(true);
    }
  }, [isNearBottom]);

  const handleScrollBeginDrag = useCallback(() => {
    userDraggingRef.current = true;
  }, []);

  const handleScrollEndDrag = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    userDraggingRef.current = false;
    if (isNearBottom(event)) {
      setFollowLatest(true);
      setShowScrollToBottom(false);
    }
  }, [isNearBottom]);

  const handleMomentumScrollEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (isNearBottom(event)) {
      setFollowLatest(true);
      setShowScrollToBottom(false);
    }
  }, [isNearBottom]);

  // Scroll to bottom button handler
  const scrollToBottom = useCallback(() => {
    setFollowLatest(true);
    setShowScrollToBottom(false);
    flatListRef.current?.scrollToEnd({ animated: true });
  }, []);

  const handleContentSizeChange = useCallback(() => {
    if (followLatest) {
      flatListRef.current?.scrollToEnd({ animated: false });
    }
  }, [followLatest]);

  // Render item with timestamp logic - P1 Recommendation #6
  const renderItem = useCallback(
    ({ item, index }: { item: EnhancedChatMessage; index: number }) => {
      const previousMessage = index > 0 ? filteredMessages[index - 1] : null;
      const showTimestamp = shouldShowTimestamp(
        item.timestamp,
        previousMessage?.timestamp ?? null,
        5 // 5 minute gap threshold
      );

      return (
        <ChatMessage
          message={item}
          showTimestamp={showTimestamp}
          emoteMap={emoteMap}
          badgeMap={badgeMap}
          onAuthorPress={onAuthorPress}
          onMessageLongPress={onMessageLongPress}
        />
      );
    },
    [filteredMessages, emoteMap, badgeMap, onAuthorPress, onMessageLongPress]
  );

  // Key extractor
  const keyExtractor = useCallback(
    (item: EnhancedChatMessage, index: number) => `${item.id}-${index}`,
    []
  );

  // Loading state
  if (isLoading) {
    return <ChatListSkeleton count={10} />;
  }

  // Empty states
  if (messages.length === 0) {
    return <NoChatEmptyState onAddChannel={onAddChannel || (() => {})} />;
  }

  if (filteredMessages.length === 0 && messages.length > 0) {
    return <NoFilteredMessagesEmptyState onClearFilters={onClearFilters || (() => {})} />;
  }

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={filteredMessages}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        onScroll={handleScroll}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={handleScrollEndDrag}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        onContentSizeChange={handleContentSizeChange}
        scrollEventThrottle={16}
        // P2 Recommendation #14: Performance optimizations
        removeClippedSubviews={true}
        maxToRenderPerBatch={15}
        windowSize={10}
        initialNumToRender={20}
        updateCellsBatchingPeriod={50}
        // Styling
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      {/* Scroll to bottom button */}
      {showScrollToBottom && (
        <Pressable style={styles.scrollToBottomButton} onPress={scrollToBottom}>
          <Text style={styles.scrollToBottomIcon}>↓</Text>
          <Text style={styles.scrollToBottomText}>Go to latest message</Text>
        </Pressable>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  listContent: {
    paddingVertical: spacing.sm,
  },
  scrollToBottomButton: {
    position: 'absolute',
    bottom: spacing.lg,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  scrollToBottomIcon: {
    color: colors.text.primary,
    fontSize: typography.fontSize.md,
    marginRight: spacing.xs,
  },
  scrollToBottomText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
});

export default ChatList;
