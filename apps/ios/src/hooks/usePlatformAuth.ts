import { useCallback, useMemo, useState } from 'react';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import {
  KICK_CLIENT_ID,
  KICK_CLIENT_SECRET,
  KICK_REDIRECT_URI,
  KICK_SCOPES,
  TWITCH_CLIENT_ID,
  TWITCH_REDIRECT_URI,
  TWITCH_SCOPES,
} from '../constants/config';
import { createCodeChallenge, parseKickUserName, randomToken } from '../utils/helpers';
import { normalizeChannelInput } from '../utils/channelInput';
import type { PlatformId } from '../types';

WebBrowser.maybeCompleteAuthSession();

type KickTokenResponse = {
  access_token?: string;
  refresh_token?: string;
};

const fetchJsonOrThrow = async <T,>(response: Response, source: string): Promise<T> => {
  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  if (text) {
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      parsed = {};
    }
  }

  if (!response.ok) {
    const message =
      (typeof parsed.message === 'string' && parsed.message) ||
      (typeof parsed.error_description === 'string' && parsed.error_description) ||
      (typeof (parsed.error as { message?: string })?.message === 'string' &&
        (parsed.error as { message: string }).message) ||
      `${source} failed (${response.status}).`;
    throw new Error(message);
  }
  return parsed as T;
};

const readAuthResultUrl = (result: WebBrowser.WebBrowserAuthSessionResult): string => {
  const authResult = result as { type: string; url?: string };
  if (authResult.type === 'cancel' || authResult.type === 'dismiss') {
    throw new Error('Sign-in was cancelled.');
  }
  if (authResult.type !== 'success' || !authResult.url) {
    throw new Error('Sign-in did not return a callback URL.');
  }
  return authResult.url;
};

export function usePlatformAuth(showNotice: (message: string) => void) {
  const [authBusy, setAuthBusy] = useState<'twitch' | 'kick' | null>(null);

  const twitchRedirectUri = useMemo(
    () => AuthSession.makeRedirectUri({ scheme: 'multichat', path: 'oauth/twitch' }),
    []
  );

  const kickRedirectUri = useMemo(
    () => AuthSession.makeRedirectUri({ scheme: 'multichat', path: 'oauth/kick' }),
    []
  );

  const signInTwitch = useCallback(
    async (onSuccess: (token: string, username: string) => Promise<void>) => {
      if (authBusy) return;
      setAuthBusy('twitch');
      try {
        const state = randomToken();
        const authUrl = new URL('https://id.twitch.tv/oauth2/authorize');
        authUrl.searchParams.set('client_id', TWITCH_CLIENT_ID);
        authUrl.searchParams.set('redirect_uri', twitchRedirectUri);
        authUrl.searchParams.set('response_type', 'token');
        authUrl.searchParams.set('scope', TWITCH_SCOPES.join(' '));
        authUrl.searchParams.set('state', state);
        authUrl.searchParams.set('force_verify', 'true');

        const callbackUrl = readAuthResultUrl(
          await WebBrowser.openAuthSessionAsync(authUrl.toString(), twitchRedirectUri)
        );
        const callback = new URL(callbackUrl);
        const hash = callback.hash.startsWith('#') ? callback.hash.slice(1) : callback.hash;
        const params = new URLSearchParams(hash);

        const error = params.get('error');
        if (error) {
          throw new Error(params.get('error_description') ?? 'Twitch sign-in failed.');
        }
        if (params.get('state') !== state) {
          throw new Error('Twitch sign-in was rejected (state mismatch).');
        }

        const accessToken = params.get('access_token')?.trim() ?? '';
        if (!accessToken) {
          throw new Error('Twitch did not return an access token.');
        }

        const validateResponse = await fetch('https://id.twitch.tv/oauth2/validate', {
          headers: { Authorization: `OAuth ${accessToken}` },
        });
        const validated = await fetchJsonOrThrow<{ login?: string }>(validateResponse, 'Twitch token validation');
        const username = validated.login?.trim() ?? '';
        if (!username) {
          throw new Error('Twitch token validation did not return a username.');
        }

        await onSuccess(accessToken, username);
        showNotice(`Signed in to Twitch as ${username}.`);
      } catch (error) {
        showNotice(error instanceof Error ? error.message : String(error));
      } finally {
        setAuthBusy(null);
      }
    },
    [authBusy, showNotice, twitchRedirectUri]
  );

  const signInKick = useCallback(
    async (onSuccess: (token: string, refreshToken: string, username: string) => Promise<void>) => {
      if (authBusy) return;
      setAuthBusy('kick');
      try {
        const state = randomToken();
        const codeVerifier = randomToken().repeat(2).replace(/[^a-zA-Z0-9]/g, '').slice(0, 64);
        const codeChallenge = await createCodeChallenge(codeVerifier);

        const authUrl = new URL('https://id.kick.com/oauth/authorize');
        authUrl.searchParams.set('client_id', KICK_CLIENT_ID);
        authUrl.searchParams.set('redirect_uri', kickRedirectUri);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', KICK_SCOPES.join(' '));
        authUrl.searchParams.set('state', state);
        authUrl.searchParams.set('code_challenge', codeChallenge);
        authUrl.searchParams.set('code_challenge_method', 'S256');

        const callbackUrl = readAuthResultUrl(
          await WebBrowser.openAuthSessionAsync(authUrl.toString(), kickRedirectUri)
        );
        const callback = new URL(callbackUrl);
        const error = callback.searchParams.get('error');
        if (error) {
          throw new Error(callback.searchParams.get('error_description') ?? 'Kick sign-in failed.');
        }
        if (callback.searchParams.get('state') !== state) {
          throw new Error('Kick sign-in was rejected (state mismatch).');
        }
        const code = callback.searchParams.get('code')?.trim() ?? '';
        if (!code) {
          throw new Error('Kick did not return an authorization code.');
        }

        const tokenResponse = await fetch('https://id.kick.com/oauth/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body: new URLSearchParams({
            code,
            client_id: KICK_CLIENT_ID,
            client_secret: KICK_CLIENT_SECRET,
            redirect_uri: kickRedirectUri,
            grant_type: 'authorization_code',
            code_verifier: codeVerifier,
          }),
        });
        const tokens = await fetchJsonOrThrow<KickTokenResponse>(tokenResponse, 'Kick token exchange');
        const accessToken = tokens.access_token?.trim() ?? '';
        if (!accessToken) {
          throw new Error('Kick token exchange did not return an access token.');
        }

        const userResponse = await fetch('https://api.kick.com/public/v1/users', {
          headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        });
        const userPayload = await fetchJsonOrThrow<unknown>(userResponse, 'Kick user profile');
        const username = parseKickUserName(userPayload) ?? '';

        await onSuccess(accessToken, tokens.refresh_token?.trim() ?? '', username);
        showNotice(`Signed in to Kick${username ? ` as ${username}` : ''}.`);
      } catch (error) {
        showNotice(error instanceof Error ? error.message : String(error));
      } finally {
        setAuthBusy(null);
      }
    },
    [authBusy, kickRedirectUri, showNotice]
  );

  const openOwnChannelAfterSignIn = useCallback(
    async (platform: PlatformId, usernameRaw: string, openChatTab: (platform: PlatformId, channel: string) => Promise<void>) => {
      const username = normalizeChannelInput(platform, usernameRaw);
      if (!username) return;
      await openChatTab(platform, username);
    },
    []
  );

  return {
    authBusy,
    signInTwitch,
    signInKick,
    openOwnChannelAfterSignIn,
  };
}
