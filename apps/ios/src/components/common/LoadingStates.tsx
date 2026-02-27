/**
 * P0 Recommendation #4: Loading states and skeleton UI for all async operations
 */

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, ViewStyle, DimensionValue, Text } from 'react-native';
import { colors, spacing, borderRadius, typography } from '../../constants/theme';

interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

// Animated skeleton placeholder
export function Skeleton({ width = '100%', height = 20, borderRadius: radius = borderRadius.md, style }: SkeletonProps) {
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [animatedValue]);

  const opacity = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.6],
  });

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: colors.border.default,
          opacity,
        },
        style,
      ]}
    />
  );
}

// Message skeleton for chat loading
export function MessageSkeleton() {
  return (
    <View style={styles.messageContainer}>
      <Skeleton width={32} height={32} borderRadius={16} />
      <View style={styles.messageContent}>
        <Skeleton width={100} height={14} style={{ marginBottom: spacing.xs }} />
        <Skeleton width="90%" height={16} />
      </View>
    </View>
  );
}

// Chat list skeleton
export function ChatListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View style={styles.listContainer}>
      {Array.from({ length: count }).map((_, index) => (
        <MessageSkeleton key={index} />
      ))}
    </View>
  );
}

// Tab skeleton
export function TabSkeleton() {
  return (
    <View style={styles.tabContainer}>
      {Array.from({ length: 3 }).map((_, index) => (
        <Skeleton key={index} width={80} height={36} borderRadius={borderRadius.lg} style={styles.tab} />
      ))}
    </View>
  );
}

// Full screen loading
export function FullScreenLoading({ message = 'Loading...' }: { message?: string }) {
  return (
    <View style={styles.fullScreenContainer}>
      <View style={styles.loadingIndicator}>
        <LoadingSpinner size={32} />
        <Text style={styles.loadingText}>{message}</Text>
      </View>
    </View>
  );
}

// Loading spinner
export function LoadingSpinner({ size = 24, color = colors.accent.primary }: { size?: number; color?: string }) {
  const spinValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      })
    );
    animation.start();
    return () => animation.stop();
  }, [spinValue]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View style={{ transform: [{ rotate: spin }] }}>
      <View
        style={[
          styles.spinner,
          {
            width: size,
            height: size,
            borderWidth: size / 8,
            borderColor: color,
            borderTopColor: 'transparent',
          },
        ]}
      />
    </Animated.View>
  );
}

// Button loading state
export function ButtonLoading({ size = 20 }: { size?: number }) {
  return <LoadingSpinner size={size} color={colors.text.primary} />;
}

// OBS connection loading
export function ObsConnectionSkeleton() {
  return (
    <View style={styles.obsContainer}>
      <Skeleton width="100%" height={100} borderRadius={borderRadius.lg} style={{ marginBottom: spacing.md }} />
      <View style={styles.obsControls}>
        <Skeleton width={80} height={44} borderRadius={borderRadius.md} />
        <Skeleton width={80} height={44} borderRadius={borderRadius.md} />
        <Skeleton width={80} height={44} borderRadius={borderRadius.md} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  messageContainer: {
    flexDirection: 'row',
    padding: spacing.md,
    alignItems: 'flex-start',
  },
  messageContent: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  listContainer: {
    flex: 1,
  },
  tabContainer: {
    flexDirection: 'row',
    padding: spacing.sm,
  },
  tab: {
    marginRight: spacing.sm,
  },
  fullScreenContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background.primary,
  },
  loadingIndicator: {
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
    color: colors.text.secondary,
    fontSize: typography.fontSize.md,
  },
  spinner: {
    borderRadius: 9999,
  },
  obsContainer: {
    padding: spacing.lg,
  },
  obsControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
});
