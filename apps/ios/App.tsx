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
type ChatTabKind = "chat" | "obs";

type ChatSource = {
  id: string;
  platform: PlatformId;
  channel: string;
};

type ChatTab =
  | {
      id: string;
      kind: "chat";
      sourceIds: string[];
      label: string;
    }
  | {
      id: string;
      kind: "obs";
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

type ObsPendingRequest = {
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

type ObsSceneItem = {
  sceneItemId: number;
  sourceName: string;
  enabled: boolean;
};

type ObsAudioInput = {
  inputName: string;
  muted: boolean;
  volumeMul: number;
};

type ObsStats = {
  cpuUsage: number | null;
  activeFps: number | null;
  outputSkippedFrames: number | null;
  outputTotalFrames: number | null;
};

type MobileSection = "chats" | "add" | "obs" | "settings";

type ObsSendTarget = "__all__" | string;

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

const OBS_ALL_SEND_TARGET: ObsSendTarget = "__all__";

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const normalizeChannelInput = (platform: PlatformId, input: string) => {
  const trimmed = input.trim().replace(/^#/, "").replace(/^@/, "");
  if (!trimmed) return "";
  if (platform === "youtube") {
    return trimmed;
  }
  return trimmed.toLowerCase();
};

const formatClock = (timestamp: string) => {
  const value = Date.parse(timestamp);
  if (Number.isNaN(value)) return "--:--";
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
};

const messageTimestamp = (message: ChatMessage) => {
  const parsed = Date.parse(message.timestamp);
  return Number.isFinite(parsed) ? parsed : Date.now();
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
  void platform;
  void credentials;
  // OAuth is intentionally disabled in this iOS build for now.
  // Keep all chat sources read-only to avoid sign-in setup friction.
  return false;
};

const randomToken = () => `${Crypto.randomUUID().replace(/-/g, "")}${Date.now().toString(36)}`;

const toBase64Url = (value: string) => value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
};

const readNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

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

const sameSourceSet = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
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

  const [sendTargetId, setSendTargetId] = useState<ObsSendTarget>(OBS_ALL_SEND_TARGET);

  const [mobileSection, setMobileSection] = useState<MobileSection>("chats");
  const [busy, setBusy] = useState(false);
  const [authBusy, setAuthBusy] = useState<"twitch" | "kick" | null>(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [obsHost, setObsHost] = useState("127.0.0.1");
  const [obsPort, setObsPort] = useState("4455");
  const [obsPassword, setObsPassword] = useState("");
  const [obsConnected, setObsConnected] = useState(false);
  const [obsConnecting, setObsConnecting] = useState(false);
  const [obsStatusText, setObsStatusText] = useState("Disconnected");
  const [obsScenes, setObsScenes] = useState<string[]>([]);
  const [obsCurrentScene, setObsCurrentScene] = useState("");
  const [obsSceneItems, setObsSceneItems] = useState<ObsSceneItem[]>([]);
  const [obsAudioInputs, setObsAudioInputs] = useState<ObsAudioInput[]>([]);
  const [obsStats, setObsStats] = useState<ObsStats>({
    cpuUsage: null,
    activeFps: null,
    outputSkippedFrames: null,
    outputTotalFrames: null
  });
  const [obsStreamActive, setObsStreamActive] = useState(false);
  const [obsRecordActive, setObsRecordActive] = useState(false);

  const adaptersRef = useRef<Map<string, ChatAdapter>>(new Map());
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const obsSocketRef = useRef<WebSocket | null>(null);
  const obsPendingRef = useRef<Map<string, ObsPendingRequest>>(new Map());
  const obsRequestIdRef = useRef(1);
  const obsRpcVersionRef = useRef(1);

  const sourceById = useMemo(() => new Map(sources.map((source) => [source.id, source])), [sources]);

  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId) ?? null, [activeTabId, tabs]);
  const chatTabs = useMemo(
    () => tabs.filter((tab): tab is Extract<ChatTab, { kind: "chat" }> => tab.kind === "chat"),
    [tabs]
  );

  const activeChatTab = useMemo(() => {
    if (!activeTab || activeTab.kind !== "chat") return null;
    return activeTab;
  }, [activeTab]);

  const activeChatSources = useMemo(() => {
    if (!activeChatTab) return [];
    return activeChatTab.sourceIds
      .map((sourceId) => sourceById.get(sourceId))
      .filter(Boolean) as ChatSource[];
  }, [activeChatTab, sourceById]);

  const activeMessages = useMemo(() => {
    if (!activeChatTab) return [];
    const merged = activeChatTab.sourceIds.flatMap((sourceId) => messagesBySource[sourceId] ?? []);
    return merged.sort((left, right) => messageTimestamp(left) - messageTimestamp(right));
  }, [activeChatTab, messagesBySource]);

  const credentials = useMemo<CredentialSnapshot>(
    () => ({
      twitchUsername,
      twitchToken,
      kickUsername,
      kickToken
    }),
    [kickToken, kickUsername, twitchToken, twitchUsername]
  );

  const writableActiveSources = useMemo(
    () => activeChatSources.filter((source) => isWritable(source.platform, credentials)),
    [activeChatSources, credentials]
  );

  const activeWritable = writableActiveSources.length > 0;

  const twitchRedirectUri = useMemo(
    () => AuthSession.makeRedirectUri({ scheme: "multichat", path: "oauth/twitch" }),
    []
  );

  const kickRedirectUri = useMemo(
    () => AuthSession.makeRedirectUri({ scheme: "multichat", path: "oauth/kick" }),
    []
  );

  const channelPlaceholder =
    platformInput === "youtube" ? "YouTube live chat ID" : `Enter ${platformInput} channel username`;

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
    void auth;
    if (platform === "twitch") {
      return new TwitchAdapter({
        channel
      });
    }

    if (platform === "kick") {
      return new KickAdapter({
        channel,
        auth: {
          accessToken: undefined,
          username: undefined,
          guest: true
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
        if (next.length > 800) {
          next.splice(0, next.length - 800);
        }
        return {
          ...previous,
          [sourceId]: next
        };
      });
    });

    adaptersRef.current.set(sourceId, adapter);
  };

  const connectSource = async (source: ChatSource, authOverride: Partial<CredentialSnapshot> = {}) => {
    const existing = adaptersRef.current.get(source.id);
    adaptersRef.current.delete(source.id);
    if (existing) {
      await existing.disconnect().catch(() => {
        // no-op
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

  const reconnectPlatformSources = async (platform: "twitch" | "kick", authOverride: Partial<CredentialSnapshot> = {}) => {
    const targets = sources.filter((source) => source.platform === platform);
    for (const source of targets) {
      try {
        await connectSource(source, authOverride);
      } catch (error) {
        setStatusBySource((previous) => ({
          ...previous,
          [source.id]: "error"
        }));
        showNotice(error instanceof Error ? error.message : String(error));
      }
    }
  };

  const openChatTab = async (platform: PlatformId, rawChannel: string) => {
    setMobileSection("chats");
    const channel = normalizeChannelInput(platform, rawChannel);
    if (!channel) {
      showNotice("Enter a channel first.");
      return;
    }

    const existingSource = sources.find((source) => source.platform === platform && source.channel === channel);
    const source =
      existingSource ??
      ({
        id: makeId(),
        platform,
        channel
      } satisfies ChatSource);

    const existingSingleTab = tabs.find(
      (tab) => tab.kind === "chat" && tab.sourceIds.length === 1 && tab.sourceIds[0] === source.id
    );
    if (existingSingleTab) {
      setActiveTabId(existingSingleTab.id);
      showNotice("That chat is already open.");
      return;
    }

    const nextTab: ChatTab = {
      id: makeId(),
      kind: "chat",
      sourceIds: [source.id],
      label: `${platform}/${channel}`
    };

    if (!existingSource) {
      setSources((previous) => [...previous, source]);
    }
    setTabs((previous) => [...previous, nextTab]);
    setActiveTabId(nextTab.id);

    if (!adaptersRef.current.has(source.id)) {
      setBusy(true);
      try {
        await connectSource(source);
      } catch (error) {
        setStatusBySource((previous) => ({
          ...previous,
          [source.id]: "error"
        }));
        showNotice(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    }
  };

  const addChannelTab = async () => {
    await openChatTab(platformInput, channelInput);
    setChannelInput("");
  };

  const openCombinedTab = () => {
    const sourceIds = Array.from(new Set(sources.map((source) => source.id)));
    if (sourceIds.length < 2) {
      showNotice("Open at least two chats before combining.");
      return;
    }

    const existing = tabs.find(
      (tab) => tab.kind === "chat" && tab.sourceIds.length > 1 && sameSourceSet(tab.sourceIds, sourceIds)
    );
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }

    const combinedTab: ChatTab = {
      id: makeId(),
      kind: "chat",
      sourceIds,
      label: `combined/${sourceIds.length} chats`
    };
    setTabs((previous) => [...previous, combinedTab]);
    setActiveTabId(combinedTab.id);
    setMobileSection("chats");
  };

  const openObsControllerTab = () => {
    setMobileSection("obs");
  };

  const openChatsSection = () => {
    setMobileSection("chats");
    const currentActive = tabs.find((tab) => tab.id === activeTabId);
    if (currentActive?.kind === "chat") return;
    const firstChat = chatTabs[0];
    setActiveTabId(firstChat?.id ?? null);
  };

  const openAddSection = () => {
    setMobileSection("add");
  };

  const openSettingsSection = () => {
    setMobileSection("settings");
  };

  const closeTab = async (tabId: string) => {
    const tab = tabs.find((candidate) => candidate.id === tabId);
    if (!tab) return;

    const nextTabs = tabs.filter((candidate) => candidate.id !== tabId);
    setTabs(nextTabs);
    setActiveTabId((current) => {
      if (current !== tabId) return current;
      return nextTabs[0]?.id ?? null;
    });

    if (tab.kind === "obs") {
      const socket = obsSocketRef.current;
      obsSocketRef.current = null;
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
      setObsConnected(false);
      setObsConnecting(false);
      setObsStatusText("Disconnected");
      setObsScenes([]);
      setObsCurrentScene("");
      setObsSceneItems([]);
      setObsAudioInputs([]);
      setObsStats({
        cpuUsage: null,
        activeFps: null,
        outputSkippedFrames: null,
        outputTotalFrames: null
      });
      setObsStreamActive(false);
      setObsRecordActive(false);
      return;
    }

    const stillUsedSourceIds = new Set(
      nextTabs.flatMap((candidate) => (candidate.kind === "chat" ? candidate.sourceIds : []))
    );
    const orphanedSourceIds = tab.sourceIds.filter((sourceId) => !stillUsedSourceIds.has(sourceId));

    for (const sourceId of orphanedSourceIds) {
      const adapter = adaptersRef.current.get(sourceId);
      adaptersRef.current.delete(sourceId);
      if (adapter) {
        await adapter.disconnect().catch(() => {
          // no-op
        });
      }
      removeSourceState(sourceId);
    }

    if (orphanedSourceIds.length > 0) {
      setSources((previous) => previous.filter((source) => !orphanedSourceIds.includes(source.id)));
    }
  };

  const sendActiveMessage = async () => {
    if (!activeChatTab) return;
    const content = composerText.trim();
    if (!content) return;

    const targetSources =
      sendTargetId === OBS_ALL_SEND_TARGET
        ? writableActiveSources
        : writableActiveSources.filter((source) => source.id === sendTargetId);

    if (targetSources.length === 0) {
      showNotice("No writable chats selected.");
      return;
    }

    setSending(true);
    const results = await Promise.allSettled(
      targetSources.map(async (source) => {
        const adapter = adaptersRef.current.get(source.id);
        if (!adapter) {
          throw new Error(`${source.platform}/${source.channel} is not connected yet.`);
        }
        await adapter.sendMessage(content);
      })
    );

    const successCount = results.filter((result) => result.status === "fulfilled").length;
    if (successCount > 0) {
      setComposerText("");
    }

    const failures = results
      .map((result, index) => {
        if (result.status === "fulfilled") return null;
        const source = targetSources[index];
        const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
        return `${source.platform}/${source.channel}: ${reason}`;
      })
      .filter(Boolean) as string[];

    if (failures.length > 0) {
      const suffix = failures.length > 1 ? ` (+${failures.length - 1} more)` : "";
      showNotice(`Send failed: ${failures[0]}${suffix}`);
    }

    setSending(false);
  };

  const openOwnChannelAfterSignIn = async (platform: "twitch" | "kick", usernameRaw: string) => {
    const username = normalizeChannelInput(platform, usernameRaw);
    if (!username) return;
    await openChatTab(platform, username);
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
      await openOwnChannelAfterSignIn("twitch", username);
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
      if (username) {
        await openOwnChannelAfterSignIn("kick", username);
      }
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

  const rejectAllObsPending = (reason: string) => {
    const pendingEntries = Array.from(obsPendingRef.current.values());
    obsPendingRef.current.clear();
    for (const pending of pendingEntries) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error(reason));
    }
  };

  const disconnectObs = (reason = "Disconnected") => {
    const socket = obsSocketRef.current;
    obsSocketRef.current = null;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.close();
    }
    rejectAllObsPending(reason);
    setObsConnected(false);
    setObsConnecting(false);
    setObsStatusText(reason);
    setObsSceneItems([]);
    setObsAudioInputs([]);
    setObsStats({
      cpuUsage: null,
      activeFps: null,
      outputSkippedFrames: null,
      outputTotalFrames: null
    });
  };

  const sendObsRequest = async <T extends Record<string, unknown> = Record<string, unknown>>(
    requestType: string,
    requestData: Record<string, unknown> = {}
  ): Promise<T> => {
    const socket = obsSocketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error("OBS is not connected.");
    }

    return new Promise<T>((resolve, reject) => {
      const requestId = `r-${Date.now()}-${obsRequestIdRef.current++}`;
      const timeoutId = setTimeout(() => {
        obsPendingRef.current.delete(requestId);
        reject(new Error(`${requestType} timed out.`));
      }, 8000);

      obsPendingRef.current.set(requestId, {
        resolve: (value) => resolve(value as T),
        reject,
        timeoutId
      });

      socket.send(
        JSON.stringify({
          op: 6,
          d: {
            requestType,
            requestId,
            requestData
          }
        })
      );
    });
  };

  const refreshObsState = async () => {
    try {
      const [sceneList, streamStatus, recordStatus, statsResponse] = await Promise.all([
        sendObsRequest("GetSceneList"),
        sendObsRequest("GetStreamStatus"),
        sendObsRequest("GetRecordStatus"),
        sendObsRequest("GetStats")
      ]);

      const scenesRaw = Array.isArray(sceneList.scenes) ? sceneList.scenes : [];
      const sceneNames = scenesRaw
        .map((item) => {
          const record = asRecord(item);
          return typeof record?.sceneName === "string" ? record.sceneName : "";
        })
        .filter(Boolean);

      setObsScenes(sceneNames);
      const currentSceneName =
        typeof sceneList.currentProgramSceneName === "string" ? sceneList.currentProgramSceneName : "";
      setObsCurrentScene(currentSceneName);

      const streamActive = streamStatus.outputActive === true;
      const recordActive = recordStatus.outputActive === true;
      setObsStreamActive(streamActive);
      setObsRecordActive(recordActive);

      setObsStats({
        cpuUsage: readNumber(statsResponse.cpuUsage),
        activeFps: readNumber(statsResponse.activeFps),
        outputSkippedFrames: readNumber(statsResponse.outputSkippedFrames),
        outputTotalFrames: readNumber(statsResponse.outputTotalFrames)
      });

      if (currentSceneName) {
        const sceneItemsResponse = await sendObsRequest("GetSceneItemList", {
          sceneName: currentSceneName
        });
        const sceneItemsRaw = Array.isArray(sceneItemsResponse.sceneItems) ? sceneItemsResponse.sceneItems : [];
        const sceneItems: ObsSceneItem[] = sceneItemsRaw
          .map((item) => {
            const record = asRecord(item);
            const id = readNumber(record?.sceneItemId);
            const name = typeof record?.sourceName === "string" ? record.sourceName : "";
            const enabled = record?.sceneItemEnabled === true;
            if (!id || !name) return null;
            return {
              sceneItemId: id,
              sourceName: name,
              enabled
            } satisfies ObsSceneItem;
          })
          .filter(Boolean) as ObsSceneItem[];
        setObsSceneItems(sceneItems);
      } else {
        setObsSceneItems([]);
      }

      const inputListResponse = await sendObsRequest("GetInputList");
      const inputRows = Array.isArray(inputListResponse.inputs) ? inputListResponse.inputs : [];
      const inputNames = inputRows
        .map((item) => {
          const row = asRecord(item);
          return typeof row?.inputName === "string" ? row.inputName : "";
        })
        .filter(Boolean);
      const uniqueInputNames = Array.from(new Set(inputNames));

      const audioStates = await Promise.all(
        uniqueInputNames.map(async (inputName) => {
          try {
            const [muteResponse, volumeResponse] = await Promise.all([
              sendObsRequest("GetInputMute", { inputName }),
              sendObsRequest("GetInputVolume", { inputName })
            ]);
            return {
              inputName,
              muted: muteResponse.inputMuted === true,
              volumeMul: clamp01(readNumber(volumeResponse.inputVolumeMul) ?? 1)
            } satisfies ObsAudioInput;
          } catch {
            return null;
          }
        })
      );
      setObsAudioInputs(audioStates.filter(Boolean) as ObsAudioInput[]);
    } catch (error) {
      setObsStatusText(error instanceof Error ? error.message : String(error));
    }
  };

  const handleObsMessage = async (raw: string) => {
    let payload: any = null;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }

    if (!payload || typeof payload !== "object") return;
    if (typeof payload.op !== "number") return;

    if (payload.op === 0) {
      const hello = asRecord(payload.d);
      const rpcVersion = typeof hello?.rpcVersion === "number" ? hello.rpcVersion : 1;
      obsRpcVersionRef.current = rpcVersion;

      let authentication: string | undefined;
      const authBlock = asRecord(hello?.authentication);
      const challenge = typeof authBlock?.challenge === "string" ? authBlock.challenge : "";
      const salt = typeof authBlock?.salt === "string" ? authBlock.salt : "";
      if (challenge && salt) {
        if (!obsPassword.trim()) {
          throw new Error("OBS requires a password.");
        }
        const secret = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${obsPassword}${salt}`, {
          encoding: Crypto.CryptoEncoding.BASE64
        });
        authentication = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          `${secret}${challenge}`,
          {
            encoding: Crypto.CryptoEncoding.BASE64
          }
        );
      }

      const socket = obsSocketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      socket.send(
        JSON.stringify({
          op: 1,
          d: {
            rpcVersion,
            authentication,
            eventSubscriptions: 1023
          }
        })
      );
      return;
    }

    if (payload.op === 2) {
      setObsConnected(true);
      setObsConnecting(false);
      setObsStatusText("Connected");
      void refreshObsState();
      return;
    }

    if (payload.op === 5) {
      const eventPayload = asRecord(payload.d);
      const eventType = typeof eventPayload?.eventType === "string" ? eventPayload.eventType : "";
      const eventData = asRecord(eventPayload?.eventData);

      if (eventType === "CurrentProgramSceneChanged") {
        const sceneName = typeof eventData?.sceneName === "string" ? eventData.sceneName : "";
        if (sceneName) {
          setObsCurrentScene(sceneName);
          void refreshObsState();
        }
      } else if (eventType === "StreamStateChanged") {
        setObsStreamActive(eventData?.outputActive === true);
      } else if (eventType === "RecordStateChanged") {
        setObsRecordActive(eventData?.outputActive === true);
      } else if (eventType === "SceneItemEnableStateChanged") {
        const sceneItemId = readNumber(eventData?.sceneItemId);
        const enabled = eventData?.sceneItemEnabled === true;
        if (!sceneItemId) return;
        setObsSceneItems((previous) =>
          previous.map((item) => (item.sceneItemId === sceneItemId ? { ...item, enabled } : item))
        );
      } else if (eventType === "InputMuteStateChanged") {
        const inputName = typeof eventData?.inputName === "string" ? eventData.inputName : "";
        const inputMuted = eventData?.inputMuted === true;
        if (!inputName) return;
        setObsAudioInputs((previous) =>
          previous.map((item) => (item.inputName === inputName ? { ...item, muted: inputMuted } : item))
        );
      } else if (eventType === "InputVolumeChanged") {
        const inputName = typeof eventData?.inputName === "string" ? eventData.inputName : "";
        const inputVolumeMul = clamp01(readNumber(eventData?.inputVolumeMul) ?? 1);
        if (!inputName) return;
        setObsAudioInputs((previous) =>
          previous.map((item) => (item.inputName === inputName ? { ...item, volumeMul: inputVolumeMul } : item))
        );
      }
      return;
    }

    if (payload.op === 7) {
      const responsePayload = asRecord(payload.d);
      if (!responsePayload) return;
      const requestId = typeof responsePayload?.requestId === "string" ? responsePayload.requestId : "";
      if (!requestId) return;

      const pending = obsPendingRef.current.get(requestId);
      if (!pending) return;
      obsPendingRef.current.delete(requestId);
      clearTimeout(pending.timeoutId);

      const requestStatus = asRecord(responsePayload.requestStatus);
      const ok = requestStatus?.result === true;
      if (!ok) {
        const comment =
          typeof requestStatus?.comment === "string" && requestStatus.comment
            ? requestStatus.comment
            : "OBS request failed.";
        pending.reject(new Error(comment));
        return;
      }

      const responseData = asRecord(responsePayload.responseData) ?? {};
      pending.resolve(responseData);
    }
  };

  const connectObs = () => {
    if (obsConnecting || obsConnected) return;

    const host = obsHost.trim();
    const port = obsPort.trim();
    if (!host || !port) {
      showNotice("OBS host and port are required.");
      return;
    }

    setObsConnecting(true);
    setObsStatusText("Connecting...");

    try {
      const socket = new WebSocket(`ws://${host}:${port}`);
      obsSocketRef.current = socket;

      socket.onopen = () => {
        setObsStatusText("Socket connected. Waiting for OBS handshake...");
      };

      socket.onmessage = (event) => {
        void handleObsMessage(String(event.data)).catch((error) => {
          setObsStatusText(error instanceof Error ? error.message : String(error));
          showNotice(error instanceof Error ? error.message : String(error));
          disconnectObs("OBS authentication failed.");
        });
      };

      socket.onerror = () => {
        setObsStatusText("OBS socket error.");
      };

      socket.onclose = () => {
        const wasConnected = obsConnected;
        rejectAllObsPending("OBS connection closed.");
        setObsConnected(false);
        setObsConnecting(false);
        if (!wasConnected) {
          setObsStatusText("Could not connect to OBS.");
        } else {
          setObsStatusText("Disconnected");
        }
      };
    } catch (error) {
      setObsConnecting(false);
      setObsConnected(false);
      setObsStatusText(error instanceof Error ? error.message : String(error));
    }
  };

  const switchObsScene = async (sceneName: string) => {
    if (!sceneName) return;
    try {
      await sendObsRequest("SetCurrentProgramScene", {
        sceneName
      });
      setObsCurrentScene(sceneName);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const toggleObsStream = async () => {
    try {
      await sendObsRequest(obsStreamActive ? "StopStream" : "StartStream");
      await refreshObsState();
    } catch (error) {
      showNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const toggleObsRecord = async () => {
    try {
      await sendObsRequest(obsRecordActive ? "StopRecord" : "StartRecord");
      await refreshObsState();
    } catch (error) {
      showNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const toggleObsSceneItem = async (sceneItem: ObsSceneItem) => {
    if (!obsCurrentScene) return;
    try {
      await sendObsRequest("SetSceneItemEnabled", {
        sceneName: obsCurrentScene,
        sceneItemId: sceneItem.sceneItemId,
        sceneItemEnabled: !sceneItem.enabled
      });
      setObsSceneItems((previous) =>
        previous.map((item) =>
          item.sceneItemId === sceneItem.sceneItemId ? { ...item, enabled: !sceneItem.enabled } : item
        )
      );
    } catch (error) {
      showNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const toggleObsInputMute = async (input: ObsAudioInput) => {
    try {
      await sendObsRequest("SetInputMute", {
        inputName: input.inputName,
        inputMuted: !input.muted
      });
      setObsAudioInputs((previous) =>
        previous.map((item) => (item.inputName === input.inputName ? { ...item, muted: !input.muted } : item))
      );
    } catch (error) {
      showNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const adjustObsInputVolume = async (input: ObsAudioInput, delta: number) => {
    try {
      const nextVolume = clamp01(input.volumeMul + delta);
      await sendObsRequest("SetInputVolume", {
        inputName: input.inputName,
        inputVolumeMul: nextVolume
      });
      setObsAudioInputs((previous) =>
        previous.map((item) => (item.inputName === input.inputName ? { ...item, volumeMul: nextVolume } : item))
      );
    } catch (error) {
      showNotice(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    return () => {
      for (const adapter of adaptersRef.current.values()) {
        void adapter.disconnect();
      }
      adaptersRef.current.clear();

      const socket = obsSocketRef.current;
      obsSocketRef.current = null;
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
      rejectAllObsPending("App closed.");

      if (noticeTimerRef.current) {
        clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!activeChatTab) {
      setSendTargetId(OBS_ALL_SEND_TARGET);
      return;
    }

    if (writableActiveSources.length === 1) {
      setSendTargetId(writableActiveSources[0].id);
      return;
    }

    if (writableActiveSources.some((source) => source.id === sendTargetId)) {
      return;
    }

    setSendTargetId(OBS_ALL_SEND_TARGET);
  }, [activeChatTab, sendTargetId, writableActiveSources]);

  const sendTargets = useMemo(() => {
    if (!activeChatTab) return [];
    const targets: Array<{ id: ObsSendTarget; label: string }> = [];
    if (writableActiveSources.length > 1) {
      targets.push({
        id: OBS_ALL_SEND_TARGET,
        label: `All writable (${writableActiveSources.length})`
      });
    }
    for (const source of writableActiveSources) {
      targets.push({
        id: source.id,
        label: `${source.platform}/${source.channel}`
      });
    }
    return targets;
  }, [activeChatTab, writableActiveSources]);

  const renderChatTabBody = () => {
    if (!activeChatTab) return null;

    const activeSourceStatusSummary =
      activeChatSources.length === 1
        ? `${activeChatSources[0].platform}/${activeChatSources[0].channel} - ${statusLabel(
            statusBySource[activeChatSources[0].id]
          )}`
        : `${activeChatSources.length} chats combined`;

    return (
      <>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{activeSourceStatusSummary}</Text>
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

        {sendTargets.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.targetStrip}>
            {sendTargets.map((target) => {
              const active = target.id === sendTargetId;
              return (
                <Pressable
                  key={String(target.id)}
                  onPress={() => setSendTargetId(target.id)}
                  style={active ? [styles.targetPill, styles.targetPillActive] : styles.targetPill}
                >
                  <Text style={active ? [styles.targetPillText, styles.targetPillTextActive] : styles.targetPillText}>
                    {target.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

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
    );
  };

  const renderObsController = () => {
    const status = obsConnected ? "connected" : obsConnecting ? "connecting" : "disconnected";
    const droppedFramePercent =
      obsStats.outputSkippedFrames !== null &&
      obsStats.outputTotalFrames !== null &&
      obsStats.outputTotalFrames > 0
        ? (obsStats.outputSkippedFrames / obsStats.outputTotalFrames) * 100
        : null;

    return (
      <View style={styles.obsCard}>
        <Text style={styles.sectionTitle}>OBS Controller</Text>
        <Text style={styles.configHint}>Control one OBS instance remotely via obs-websocket.</Text>

        <View style={styles.addRow}>
          <TextInput
            value={obsHost}
            onChangeText={setObsHost}
            placeholder="Host"
            placeholderTextColor="#6c7888"
            autoCapitalize="none"
            style={[styles.input, styles.grow]}
          />
          <TextInput
            value={obsPort}
            onChangeText={setObsPort}
            placeholder="Port"
            placeholderTextColor="#6c7888"
            keyboardType="number-pad"
            style={styles.portInput}
          />
        </View>

        <TextInput
          value={obsPassword}
          onChangeText={setObsPassword}
          placeholder="OBS password (if set)"
          placeholderTextColor="#6c7888"
          secureTextEntry
          style={styles.input}
        />

        <View style={styles.obsStatusRow}>
          <Text style={styles.metaText}>Status: {status}</Text>
          <Text style={styles.metaText}>{obsStatusText}</Text>
        </View>

        <View style={styles.obsActionsRow}>
          <Pressable
            onPress={obsConnected ? () => disconnectObs("Disconnected") : connectObs}
            style={obsConnected ? styles.warningButton : styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>{obsConnected ? "Disconnect" : obsConnecting ? "Connecting..." : "Connect"}</Text>
          </Pressable>
          <Pressable onPress={() => void refreshObsState()} disabled={!obsConnected} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Refresh</Text>
          </Pressable>
        </View>

        {obsConnected ? (
          <>
            <View style={styles.obsActionsRow}>
              <Pressable onPress={() => void toggleObsStream()} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>{obsStreamActive ? "Stop Stream" : "Start Stream"}</Text>
              </Pressable>
              <Pressable onPress={() => void toggleObsRecord()} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>{obsRecordActive ? "Stop Record" : "Start Record"}</Text>
              </Pressable>
            </View>

            <Text style={styles.sectionLabel}>Scenes</Text>
            {obsScenes.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sceneStrip}>
                {obsScenes.map((scene) => {
                  const active = scene === obsCurrentScene;
                  return (
                    <Pressable
                      key={scene}
                      onPress={() => void switchObsScene(scene)}
                      style={active ? [styles.scenePill, styles.scenePillActive] : styles.scenePill}
                    >
                      <Text style={active ? [styles.scenePillText, styles.scenePillTextActive] : styles.scenePillText}>{scene}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : (
              <Text style={styles.emptyText}>No scenes found yet. Tap Refresh.</Text>
            )}

            <Text style={styles.sectionLabel}>Scene Sources</Text>
            {obsSceneItems.length > 0 ? (
              <View style={styles.listBlock}>
                {obsSceneItems.map((item) => (
                  <View key={`${item.sceneItemId}-${item.sourceName}`} style={styles.listRow}>
                    <Text style={styles.listRowLabel}>{item.sourceName}</Text>
                    <Pressable
                      onPress={() => void toggleObsSceneItem(item)}
                      style={item.enabled ? styles.primaryButton : styles.warningButton}
                    >
                      <Text style={styles.primaryButtonText}>{item.enabled ? "Visible" : "Hidden"}</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyText}>No scene sources found for the current scene.</Text>
            )}

            <Text style={styles.sectionLabel}>Audio Inputs</Text>
            {obsAudioInputs.length > 0 ? (
              <View style={styles.listBlock}>
                {obsAudioInputs.map((input) => (
                  <View key={input.inputName} style={styles.audioRow}>
                    <View style={styles.audioDetails}>
                      <Text style={styles.listRowLabel}>{input.inputName}</Text>
                      <Text style={styles.metaText}>Volume: {(input.volumeMul * 100).toFixed(0)}%</Text>
                    </View>
                    <View style={styles.audioActions}>
                      <Pressable onPress={() => void adjustObsInputVolume(input, -0.1)} style={styles.secondaryButton}>
                        <Text style={styles.secondaryButtonText}>-10%</Text>
                      </Pressable>
                      <Pressable onPress={() => void adjustObsInputVolume(input, 0.1)} style={styles.secondaryButton}>
                        <Text style={styles.secondaryButtonText}>+10%</Text>
                      </Pressable>
                      <Pressable onPress={() => void toggleObsInputMute(input)} style={input.muted ? styles.warningButton : styles.primaryButton}>
                        <Text style={styles.primaryButtonText}>{input.muted ? "Muted" : "Live"}</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyText}>No audio inputs found.</Text>
            )}

            <Text style={styles.sectionLabel}>Live Stats</Text>
            <View style={styles.statsRow}>
              <Text style={styles.metaText}>
                CPU: {obsStats.cpuUsage !== null ? `${obsStats.cpuUsage.toFixed(1)}%` : "n/a"}
              </Text>
              <Text style={styles.metaText}>
                FPS: {obsStats.activeFps !== null ? obsStats.activeFps.toFixed(1) : "n/a"}
              </Text>
              <Text style={styles.metaText}>
                Dropped: {droppedFramePercent !== null ? `${droppedFramePercent.toFixed(2)}%` : "n/a"}
              </Text>
            </View>
          </>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <KeyboardAvoidingView behavior={RNPlatform.OS === "ios" ? "padding" : undefined} style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>MultiChat</Text>
            <Text style={styles.subtitle}>Mobile core</Text>
          </View>

          <View style={styles.contentArea}>
            {mobileSection === "chats" ? (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsStrip}>
                  <View style={styles.tabsRow}>
                    {chatTabs.map((tab) => {
                      const active = tab.id === activeTabId;
                      const tabStatus =
                        tab.sourceIds.length === 1
                          ? statusLabel(statusBySource[tab.sourceIds[0]])
                          : `${tab.sourceIds.filter((id) => statusBySource[id] === "connected").length}/${tab.sourceIds.length} live`;

                      return (
                        <View key={tab.id} style={active ? [styles.tabCard, styles.tabCardActive] : styles.tabCard}>
                          <Pressable onPress={() => setActiveTabId(tab.id)} style={styles.tabSelect}>
                            <Text style={styles.tabTag}>
                              {tab.sourceIds.length > 1 ? "COMBO" : platformTag(sourceById.get(tab.sourceIds[0])?.platform ?? "twitch")}
                            </Text>
                            <Text style={styles.tabLabel}>{tab.label}</Text>
                            <Text style={styles.tabStatus}>{tabStatus}</Text>
                          </Pressable>
                          <Pressable onPress={() => void closeTab(tab.id)} style={styles.tabClose}>
                            <Text style={styles.tabCloseText}>x</Text>
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                </ScrollView>

                {activeChatTab ? (
                  renderChatTabBody()
                ) : (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>No chats yet</Text>
                    <Text style={styles.emptyText}>Go to Add and open your first chat.</Text>
                  </View>
                )}
              </>
            ) : null}

            {mobileSection === "add" ? (
              <View style={styles.addCard}>
                <Text style={styles.sectionTitle}>Add Chat</Text>
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

                <Pressable onPress={openCombinedTab} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Combine Open Chats</Text>
                </Pressable>
              </View>
            ) : null}

            {mobileSection === "obs" ? renderObsController() : null}

            {mobileSection === "settings" ? (
              <ScrollView style={styles.settingsScroll} contentContainerStyle={styles.settingsContent}>
                <View style={styles.configCard}>
                  <Text style={styles.sectionTitle}>Accounts</Text>
                  <Text style={styles.configHint}>OAuth sign-in is temporarily disabled for mobile.</Text>
                  <Text style={styles.configHint}>Twitch and Kick are currently read-only in this build.</Text>

                  <Text style={styles.sectionTitle}>YouTube (read-only)</Text>
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
              </ScrollView>
            ) : null}
          </View>

          <View style={styles.bottomNav}>
            <Pressable
              onPress={openChatsSection}
              style={mobileSection === "chats" ? [styles.bottomNavItem, styles.bottomNavItemActive] : styles.bottomNavItem}
            >
              <Text style={mobileSection === "chats" ? [styles.bottomNavIcon, styles.bottomNavTextActive] : styles.bottomNavIcon}>⌂</Text>
              <Text style={mobileSection === "chats" ? [styles.bottomNavText, styles.bottomNavTextActive] : styles.bottomNavText}>Chats</Text>
            </Pressable>
            <Pressable
              onPress={openAddSection}
              style={mobileSection === "add" ? [styles.bottomNavItem, styles.bottomNavItemActive] : styles.bottomNavItem}
            >
              <Text style={mobileSection === "add" ? [styles.bottomNavIcon, styles.bottomNavTextActive] : styles.bottomNavIcon}>＋</Text>
              <Text style={mobileSection === "add" ? [styles.bottomNavText, styles.bottomNavTextActive] : styles.bottomNavText}>Add</Text>
            </Pressable>
            <Pressable
              onPress={openObsControllerTab}
              style={mobileSection === "obs" ? [styles.bottomNavItem, styles.bottomNavItemActive] : styles.bottomNavItem}
            >
              <Text style={mobileSection === "obs" ? [styles.bottomNavIcon, styles.bottomNavTextActive] : styles.bottomNavIcon}>◎</Text>
              <Text style={mobileSection === "obs" ? [styles.bottomNavText, styles.bottomNavTextActive] : styles.bottomNavText}>OBS</Text>
            </Pressable>
            <Pressable
              onPress={openSettingsSection}
              style={mobileSection === "settings" ? [styles.bottomNavItem, styles.bottomNavItemActive] : styles.bottomNavItem}
            >
              <Text style={mobileSection === "settings" ? [styles.bottomNavIcon, styles.bottomNavTextActive] : styles.bottomNavIcon}>⚙</Text>
              <Text style={mobileSection === "settings" ? [styles.bottomNavText, styles.bottomNavTextActive] : styles.bottomNavText}>Settings</Text>
            </Pressable>
          </View>

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
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  contentArea: {
    flex: 1,
    minHeight: 0
  },
  settingsScroll: {
    flex: 1
  },
  settingsContent: {
    gap: 10,
    paddingBottom: 96
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
  sectionTitle: {
    color: "#d8e2f0",
    fontSize: 13,
    fontWeight: "700"
  },
  sectionLabel: {
    color: "#d8e2f0",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4
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
  combineRow: {
    flexDirection: "row",
    justifyContent: "flex-start"
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
  targetStrip: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    marginBottom: 4
  },
  targetPill: {
    borderWidth: 1,
    borderColor: "#2a3344",
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10
  },
  targetPillActive: {
    borderColor: "#38bdf8",
    backgroundColor: "#163042"
  },
  targetPillText: {
    color: "#9eb0c8",
    fontSize: 11,
    fontWeight: "600"
  },
  targetPillTextActive: {
    color: "#d9f5ff"
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
  portInput: {
    width: 90,
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
  obsCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#1f2938",
    borderRadius: 10,
    backgroundColor: "#101722",
    padding: 10,
    gap: 8
  },
  obsStatusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8
  },
  obsActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  sceneStrip: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 4
  },
  scenePill: {
    borderWidth: 1,
    borderColor: "#2a3344",
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10
  },
  scenePillActive: {
    borderColor: "#34d399",
    backgroundColor: "#163a31"
  },
  scenePillText: {
    color: "#9eb0c8",
    fontSize: 11,
    fontWeight: "600"
  },
  scenePillTextActive: {
    color: "#dcfff1"
  },
  listBlock: {
    borderWidth: 1,
    borderColor: "#243040",
    borderRadius: 8,
    backgroundColor: "#0d1522",
    padding: 8,
    gap: 8
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  listRowLabel: {
    color: "#d5e4f7",
    fontSize: 12,
    fontWeight: "600",
    flex: 1
  },
  audioRow: {
    borderWidth: 1,
    borderColor: "#243040",
    borderRadius: 8,
    backgroundColor: "#101a2a",
    padding: 8,
    gap: 8
  },
  audioDetails: {
    gap: 2
  },
  audioActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap"
  },
  statsRow: {
    borderWidth: 1,
    borderColor: "#243040",
    borderRadius: 8,
    backgroundColor: "#0d1522",
    paddingHorizontal: 8,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
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
  },
  bottomNav: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#1c2533",
    borderRadius: 14,
    backgroundColor: "#0f1624",
    flexDirection: "row",
    alignItems: "stretch",
    padding: 4,
    gap: 4
  },
  bottomNavItem: {
    flex: 1,
    minHeight: 54,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8
  },
  bottomNavItemActive: {
    backgroundColor: "#1a2940"
  },
  bottomNavIcon: {
    color: "#8ea2b9",
    fontSize: 16,
    marginBottom: 2
  },
  bottomNavText: {
    color: "#8ea2b9",
    fontSize: 12,
    fontWeight: "600"
  },
  bottomNavTextActive: {
    color: "#d9e8ff"
  }
});
