/**
 * P2 Recommendation #11: Message filtering (by platform, user, keywords)
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Switch,
  Image,
  Modal,
} from 'react-native';
import { colors, spacing, borderRadius, typography, shadows, accessibility } from '../../constants/theme';
import type { MessageFilter, PlatformId } from '../../types';
import { PLATFORM_LOGOS, PLATFORM_NAMES, PLATFORM_COLORS } from '../../constants/config';

interface FilterSettingsProps {
  isVisible: boolean;
  onClose: () => void;
  filter: MessageFilter;
  onFilterChange: (filter: MessageFilter) => void;
}

export function FilterSettings({
  isVisible,
  onClose,
  filter,
  onFilterChange,
}: FilterSettingsProps) {
  const [keywordInput, setKeywordInput] = useState('');
  const [userInput, setUserInput] = useState('');

  const togglePlatform = (platform: PlatformId) => {
    const newPlatforms = filter.platforms.includes(platform)
      ? filter.platforms.filter((p) => p !== platform)
      : [...filter.platforms, platform];
    onFilterChange({ ...filter, platforms: newPlatforms });
  };

  const addKeyword = () => {
    if (keywordInput.trim() && !filter.keywords.includes(keywordInput.trim().toLowerCase())) {
      onFilterChange({
        ...filter,
        keywords: [...filter.keywords, keywordInput.trim().toLowerCase()],
      });
      setKeywordInput('');
    }
  };

  const removeKeyword = (keyword: string) => {
    onFilterChange({
      ...filter,
      keywords: filter.keywords.filter((k) => k !== keyword),
    });
  };

  const addUser = () => {
    if (userInput.trim() && !filter.users.includes(userInput.trim().toLowerCase())) {
      onFilterChange({
        ...filter,
        users: [...filter.users, userInput.trim().toLowerCase()],
      });
      setUserInput('');
    }
  };

  const removeUser = (user: string) => {
    onFilterChange({
      ...filter,
      users: filter.users.filter((u) => u !== user),
    });
  };

  const resetFilters = () => {
    onFilterChange({
      platforms: ['twitch', 'kick', 'youtube'],
      users: [],
      keywords: [],
      showSubscriptions: true,
      showRaids: true,
      showSuperChats: true,
      showBits: true,
    });
  };

  const activeFilterCount = 
    (filter.platforms.length < 3 ? 1 : 0) +
    (filter.users.length > 0 ? 1 : 0) +
    (filter.keywords.length > 0 ? 1 : 0) +
    (!filter.showSubscriptions ? 1 : 0) +
    (!filter.showRaids ? 1 : 0) +
    (!filter.showSuperChats ? 1 : 0) +
    (!filter.showBits ? 1 : 0);

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </Pressable>
          <Text style={styles.title}>Message Filters</Text>
          {activeFilterCount > 0 && (
            <Pressable onPress={resetFilters} style={styles.resetButton}>
              <Text style={styles.resetButtonText}>Reset</Text>
            </Pressable>
          )}
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {/* Active filters summary */}
          {activeFilterCount > 0 && (
            <View style={styles.activeFiltersBar}>
              <Text style={styles.activeFiltersText}>
                {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active
              </Text>
            </View>
          )}

          {/* Platform Filters */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Platforms</Text>
            <Text style={styles.sectionDescription}>
              Only show messages from selected platforms
            </Text>
            <View style={styles.platformGrid}>
              {(['twitch', 'kick', 'youtube'] as PlatformId[]).map((platform) => (
                <Pressable
                  key={platform}
                  style={[
                    styles.platformChip,
                    filter.platforms.includes(platform) && {
                      backgroundColor: PLATFORM_COLORS[platform] + '30',
                      borderColor: PLATFORM_COLORS[platform],
                    },
                  ]}
                  onPress={() => togglePlatform(platform)}
                >
                  <Image source={{ uri: PLATFORM_LOGOS[platform] }} style={styles.platformLogo} />
                  <Text
                    style={[
                      styles.platformName,
                      filter.platforms.includes(platform) && { color: PLATFORM_COLORS[platform] },
                    ]}
                  >
                    {PLATFORM_NAMES[platform]}
                  </Text>
                  {filter.platforms.includes(platform) && (
                    <Text style={[styles.checkmark, { color: PLATFORM_COLORS[platform] }]}>✓</Text>
                  )}
                </Pressable>
              ))}
            </View>
          </View>

          {/* User Filters */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Users</Text>
            <Text style={styles.sectionDescription}>
              Only show messages from specific users (leave empty for all)
            </Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.textInput}
                placeholder="Enter username"
                placeholderTextColor={colors.text.muted}
                value={userInput}
                onChangeText={setUserInput}
                onSubmitEditing={addUser}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable style={styles.addButton} onPress={addUser}>
                <Text style={styles.addButtonText}>Add</Text>
              </Pressable>
            </View>
            {filter.users.length > 0 && (
              <View style={styles.chipContainer}>
                {filter.users.map((user) => (
                  <View key={user} style={styles.chip}>
                    <Text style={styles.chipText}>{user}</Text>
                    <Pressable onPress={() => removeUser(user)} style={styles.chipRemove}>
                      <Text style={styles.chipRemoveText}>✕</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Keyword Filters */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Keywords</Text>
            <Text style={styles.sectionDescription}>
              Only show messages containing these keywords (leave empty for all)
            </Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.textInput}
                placeholder="Enter keyword"
                placeholderTextColor={colors.text.muted}
                value={keywordInput}
                onChangeText={setKeywordInput}
                onSubmitEditing={addKeyword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable style={styles.addButton} onPress={addKeyword}>
                <Text style={styles.addButtonText}>Add</Text>
              </Pressable>
            </View>
            {filter.keywords.length > 0 && (
              <View style={styles.chipContainer}>
                {filter.keywords.map((keyword) => (
                  <View key={keyword} style={styles.chip}>
                    <Text style={styles.chipText}>{keyword}</Text>
                    <Pressable onPress={() => removeKeyword(keyword)} style={styles.chipRemove}>
                      <Text style={styles.chipRemoveText}>✕</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Message Type Filters */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Message Types</Text>
            <Text style={styles.sectionDescription}>
              Show or hide special message types
            </Text>
            
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleIcon}>⭐</Text>
                <Text style={styles.toggleLabel}>Subscriptions</Text>
              </View>
              <Switch
                value={filter.showSubscriptions}
                onValueChange={(v) => onFilterChange({ ...filter, showSubscriptions: v })}
                trackColor={{ false: colors.border.default, true: colors.accent.primary }}
                thumbColor={colors.text.primary}
              />
            </View>

            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleIcon}>⚡</Text>
                <Text style={styles.toggleLabel}>Raids</Text>
              </View>
              <Switch
                value={filter.showRaids}
                onValueChange={(v) => onFilterChange({ ...filter, showRaids: v })}
                trackColor={{ false: colors.border.default, true: colors.accent.primary }}
                thumbColor={colors.text.primary}
              />
            </View>

            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleIcon}>💵</Text>
                <Text style={styles.toggleLabel}>Super Chats</Text>
              </View>
              <Switch
                value={filter.showSuperChats}
                onValueChange={(v) => onFilterChange({ ...filter, showSuperChats: v })}
                trackColor={{ false: colors.border.default, true: colors.accent.primary }}
                thumbColor={colors.text.primary}
              />
            </View>

            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleIcon}>💎</Text>
                <Text style={styles.toggleLabel}>Bits</Text>
              </View>
              <Switch
                value={filter.showBits}
                onValueChange={(v) => onFilterChange({ ...filter, showBits: v })}
                trackColor={{ false: colors.border.default, true: colors.accent.primary }}
                thumbColor={colors.text.primary}
              />
            </View>
          </View>
        </ScrollView>

        {/* Apply button */}
        <View style={styles.footer}>
          <Pressable style={styles.applyButton} onPress={onClose}>
            <Text style={styles.applyButtonText}>Apply Filters</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.xl,
  },
  title: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  resetButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  resetButtonText: {
    color: colors.accent.primary,
    fontSize: typography.fontSize.md,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing.lg,
  },
  activeFiltersBar: {
    backgroundColor: colors.accent.primary + '20',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
  },
  activeFiltersText: {
    color: colors.accent.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  sectionDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.text.muted,
    marginBottom: spacing.md,
  },
  platformGrid: {
    gap: spacing.sm,
  },
  platformChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.card,
    borderWidth: 2,
    borderColor: colors.border.default,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  platformLogo: {
    width: 24,
    height: 24,
    marginRight: spacing.sm,
  },
  platformName: {
    flex: 1,
    fontSize: typography.fontSize.md,
    color: colors.text.primary,
  },
  checkmark: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  textInput: {
    flex: 1,
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.fontSize.md,
    color: colors.text.primary,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  addButton: {
    backgroundColor: colors.accent.primary,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
  },
  addButtonText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.elevated,
    borderRadius: borderRadius.full,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
  },
  chipText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.sm,
    marginRight: spacing.xs,
  },
  chipRemove: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipRemoveText: {
    color: colors.text.muted,
    fontSize: typography.fontSize.xs,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
    minHeight: accessibility.minTouchTarget,
  },
  toggleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleIcon: {
    fontSize: 20,
    marginRight: spacing.sm,
  },
  toggleLabel: {
    fontSize: typography.fontSize.md,
    color: colors.text.primary,
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border.default,
  },
  applyButton: {
    backgroundColor: colors.accent.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    ...shadows.md,
  },
  applyButtonText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
});

export default FilterSettings;
