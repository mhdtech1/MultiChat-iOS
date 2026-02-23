import React, { useEffect, useMemo, useRef, useState } from "react";
import * as AuthSession from "expo-auth-session";
import * as Crypto from "expo-crypto";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform as RNPlatform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import type { ChatAdapter, ChatAdapterStatus, ChatMessage } from "@multichat/chat-core";
import { KickAdapter, TwitchAdapter, YouTubeAdapter } from "@multichat/chat-core";

WebBrowser.maybeCompleteAuthSession();

type PlatformId = "twitch" | "kick" | "youtube";

type ChatSource = {
  id: string;
  platform: PlatformId;
  channel: string;
};

type ChatTab = {
  id: string;
  sourceId: string;
  label: string;
};

type CredentialSnapshot = {
  twitchToken: string;
  twitchUsername: string;
  kickToken: string;
  kickUsername: string;
};

type KickTokenResponse = {
  access_token?: string;
  refresh_token?: string;
};

const PLATFORM_OPTIONS: PlatformId[] = ["twitch", "kick", "youtube"];

const TWITCH_CLIENT_ID = "syeui9mom7i5f9060j03tydgpdywbh";
const KICK_CLIENT_ID = "01KGRFF03VYRJMB3W4369Y07CS";
const KICK_CLIENT_SECRET = "29f43591eb0496352c66ea36f55c5c21e3fbc5053ba22568194e0c950c174794";

const TWITCH_SCOPES = [
  "chat:read",
  "chat:edit",
  "moderator:manage:banned_users",
  "moderator:manage:chat_messages",
  "moderator:read:moderators"
];

const KICK_SCOPES = ["user:read", "channel:read", "chat:write", "moderation:ban", "moderation:chat_message:manage"];

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const formatClock = (timestamp: string) => {
  const value = Date.parse(timestamp);
  if (Number.isNaN(value)) return "--:--";
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
};

const statusLabel = (status: ChatAdapterStatus | undefined) => {
  if (!status) return "disconnected";
  return status;
};

const platformTag = (platform: PlatformId) => {
  if (platform === "twitch") return "TW";
  if (platform === "kick") return "KI";
  return "YT";
};

const isWritable = (platform: PlatformId, credentials: CredentialSnapshot) => {
  if (platform === "twitch") {
    return Boolean(credentials.twitchToken.trim() && credentials.twitchUsername.trim());
  }
  if (platform === "kick") {
    return Boolean(credentials.kickToken.trim());
  }
  return false;
};

const randomToken = () => `${Crypto.randomUUID().replace(/-/g, "")}${Date.now().toString(36)}`;

const toBase64Url = (value: string) => value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

const parseKickUserName = (response: unknown): string | undefined => {
  if (!response || typeof response !== "object") return undefined;
  const maybeData = (response as { data?: unknown }).data;
  const user = Array.isArray(maybeData) ? maybeData[0] : maybeData;
  if (!user || typeof user !== "object") return undefined;

  const record = user as Record<string, unknown>;
  if (typeof record.username === "string" && record.username.length > 0) return record.username;
  if (typeof record.name === "string" && record.name.length > 0) return record.name;
  if (typeof record.slug === "string" && record.slug.length > 0) return record.slug;
  return undefined;
};

const fetchJsonOrThrow = async <T,>(response: Response, source: string): Promise<T> => {
  const text = await response.text();
  let parsed: any = {};
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = {};
    }
  }

  if (!response.ok) {
    const message =
      (typeof parsed?.message === "string" && parsed.message) ||
      (typeof parsed?.error_description === "string" && parsed.error_description) ||
      (typeof parsed?.error?.message === "string" && parsed.error.message) ||
      `${source} failed (${response.status}).`;
    throw new Error(message);
  }
  return parsed as T;
};

const readAuthResultUrl = (result: WebBrowser.WebBrowserAuthSessionResult): string => {
  const authResult = result as { type: string; url?: string };
  if (authResult.type === "cancel" || authResult.type === "dismiss") {
    throw new Error("Sign-in was cancelled.");
  }
  if (authResult.type !== "success" || !authResult.url) {
    throw new Error("Sign-in did not return a callback URL.");
  }
  return authResult.url;
};

