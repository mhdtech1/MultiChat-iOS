import { useEffect, useState } from 'react';
import { TWITCH_GLOBAL_BADGES_URL } from '../constants/config';
import { parseTwitchBadgeMap } from '../utils/helpers';

export function useGlobalBadgeMap() {
  const [badgeMap, setBadgeMap] = useState<Record<string, string>>({});
  const [emoteMap] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(TWITCH_GLOBAL_BADGES_URL);
        if (!response.ok) return;
        const payload = await response.json();
        if (cancelled) return;
        setBadgeMap(parseTwitchBadgeMap(payload));
      } catch {
        // Badge fetch is best-effort.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { badgeMap, emoteMap };
}
