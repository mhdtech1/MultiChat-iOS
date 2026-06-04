import React from 'react';
import { View, Text, Pressable, ScrollView, TextInput, StyleSheet } from 'react-native';
import { colors, spacing, borderRadius, typography } from '../../constants/theme';
import type { ObsAudioInput, ObsSceneItem, ObsStats } from '../../types';

type ObsControllerPanelProps = {
  obsHost: string;
  obsPort: string;
  obsPassword: string;
  obsConnected: boolean;
  obsConnecting: boolean;
  obsStatusText: string;
  obsScenes: string[];
  obsCurrentScene: string;
  obsSceneItems: ObsSceneItem[];
  obsAudioInputs: ObsAudioInput[];
  obsStats: ObsStats;
  obsStreamActive: boolean;
  obsRecordActive: boolean;
  onHostChange: (value: string) => void;
  onPortChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onRefresh: () => void;
  onSwitchScene: (scene: string) => void;
  onToggleStream: () => void;
  onToggleRecord: () => void;
  onToggleSceneItem: (item: ObsSceneItem) => void;
  onToggleMute: (input: ObsAudioInput) => void;
  onAdjustVolume: (input: ObsAudioInput, delta: number) => void;
};

export function ObsControllerPanel({
  obsHost,
  obsPort,
  obsPassword,
  obsConnected,
  obsConnecting,
  obsStatusText,
  obsScenes,
  obsCurrentScene,
  obsSceneItems,
  obsAudioInputs,
  obsStats,
  obsStreamActive,
  obsRecordActive,
  onHostChange,
  onPortChange,
  onPasswordChange,
  onConnect,
  onDisconnect,
  onRefresh,
  onSwitchScene,
  onToggleStream,
  onToggleRecord,
  onToggleSceneItem,
  onToggleMute,
  onAdjustVolume,
}: ObsControllerPanelProps) {
  const status = obsConnected ? 'connected' : obsConnecting ? 'connecting' : 'disconnected';
  const droppedFramePercent =
    obsStats.outputSkippedFrames !== null &&
    obsStats.outputTotalFrames !== null &&
    obsStats.outputTotalFrames > 0
      ? (obsStats.outputSkippedFrames / obsStats.outputTotalFrames) * 100
      : null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>OBS Controller</Text>
      <Text style={styles.hint}>Control one OBS instance remotely via obs-websocket.</Text>

      <View style={styles.row}>
        <TextInput
          value={obsHost}
          onChangeText={onHostChange}
          placeholder="Host"
          placeholderTextColor={colors.text.muted}
          autoCapitalize="none"
          style={[styles.input, styles.grow]}
        />
        <TextInput
          value={obsPort}
          onChangeText={onPortChange}
          placeholder="Port"
          placeholderTextColor={colors.text.muted}
          keyboardType="number-pad"
          style={styles.portInput}
        />
      </View>

      <TextInput
        value={obsPassword}
        onChangeText={onPasswordChange}
        placeholder="OBS password (if set)"
        placeholderTextColor={colors.text.muted}
        secureTextEntry
        style={styles.input}
      />

      <View style={styles.statusRow}>
        <Text style={styles.meta}>Status: {status}</Text>
        <Text style={styles.meta}>{obsStatusText}</Text>
      </View>

      <View style={styles.row}>
        <Pressable
          onPress={obsConnected ? onDisconnect : onConnect}
          style={obsConnected ? styles.warningButton : styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>
            {obsConnected ? 'Disconnect' : obsConnecting ? 'Connecting...' : 'Connect'}
          </Text>
        </Pressable>
        <Pressable onPress={onRefresh} disabled={!obsConnected} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Refresh</Text>
        </Pressable>
      </View>

      {obsConnected ? (
        <>
          <View style={styles.row}>
            <Pressable onPress={onToggleStream} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{obsStreamActive ? 'Stop Stream' : 'Start Stream'}</Text>
            </Pressable>
            <Pressable onPress={onToggleRecord} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{obsRecordActive ? 'Stop Record' : 'Start Record'}</Text>
            </Pressable>
          </View>

          <Text style={styles.sectionLabel}>Scenes</Text>
          {obsScenes.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
              {obsScenes.map((scene) => {
                const active = scene === obsCurrentScene;
                return (
                  <Pressable
                    key={scene}
                    onPress={() => onSwitchScene(scene)}
                    style={[styles.pill, active && styles.pillActive]}
                  >
                    <Text style={[styles.pillText, active && styles.pillTextActive]}>{scene}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : (
            <Text style={styles.empty}>No scenes found yet. Tap Refresh.</Text>
          )}

          <Text style={styles.sectionLabel}>Scene Sources</Text>
          {obsSceneItems.length > 0 ? (
            <View style={styles.listBlock}>
              {obsSceneItems.map((item) => (
                <View key={`${item.sceneItemId}-${item.sourceName}`} style={styles.listRow}>
                  <Text style={styles.listLabel}>{item.sourceName}</Text>
                  <Pressable
                    onPress={() => onToggleSceneItem(item)}
                    style={item.enabled ? styles.primaryButton : styles.warningButton}
                  >
                    <Text style={styles.primaryButtonText}>{item.enabled ? 'Visible' : 'Hidden'}</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.empty}>No scene sources for the current scene.</Text>
          )}

          <Text style={styles.sectionLabel}>Audio Inputs</Text>
          {obsAudioInputs.length > 0 ? (
            <View style={styles.listBlock}>
              {obsAudioInputs.map((input) => (
                <View key={input.inputName} style={styles.audioRow}>
                  <View>
                    <Text style={styles.listLabel}>{input.inputName}</Text>
                    <Text style={styles.meta}>Volume: {(input.volumeMul * 100).toFixed(0)}%</Text>
                  </View>
                  <View style={styles.row}>
                    <Pressable onPress={() => onAdjustVolume(input, -0.1)} style={styles.secondaryButton}>
                      <Text style={styles.secondaryButtonText}>-10%</Text>
                    </Pressable>
                    <Pressable onPress={() => onAdjustVolume(input, 0.1)} style={styles.secondaryButton}>
                      <Text style={styles.secondaryButtonText}>+10%</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => onToggleMute(input)}
                      style={input.muted ? styles.warningButton : styles.primaryButton}
                    >
                      <Text style={styles.primaryButtonText}>{input.muted ? 'Muted' : 'Live'}</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.empty}>No audio inputs found.</Text>
          )}

          <Text style={styles.sectionLabel}>Live Stats</Text>
          <View style={styles.statsRow}>
            <Text style={styles.meta}>CPU: {obsStats.cpuUsage !== null ? `${obsStats.cpuUsage.toFixed(1)}%` : 'n/a'}</Text>
            <Text style={styles.meta}>FPS: {obsStats.activeFps !== null ? obsStats.activeFps.toFixed(1) : 'n/a'}</Text>
            <Text style={styles.meta}>
              Dropped: {droppedFramePercent !== null ? `${droppedFramePercent.toFixed(2)}%` : 'n/a'}
            </Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.background.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  title: { color: colors.text.primary, fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.bold },
  hint: { color: colors.text.muted, fontSize: typography.fontSize.xs },
  sectionLabel: { color: colors.text.secondary, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between' },
  meta: { color: colors.text.muted, fontSize: typography.fontSize.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background.secondary,
    color: colors.text.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontSize: typography.fontSize.sm,
  },
  portInput: { width: 90, borderWidth: 1, borderColor: colors.border.default, borderRadius: borderRadius.md, backgroundColor: colors.background.secondary, color: colors.text.primary, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  grow: { flex: 1 },
  pillRow: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.xs },
  pill: { borderWidth: 1, borderColor: colors.border.default, borderRadius: borderRadius.full, paddingVertical: 5, paddingHorizontal: 10 },
  pillActive: { borderColor: colors.status.success, backgroundColor: '#163a31' },
  pillText: { color: colors.text.secondary, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium },
  pillTextActive: { color: '#dcfff1' },
  listBlock: { borderWidth: 1, borderColor: colors.border.default, borderRadius: borderRadius.md, backgroundColor: colors.background.secondary, padding: spacing.sm, gap: spacing.sm },
  listRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  listLabel: { color: colors.text.primary, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, flex: 1 },
  audioRow: { borderWidth: 1, borderColor: colors.border.default, borderRadius: borderRadius.md, padding: spacing.sm, gap: spacing.sm },
  statsRow: { borderWidth: 1, borderColor: colors.border.default, borderRadius: borderRadius.md, padding: spacing.sm, flexDirection: 'row', justifyContent: 'space-between' },
  empty: { color: colors.text.muted, fontSize: typography.fontSize.sm },
  primaryButton: { borderRadius: borderRadius.md, backgroundColor: colors.accent.primary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  secondaryButton: { borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border.default, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  warningButton: { borderRadius: borderRadius.md, backgroundColor: colors.status.error, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  primaryButtonText: { color: colors.text.primary, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold },
  secondaryButtonText: { color: colors.text.secondary, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium },
});