const createCodeChallenge = async (codeVerifier: string) => {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, codeVerifier, {
    encoding: Crypto.CryptoEncoding.BASE64
  });
  return toBase64Url(digest);
};

export default function App() {
  const [platformInput, setPlatformInput] = useState<PlatformId>("twitch");
  const [channelInput, setChannelInput] = useState("");
  const [composerText, setComposerText] = useState("");
  const [sources, setSources] = useState<ChatSource[]>([]);
  const [tabs, setTabs] = useState<ChatTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [messagesBySource, setMessagesBySource] = useState<Record<string, ChatMessage[]>>({});
  const [statusBySource, setStatusBySource] = useState<Record<string, ChatAdapterStatus>>({});

  const [twitchUsername, setTwitchUsername] = useState("");
  const [twitchToken, setTwitchToken] = useState("");
  const [kickUsername, setKickUsername] = useState("");
  const [kickToken, setKickToken] = useState("");
  const [kickRefreshToken, setKickRefreshToken] = useState("");
  const [youtubeApiKey, setYoutubeApiKey] = useState("");

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [authBusy, setAuthBusy] = useState<"twitch" | "kick" | null>(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const adaptersRef = useRef<Map<string, ChatAdapter>>(new Map());
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const sourceById = useMemo(() => new Map(sources.map((source) => [source.id, source])), [sources]);
  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId) ?? null, [activeTabId, tabs]);
  const activeSource = activeTab ? sourceById.get(activeTab.sourceId) ?? null : null;

  const activeMessages = useMemo(() => {
    if (!activeSource) return [];
    return messagesBySource[activeSource.id] ?? [];
  }, [activeSource, messagesBySource]);

  const credentials = useMemo<CredentialSnapshot>(
    () => ({
      twitchUsername,
      twitchToken,
      kickUsername,
      kickToken
    }),
    [kickToken, kickUsername, twitchToken, twitchUsername]
  );

  const activeWritable = activeSource ? isWritable(activeSource.platform, credentials) : false;

  const twitchRedirectUri = useMemo(
    () => AuthSession.makeRedirectUri({ scheme: "multichat", path: "oauth/twitch" }),
    []
  );
  const kickRedirectUri = useMemo(
    () => AuthSession.makeRedirectUri({ scheme: "multichat", path: "oauth/kick" }),
    []
  );

  useEffect(() => {
    return () => {
      for (const adapter of adaptersRef.current.values()) {
        void adapter.disconnect();
      }
      adaptersRef.current.clear();
      if (noticeTimerRef.current) {
        clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  const showNotice = (message: string) => {
    setNotice(message);
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = setTimeout(() => {
      setNotice(null);
    }, 5000);
  };

  const removeSourceState = (sourceId: string) => {
    setMessagesBySource((previous) => {
      const next = { ...previous };
      delete next[sourceId];
      return next;
    });
    setStatusBySource((previous) => {
      const next = { ...previous };
      delete next[sourceId];
      return next;
    });
  };

  const snapshotCredentials = (override: Partial<CredentialSnapshot> = {}): CredentialSnapshot => ({
    twitchToken: override.twitchToken ?? credentials.twitchToken,
    twitchUsername: override.twitchUsername ?? credentials.twitchUsername,
    kickToken: override.kickToken ?? credentials.kickToken,
    kickUsername: override.kickUsername ?? credentials.kickUsername
  });

  const buildAdapter = (platform: PlatformId, channel: string, auth: CredentialSnapshot): ChatAdapter => {
    if (platform === "twitch") {
      return new TwitchAdapter({
        channel,
        auth: {
          token: auth.twitchToken.trim() || undefined,
          username: auth.twitchUsername.trim() || undefined
        }
      });
    }

    if (platform === "kick") {
      return new KickAdapter({
        channel,
        auth: {
          accessToken: auth.kickToken.trim() || undefined,
          username: auth.kickUsername.trim() || undefined
        }
      });
    }

    if (!youtubeApiKey.trim()) {
      throw new Error("YouTube API key is required for read-only chat.");
    }

    return new YouTubeAdapter({
      channel,
      auth: {
        apiKey: youtubeApiKey.trim(),
        liveChatId: channel
      }
    });
  };

  const attachAdapter = (sourceId: string, adapter: ChatAdapter) => {
    adapter.onStatus((status) => {
      setStatusBySource((previous) => ({
        ...previous,
        [sourceId]: status
      }));
    });

    adapter.onMessage((message) => {
      setMessagesBySource((previous) => {
        const current = previous[sourceId] ?? [];
        const next = [...current, message];
        if (next.length > 600) {
          next.splice(0, next.length - 600);
        }
        return {
          ...previous,
          [sourceId]: next
        };
      });
    });

    adaptersRef.current.set(sourceId, adapter);
  };

  const reconnectSource = async (source: ChatSource, authOverride: Partial<CredentialSnapshot> = {}) => {
    const existing = adaptersRef.current.get(source.id);
    adaptersRef.current.delete(source.id);
    if (existing) {
      await existing.disconnect().catch(() => {
        // best effort
      });
    }

    const adapter = buildAdapter(source.platform, source.channel, snapshotCredentials(authOverride));
    attachAdapter(source.id, adapter);
    setStatusBySource((previous) => ({
      ...previous,
      [source.id]: "connecting"
    }));
    await adapter.connect();
  };

  const reconnectPlatformSources = async (
    platform: "twitch" | "kick",
    authOverride: Partial<CredentialSnapshot> = {}
  ) => {
    const targets = sources.filter((source) => source.platform === platform);
    for (const source of targets) {
      try {
        await reconnectSource(source, authOverride);
      } catch (error) {
        setStatusBySource((previous) => ({
          ...previous,
          [source.id]: "error"
        }));
        showNotice(error instanceof Error ? error.message : String(error));
      }
    }
  };

  const addChannelTab = async () => {
    const channel = channelInput.trim().toLowerCase();
    if (!channel) {
      showNotice("Enter a channel (or YouTube live chat ID) first.");
      return;
    }

    const existingSource = sources.find((source) => source.platform === platformInput && source.channel === channel);
    if (existingSource) {
      const existingTab = tabs.find((tab) => tab.sourceId === existingSource.id);
      if (existingTab) {
        setActiveTabId(existingTab.id);
      }
      showNotice("That chat is already open.");
      return;
    }

    const sourceId = makeId();
    const tabId = makeId();
    const label = `${platformInput}/${channel}`;
    const source: ChatSource = {
      id: sourceId,
      platform: platformInput,
      channel
    };
    const tab: ChatTab = {
      id: tabId,
      sourceId,
      label
    };

    setBusy(true);
    setSources((previous) => [...previous, source]);
    setTabs((previous) => [...previous, tab]);
    setActiveTabId(tabId);
    setStatusBySource((previous) => ({
      ...previous,
      [sourceId]: "connecting"
    }));

    try {
      await reconnectSource(source);
      setChannelInput("");
    } catch (error) {
      setStatusBySource((previous) => ({
        ...previous,
        [sourceId]: "error"
      }));
      showNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const closeTab = async (tabId: string) => {
    const tab = tabs.find((candidate) => candidate.id === tabId);
    if (!tab) return;
    const sourceId = tab.sourceId;

    const adapter = adaptersRef.current.get(sourceId);
    adaptersRef.current.delete(sourceId);
    if (adapter) {
      await adapter.disconnect().catch(() => {
        // no-op
      });
    }

    setTabs((previous) => {
      const next = previous.filter((candidate) => candidate.id !== tabId);
      setActiveTabId((current) => {
        if (current !== tabId) return current;
        return next.length > 0 ? next[Math.max(0, next.length - 1)].id : null;
      });
      return next;
    });
    setSources((previous) => previous.filter((source) => source.id !== sourceId));
    removeSourceState(sourceId);
  };

  const sendActiveMessage = async () => {
    if (!activeSource) return;
    const content = composerText.trim();
    if (!content) return;

    const adapter = adaptersRef.current.get(activeSource.id);
    if (!adapter) {
      showNotice("Connection is not ready yet.");
      return;
    }
    if (!isWritable(activeSource.platform, credentials)) {
      showNotice("This chat is read-only until sign-in is complete.");
      return;
    }

    setSending(true);
    try {
      await adapter.sendMessage(content);
      setComposerText("");
    } catch (error) {
      showNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setSending(false);
    }
  };

  const signInTwitch = async () => {
    if (authBusy) return;
    setAuthBusy("twitch");
    try {
      const state = randomToken();
      const authUrl = new URL("https://id.twitch.tv/oauth2/authorize");
      authUrl.searchParams.set("client_id", TWITCH_CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", twitchRedirectUri);
      authUrl.searchParams.set("response_type", "token");
      authUrl.searchParams.set("scope", TWITCH_SCOPES.join(" "));
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("force_verify", "true");

      const callbackUrl = readAuthResultUrl(await WebBrowser.openAuthSessionAsync(authUrl.toString(), twitchRedirectUri));
      const callback = new URL(callbackUrl);
      const hash = callback.hash.startsWith("#") ? callback.hash.slice(1) : callback.hash;
      const params = new URLSearchParams(hash);

      const error = params.get("error");
      if (error) {
        const description = params.get("error_description") ?? "Twitch sign-in failed.";
        throw new Error(description);
      }
      if (params.get("state") !== state) {
        throw new Error("Twitch sign-in was rejected (state mismatch).");
      }

      const accessToken = params.get("access_token")?.trim() ?? "";
      if (!accessToken) {
        throw new Error("Twitch did not return an access token.");
      }

      const validateResponse = await fetch("https://id.twitch.tv/oauth2/validate", {
        headers: {
          Authorization: `OAuth ${accessToken}`
        }
      });
      const validated = await fetchJsonOrThrow<{ login?: string }>(validateResponse, "Twitch token validation");
      const username = validated.login?.trim() ?? "";
      if (!username) {
        throw new Error("Twitch token validation did not return a username.");
      }

      setTwitchToken(accessToken);
      setTwitchUsername(username);
      await reconnectPlatformSources("twitch", {
        twitchToken: accessToken,
        twitchUsername: username
      });
      showNotice(`Signed in to Twitch as ${username}.`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setAuthBusy(null);
    }
  };

  const signOutTwitch = async () => {
    if (authBusy) return;
    setAuthBusy("twitch");
    setTwitchToken("");
    setTwitchUsername("");
    await reconnectPlatformSources("twitch", {
      twitchToken: "",
      twitchUsername: ""
    });
    showNotice("Signed out of Twitch.");
    setAuthBusy(null);
  };

  const signInKick = async () => {
    if (authBusy) return;
    setAuthBusy("kick");
    try {
      const state = randomToken();
      const codeVerifier = randomToken().repeat(2).replace(/[^a-zA-Z0-9]/g, "").slice(0, 64);
      const codeChallenge = await createCodeChallenge(codeVerifier);

      const authUrl = new URL("https://id.kick.com/oauth/authorize");
      authUrl.searchParams.set("client_id", KICK_CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", kickRedirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", KICK_SCOPES.join(" "));
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("code_challenge", codeChallenge);
      authUrl.searchParams.set("code_challenge_method", "S256");

      const callbackUrl = readAuthResultUrl(await WebBrowser.openAuthSessionAsync(authUrl.toString(), kickRedirectUri));
      const callback = new URL(callbackUrl);
      const error = callback.searchParams.get("error");
      if (error) {
        const description = callback.searchParams.get("error_description") ?? "Kick sign-in failed.";
        throw new Error(description);
      }
      if (callback.searchParams.get("state") !== state) {
        throw new Error("Kick sign-in was rejected (state mismatch).");
      }
      const code = callback.searchParams.get("code")?.trim() ?? "";
      if (!code) {
        throw new Error("Kick did not return an authorization code.");
      }

      const tokenResponse = await fetch("https://id.kick.com/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json"
        },
        body: new URLSearchParams({
          code,
          client_id: KICK_CLIENT_ID,
          client_secret: KICK_CLIENT_SECRET,
          redirect_uri: kickRedirectUri,
          grant_type: "authorization_code",
          code_verifier: codeVerifier
        })
      });
      const tokens = await fetchJsonOrThrow<KickTokenResponse>(tokenResponse, "Kick token exchange");
      const accessToken = tokens.access_token?.trim() ?? "";
      if (!accessToken) {
        throw new Error("Kick token exchange did not return an access token.");
      }

      const userResponse = await fetch("https://api.kick.com/public/v1/users", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json"
        }
      });
      const userPayload = await fetchJsonOrThrow<unknown>(userResponse, "Kick user profile");
      const username = parseKickUserName(userPayload) ?? "";

      setKickToken(accessToken);
      setKickRefreshToken(tokens.refresh_token?.trim() ?? "");
      setKickUsername(username);
      await reconnectPlatformSources("kick", {
        kickToken: accessToken,
        kickUsername: username
      });
      showNotice(`Signed in to Kick${username ? ` as ${username}` : ""}.`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setAuthBusy(null);
    }
  };

  const signOutKick = async () => {
    if (authBusy) return;
    setAuthBusy("kick");
    setKickToken("");
    setKickRefreshToken("");
    setKickUsername("");
    await reconnectPlatformSources("kick", {
      kickToken: "",
      kickUsername: ""
    });
    showNotice("Signed out of Kick.");
    setAuthBusy(null);
  };

  const channelPlaceholder =
    platformInput === "youtube" ? "YouTube live chat ID" : `Enter ${platformInput} channel username`;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <KeyboardAvoidingView behavior={RNPlatform.OS === "ios" ? "padding" : undefined} style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>MultiChat iOS</Text>
            <Text style={styles.subtitle}>Unified mobile chat monitor</Text>
          </View>
          <Pressable onPress={() => setSettingsOpen((previous) => !previous)} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>{settingsOpen ? "Hide Config" : "Show Config"}</Text>
          </Pressable>
        </View>

        {settingsOpen ? (
          <View style={styles.configCard}>
            <Text style={styles.configTitle}>OAuth Accounts</Text>

            <View style={styles.accountRow}>
              <View style={styles.accountCopy}>
                <Text style={styles.accountLabel}>Twitch</Text>
                <Text style={styles.accountValue}>{twitchToken ? `Connected as ${twitchUsername}` : "Not connected"}</Text>
              </View>
              <Pressable
                onPress={() => void (twitchToken ? signOutTwitch() : signInTwitch())}
                disabled={authBusy !== null}
                style={twitchToken ? styles.warningButton : styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>
                  {authBusy === "twitch" ? "Working..." : twitchToken ? "Sign Out" : "Sign In"}
                </Text>
              </Pressable>
            </View>
            <Text style={styles.configHint}>Twitch redirect: {twitchRedirectUri}</Text>

            <View style={styles.accountRow}>
              <View style={styles.accountCopy}>
                <Text style={styles.accountLabel}>Kick</Text>
                <Text style={styles.accountValue}>{kickToken ? `Connected as ${kickUsername || "account"}` : "Not connected"}</Text>
              </View>
              <Pressable
                onPress={() => void (kickToken ? signOutKick() : signInKick())}
                disabled={authBusy !== null}
                style={kickToken ? styles.warningButton : styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>{authBusy === "kick" ? "Working..." : kickToken ? "Sign Out" : "Sign In"}</Text>
              </Pressable>
            </View>
            <Text style={styles.configHint}>Kick redirect: {kickRedirectUri}</Text>
            {kickRefreshToken ? <Text style={styles.configHint}>Kick refresh token saved.</Text> : null}

            <Text style={styles.configTitle}>YouTube Read-Only</Text>
            <TextInput
              value={youtubeApiKey}
              onChangeText={setYoutubeApiKey}
              placeholder="YouTube API key"
              placeholderTextColor="#6c7888"
              autoCapitalize="none"
              secureTextEntry
              style={styles.input}
            />
          </View>
        ) : null}

        <View style={styles.addCard}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.platformRow}>
            {PLATFORM_OPTIONS.map((platform) => {
              const active = platformInput === platform;
              return (
                <Pressable
                  key={platform}
                  onPress={() => setPlatformInput(platform)}
                  style={active ? [styles.platformPill, styles.platformPillActive] : styles.platformPill}
                >
                  <Text style={active ? [styles.platformPillText, styles.platformPillTextActive] : styles.platformPillText}>
                    {platform}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.addRow}>
            <TextInput
              value={channelInput}
              onChangeText={setChannelInput}
              placeholder={channelPlaceholder}
              placeholderTextColor="#6c7888"
              autoCapitalize="none"
              style={[styles.input, styles.grow]}
            />
            <Pressable onPress={() => void addChannelTab()} disabled={busy} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{busy ? "Opening..." : "Open"}</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsStrip}>
          <View style={styles.tabsRow}>
            {tabs.map((tab) => {
              const source = sourceById.get(tab.sourceId);
              const active = tab.id === activeTabId;
              const status = statusLabel(statusBySource[tab.sourceId]);
              return (
                <View key={tab.id} style={active ? [styles.tabCard, styles.tabCardActive] : styles.tabCard}>
                  <Pressable onPress={() => setActiveTabId(tab.id)} style={styles.tabSelect}>
                    <Text style={styles.tabTag}>{source ? platformTag(source.platform) : "??"}</Text>
                    <Text style={styles.tabLabel}>{tab.label}</Text>
                    <Text style={styles.tabStatus}>{status}</Text>
                  </Pressable>
                  <Pressable onPress={() => void closeTab(tab.id)} style={styles.tabClose}>
                    <Text style={styles.tabCloseText}>x</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </ScrollView>

        {activeSource ? (
          <>
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>
                {activeSource.platform}/{activeSource.channel} - {statusLabel(statusBySource[activeSource.id])}
              </Text>
              <Text style={styles.metaText}>{activeWritable ? "Writable" : "Read-only"}</Text>
            </View>

            <FlatList
              ref={listRef}
              data={activeMessages}
              keyExtractor={(item, index) => `${item.id}-${item.timestamp}-${index}`}
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
              style={styles.messagesList}
              contentContainerStyle={styles.messagesContent}
              renderItem={({ item }) => (
                <View style={styles.messageCard}>
                  <View style={styles.messageMetaRow}>
                    <Text style={styles.messageMeta}>
                      {platformTag(item.platform as PlatformId)} #{item.channel}
                    </Text>
                    <Text style={styles.messageMeta}>{formatClock(item.timestamp)}</Text>
                  </View>
                  <Text style={styles.messageAuthor}>{item.displayName || item.username}</Text>
                  <Text style={styles.messageText}>{item.message}</Text>
                </View>
              )}
              ListEmptyComponent={<Text style={styles.emptyText}>No messages yet for this tab.</Text>}
            />

            <View style={styles.composerRow}>
              <TextInput
                value={composerText}
                onChangeText={setComposerText}
                placeholder={activeWritable ? "Type a message" : "Read-only tab"}
                placeholderTextColor="#6c7888"
                editable={activeWritable}
                style={[styles.input, styles.grow]}
              />
              <Pressable
                onPress={() => void sendActiveMessage()}
                disabled={!activeWritable || sending || !composerText.trim()}
                style={[
                  styles.primaryButton,
                  !activeWritable || sending || !composerText.trim() ? styles.primaryButtonDisabled : null
                ]}
              >
                <Text style={styles.primaryButtonText}>{sending ? "Sending..." : "Send"}</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No tabs open</Text>
            <Text style={styles.emptyText}>Pick a platform, enter a channel, and tap Open.</Text>
          </View>
        )}

        {notice ? (
          <View style={styles.noticeBar}>
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#070a10"
  },
  container: {
    flex: 1,
    backgroundColor: "#070a10",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10
  },
  title: {
    color: "#f4f7fb",
    fontSize: 22,
    fontWeight: "700"
  },
  subtitle: {
    color: "#92a0b3",
    fontSize: 12,
    marginTop: 2
  },
  configCard: {
    borderWidth: 1,
    borderColor: "#1c2533",
    borderRadius: 10,
    backgroundColor: "#101722",
    padding: 10,
    gap: 8,
    marginBottom: 10
  },
  configTitle: {
    color: "#d8e2f0",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 2,
    marginTop: 4
  },
  configHint: {
    color: "#8395ad",
    fontSize: 11
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  accountCopy: {
    flex: 1,
    gap: 2
  },
  accountLabel: {
    color: "#c9d5e5",
    fontSize: 12,
    fontWeight: "700"
  },
  accountValue: {
    color: "#93a4bb",
    fontSize: 12
  },
  addCard: {
    borderWidth: 1,
    borderColor: "#1c2533",
    borderRadius: 10,
    backgroundColor: "#101722",
    padding: 10,
    gap: 10
  },
  platformRow: {
    flexDirection: "row",
    gap: 8
  },
  platformPill: {
    borderWidth: 1,
    borderColor: "#2a3344",
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10
  },
  platformPillActive: {
    borderColor: "#2dd4bf",
    backgroundColor: "#17353f"
  },
  platformPillText: {
    color: "#9eb0c8",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "capitalize"
  },
  platformPillTextActive: {
    color: "#d9fff7"
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  tabsStrip: {
    marginTop: 10,
    marginBottom: 8
  },
  tabsRow: {
    flexDirection: "row",
    gap: 8
  },
  tabCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#283346",
    borderRadius: 10,
    backgroundColor: "#121a27",
    minWidth: 220
  },
  tabCardActive: {
    borderColor: "#2dd4bf"
  },
  tabSelect: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10
  },
  tabTag: {
    color: "#7fdff8",
    fontSize: 11,
    fontWeight: "700"
  },
  tabLabel: {
    color: "#dfe9f6",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 2
  },
  tabStatus: {
    color: "#8ba1bb",
    fontSize: 10,
    marginTop: 2,
    textTransform: "capitalize"
  },
  tabClose: {
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  tabCloseText: {
    color: "#8ca3c1",
    fontSize: 16,
    fontWeight: "700"
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6
  },
  metaText: {
    color: "#8ea1b9",
    fontSize: 12
  },
  messagesList: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#1f2938",
    borderRadius: 10,
    backgroundColor: "#0f1622"
  },
  messagesContent: {
    padding: 10,
    gap: 8
  },
  messageCard: {
    borderWidth: 1,
    borderColor: "#1f2a3a",
    borderRadius: 8,
    backgroundColor: "#0b1220",
    padding: 8,
    gap: 3
  },
  messageMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  messageMeta: {
    color: "#8aa1bd",
    fontSize: 11
  },
  messageAuthor: {
    color: "#d5e4f7",
    fontSize: 13,
    fontWeight: "700"
  },
  messageText: {
    color: "#edf3ff",
    fontSize: 14
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8
  },
  input: {
    borderWidth: 1,
    borderColor: "#253246",
    borderRadius: 8,
    backgroundColor: "#0f1622",
    color: "#e5eefb",
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14
  },
  grow: {
    flex: 1
  },
  primaryButton: {
    borderRadius: 8,
    backgroundColor: "#186d60",
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  secondaryButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2f3e56",
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  warningButton: {
    borderRadius: 8,
    backgroundColor: "#7a3b3b",
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  primaryButtonDisabled: {
    opacity: 0.45
  },
  primaryButtonText: {
    color: "#f1fffc",
    fontSize: 12,
    fontWeight: "700"
  },
  secondaryButtonText: {
    color: "#c9d7ea",
    fontSize: 12,
    fontWeight: "600"
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8
  },
  emptyTitle: {
    color: "#d7e5f7",
    fontSize: 18,
    fontWeight: "700"
  },
  emptyText: {
    color: "#8ea2b9",
    fontSize: 13
  },
  noticeBar: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1e6f65",
    backgroundColor: "#103b36",
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  noticeText: {
    color: "#d8fffa",
    fontSize: 12
  }
});
