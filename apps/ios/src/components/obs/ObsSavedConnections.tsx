import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, StyleSheet } from 'react-native';
import { colors, spacing, borderRadius, typography } from '../../constants/theme';
import type { ObsSavedConnection } from '../../types';
import { loadObsConnections, saveObsConnections } from '../../utils/storage';
import { makeId } from '../../utils/helpers';

type ObsSavedConnectionsProps = {
  currentHost: string;
  currentPort: string;
  currentPassword: string;
  onApply: (config: { host: string; port: string; password: string }) => void;
  onConnect: (config?: { host: string; port: string; password: string }) => void;
  showNotice: (message: string) => void;
};

/**
 * Saved OBS connection manager. Persists nickname + host/port/password via the
 * storage helpers and offers a quick-connect list. Selecting a saved connection
 * applies its config and immediately connects.
 */
export function ObsSavedConnections({
  currentHost,
  currentPort,
  currentPassword,
  onApply,
  onConnect,
  showNotice,
}: ObsSavedConnectionsProps) {
  const [connections, setConnections] = useState<ObsSavedConnection[]>([]);
  const [nickname, setNickname] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const saved = await loadObsConnections();
      if (!cancelled) setConnections(saved);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(
    async (next: ObsSavedConnection[]) => {
      setConnections(next);
      const ok = await saveObsConnections(next);
      if (!ok) showNotice('Could not save OBS connections.');
    },
    [showNotice]
  );

  const saveCurrent = useCallback(() => {
    const host = currentHost.trim();
    const port = currentPort.trim();
    if (!host || !port) {
      showNotice('Enter OBS host and port before saving.');
      return;
    }

    const label = nickname.trim() || host;
    const existingIndex = connections.findIndex(
      (entry) => entry.host === host && entry.port === port
    );

    const entry: ObsSavedConnection = {
      id: existingIndex >= 0 ? connections[existingIndex].id : makeId(),
      nickname: label,
      name: label,
      host,
      port,
      password: currentPassword.trim() ? currentPassword : undefined,
    };

    const next =
      existingIndex >= 0
        ? connections.map((candidate, index) => (index === existingIndex ? entry : candidate))
        : [...connections, entry];

    void persist(next);
    setNickname('');
    showNotice(existingIndex >= 0 ? 'Updated saved connection.' : 'Saved OBS connection.');
  }, [connections, currentHost, currentPassword, currentPort, nickname, persist, showNotice]);

  const selectConnection = useCallback(
    (connection: ObsSavedConnection) => {
      const config = {
        host: connection.host,
        port: connection.port,
        password: connection.password ?? '',
      };
      onApply(config);
      onConnect(config);
    },
    [onApply, onConnect]
  );

  const deleteConnection = useCallback(
    (id: string) => {
      void persist(connections.filter((entry) => entry.id !== id));
    },
    [connections, persist]
  );

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Saved Connections</Text>
      {connections.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.list}>
          {connections.map((connection) => (
            <View key={connection.id} style={styles.chip}>
              <Pressable onPress={() => selectConnection(connection)} style={styles.chipSelect}>
                <Text style={styles.chipLabel} numberOfLines={1}>
                  {connection.nickname || connection.host}
                </Text>
                <Text style={styles.chipMeta} numberOfLines={1}>
                  {connection.host}:{connection.port}
                </Text>
              </Pressable>
              <Pressable onPress={() => deleteConnection(connection.id)} style={styles.chipDelete}>
                <Text style={styles.chipDeleteText}>×</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : (
        <Text style={styles.empty}>No saved connections yet. Save the current host below.</Text>
      )}

      <View style={styles.saveRow}>
        <TextInput
          value={nickname}
          onChangeText={setNickname}
          placeholder="Nickname (optional)"
          placeholderTextColor={colors.text.muted}
          autoCapitalize="none"
          style={[styles.input, styles.grow]}
        />
        <Pressable onPress={saveCurrent} style={styles.saveButton}>
          <Text style={styles.saveButtonText}>Save current</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.background.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  title: { color: colors.text.primary, fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.bold },
  empty: { color: colors.text.muted, fontSize: typography.fontSize.xs },
  list: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background.secondary,
    minWidth: 150,
  },
  chipSelect: { flex: 1, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  chipLabel: { color: colors.text.primary, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold },
  chipMeta: { color: colors.text.muted, fontSize: 10 },
  chipDelete: { paddingHorizontal: spacing.sm, justifyContent: 'center' },
  chipDeleteText: { color: colors.text.muted, fontSize: 18 },
  saveRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
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
  grow: { flex: 1 },
  saveButton: {
    borderRadius: borderRadius.md,
    backgroundColor: colors.accent.primary,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  saveButtonText: { color: colors.text.primary, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.bold },
});

export default ObsSavedConnections;
