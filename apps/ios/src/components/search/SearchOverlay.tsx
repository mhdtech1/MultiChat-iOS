/**
 * P1 Recommendation #8: Search functionality across all chats
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  FlatList,
  Keyboard,
  Animated,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography, shadows } from '../../constants/theme';
import type { SearchResult, PlatformId } from '../../types';
import { PLATFORM_LOGOS, PLATFORM_NAMES, PLATFORM_COLORS } from '../../constants/config';
import { formatTimestamp, getMessageAuthor, getMessageAuthorColor } from '../../utils/helpers';
import { NoSearchResultsEmptyState } from '../common/EmptyStates';
import { LoadingSpinner } from '../common/LoadingStates';

interface SearchOverlayProps {
  isVisible: boolean;
  onClose: () => void;
  onSearch: (query: string) => void;
  results: SearchResult[];
  isSearching: boolean;
  onResultPress: (result: SearchResult) => void;
  query: string;
}

export function SearchOverlay({
  isVisible,
  onClose,
  onSearch,
  results,
  isSearching,
  onResultPress,
  query,
}: SearchOverlayProps) {
  const [localQuery, setLocalQuery] = useState(query);
  const inputRef = useRef<TextInput>(null);
  const slideAnim = useRef(new Animated.Value(-100)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (isVisible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 50,
          friction: 10,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        inputRef.current?.focus();
      });
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -100,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isVisible, slideAnim, fadeAnim]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      if (localQuery.trim()) {
        onSearch(localQuery);
      }
    }, 300);
    return () => clearTimeout(debounce);
  }, [localQuery, onSearch]);

  const handleClear = () => {
    setLocalQuery('');
    onSearch('');
  };

  if (!isVisible) return null;

  return (
    <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
      <Animated.View
        style={[
          styles.container,
          {
            transform: [{ translateY: slideAnim }],
            paddingTop: Math.max(insets.top, spacing.sm),
          },
        ]}
      >
        {/* Search header */}
        <View style={styles.header}>
          <View style={styles.searchInputContainer}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
              placeholder="Search messages..."
              placeholderTextColor={colors.text.muted}
              value={localQuery}
              onChangeText={setLocalQuery}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {localQuery.length > 0 && (
              <Pressable onPress={handleClear} style={styles.clearButton}>
                <Text style={styles.clearButtonText}>✕</Text>
              </Pressable>
            )}
          </View>
          <Pressable onPress={onClose} style={styles.cancelButton}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
        </View>

        {/* Filter chips */}
        <View style={styles.filterChips}>
          {(['twitch', 'kick', 'youtube'] as PlatformId[]).map((platform) => (
            <Pressable key={platform} style={styles.filterChip}>
              <Image source={{ uri: PLATFORM_LOGOS[platform] }} style={styles.filterChipLogo} />
              <Text style={styles.filterChipText}>{PLATFORM_NAMES[platform]}</Text>
            </Pressable>
          ))}
        </View>

        {/* Results */}
        <View style={styles.results}>
          {isSearching ? (
            <View style={styles.loadingContainer}>
              <LoadingSpinner size={32} />
              <Text style={styles.loadingText}>Searching...</Text>
            </View>
          ) : localQuery.trim() && results.length === 0 ? (
            <NoSearchResultsEmptyState query={localQuery} onClearSearch={handleClear} />
          ) : results.length > 0 ? (
            <FlatList
              data={results}
              keyExtractor={(item, index) => `${item.sourceId}-${item.message.id}-${index}`}
              renderItem={({ item }) => (
                <SearchResultItem result={item} onPress={() => onResultPress(item)} query={localQuery} />
              )}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.resultsList}
            />
          ) : (
            <View style={styles.promptContainer}>
              <Text style={styles.promptIcon}>🔍</Text>
              <Text style={styles.promptText}>Search across all your chats</Text>
              <Text style={styles.promptSubtext}>
                Find messages by username, keywords, or content
              </Text>
            </View>
          )}
        </View>
      </Animated.View>
    </Animated.View>
  );
}

interface SearchResultItemProps {
  result: SearchResult;
  onPress: () => void;
  query: string;
}

function SearchResultItem({ result, onPress, query }: SearchResultItemProps) {
  const { message } = result;
  const platform = message.platform as PlatformId;
  const author = getMessageAuthor(message);
  const authorColor = getMessageAuthorColor(message);

  // Highlight matching text
  const highlightText = (text: string) => {
    if (!query.trim()) return text;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <Text key={i} style={styles.highlight}>
          {part}
        </Text>
      ) : (
        part
      )
    );
  };

  return (
    <Pressable style={styles.resultItem} onPress={onPress}>
      <View style={styles.resultHeader}>
        <View style={[styles.platformIndicator, { backgroundColor: PLATFORM_COLORS[platform] }]} />
        <Text style={[styles.resultAuthor, { color: authorColor || colors.text.primary }]}>
          {highlightText(author)}
        </Text>
        <Text style={styles.resultTime}>{formatTimestamp(message.timestamp)}</Text>
      </View>
      <Text style={styles.resultMessage} numberOfLines={2}>
        {highlightText(message.message)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
    zIndex: 100,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  searchInputContainer: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: spacing.md,
    fontSize: typography.fontSize.md,
    color: colors.text.primary,
  },
  clearButton: {
    padding: spacing.xs,
  },
  clearButtonText: {
    color: colors.text.muted,
    fontSize: typography.fontSize.md,
  },
  cancelButton: {
    flexShrink: 0,
    marginLeft: spacing.md,
    padding: spacing.sm,
  },
  cancelButtonText: {
    color: colors.accent.primary,
    fontSize: typography.fontSize.md,
  },
  filterChips: {
    flexDirection: 'row',
    padding: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.card,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  filterChipLogo: {
    width: 16,
    height: 16,
    marginRight: spacing.xs,
  },
  filterChipText: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.xs,
  },
  results: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
    color: colors.text.secondary,
    fontSize: typography.fontSize.md,
  },
  promptContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  promptIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  promptText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.medium,
    marginBottom: spacing.sm,
  },
  promptSubtext: {
    color: colors.text.muted,
    fontSize: typography.fontSize.sm,
    textAlign: 'center',
  },
  resultsList: {
    padding: spacing.md,
  },
  resultItem: {
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  platformIndicator: {
    width: 4,
    height: 14,
    borderRadius: 2,
    marginRight: spacing.sm,
  },
  resultAuthor: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    flex: 1,
  },
  resultTime: {
    color: colors.text.muted,
    fontSize: typography.fontSize.xs,
  },
  resultMessage: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
    lineHeight: 20,
  },
  highlight: {
    backgroundColor: colors.accent.primary + '40',
    color: colors.text.primary,
  },
});
