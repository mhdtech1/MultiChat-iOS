import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChatSource } from '../types';
import { TWITCH_CLIENT_ID } from '../constants/config';
import {
  fetchGlobalEmotes,
  fetchTwitchChannelEmotes,
  resolveTwitchUserId,
  type EmoteMap,
} from '../services/emotes';

const channelKey = (source: Pick<ChatSource, 'platform' | 'channel'>) =>
  `${source.platform}:${source.channel}`;

/**
 * Builds the emote name -> url map used by the chat renderer.
 *
 * - Global 7TV / BetterTTV / Kick emote sets load once on mount.
 * - For each active Twitch channel we resolve its numeric user id (only when
 *   signed in to Twitch) and fetch the channel's 7TV + BetterTTV emotes.
 * - Per-channel results are cached so switching tabs never refetches, and the
 *   cache is rebuilt if the Twitch sign-in state changes (so channel emotes can
 *   appear after a fresh sign-in).
 *
 * Native Twitch (IRC emote tags) and Kick (`[emote:id:name]`) emotes are handled
 * at render time and need no fetching, so chat in real channels shows emotes
 * even before/without any channel fetch succeeding.
 */
export function useEmoteMaps(
  activeChatSources: ChatSource[],
  twitchToken: string
): EmoteMap {
  const [globalEmotes, setGlobalEmotes] = useState<EmoteMap>({});
  const [channelEmotes, setChannelEmotes] = useState<Record<string, EmoteMap>>({});
  const inFlightRef = useRef<Set<string>>(new Set());

  const hasTwitchAuth = Boolean(twitchToken.trim());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const map = await fetchGlobalEmotes();
      if (!cancelled && Object.keys(map).length > 0) {
        setGlobalEmotes(map);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Reset channel caches when Twitch sign-in state flips so channel emotes can
  // be (re)fetched with — or without — auth.
  useEffect(() => {
    inFlightRef.current.clear();
    setChannelEmotes({});
  }, [hasTwitchAuth]);

  useEffect(() => {
    let cancelled = false;

    for (const source of activeChatSources) {
      if (source.platform !== 'twitch') continue;
      const key = channelKey(source);
      if (channelEmotes[key] || inFlightRef.current.has(key)) continue;
      inFlightRef.current.add(key);

      void (async () => {
        let map: EmoteMap = {};
        try {
          const userId = hasTwitchAuth
            ? await resolveTwitchUserId(source.channel, TWITCH_CLIENT_ID, twitchToken)
            : '';
          if (userId) {
            map = await fetchTwitchChannelEmotes(userId);
          }
        } catch {
          map = {};
        }
        if (cancelled) return;
        setChannelEmotes((previous) => ({ ...previous, [key]: map }));
      })();
    }

    return () => {
      cancelled = true;
    };
  }, [activeChatSources, channelEmotes, hasTwitchAuth, twitchToken]);

  return useMemo(() => {
    let merged: EmoteMap = { ...globalEmotes };
    for (const source of activeChatSources) {
      const map = channelEmotes[channelKey(source)];
      if (map) merged = { ...merged, ...map };
    }
    return merged;
  }, [globalEmotes, channelEmotes, activeChatSources]);
}
