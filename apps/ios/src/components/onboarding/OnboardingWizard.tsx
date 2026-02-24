/**
 * P0 Recommendation #1: First-run onboarding flow (3-step wizard)
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Dimensions,
  Image,
  TextInput,
  ScrollView,
} from 'react-native';
import { colors, spacing, borderRadius, typography, shadows } from '../../constants/theme';
import type { PlatformId } from '../../types';
import { PLATFORM_LOGOS, PLATFORM_NAMES, PLATFORM_COLORS } from '../../constants/config';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface OnboardingWizardProps {
  onComplete: (platform: PlatformId, channel: string) => void;
  onSkip: () => void;
}

type Step = 'welcome' | 'platform' | 'channel' | 'success';

export function OnboardingWizard({ onComplete, onSkip }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState<Step>('welcome');
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformId>('twitch');
  const [channelName, setChannelName] = useState('');
  const slideAnim = useRef(new Animated.Value(0)).current;

  const steps: Step[] = ['welcome', 'platform', 'channel', 'success'];
  const currentIndex = steps.indexOf(currentStep);

  const animateToStep = (step: Step) => {
    const toIndex = steps.indexOf(step);
    Animated.spring(slideAnim, {
      toValue: -toIndex * SCREEN_WIDTH,
      useNativeDriver: true,
      tension: 50,
      friction: 10,
    }).start();
    setCurrentStep(step);
  };

  const handleNext = () => {
    if (currentStep === 'welcome') {
      animateToStep('platform');
    } else if (currentStep === 'platform') {
      animateToStep('channel');
    } else if (currentStep === 'channel' && channelName.trim()) {
      animateToStep('success');
    }
  };

  const handleBack = () => {
    if (currentStep === 'platform') {
      animateToStep('welcome');
    } else if (currentStep === 'channel') {
      animateToStep('platform');
    }
  };

  const handleFinish = () => {
    onComplete(selectedPlatform, channelName.trim());
  };

  return (
    <View style={styles.container}>
      {/* Progress indicator */}
      <View style={styles.progressContainer}>
        {steps.slice(0, -1).map((step, index) => (
          <View
            key={step}
            style={[
              styles.progressDot,
              index <= currentIndex && styles.progressDotActive,
            ]}
          />
        ))}
      </View>

      {/* Skip button */}
      {currentStep !== 'success' && (
        <Pressable style={styles.skipButton} onPress={onSkip}>
          <Text style={styles.skipButtonText}>Skip</Text>
        </Pressable>
      )}

      {/* Slides */}
      <Animated.View
        style={[
          styles.slidesContainer,
          { transform: [{ translateX: slideAnim }] },
        ]}
      >
        {/* Welcome Step */}
        <View style={styles.slide}>
          <View style={styles.slideContent}>
            <Text style={styles.welcomeEmoji}>💬</Text>
            <Text style={styles.title}>Welcome to MultiChat</Text>
            <Text style={styles.subtitle}>
              Monitor all your streaming chats in one place. Connect to Twitch, Kick, and YouTube simultaneously.
            </Text>
            <View style={styles.features}>
              <FeatureItem icon="🌐" text="Multi-platform chat aggregation" />
              <FeatureItem icon="🎥" text="OBS remote control" />
              <FeatureItem icon="✨" text="7TV emote support" />
            </View>
          </View>
          <Pressable style={styles.primaryButton} onPress={handleNext}>
            <Text style={styles.primaryButtonText}>Get Started</Text>
          </Pressable>
        </View>

        {/* Platform Selection Step */}
        <View style={styles.slide}>
          <View style={styles.slideContent}>
            <Text style={styles.stepTitle}>Choose a Platform</Text>
            <Text style={styles.stepSubtitle}>
              Select which platform you'd like to add first. You can add more later.
            </Text>
            <View style={styles.platformGrid}>
              {(['twitch', 'kick', 'youtube'] as PlatformId[]).map((platform) => (
                <Pressable
                  key={platform}
                  style={[
                    styles.platformCard,
                    selectedPlatform === platform && {
                      borderColor: PLATFORM_COLORS[platform],
                      backgroundColor: PLATFORM_COLORS[platform] + '15',
                    },
                  ]}
                  onPress={() => setSelectedPlatform(platform)}
                >
                  <Image source={{ uri: PLATFORM_LOGOS[platform] }} style={styles.platformLogo} />
                  <Text style={styles.platformName}>{PLATFORM_NAMES[platform]}</Text>
                  {selectedPlatform === platform && (
                    <View style={[styles.checkmark, { backgroundColor: PLATFORM_COLORS[platform] }]}>
                      <Text style={styles.checkmarkText}>✓</Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.buttonRow}>
            <Pressable style={styles.backButton} onPress={handleBack}>
              <Text style={styles.backButtonText}>Back</Text>
            </Pressable>
            <Pressable style={styles.primaryButton} onPress={handleNext}>
              <Text style={styles.primaryButtonText}>Continue</Text>
            </Pressable>
          </View>
        </View>

        {/* Channel Input Step */}
        <View style={styles.slide}>
          <View style={styles.slideContent}>
            <Image source={{ uri: PLATFORM_LOGOS[selectedPlatform] }} style={styles.selectedPlatformLogo} />
            <Text style={styles.stepTitle}>Enter Channel Name</Text>
            <Text style={styles.stepSubtitle}>
              {selectedPlatform === 'youtube'
                ? 'Enter the YouTube channel handle or video ID'
                : `Enter the ${PLATFORM_NAMES[selectedPlatform]} channel name`}
            </Text>
            <TextInput
              style={[
                styles.channelInput,
                { borderColor: channelName.trim() ? PLATFORM_COLORS[selectedPlatform] : colors.border.default },
              ]}
              placeholder={`e.g., ${selectedPlatform === 'twitch' ? 'xqc' : selectedPlatform === 'kick' ? 'xqc' : '@mkbhd'}`}
              placeholderTextColor={colors.text.muted}
              value={channelName}
              onChangeText={setChannelName}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.hint}>
              {selectedPlatform === 'twitch' && 'Just enter the username, no URLs needed'}
              {selectedPlatform === 'kick' && 'Enter the channel name as it appears in the URL'}
              {selectedPlatform === 'youtube' && 'Use @handle or the video ID for live streams'}
            </Text>
          </View>
          <View style={styles.buttonRow}>
            <Pressable style={styles.backButton} onPress={handleBack}>
              <Text style={styles.backButtonText}>Back</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryButton, !channelName.trim() && styles.primaryButtonDisabled]}
              onPress={handleNext}
              disabled={!channelName.trim()}
            >
              <Text style={styles.primaryButtonText}>Add Channel</Text>
            </Pressable>
          </View>
        </View>

        {/* Success Step */}
        <View style={styles.slide}>
          <View style={styles.slideContent}>
            <Text style={styles.successEmoji}>🎉</Text>
            <Text style={styles.title}>You're All Set!</Text>
            <Text style={styles.subtitle}>
              Your {PLATFORM_NAMES[selectedPlatform]} chat for {channelName} is ready.
            </Text>
            <View style={styles.successCard}>
              <Image source={{ uri: PLATFORM_LOGOS[selectedPlatform] }} style={styles.successLogo} />
              <View>
                <Text style={styles.successChannel}>{channelName}</Text>
                <Text style={styles.successPlatform}>{PLATFORM_NAMES[selectedPlatform]}</Text>
              </View>
            </View>
            <Text style={styles.tipText}>
              Tip: You can add more channels and create merged views from the Add tab.
            </Text>
          </View>
          <Pressable style={styles.primaryButton} onPress={handleFinish}>
            <Text style={styles.primaryButtonText}>Start Chatting</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

function FeatureItem({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.featureItem}>
      <Text style={styles.featureIcon}>{icon}</Text>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingTop: spacing.xl,
    gap: spacing.sm,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border.default,
  },
  progressDotActive: {
    backgroundColor: colors.accent.primary,
    width: 24,
  },
  skipButton: {
    position: 'absolute',
    top: spacing.xl,
    right: spacing.lg,
    padding: spacing.sm,
    zIndex: 10,
  },
  skipButtonText: {
    color: colors.text.muted,
    fontSize: typography.fontSize.md,
  },
  slidesContainer: {
    flex: 1,
    flexDirection: 'row',
    width: SCREEN_WIDTH * 4,
  },
  slide: {
    width: SCREEN_WIDTH,
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    justifyContent: 'space-between',
  },
  slideContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  welcomeEmoji: {
    fontSize: 72,
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: typography.fontSize.xxxl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  subtitle: {
    fontSize: typography.fontSize.md,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.xl,
  },
  features: {
    gap: spacing.md,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  featureIcon: {
    fontSize: 24,
  },
  featureText: {
    fontSize: typography.fontSize.md,
    color: colors.text.primary,
  },
  stepTitle: {
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  stepSubtitle: {
    fontSize: typography.fontSize.md,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  platformGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  platformCard: {
    width: 100,
    height: 120,
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: colors.border.default,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.sm,
  },
  platformLogo: {
    width: 40,
    height: 40,
    marginBottom: spacing.sm,
  },
  platformName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
  },
  checkmark: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmarkText: {
    color: colors.text.primary,
    fontSize: 12,
    fontWeight: typography.fontWeight.bold,
  },
  selectedPlatformLogo: {
    width: 60,
    height: 60,
    marginBottom: spacing.lg,
  },
  channelInput: {
    width: '100%',
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: typography.fontSize.lg,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  hint: {
    fontSize: typography.fontSize.sm,
    color: colors.text.muted,
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: colors.accent.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    ...shadows.md,
  },
  primaryButtonDisabled: {
    backgroundColor: colors.border.default,
  },
  primaryButtonText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  backButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.background.elevated,
  },
  backButtonText: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.md,
  },
  successEmoji: {
    fontSize: 72,
    marginBottom: spacing.lg,
  },
  successCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.xl,
    ...shadows.md,
  },
  successLogo: {
    width: 40,
    height: 40,
  },
  successChannel: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  successPlatform: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  tipText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.muted,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
