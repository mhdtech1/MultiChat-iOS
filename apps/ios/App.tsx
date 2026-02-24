import React, { useEffect, useMemo, useRef, useState } from "react";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Crypto from "expo-crypto";
import * as FileSystemLegacy from "expo-file-system/legacy";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform as RNPlatform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
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
  sourceIds: string[];
  label: string;
};

type TabMessageItem = {
  sourceId: string;
  message: ChatMessage;
};

type RenderBadge = {
  key: string;
  label?: string;
  imageUri?: string;
};

type CredentialSnapshot = {
  twitchToken: string;
  twitchUsername: string;
  kickToken: string;
  kickUsername: string;
  youtubeAccessToken: string;
  youtubeRefreshToken: string;
};

type KickTokenResponse = {
  access_token?: string;
  refresh_token?: string;
};

type TwitchTokenResponse = {
  access_token?: string;
  refresh_token?: string;
};

type YouTubeTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
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

type ObsSavedConnection = {
  id: string;
  name: string;
  host: string;
  port: string;
  password?: string;
};

type ObsReachability = "checking" | "reachable" | "offline";

type MobileSection = "chats" | "add" | "obs" | "accounts";
type ObsDetailTab = "sceneItems" | "audio";

type PersistedAppStateV1 = {
  version: number;
  platformInput: PlatformId;
  channelInput: string;
  mobileSection: MobileSection;
  sources: ChatSource[];
  tabs: ChatTab[];
  activeTabId: string | null;
  twitchUsername: string;
  twitchToken: string;
  kickUsername: string;
  kickToken: string;
  kickRefreshToken: string;
  youtubeAccessToken: string;
  youtubeRefreshToken: string;
  youtubeTokenExpiry: number;
  youtubeUsername: string;
  obsHost: string;
  obsPort: string;
  obsPassword: string;
  obsSavedName: string;
  obsDetailTab: ObsDetailTab;
};

const PLATFORM_OPTIONS: PlatformId[] = ["twitch", "kick", "youtube"];

const TWITCH_CLIENT_ID = "syeui9mom7i5f9060j03tydgpdywbh";
const KICK_CLIENT_ID = "01KGRFF03VYRJMB3W4369Y07CS";
const KICK_CLIENT_SECRET = "29f43591eb0496352c66ea36f55c5c21e3fbc5053ba22568194e0c950c174794";
const TWITCH_REDIRECT_URI = "multichat://oauth/twitch";
const KICK_REDIRECT_URI = "multichat://oauth/kick";
const YOUTUBE_CLIENT_ID = "1008732662207-rufcsa7rafob02h29docduk7pboim0s8.apps.googleusercontent.com";
const YOUTUBE_REDIRECT_URI = "multichat://oauth/youtube";

const TWITCH_SCOPES = [
  "chat:read",
  "chat:edit",
  "moderator:manage:banned_users",
  "moderator:manage:chat_messages",
  "moderator:read:moderators"
];

const KICK_SCOPES = ["user:read", "channel:read", "chat:write", "moderation:ban", "moderation:chat_message:manage"];
const YOUTUBE_SCOPES = ["https://www.googleapis.com/auth/youtube.force-ssl"];

const PLATFORM_LOGOS: Record<PlatformId, string> = {
  twitch: "https://static.twitchcdn.net/assets/favicon-32-e29e246c157142c94346.png",
  kick: "https://kick.com/favicon.ico",
  youtube: "https://www.youtube.com/favicon.ico"
};

const APP_STATE_FILENAME = "mobile-app-state-v1.json";
const OBS_SAVED_CONNECTIONS_FILENAME = "obs-saved-connections.json";
const OBS_PREVIEW_TARGET_INTERVAL_MS = Math.round(1000 / 24);
const OBS_SCENE_TILE_ROW_GAP = 10;
const TWITCH_GLOBAL_BADGES_URL = "https://badges.twitch.tv/v1/badges/global/display";

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const formatClock = (timestamp: string) => {
  const value = Date.parse(timestamp);
  if (Number.isNaN(value)) return "--:--";
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
};

const formatObsDuration = (durationMs: number | null) => {
  const safeMs = durationMs && Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
  const totalSeconds = Math.floor(safeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const statusLabel = (status: ChatAdapterStatus | undefined) => {
  if (!status) return "disconnected";
  return status;
};

const platformTag = (platform: string) => {
  if (platform === "twitch") return "TW";
  if (platform === "kick") return "KI";
  if (platform === "tiktok") return "TT";
  return "YT";
};

const isWritable = (platform: PlatformId, credentials: CredentialSnapshot) => {
  if (platform === "twitch") {
    return Boolean(credentials.twitchToken.trim() && credentials.twitchUsername.trim());
  }
  if (platform === "kick") {
    return Boolean(credentials.kickToken.trim());
  }
  return Boolean(credentials.youtubeAccessToken.trim() || credentials.youtubeRefreshToken.trim());
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

const normalizeTabSourceSignature = (sourceIds: string[]) => Array.from(new Set(sourceIds)).sort().join(",");

const parseSevenTvEmoteMap = (value: unknown): Record<string, string> => {
  const root = asRecord(value);
  if (!root) return {};

  const nestedSet = asRecord(root.emote_set);
  const nestedEmotes = nestedSet && Array.isArray(nestedSet.emotes) ? nestedSet.emotes : [];
  const emoteArray = Array.isArray(root.emotes) ? root.emotes : nestedEmotes;

  const next: Record<string, string> = {};
  for (const entry of emoteArray) {
    const record = asRecord(entry);
    if (!record) continue;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (!id || !name) continue;
    next[name] = `https://cdn.7tv.app/emote/${id}/1x.webp`;
  }
  return next;
};

const parseTwitchBadgeMap = (value: unknown): Record<string, string> => {
  const root = asRecord(value);
  if (!root) return {};
  const badgeSets = asRecord(root.badge_sets);
  if (!badgeSets) return {};

  const next: Record<string, string> = {};
  for (const [setId, setValue] of Object.entries(badgeSets)) {
    const setRecord = asRecord(setValue);
    const versions = setRecord && Array.isArray(setRecord.versions) ? setRecord.versions : [];
    for (const version of versions) {
      const versionRecord = asRecord(version);
      if (!versionRecord) continue;
      const versionId = typeof versionRecord.id === "string" ? versionRecord.id.trim() : "";
      if (!versionId) continue;
      const imageUrl =
        (typeof versionRecord.image_url_1x === "string" && versionRecord.image_url_1x.trim()) ||
        (typeof versionRecord.image_url_2x === "string" && versionRecord.image_url_2x.trim()) ||
        (typeof versionRecord.image_url_4x === "string" && versionRecord.image_url_4x.trim()) ||
        "";
      if (!imageUrl) continue;
      next[`${setId}/${versionId}`] = imageUrl;
    }
  }
  return next;
};

const readPossibleImageUri = (record: Record<string, unknown>): string => {
  const directKeys = [
    "image",
    "image_url",
    "imageUrl",
    "icon",
    "icon_url",
    "iconUrl",
    "src",
    "url",
    "badge_image",
    "badgeImage",
    "thumbnail",
    "small",
    "tiny"
  ];
  for (const key of directKeys) {
    const value = record[key];
    if (typeof value === "string" && /^https?:\/\//i.test(value.trim())) {
      return value.trim();
    }
    const nested = asRecord(value);
    if (!nested) continue;
    for (const nestedKey of ["1x", "2x", "4x", "url", "src", "small", "tiny"]) {
      const nestedValue = nested[nestedKey];
      if (typeof nestedValue === "string" && /^https?:\/\//i.test(nestedValue.trim())) {
        return nestedValue.trim();
      }
    }
  }
  return "";
};

const compactBadgeLabel = (value: string) => {
  const normalized = value.trim();
  if (!normalized) return "";
  const first = normalized.split(/[/:\s]/)[0] ?? normalized;
  return first.slice(0, 4).toUpperCase();
};

type MessageSegment =
  | {
      type: "text";
      value: string;
    }
  | {
      type: "emote";
      value: string;
      uri: string;
    };

const segmentMessageWithEmotes = (message: string, emoteMap: Record<string, string>): MessageSegment[] => {
  if (!message) return [];
  const parts = message.split(/(\s+)/);
  const segments: MessageSegment[] = [];
  for (const part of parts) {
    if (part.length === 0) continue;
    const emoteUri = emoteMap[part];
    if (emoteUri && !/^\s+$/.test(part)) {
      segments.push({
        type: "emote",
        value: part,
        uri: emoteUri
      });
    } else {
      segments.push({
        type: "text",
        value: part
      });
    }
  }
  return segments;
};

const getObsSavedConnectionsUri = () => {
  const baseDirectory = FileSystemLegacy.documentDirectory;
  if (!baseDirectory) return null;
  return `${baseDirectory}${OBS_SAVED_CONNECTIONS_FILENAME}`;
};

const getAppStateUri = () => {
  const baseDirectory = FileSystemLegacy.documentDirectory;
  if (!baseDirectory) return null;
  return `${baseDirectory}${APP_STATE_FILENAME}`;
};

const normalizePlatformId = (value: unknown): PlatformId => {
  if (value === "kick" || value === "youtube") return value;
  return "twitch";
};

const normalizeMobileSection = (value: unknown): MobileSection => {
  if (value === "add" || value === "obs" || value === "accounts") return value;
  return "chats";
};

const normalizeObsDetailTab = (value: unknown): ObsDetailTab => {
  if (value === "audio") return "audio";
  return "sceneItems";
};

const normalizePersistedSources = (value: unknown): ChatSource[] => {
  if (!Array.isArray(value)) return [];
  const seenByChannel = new Set<string>();
  const seenIds = new Set<string>();
  const next: ChatSource[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const platform = normalizePlatformId(record.platform);
    const channel = typeof record.channel === "string" ? record.channel.trim().toLowerCase() : "";
    if (!channel) continue;

    const channelKey = `${platform}:${channel}`;
    if (seenByChannel.has(channelKey)) continue;
    seenByChannel.add(channelKey);

    let id = typeof record.id === "string" && record.id.trim() ? record.id.trim() : makeId();
    while (seenIds.has(id)) {
      id = makeId();
    }
    seenIds.add(id);

    next.push({
      id,
      platform,
      channel
    });
  }

  return next;
};

const normalizePersistedTabs = (value: unknown, sources: ChatSource[]): ChatTab[] => {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const seenIds = new Set<string>();
  const sourceWithStandaloneTab = new Set<string>();
  const next: ChatTab[] = [];

  if (Array.isArray(value)) {
    for (const entry of value) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const sourceIdsRaw = Array.isArray(record.sourceIds)
        ? record.sourceIds
            .map((candidate) => (typeof candidate === "string" ? candidate.trim() : ""))
            .filter(Boolean)
        : [];
      const legacySourceId = typeof record.sourceId === "string" ? record.sourceId.trim() : "";
      if (sourceIdsRaw.length === 0 && legacySourceId) {
        sourceIdsRaw.push(legacySourceId);
      }
      if (sourceIdsRaw.length === 0) continue;

      const sourceIds = Array.from(new Set(sourceIdsRaw.filter((candidate) => sourceById.has(candidate))));
      if (sourceIds.length === 0) continue;
      if (sourceIds.length === 1 && sourceWithStandaloneTab.has(sourceIds[0])) continue;

      let id = typeof record.id === "string" && record.id.trim() ? record.id.trim() : makeId();
      while (seenIds.has(id)) {
        id = makeId();
      }
      seenIds.add(id);

      const defaultLabel =
        sourceIds.length === 1
          ? (() => {
              const source = sourceById.get(sourceIds[0]);
              return source ? `${source.platform}/${source.channel}` : "Chat";
            })()
          : `Merged (${sourceIds.length})`;
      const label = typeof record.label === "string" && record.label.trim() ? record.label.trim() : defaultLabel;
      if (sourceIds.length === 1) {
        sourceWithStandaloneTab.add(sourceIds[0]);
      }
      next.push({
        id,
        sourceIds,
        label
      });
    }
  }

  for (const source of sources) {
    if (sourceWithStandaloneTab.has(source.id)) continue;
    let id = makeId();
    while (seenIds.has(id)) {
      id = makeId();
    }
    seenIds.add(id);
    next.push({
      id,
      sourceIds: [source.id],
      label: `${source.platform}/${source.channel}`
    });
  }

  return next;
};

const normalizePersistedAppState = (value: unknown): PersistedAppStateV1 | null => {
  const record = asRecord(value);
  if (!record) return null;

  const sources = normalizePersistedSources(record.sources);
  const tabs = normalizePersistedTabs(record.tabs, sources);
  const activeTabCandidate = typeof record.activeTabId === "string" ? record.activeTabId.trim() : "";
  const hasActiveTab = activeTabCandidate && tabs.some((tab) => tab.id === activeTabCandidate);

  return {
    version: 1,
    platformInput: normalizePlatformId(record.platformInput),
    channelInput: typeof record.channelInput === "string" ? record.channelInput : "",
    mobileSection: normalizeMobileSection(record.mobileSection),
    sources,
    tabs,
    activeTabId: hasActiveTab ? activeTabCandidate : tabs[0]?.id ?? null,
    twitchUsername: typeof record.twitchUsername === "string" ? record.twitchUsername : "",
    twitchToken: typeof record.twitchToken === "string" ? record.twitchToken : "",
    kickUsername: typeof record.kickUsername === "string" ? record.kickUsername : "",
    kickToken: typeof record.kickToken === "string" ? record.kickToken : "",
    kickRefreshToken: typeof record.kickRefreshToken === "string" ? record.kickRefreshToken : "",
    youtubeAccessToken: typeof record.youtubeAccessToken === "string" ? record.youtubeAccessToken : "",
    youtubeRefreshToken: typeof record.youtubeRefreshToken === "string" ? record.youtubeRefreshToken : "",
    youtubeTokenExpiry:
      typeof record.youtubeTokenExpiry === "number" && Number.isFinite(record.youtubeTokenExpiry)
        ? record.youtubeTokenExpiry
        : 0,
    youtubeUsername: typeof record.youtubeUsername === "string" ? record.youtubeUsername : "",
    obsHost: typeof record.obsHost === "string" && record.obsHost.trim() ? record.obsHost.trim() : "127.0.0.1",
    obsPort: typeof record.obsPort === "string" && record.obsPort.trim() ? record.obsPort.trim() : "4455",
    obsPassword: typeof record.obsPassword === "string" ? record.obsPassword : "",
    obsSavedName: typeof record.obsSavedName === "string" ? record.obsSavedName : "",
    obsDetailTab: normalizeObsDetailTab(record.obsDetailTab)
  };
};

const normalizeObsSavedConnections = (value: unknown): ObsSavedConnection[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const host = typeof record.host === "string" ? record.host.trim() : "";
      const port = typeof record.port === "string" ? record.port.trim() : "";
      if (!host || !port) return null;

      const id = typeof record.id === "string" && record.id.trim() ? record.id.trim() : makeId();
      const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : host;
      const password = typeof record.password === "string" && record.password.trim() ? record.password : undefined;
      return {
        id,
        name,
        host,
        port,
        password
      } satisfies ObsSavedConnection;
    })
    .filter(Boolean) as ObsSavedConnection[];
};

const probeObsEndpoint = async (host: string, port: string, timeoutMs = 2200): Promise<boolean> => {
  return await new Promise((resolve) => {
    let settled = false;
    let socket: WebSocket | null = null;
    const done = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timeoutId = setTimeout(() => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
      done(false);
    }, timeoutMs);

    try {
      socket = new WebSocket(`ws://${host}:${port}`);
      socket.onopen = () => {
        clearTimeout(timeoutId);
        socket?.close();
        done(true);
      };
      socket.onerror = () => {
        clearTimeout(timeoutId);
        done(false);
      };
      socket.onclose = () => {
        clearTimeout(timeoutId);
        done(false);
      };
    } catch {
      clearTimeout(timeoutId);
      done(false);
    }
  });
};

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

const readCallbackParams = (callbackUrl: URL): URLSearchParams => {
  const params = new URLSearchParams(callbackUrl.search);
  const hash = callbackUrl.hash.startsWith("#") ? callbackUrl.hash.slice(1) : callbackUrl.hash;
  if (hash) {
    const hashParams = new URLSearchParams(hash);
    for (const [key, value] of hashParams.entries()) {
      if (!params.has(key)) {
        params.set(key, value);
      }
    }
  }
  return params;
};

const createCodeChallenge = async (codeVerifier: string) => {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, codeVerifier, {
    encoding: Crypto.CryptoEncoding.BASE64
  });
  return toBase64Url(digest);
};

const parseObsQr = (raw: string): { host: string; port: string; password?: string } | null => {
  const value = raw.trim();
  if (!value) return null;

  const decodeValue = (input: string | null | undefined) => {
    if (!input) return "";
    const trimmed = input.trim();
    if (!trimmed) return "";
    try {
      return decodeURIComponent(trimmed.replace(/\+/g, "%20")).trim();
    } catch {
      return trimmed;
    }
  };

  const firstNonEmpty = (...candidates: Array<unknown>) => {
    for (const candidate of candidates) {
      if (typeof candidate === "string") {
        const decoded = decodeValue(candidate);
        if (decoded) return decoded;
        continue;
      }
      if (typeof candidate === "number" && Number.isFinite(candidate)) {
        const normalized = String(candidate).trim();
        if (normalized) return normalized;
      }
    }
    return "";
  };

  const normalizeUrlPayload = (input: string) => {
    try {
      const resolved = input.startsWith("obsws://") ? `ws://${input.slice("obsws://".length)}` : input;
      const url = new URL(resolved);
      const host = firstNonEmpty(
        url.hostname,
        url.searchParams.get("host"),
        url.searchParams.get("hostname"),
        url.searchParams.get("address"),
        url.searchParams.get("ip"),
        url.searchParams.get("server")
      );
      const port = firstNonEmpty(url.port, url.searchParams.get("port"), url.searchParams.get("wsPort"), "4455");
      if (!host || !port) return null;
      const password = firstNonEmpty(
        url.searchParams.get("password"),
        url.searchParams.get("pwd"),
        url.searchParams.get("pass"),
        url.searchParams.get("serverPassword"),
        url.searchParams.get("server_password"),
        url.searchParams.get("auth"),
        url.searchParams.get("token"),
        url.password,
        url.username && !url.password ? url.username : "",
        url.pathname && url.pathname !== "/" ? url.pathname.replace(/^\/+/, "") : ""
      );
      return { host, port, password };
    } catch {
      return null;
    }
  };

  if (value.startsWith("obsws://") || value.startsWith("ws://") || value.startsWith("wss://")) {
    return normalizeUrlPayload(value);
  }

  if (value.startsWith("{") && value.endsWith("}")) {
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      const nested =
        asRecord(parsed.connection) ??
        asRecord(parsed.server) ??
        asRecord(parsed.obs) ??
        asRecord(parsed.websocket) ??
        null;
      const host = firstNonEmpty(
        parsed.host,
        parsed.hostname,
        parsed.address,
        parsed.ip,
        parsed.server,
        nested?.host,
        nested?.hostname,
        nested?.address,
        nested?.ip
      );
      const port = firstNonEmpty(parsed.port, parsed.wsPort, parsed.serverPort, nested?.port, nested?.wsPort, "4455");
      const password = firstNonEmpty(
        parsed.password,
        parsed.pass,
        parsed.pwd,
        parsed.serverPassword,
        parsed.server_password,
        parsed.auth,
        parsed.token,
        nested?.password,
        nested?.pass,
        nested?.pwd,
        nested?.serverPassword,
        nested?.auth,
        nested?.token
      );
      if (!host || !port) return null;
      return {
        host,
        port,
        password: password || undefined
      };
    } catch {
      return null;
    }
  }

  if (value.includes("=") && value.includes("&")) {
    const params = new URLSearchParams(value);
    const host = firstNonEmpty(
      params.get("host"),
      params.get("hostname"),
      params.get("address"),
      params.get("ip"),
      params.get("server")
    );
    const port = firstNonEmpty(params.get("port"), params.get("wsPort"), params.get("serverPort"), "4455");
    const password = firstNonEmpty(
      params.get("password"),
      params.get("pwd"),
      params.get("pass"),
      params.get("serverPassword"),
      params.get("server_password"),
      params.get("auth"),
      params.get("token")
    );
    if (!host || !port) return null;
    return {
      host,
      port,
      password: password || undefined
    };
  }

  if (value.includes("://")) {
    const parsed = normalizeUrlPayload(value);
    if (parsed) {
      return parsed;
    }
  }

  const parts = value.split(":");
  if (parts.length >= 2) {
    const host = decodeValue(parts[0]);
    const port = decodeValue(parts[1]) || "4455";
    const password = decodeValue(parts.slice(2).join(":"));
    if (host && port) {
      return {
        host,
        port,
        password: password || undefined
      };
    }
  }

  return null;
};

export default function App() {
  const { width: viewportWidth } = useWindowDimensions();
  const obsCompact = viewportWidth <= 390;

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
  const [youtubeAccessToken, setYoutubeAccessToken] = useState("");
  const [youtubeRefreshToken, setYoutubeRefreshToken] = useState("");
  const [youtubeTokenExpiry, setYoutubeTokenExpiry] = useState(0);
  const [youtubeUsername, setYoutubeUsername] = useState("");

  const [mobileSection, setMobileSection] = useState<MobileSection>("chats");
  const [mergeCandidateTabIds, setMergeCandidateTabIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [authBusy, setAuthBusy] = useState<"twitch" | "kick" | "youtube" | null>(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [appStateLoaded, setAppStateLoaded] = useState(false);
  const [sevenTvGlobalEmotes, setSevenTvGlobalEmotes] = useState<Record<string, string>>({});
  const [sevenTvEmotesBySource, setSevenTvEmotesBySource] = useState<Record<string, Record<string, string>>>({});
  const [twitchGlobalBadgeMap, setTwitchGlobalBadgeMap] = useState<Record<string, string>>({});
  const [twitchChannelBadgeMapByRoomId, setTwitchChannelBadgeMapByRoomId] = useState<Record<string, Record<string, string>>>({});

  const [obsHost, setObsHost] = useState("127.0.0.1");
  const [obsPort, setObsPort] = useState("4455");
  const [obsPassword, setObsPassword] = useState("");
  const [obsSavedName, setObsSavedName] = useState("");
  const [obsSavedConnections, setObsSavedConnections] = useState<ObsSavedConnection[]>([]);
  const [obsSavedConnectionsLoaded, setObsSavedConnectionsLoaded] = useState(false);
  const [obsEditingConnectionId, setObsEditingConnectionId] = useState<string | null>(null);
  const [obsReachabilityById, setObsReachabilityById] = useState<Record<string, ObsReachability>>({});
  const [obsConnected, setObsConnected] = useState(false);
  const [obsConnecting, setObsConnecting] = useState(false);
  const [obsStatusText, setObsStatusText] = useState("Disconnected");
  const [obsScenes, setObsScenes] = useState<string[]>([]);
  const [obsCurrentScene, setObsCurrentScene] = useState("");
  const [obsSceneGridWidth, setObsSceneGridWidth] = useState(0);
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
  const [obsStreamConfirmAction, setObsStreamConfirmAction] = useState<"start" | "stop" | null>(null);
  const [obsStreamConfirmBusy, setObsStreamConfirmBusy] = useState(false);
  const [obsStreamDurationMs, setObsStreamDurationMs] = useState<number | null>(0);
  const [obsRecordDurationMs, setObsRecordDurationMs] = useState<number | null>(0);
  const [obsPreviewExpanded, setObsPreviewExpanded] = useState(true);
  const [obsPreviewImageUri, setObsPreviewImageUri] = useState<string | null>(null);
  const [obsPreviewLoading, setObsPreviewLoading] = useState(false);
  const [obsDetailTab, setObsDetailTab] = useState<ObsDetailTab>("sceneItems");
  const [obsQrScannerOpen, setObsQrScannerOpen] = useState(false);
  const [obsQrScanLocked, setObsQrScanLocked] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const adaptersRef = useRef<Map<string, ChatAdapter>>(new Map());
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<FlatList<TabMessageItem>>(null);
  const obsSocketRef = useRef<WebSocket | null>(null);
  const obsAuthPasswordRef = useRef("");
  const obsPreviewRequestInFlightRef = useRef(false);
  const sevenTvLoadedTwitchUserIdsRef = useRef<Set<string>>(new Set());
  const twitchBadgeFetchInFlightRef = useRef<Set<string>>(new Set());
  const youtubeAccessTokenRef = useRef("");
  const youtubeRefreshTokenRef = useRef("");
  const youtubeTokenExpiryRef = useRef(0);
  const obsPendingRef = useRef<Map<string, ObsPendingRequest>>(new Map());
  const obsRequestIdRef = useRef(1);
  const obsRpcVersionRef = useRef(1);

  const sourceById = useMemo(() => new Map(sources.map((source) => [source.id, source])), [sources]);
  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId) ?? null, [activeTabId, tabs]);
  const activeSourceIds = activeTab?.sourceIds ?? [];
  const activeSources = useMemo(
    () => activeSourceIds.map((sourceId) => sourceById.get(sourceId)).filter(Boolean) as ChatSource[],
    [activeSourceIds, sourceById]
  );

  const activeMessageItems = useMemo<TabMessageItem[]>(() => {
    if (activeSourceIds.length === 0) return [];
    const merged = activeSourceIds.flatMap((sourceId) =>
      (messagesBySource[sourceId] ?? []).map((message) => ({
        sourceId,
        message
      }))
    );
    if (merged.length <= 1) return merged;
    return [...merged].sort((a, b) => {
      const left = Date.parse(a.message.timestamp);
      const right = Date.parse(b.message.timestamp);
      if (Number.isNaN(left) || Number.isNaN(right)) return 0;
      return left - right;
    });
  }, [activeSourceIds, messagesBySource]);

  const credentials = useMemo<CredentialSnapshot>(
    () => ({
      twitchUsername,
      twitchToken,
      kickUsername,
      kickToken,
      youtubeAccessToken,
      youtubeRefreshToken
    }),
    [kickToken, kickUsername, twitchToken, twitchUsername, youtubeAccessToken, youtubeRefreshToken]
  );

  const writableSources = useMemo(
    () => activeSources.filter((source) => isWritable(source.platform, credentials)),
    [activeSources, credentials]
  );
  const activeWritable = writableSources.length > 0;
  const activeConnectionSummary = useMemo(() => {
    if (activeSources.length === 0) return "No active tab";
    if (activeSources.length === 1) {
      return `${activeSources[0].platform}/${activeSources[0].channel}`;
    }
    return `Merged (${activeSources.length} chats)`;
  }, [activeSources]);
  const activeStatusSummary = useMemo(() => {
    if (activeSources.length === 0) return "";
    if (activeSources.length === 1) {
      return statusLabel(statusBySource[activeSources[0].id]);
    }
    const connectedCount = activeSources.filter((source) => statusBySource[source.id] === "connected").length;
    return `${connectedCount}/${activeSources.length} connected`;
  }, [activeSources, statusBySource]);

  const obsSceneColumnCount = useMemo(() => {
    const estimatedWidth = obsSceneGridWidth > 0 ? obsSceneGridWidth : Math.max(240, viewportWidth - 56);
    const autoColumns = Math.floor(estimatedWidth / 118);
    return Math.max(3, Math.min(6, autoColumns));
  }, [obsSceneGridWidth, viewportWidth]);

  const obsSceneTileWidth = useMemo(() => {
    const estimatedWidth = obsSceneGridWidth > 0 ? obsSceneGridWidth : Math.max(240, viewportWidth - 56);
    const totalGutter = (obsSceneColumnCount - 1) * 8;
    const tileWidth = Math.floor((estimatedWidth - totalGutter) / obsSceneColumnCount);
    return Math.max(72, tileWidth);
  }, [obsSceneColumnCount, obsSceneGridWidth, viewportWidth]);

  const obsSceneTileHeight = useMemo(() => {
    const fromWidth = Math.round(obsSceneTileWidth * 0.56);
    const minimum = obsCompact ? 82 : 90;
    return Math.max(minimum, Math.min(116, fromWidth));
  }, [obsCompact, obsSceneTileWidth]);

  const twitchRedirectUri = TWITCH_REDIRECT_URI;
  const kickRedirectUri = KICK_REDIRECT_URI;
  const youtubeRedirectUri = YOUTUBE_REDIRECT_URI;

  useEffect(() => {
    youtubeAccessTokenRef.current = youtubeAccessToken;
  }, [youtubeAccessToken]);

  useEffect(() => {
    youtubeRefreshTokenRef.current = youtubeRefreshToken;
  }, [youtubeRefreshToken]);

  useEffect(() => {
    youtubeTokenExpiryRef.current = youtubeTokenExpiry;
  }, [youtubeTokenExpiry]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("https://7tv.io/v3/emote-sets/global");
        if (!response.ok) return;
        const payload = await response.json();
        if (cancelled) return;
        const emotes = parseSevenTvEmoteMap(payload);
        if (Object.keys(emotes).length > 0) {
          setSevenTvGlobalEmotes(emotes);
        }
      } catch {
        // Best effort only.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(TWITCH_GLOBAL_BADGES_URL);
        if (!response.ok) return;
        const payload = await response.json();
        if (cancelled) return;
        const badgeMap = parseTwitchBadgeMap(payload);
        if (Object.keys(badgeMap).length > 0) {
          setTwitchGlobalBadgeMap(badgeMap);
        }
      } catch {
        // Best effort only.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const uri = getAppStateUri();
        if (!uri) return;
        const info = await FileSystemLegacy.getInfoAsync(uri);
        if (!info.exists) return;
        const raw = await FileSystemLegacy.readAsStringAsync(uri);
        const normalized = normalizePersistedAppState(raw ? JSON.parse(raw) : null);
        if (cancelled || !normalized) return;

        setPlatformInput(normalized.platformInput);
        setChannelInput(normalized.channelInput);
        setMobileSection(normalized.mobileSection);
        setSources(normalized.sources);
        setTabs(normalized.tabs);
        setActiveTabId(normalized.activeTabId);

        setTwitchUsername(normalized.twitchUsername);
        setTwitchToken(normalized.twitchToken);
        setKickUsername(normalized.kickUsername);
        setKickToken(normalized.kickToken);
        setKickRefreshToken(normalized.kickRefreshToken);
        applyYouTubeTokenState(normalized.youtubeAccessToken, normalized.youtubeRefreshToken, normalized.youtubeTokenExpiry);
        setYoutubeUsername(normalized.youtubeUsername);

        setObsHost(normalized.obsHost);
        setObsPort(normalized.obsPort);
        setObsPassword(normalized.obsPassword);
        setObsSavedName(normalized.obsSavedName);
        setObsDetailTab(normalized.obsDetailTab);
      } catch {
        // Keep defaults if persisted state cannot be read.
      } finally {
        if (!cancelled) {
          setAppStateLoaded(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!appStateLoaded) return;
    if (tabs.length === 0) {
      if (activeTabId !== null) {
        setActiveTabId(null);
      }
      return;
    }
    if (!activeTabId || !tabs.some((tab) => tab.id === activeTabId)) {
      setActiveTabId(tabs[0].id);
    }
  }, [activeTabId, appStateLoaded, tabs]);

  useEffect(() => {
    const existing = new Set(tabs.map((tab) => tab.id));
    setMergeCandidateTabIds((previous) => {
      if (previous.length === 0) return previous;
      const next = previous.filter((tabId) => existing.has(tabId));
      return next.length === previous.length ? previous : next;
    });
  }, [tabs]);

  useEffect(() => {
    if (!appStateLoaded) return;
    const snapshot: PersistedAppStateV1 = {
      version: 1,
      platformInput,
      channelInput,
      mobileSection,
      sources,
      tabs,
      activeTabId,
      twitchUsername,
      twitchToken,
      kickUsername,
      kickToken,
      kickRefreshToken,
      youtubeAccessToken,
      youtubeRefreshToken,
      youtubeTokenExpiry,
      youtubeUsername,
      obsHost,
      obsPort,
      obsPassword,
      obsSavedName,
      obsDetailTab
    };

    void (async () => {
      try {
        const uri = getAppStateUri();
        if (!uri) return;
        await FileSystemLegacy.writeAsStringAsync(uri, JSON.stringify(snapshot));
      } catch {
        // Ignore write failures on restricted devices.
      }
    })();
  }, [
    activeTabId,
    appStateLoaded,
    channelInput,
    kickRefreshToken,
    kickToken,
    kickUsername,
    mobileSection,
    obsDetailTab,
    obsHost,
    obsPassword,
    obsPort,
    obsSavedName,
    platformInput,
    sources,
    tabs,
    twitchToken,
    twitchUsername,
    youtubeAccessToken,
    youtubeRefreshToken,
    youtubeTokenExpiry,
    youtubeUsername
  ]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const uri = getObsSavedConnectionsUri();
        if (!uri) return;
        const info = await FileSystemLegacy.getInfoAsync(uri);
        if (!info.exists) return;
        const raw = await FileSystemLegacy.readAsStringAsync(uri);
        const parsed = raw ? JSON.parse(raw) : [];
        if (cancelled) return;
        setObsSavedConnections(normalizeObsSavedConnections(parsed));
      } catch {
        if (!cancelled) {
          setObsSavedConnections([]);
        }
      } finally {
        if (!cancelled) {
          setObsSavedConnectionsLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!obsSavedConnectionsLoaded) return;
    void (async () => {
      try {
        const uri = getObsSavedConnectionsUri();
        if (!uri) return;
        await FileSystemLegacy.writeAsStringAsync(uri, JSON.stringify(obsSavedConnections));
      } catch {
        // Ignore write failures on restricted devices.
      }
    })();
  }, [obsSavedConnections, obsSavedConnectionsLoaded]);

  useEffect(() => {
    let cancelled = false;
    if (obsSavedConnections.length === 0) {
      setObsReachabilityById({});
      return () => {
        cancelled = true;
      };
    }

    setObsReachabilityById((previous) => {
      const next: Record<string, ObsReachability> = {};
      for (const connection of obsSavedConnections) {
        next[connection.id] = previous[connection.id] ?? "checking";
      }
      return next;
    });

    void (async () => {
      for (const connection of obsSavedConnections) {
        const reachable = await probeObsEndpoint(connection.host, connection.port);
        if (cancelled) return;
        setObsReachabilityById((previous) => ({
          ...previous,
          [connection.id]: reachable ? "reachable" : "offline"
        }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [obsSavedConnections]);

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

  const showNotice = (message: string) => {
    setNotice(message);
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = setTimeout(() => {
      setNotice(null);
    }, 5000);
  };

  const loadSevenTvForTwitchSource = async (sourceId: string, twitchUserId: string) => {
    const normalizedUserId = twitchUserId.trim();
    if (!normalizedUserId) return;
    if (sevenTvLoadedTwitchUserIdsRef.current.has(normalizedUserId)) return;
    sevenTvLoadedTwitchUserIdsRef.current.add(normalizedUserId);
    try {
      const response = await fetch(`https://7tv.io/v3/users/twitch/${normalizedUserId}`);
      if (!response.ok) {
        return;
      }
      const payload = await response.json();
      const emotes = parseSevenTvEmoteMap(payload);
      if (Object.keys(emotes).length === 0) return;
      setSevenTvEmotesBySource((previous) => ({
        ...previous,
        [sourceId]: emotes
      }));
    } catch {
      // Best effort only.
    }
  };

  const loadTwitchChannelBadgesForRoom = async (roomId: string) => {
    const normalizedRoomId = roomId.trim();
    if (!normalizedRoomId) return;
    if (twitchChannelBadgeMapByRoomId[normalizedRoomId]) return;
    if (twitchBadgeFetchInFlightRef.current.has(normalizedRoomId)) return;
    twitchBadgeFetchInFlightRef.current.add(normalizedRoomId);
    try {
      const response = await fetch(`https://badges.twitch.tv/v1/badges/channels/${normalizedRoomId}/display`);
      if (!response.ok) return;
      const payload = await response.json();
      const badgeMap = parseTwitchBadgeMap(payload);
      if (Object.keys(badgeMap).length === 0) return;
      setTwitchChannelBadgeMapByRoomId((previous) => ({
        ...previous,
        [normalizedRoomId]: badgeMap
      }));
    } catch {
      // Best effort only.
    } finally {
      twitchBadgeFetchInFlightRef.current.delete(normalizedRoomId);
    }
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
    setSevenTvEmotesBySource((previous) => {
      if (!(sourceId in previous)) return previous;
      const next = { ...previous };
      delete next[sourceId];
      return next;
    });
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
    setObsStreamDurationMs(0);
    setObsRecordDurationMs(0);
    setObsPreviewImageUri(null);
    setObsPreviewLoading(false);
    setObsStreamConfirmAction(null);
    setObsStreamConfirmBusy(false);
    obsAuthPasswordRef.current = "";
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

  const refreshObsPreview = async (sceneName: string) => {
    if (!sceneName) {
      setObsPreviewImageUri(null);
      return;
    }
    if (obsPreviewRequestInFlightRef.current) {
      return;
    }
    obsPreviewRequestInFlightRef.current = true;
    setObsPreviewLoading(true);
    try {
      const previewResponse = await sendObsRequest("GetSourceScreenshot", {
        sourceName: sceneName,
        imageFormat: "jpg",
        imageWidth: 720,
        imageHeight: 405,
        imageCompressionQuality: 80
      });
      const uri = typeof previewResponse.imageData === "string" ? previewResponse.imageData : "";
      setObsPreviewImageUri(uri || null);
    } catch {
      setObsPreviewImageUri(null);
    } finally {
      obsPreviewRequestInFlightRef.current = false;
      setObsPreviewLoading(false);
    }
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
      void refreshObsPreview(currentSceneName);

      setObsStreamActive(streamStatus.outputActive === true);
      setObsRecordActive(recordStatus.outputActive === true);
      setObsStreamDurationMs(readNumber(streamStatus.outputDuration) ?? 0);
      setObsRecordDurationMs(readNumber(recordStatus.outputDuration) ?? 0);

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

  useEffect(() => {
    if (!obsConnected) return;
    if (!obsPreviewExpanded) return;
    if (mobileSection !== "obs") return;
    if (!obsCurrentScene) return;

    void refreshObsPreview(obsCurrentScene);
    const intervalId = setInterval(() => {
      void refreshObsPreview(obsCurrentScene);
    }, OBS_PREVIEW_TARGET_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [mobileSection, obsConnected, obsCurrentScene, obsPreviewExpanded]);

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
        const password = obsAuthPasswordRef.current.trim();
        if (!password) {
          throw new Error("OBS requires a password.");
        }
        const secret = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${password}${salt}`, {
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
        setObsStreamDurationMs(readNumber(eventData?.outputDuration) ?? 0);
      } else if (eventType === "RecordStateChanged") {
        setObsRecordActive(eventData?.outputActive === true);
        setObsRecordDurationMs(readNumber(eventData?.outputDuration) ?? 0);
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

  const connectObs = (options?: { host?: string; port?: string; password?: string }) => {
    if (obsConnecting || obsConnected) return;

    const host = (options?.host ?? obsHost).trim();
    const port = (options?.port ?? obsPort).trim();
    const password = (options?.password ?? obsPassword).trim();
    if (!host || !port) {
      showNotice("OBS host and port are required.");
      return;
    }
    if (options?.host) setObsHost(host);
    if (options?.port) setObsPort(port);
    if (options?.password !== undefined) setObsPassword(options.password);
    obsAuthPasswordRef.current = password;

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
      void refreshObsPreview(sceneName);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const requestObsStreamToggle = () => {
    if (!obsConnected || obsConnecting || obsStreamConfirmBusy) return;
    setObsStreamConfirmAction(obsStreamActive ? "stop" : "start");
  };

  const cancelObsStreamToggle = () => {
    if (obsStreamConfirmBusy) return;
    setObsStreamConfirmAction(null);
  };

  const confirmObsStreamToggle = async () => {
    if (!obsStreamConfirmAction || obsStreamConfirmBusy) return;
    const action = obsStreamConfirmAction;
    setObsStreamConfirmBusy(true);
    try {
      await sendObsRequest(action === "start" ? "StartStream" : "StopStream");
      setObsStreamConfirmAction(null);
      await refreshObsState();
    } catch (error) {
      showNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setObsStreamConfirmBusy(false);
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

  const closeObsQrScanner = () => {
    setObsQrScannerOpen(false);
    setObsQrScanLocked(false);
  };

  const openObsQrScanner = async () => {
    if (!cameraPermission?.granted) {
      const next = await requestCameraPermission();
      if (!next.granted) {
        showNotice("Camera permission is required to scan OBS QR codes.");
        return;
      }
    }
    setObsQrScanLocked(false);
    setObsQrScannerOpen(true);
  };

  const onObsQrScanned = (event: { data: string }) => {
    if (obsQrScanLocked) return;
    setObsQrScanLocked(true);

    const parsed = parseObsQr(event.data);
    if (!parsed) {
      showNotice("QR code format not recognized for OBS.");
      setTimeout(() => {
        setObsQrScanLocked(false);
      }, 1200);
      return;
    }

    setObsHost(parsed.host);
    setObsPort(parsed.port || "4455");
    if (parsed.password !== undefined) {
      setObsPassword(parsed.password);
    }
    closeObsQrScanner();
    showNotice(`OBS connection loaded from QR (${parsed.host}:${parsed.port})${parsed.password !== undefined ? " with password." : "."}`);
  };

  const saveObsConnection = () => {
    const host = obsHost.trim();
    const port = obsPort.trim();
    if (!host || !port) {
      showNotice("OBS host and port are required before saving.");
      return;
    }

    const password = obsPassword.trim();
    const normalized: ObsSavedConnection = {
      id: obsEditingConnectionId ?? makeId(),
      name: obsSavedName.trim() || host,
      host,
      port,
      password: password || undefined
    };

    setObsSavedConnections((previous) => {
      if (obsEditingConnectionId) {
        return previous.map((entry) => (entry.id === obsEditingConnectionId ? normalized : entry));
      }
      const duplicateIndex = previous.findIndex(
        (entry) => entry.host.toLowerCase() === host.toLowerCase() && entry.port === port
      );
      if (duplicateIndex >= 0) {
        const next = [...previous];
        next[duplicateIndex] = { ...next[duplicateIndex], ...normalized };
        return next;
      }
      return [normalized, ...previous];
    });

    setObsEditingConnectionId(null);
    setObsSavedName("");
    showNotice("OBS connection saved.");
  };

  const editObsConnection = (connection: ObsSavedConnection) => {
    setObsHost(connection.host);
    setObsPort(connection.port);
    setObsPassword(connection.password ?? "");
    setObsSavedName(connection.name);
    setObsEditingConnectionId(connection.id);
  };

  const removeObsConnection = (connectionId: string) => {
    setObsSavedConnections((previous) => previous.filter((entry) => entry.id !== connectionId));
    setObsReachabilityById((previous) => {
      const next = { ...previous };
      delete next[connectionId];
      return next;
    });
    if (obsEditingConnectionId === connectionId) {
      setObsEditingConnectionId(null);
      setObsSavedName("");
    }
  };

  const connectObsConnection = (connection: ObsSavedConnection) => {
    connectObs({
      host: connection.host,
      port: connection.port,
      password: connection.password ?? ""
    });
  };

  const snapshotCredentials = (override: Partial<CredentialSnapshot> = {}): CredentialSnapshot => ({
    twitchToken: override.twitchToken ?? credentials.twitchToken,
    twitchUsername: override.twitchUsername ?? credentials.twitchUsername,
    kickToken: override.kickToken ?? credentials.kickToken,
    kickUsername: override.kickUsername ?? credentials.kickUsername,
    youtubeAccessToken: override.youtubeAccessToken ?? credentials.youtubeAccessToken,
    youtubeRefreshToken: override.youtubeRefreshToken ?? credentials.youtubeRefreshToken
  });

  const applyYouTubeTokenState = (accessToken: string, refreshToken: string, expiresAtMs: number) => {
    youtubeAccessTokenRef.current = accessToken;
    youtubeRefreshTokenRef.current = refreshToken;
    youtubeTokenExpiryRef.current = expiresAtMs;
    setYoutubeAccessToken(accessToken);
    setYoutubeRefreshToken(refreshToken);
    setYoutubeTokenExpiry(expiresAtMs);
  };

  const refreshYouTubeAccessToken = async (): Promise<string> => {
    const refreshToken = youtubeRefreshTokenRef.current.trim();
    if (!refreshToken) {
      throw new Error("YouTube session expired. Sign in again.");
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json"
      },
      body: new URLSearchParams({
        client_id: YOUTUBE_CLIENT_ID,
        grant_type: "refresh_token",
        refresh_token: refreshToken
      })
    });
    const tokens = await fetchJsonOrThrow<YouTubeTokenResponse>(tokenResponse, "YouTube token refresh");
    const accessToken = tokens.access_token?.trim() ?? "";
    if (!accessToken) {
      throw new Error("YouTube token refresh did not return an access token.");
    }

    const expiresInSeconds = Number.isFinite(Number(tokens.expires_in)) ? Number(tokens.expires_in) : 3600;
    const expiresAt = Date.now() + Math.max(60, expiresInSeconds) * 1000;
    const nextRefresh = tokens.refresh_token?.trim() || refreshToken;
    applyYouTubeTokenState(accessToken, nextRefresh, expiresAt);
    return accessToken;
  };

  const ensureYouTubeAccessToken = async (): Promise<string> => {
    const accessToken = youtubeAccessTokenRef.current.trim();
    const expiry = youtubeTokenExpiryRef.current;
    const hasExpiry = Number.isFinite(expiry) && expiry > 0;
    const stillValid = Boolean(accessToken && (!hasExpiry || Date.now() + 45_000 < expiry));
    if (stillValid) {
      return accessToken;
    }
    return refreshYouTubeAccessToken();
  };

  const youtubeFetchWithAuth = async (
    input: string | URL,
    init: RequestInit = {},
    allowRetry = true
  ): Promise<Response> => {
    const accessToken = await ensureYouTubeAccessToken();
    const headers = new Headers(init.headers ?? {});
    headers.set("Authorization", `Bearer ${accessToken}`);
    headers.set("Accept", "application/json");
    const response = await fetch(input, {
      ...init,
      headers
    });

    if (response.status === 401 && allowRetry && youtubeRefreshTokenRef.current.trim()) {
      applyYouTubeTokenState("", youtubeRefreshTokenRef.current.trim(), 0);
      return youtubeFetchWithAuth(input, init, false);
    }
    return response;
  };

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

    if (!auth.youtubeAccessToken.trim() && !auth.youtubeRefreshToken.trim()) {
      throw new Error("Sign in to YouTube in Accounts before opening YouTube chat.");
    }

    return new YouTubeAdapter({
      channel,
      auth: {
        liveChatId: channel
      },
      transport: {
        fetchMessages: async (payload) => {
          const requestUrl = new URL("https://www.googleapis.com/youtube/v3/liveChat/messages");
          requestUrl.searchParams.set("part", "snippet,authorDetails");
          requestUrl.searchParams.set("liveChatId", payload.liveChatId);
          requestUrl.searchParams.set("maxResults", "200");
          if (payload.pageToken) {
            requestUrl.searchParams.set("pageToken", payload.pageToken);
          }
          const response = await youtubeFetchWithAuth(requestUrl);
          return fetchJsonOrThrow(response, "YouTube message fetch");
        },
        sendMessage: async (payload) => {
          const requestUrl = new URL("https://www.googleapis.com/youtube/v3/liveChat/messages");
          requestUrl.searchParams.set("part", "snippet");
          const response = await youtubeFetchWithAuth(requestUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              snippet: {
                liveChatId: payload.liveChatId,
                type: "textMessageEvent",
                textMessageDetails: {
                  messageText: payload.message
                }
              }
            })
          });
          await fetchJsonOrThrow<Record<string, unknown>>(response, "YouTube send message");
        }
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
      if (message.platform === "twitch") {
        const raw = asRecord(message.raw);
        const roomId = typeof raw?.["room-id"] === "string" ? raw["room-id"].trim() : "";
        if (roomId) {
          void loadSevenTvForTwitchSource(sourceId, roomId);
          void loadTwitchChannelBadgesForRoom(roomId);
        }
      }
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
    platform: "twitch" | "kick" | "youtube",
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

  const tabDisplayName = (tab: ChatTab) => {
    if (tab.sourceIds.length === 1) {
      const source = sourceById.get(tab.sourceIds[0]);
      if (source) return `${source.platform}/${source.channel}`;
    }
    return tab.label || `Merged (${tab.sourceIds.length})`;
  };

  useEffect(() => {
    if (!appStateLoaded || sources.length === 0) return;
    let cancelled = false;

    const authOverride: Partial<CredentialSnapshot> = {
      twitchToken,
      twitchUsername,
      kickToken,
      kickUsername,
      youtubeAccessToken,
      youtubeRefreshToken
    };

    void (async () => {
      for (const source of sources) {
        if (cancelled) return;
        if (adaptersRef.current.has(source.id)) continue;
        try {
          await reconnectSource(source, authOverride);
        } catch {
          if (cancelled) return;
          setStatusBySource((previous) => ({
            ...previous,
            [source.id]: "error"
          }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    appStateLoaded,
    kickToken,
    kickUsername,
    sources,
    twitchToken,
    twitchUsername,
    youtubeAccessToken,
    youtubeRefreshToken
  ]);

  const addChannelTab = async () => {
    const channel = channelInput.trim().toLowerCase();
    if (!channel) {
      showNotice("Enter a channel (or YouTube live chat ID) first.");
      return;
    }

    const existingSource = sources.find((source) => source.platform === platformInput && source.channel === channel);
    if (existingSource) {
      const existingTab = tabs.find((tab) => tab.sourceIds.length === 1 && tab.sourceIds[0] === existingSource.id);
      if (existingTab) {
        setActiveTabId(existingTab.id);
        showNotice("That chat is already open.");
        return;
      }
      const standaloneTab: ChatTab = {
        id: makeId(),
        sourceIds: [existingSource.id],
        label: `${existingSource.platform}/${existingSource.channel}`
      };
      setTabs((previous) => [...previous, standaloneTab]);
      setActiveTabId(standaloneTab.id);
      setMobileSection("chats");
      showNotice("Opened that chat as a standalone tab.");
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
      sourceIds: [sourceId],
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
      setMobileSection("chats");
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

  const toggleMergeCandidate = (tabId: string) => {
    setMergeCandidateTabIds((previous) => {
      if (previous.includes(tabId)) {
        return previous.filter((candidate) => candidate !== tabId);
      }
      return [...previous, tabId];
    });
  };

  const mergeSelectedTabs = () => {
    const selectedTabs = tabs.filter((tab) => mergeCandidateTabIds.includes(tab.id));
    if (selectedTabs.length < 2) {
      showNotice("Select at least two tabs to merge.");
      return;
    }

    const mergedSourceIds = Array.from(new Set(selectedTabs.flatMap((tab) => tab.sourceIds)));
    if (mergedSourceIds.length < 2) {
      showNotice("Merged tab must include at least two chat sources.");
      return;
    }

    const signature = normalizeTabSourceSignature(mergedSourceIds);
    const existingTab = tabs.find((tab) => normalizeTabSourceSignature(tab.sourceIds) === signature);
    if (existingTab) {
      setActiveTabId(existingTab.id);
      setMobileSection("chats");
      setMergeCandidateTabIds([]);
      showNotice("Those tabs are already merged.");
      return;
    }

    const labelParts = selectedTabs.map((tab) => tabDisplayName(tab)).slice(0, 3);
    const label = `Merged: ${labelParts.join(" + ")}${selectedTabs.length > 3 ? " +" : ""}`;
    const mergedTab: ChatTab = {
      id: makeId(),
      sourceIds: mergedSourceIds,
      label
    };

    setTabs((previous) => [...previous, mergedTab]);
    setActiveTabId(mergedTab.id);
    setMobileSection("chats");
    setMergeCandidateTabIds([]);
    showNotice("Merged tab created.");
  };

  const closeTab = async (tabId: string) => {
    const tab = tabs.find((candidate) => candidate.id === tabId);
    if (!tab) return;
    const nextTabs = tabs.filter((candidate) => candidate.id !== tabId);
    const referencedSourceIds = new Set(nextTabs.flatMap((candidate) => candidate.sourceIds));
    const orphanSources = sources.filter((source) => !referencedSourceIds.has(source.id));

    setTabs(nextTabs);
    setMergeCandidateTabIds((previous) => previous.filter((candidateId) => candidateId !== tabId));
    setActiveTabId((current) => {
      if (current !== tabId) return current;
      return nextTabs.length > 0 ? nextTabs[Math.max(0, nextTabs.length - 1)].id : null;
    });
    setSources((previous) => previous.filter((source) => referencedSourceIds.has(source.id)));

    for (const source of orphanSources) {
      const adapter = adaptersRef.current.get(source.id);
      adaptersRef.current.delete(source.id);
      if (adapter) {
        await adapter.disconnect().catch(() => {
          // no-op
        });
      }
      removeSourceState(source.id);
    }
  };

  const sendActiveMessage = async () => {
    const content = composerText.trim();
    if (!content) return;
    if (activeSources.length === 0) return;
    if (writableSources.length === 0) {
      showNotice("This chat is read-only until sign-in is complete.");
      return;
    }

    setSending(true);
    try {
      let sentCount = 0;
      for (const source of writableSources) {
        const adapter = adaptersRef.current.get(source.id);
        if (!adapter) continue;
        await adapter.sendMessage(content);
        sentCount += 1;
      }
      if (sentCount === 0) {
        showNotice("Connection is not ready yet.");
        return;
      }
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
      const codeVerifier = randomToken().repeat(2).replace(/[^a-zA-Z0-9]/g, "").slice(0, 64);
      const codeChallenge = await createCodeChallenge(codeVerifier);
      const authUrl = new URL("https://id.twitch.tv/oauth2/authorize");
      authUrl.searchParams.set("client_id", TWITCH_CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", twitchRedirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", TWITCH_SCOPES.join(" "));
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("code_challenge", codeChallenge);
      authUrl.searchParams.set("code_challenge_method", "S256");
      authUrl.searchParams.set("force_verify", "true");

      const callbackUrl = readAuthResultUrl(await WebBrowser.openAuthSessionAsync(authUrl.toString(), twitchRedirectUri));
      const callback = new URL(callbackUrl);
      const params = readCallbackParams(callback);

      const error = params.get("error");
      if (error) {
        const description = params.get("error_description") ?? "Twitch sign-in failed.";
        if (description.toLowerCase().includes("redirect")) {
          throw new Error(`Twitch redirect URI is not allowed. Add this redirect URI: ${twitchRedirectUri}`);
        }
        throw new Error(description);
      }
      if (params.get("state") !== state) {
        throw new Error("Twitch sign-in was rejected (state mismatch).");
      }

      const code = params.get("code")?.trim() ?? "";
      if (!code) {
        throw new Error("Twitch did not return an authorization code.");
      }

      const tokenResponse = await fetch("https://id.twitch.tv/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json"
        },
        body: new URLSearchParams({
          client_id: TWITCH_CLIENT_ID,
          code,
          grant_type: "authorization_code",
          redirect_uri: twitchRedirectUri,
          code_verifier: codeVerifier
        })
      });
      const tokens = await fetchJsonOrThrow<TwitchTokenResponse>(tokenResponse, "Twitch token exchange");
      const accessToken = tokens.access_token?.trim() ?? "";
      if (!accessToken) {
        throw new Error("Twitch token exchange did not return an access token.");
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
      const params = readCallbackParams(callback);
      const error = params.get("error");
      if (error) {
        const description = params.get("error_description") ?? "Kick sign-in failed.";
        if (description.toLowerCase().includes("redirect")) {
          throw new Error(`Kick redirect URI is not allowed. Add this redirect URI: ${kickRedirectUri}`);
        }
        throw new Error(description);
      }
      if (params.get("state") !== state) {
        throw new Error("Kick sign-in was rejected (state mismatch).");
      }
      const code = params.get("code")?.trim() ?? "";
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

  const signInYouTube = async () => {
    if (authBusy) return;
    setAuthBusy("youtube");
    try {
      if (!YOUTUBE_CLIENT_ID.trim()) {
        throw new Error("YouTube OAuth is not configured in this build.");
      }

      const state = randomToken();
      const codeVerifier = randomToken().repeat(2).replace(/[^a-zA-Z0-9]/g, "").slice(0, 64);
      const codeChallenge = await createCodeChallenge(codeVerifier);
      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", YOUTUBE_CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", youtubeRedirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", YOUTUBE_SCOPES.join(" "));
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("include_granted_scopes", "true");
      authUrl.searchParams.set("prompt", "consent");
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("code_challenge", codeChallenge);
      authUrl.searchParams.set("code_challenge_method", "S256");

      const callbackUrl = readAuthResultUrl(await WebBrowser.openAuthSessionAsync(authUrl.toString(), youtubeRedirectUri));
      const callback = new URL(callbackUrl);
      const params = readCallbackParams(callback);
      const error = params.get("error");
      if (error) {
        const description = params.get("error_description") ?? "YouTube sign-in failed.";
        throw new Error(description);
      }
      if (params.get("state") !== state) {
        throw new Error("YouTube sign-in was rejected (state mismatch).");
      }

      const code = params.get("code")?.trim() ?? "";
      if (!code) {
        throw new Error("YouTube did not return an authorization code.");
      }

      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json"
        },
        body: new URLSearchParams({
          code,
          client_id: YOUTUBE_CLIENT_ID,
          redirect_uri: youtubeRedirectUri,
          grant_type: "authorization_code",
          code_verifier: codeVerifier
        })
      });

      const tokens = await fetchJsonOrThrow<YouTubeTokenResponse>(tokenResponse, "YouTube token exchange");
      const accessToken = tokens.access_token?.trim() ?? "";
      if (!accessToken) {
        throw new Error("YouTube token exchange did not return an access token.");
      }
      const refreshToken = tokens.refresh_token?.trim() ?? youtubeRefreshTokenRef.current.trim();
      const expiresInSeconds = Number.isFinite(Number(tokens.expires_in)) ? Number(tokens.expires_in) : 3600;
      const expiresAt = Date.now() + Math.max(60, expiresInSeconds) * 1000;
      applyYouTubeTokenState(accessToken, refreshToken, expiresAt);

      let username = "";
      try {
        const profileResponse = await youtubeFetchWithAuth(
          "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true&maxResults=1"
        );
        const profilePayload = await fetchJsonOrThrow<{ items?: Array<{ snippet?: { title?: string } }> }>(
          profileResponse,
          "YouTube profile"
        );
        username = profilePayload.items?.[0]?.snippet?.title?.trim() ?? "";
      } catch {
        username = "";
      }

      setYoutubeUsername(username);
      await reconnectPlatformSources("youtube", {
        youtubeAccessToken: accessToken,
        youtubeRefreshToken: refreshToken
      });
      showNotice(`Signed in to YouTube${username ? ` as ${username}` : ""}.`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setAuthBusy(null);
    }
  };

  const signOutYouTube = async () => {
    if (authBusy) return;
    setAuthBusy("youtube");
    applyYouTubeTokenState("", "", 0);
    setYoutubeUsername("");
    await reconnectPlatformSources("youtube", {
      youtubeAccessToken: "",
      youtubeRefreshToken: ""
    });
    showNotice("Signed out of YouTube.");
    setAuthBusy(null);
  };

  const resolveMessageBadges = (message: ChatMessage): RenderBadge[] => {
    const raw = asRecord(message.raw);
    const resolved: RenderBadge[] = [];
    const seenKeys = new Set<string>();
    const pushBadge = (badge: RenderBadge) => {
      if (!badge.key) return;
      if (seenKeys.has(badge.key)) return;
      seenKeys.add(badge.key);
      resolved.push(badge);
    };

    if (message.platform === "twitch") {
      const roomId = typeof raw?.["room-id"] === "string" ? raw["room-id"].trim() : "";
      const channelBadgeMap = roomId ? twitchChannelBadgeMapByRoomId[roomId] ?? {} : {};
      const tokens: string[] = [];
      if (Array.isArray(message.badges)) {
        tokens.push(...message.badges.filter((entry): entry is string => typeof entry === "string"));
      }
      if (typeof raw?.badges === "string") {
        tokens.push(...raw.badges.split(",").filter(Boolean));
      }
      for (const token of tokens) {
        const [setIdRaw, versionRaw] = token.split("/");
        const setId = (setIdRaw ?? "").trim();
        const version = (versionRaw ?? "").trim();
        if (!setId || !version) continue;
        const key = `${setId}/${version}`;
        const imageUri = channelBadgeMap[key] ?? twitchGlobalBadgeMap[key];
        if (imageUri) {
          pushBadge({
            key,
            imageUri,
            label: setId
          });
        } else {
          pushBadge({
            key,
            label: compactBadgeLabel(setId)
          });
        }
      }
      return resolved;
    }

    if (message.platform === "kick") {
      const rawSender = asRecord(raw?.sender);
      const identity = asRecord(rawSender?.identity);
      const rawBadges = Array.isArray(identity?.badges) ? identity?.badges : [];
      for (const entry of rawBadges) {
        if (typeof entry === "string") {
          const key = entry.trim();
          if (!key) continue;
          pushBadge({
            key: `kick:${key}`,
            label: compactBadgeLabel(key)
          });
          continue;
        }
        const record = asRecord(entry);
        if (!record) continue;
        const type = typeof record.type === "string" ? record.type.trim() : "";
        const text = typeof record.text === "string" ? record.text.trim() : "";
        const count = typeof record.count === "number" && Number.isFinite(record.count) ? `:${record.count}` : "";
        const label = type || text;
        const imageUri = readPossibleImageUri(record);
        const key = `kick:${type || text || Math.random().toString(36).slice(2, 8)}${count}`;
        if (imageUri) {
          pushBadge({
            key,
            imageUri,
            label: label || "badge"
          });
        } else if (label) {
          pushBadge({
            key,
            label: compactBadgeLabel(`${label}${count}`)
          });
        }
      }
      if (resolved.length === 0 && Array.isArray(message.badges)) {
        for (const token of message.badges) {
          if (typeof token !== "string" || !token.trim()) continue;
          pushBadge({
            key: `kick-fallback:${token}`,
            label: compactBadgeLabel(token)
          });
        }
      }
      return resolved;
    }

    if (Array.isArray(message.badges)) {
      for (const token of message.badges) {
        if (typeof token !== "string" || !token.trim()) continue;
        pushBadge({
          key: `generic:${token}`,
          label: compactBadgeLabel(token)
        });
      }
    }
    return resolved;
  };

  const renderMessageBadges = (message: ChatMessage) => {
    const badges = resolveMessageBadges(message);
    if (badges.length === 0) return null;
    return (
      <View style={styles.badgeRow}>
        {badges.map((badge) =>
          badge.imageUri ? (
            <Image key={`img-${badge.key}`} source={{ uri: badge.imageUri }} style={styles.badgeIcon} resizeMode="contain" />
          ) : (
            <View key={`txt-${badge.key}`} style={styles.badgePill}>
              <Text style={styles.badgePillText}>{badge.label ?? "BADG"}</Text>
            </View>
          )
        )}
      </View>
    );
  };

  const renderMessageContent = (sourceId: string, text: string) => {
    const sourceEmotes = sevenTvEmotesBySource[sourceId] ?? {};
    const mergedEmoteMap = {
      ...sevenTvGlobalEmotes,
      ...sourceEmotes
    };
    const segments = segmentMessageWithEmotes(text, mergedEmoteMap);
    if (segments.length === 0) {
      return <Text style={styles.messageText}>{text}</Text>;
    }
    return (
      <View style={styles.messageInlineRow}>
        {segments.map((segment, index) =>
          segment.type === "emote" ? (
            <Image key={`${segment.value}-${index}`} source={{ uri: segment.uri }} style={styles.inlineEmote} resizeMode="contain" />
          ) : (
            <Text key={`text-${index}`} style={styles.messageText}>
              {segment.value}
            </Text>
          )
        )}
      </View>
    );
  };

  const channelPlaceholder =
    platformInput === "youtube" ? "YouTube live chat ID" : `Enter ${platformInput} channel username`;
  const obsDroppedFramePercent =
    obsStats.outputSkippedFrames !== null &&
    obsStats.outputTotalFrames !== null &&
    obsStats.outputTotalFrames > 0
      ? (obsStats.outputSkippedFrames / obsStats.outputTotalFrames) * 100
      : null;
  const headerSubtitle =
    mobileSection === "chats"
      ? `${tabs.length} open ${tabs.length === 1 ? "chat" : "chats"}`
      : mobileSection === "add"
        ? "Open chats fast"
        : mobileSection === "obs"
          ? "OBS Controller"
          : "Manage account sign-in";

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <KeyboardAvoidingView behavior={RNPlatform.OS === "ios" ? "padding" : undefined} style={styles.container}>
          <View style={styles.appShell}>
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>MultiChat</Text>
                <Text style={styles.subtitle}>{headerSubtitle}</Text>
              </View>
              {mobileSection !== "chats" ? (
                <Pressable onPress={() => setMobileSection("chats")} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Chats</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.screenBody}>
              {mobileSection === "chats" ? (
                <View style={styles.chatSection}>
                  <View style={styles.chatToolbar}>
                    <Text style={styles.toolbarMeta}>{activeConnectionSummary}</Text>
                    {activeSources.length > 0 ? (
                      <Text style={styles.toolbarMetaSecondary}>
                        {activeStatusSummary} • {activeWritable ? "write" : "read"}
                      </Text>
                    ) : null}
                  </View>

                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsStrip}>
                    <View style={styles.tabsRow}>
                      {tabs.map((tab) => {
                        const primarySource = tab.sourceIds.length > 0 ? sourceById.get(tab.sourceIds[0]) : undefined;
                        const active = tab.id === activeTabId;
                        const tabLabel =
                          tab.sourceIds.length === 1
                            ? primarySource?.channel || tab.label.split("/").pop() || tab.label
                            : tab.label || `Merged (${tab.sourceIds.length})`;
                        return (
                          <View key={tab.id} style={active ? [styles.tabCard, styles.tabCardActive] : styles.tabCard}>
                            <Pressable onPress={() => setActiveTabId(tab.id)} style={styles.tabSelect}>
                              <View style={styles.tabTitleRow}>
                                {primarySource ? (
                                  <Image source={{ uri: PLATFORM_LOGOS[primarySource.platform] }} style={styles.tabLogo} />
                                ) : (
                                  <View style={styles.tabLogoFallback}>
                                    <Text style={styles.tabLogoFallbackText}>{tab.sourceIds.length > 1 ? "M" : "?"}</Text>
                                  </View>
                                )}
                                <Text numberOfLines={1} style={styles.tabLabel}>
                                  {tabLabel}
                                </Text>
                                {tab.sourceIds.length > 1 ? <Text style={styles.tabMergedBadge}>MERGED</Text> : null}
                              </View>
                            </Pressable>
                            <Pressable onPress={() => void closeTab(tab.id)} style={styles.tabClose}>
                              <Text style={styles.tabCloseText}>×</Text>
                            </Pressable>
                          </View>
                        );
                      })}
                    </View>
                  </ScrollView>

                  {activeSources.length > 0 ? (
                    <>
                      <FlatList
                        ref={listRef}
                        data={activeMessageItems}
                        keyExtractor={(item, index) => `${item.sourceId}-${item.message.id}-${item.message.timestamp}-${index}`}
                        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
                        style={styles.messagesList}
                        contentContainerStyle={
                          activeMessageItems.length > 0 ? styles.messagesContent : [styles.messagesContent, styles.messagesContentEmpty]
                        }
                        renderItem={({ item }) => (
                          <View style={styles.messageCard}>
                            <View style={styles.messageMetaRow}>
                              <Text style={styles.messageMeta}>
                                {platformTag(item.message.platform as PlatformId)} #{item.message.channel}
                              </Text>
                              <Text style={styles.messageMeta}>{formatClock(item.message.timestamp)}</Text>
                            </View>
                            <View style={styles.messageAuthorRow}>
                              {renderMessageBadges(item.message)}
                              <Text style={styles.messageAuthor}>{item.message.displayName || item.message.username}</Text>
                            </View>
                            {renderMessageContent(item.sourceId, item.message.message)}
                          </View>
                        )}
                        ListEmptyComponent={<Text style={styles.emptyText}>No messages yet for this tab.</Text>}
                      />

                      <View style={styles.composerRow}>
                        <TextInput
                          value={composerText}
                          onChangeText={setComposerText}
                          placeholder={
                            activeWritable
                              ? activeSources.length > 1
                                ? "Type a message to all writable chats"
                                : "Type a message"
                              : "Read-only tab"
                          }
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
                      <Text style={styles.emptyText}>Go to Add and open your first chat tab.</Text>
                      <Pressable onPress={() => setMobileSection("add")} style={styles.primaryButton}>
                        <Text style={styles.primaryButtonText}>Open First Chat</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              ) : null}

              {mobileSection === "add" ? (
                <ScrollView
                  style={styles.scrollSection}
                  contentContainerStyle={styles.sectionContent}
                  keyboardShouldPersistTaps="handled"
                >
                  <View style={styles.addCard}>
                    <Text style={styles.sectionTitle}>Open a Chat</Text>
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
                    <Text style={styles.configHint}>YouTube tabs use live chat ID and OAuth (no API key needed).</Text>
                  </View>

                  <View style={styles.addCard}>
                    <Text style={styles.sectionTitle}>Merge Tabs</Text>
                    {tabs.length >= 2 ? (
                      <>
                        <View style={styles.mergeTabList}>
                          {tabs.map((tab) => {
                            const selected = mergeCandidateTabIds.includes(tab.id);
                            return (
                              <Pressable
                                key={`merge-${tab.id}`}
                                onPress={() => toggleMergeCandidate(tab.id)}
                                style={selected ? [styles.mergeTabChip, styles.mergeTabChipActive] : styles.mergeTabChip}
                              >
                                <Text style={selected ? [styles.mergeTabChipText, styles.mergeTabChipTextActive] : styles.mergeTabChipText}>
                                  {tabDisplayName(tab)}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                        <View style={styles.addRow}>
                          <Text style={styles.configHint}>{mergeCandidateTabIds.length} selected</Text>
                          <Pressable
                            onPress={mergeSelectedTabs}
                            disabled={mergeCandidateTabIds.length < 2}
                            style={[
                              styles.primaryButton,
                              mergeCandidateTabIds.length < 2 ? styles.primaryButtonDisabled : null
                            ]}
                          >
                            <Text style={styles.primaryButtonText}>Create Merged Tab</Text>
                          </Pressable>
                        </View>
                      </>
                    ) : (
                      <Text style={styles.configHint}>Open at least two chat tabs first.</Text>
                    )}
                  </View>

                  <View style={styles.addCard}>
                    <Text style={styles.sectionTitle}>Quick Tips</Text>
                    <Text style={styles.configHint}>1. Sign in from Accounts if you want to send on Twitch/Kick/YouTube.</Text>
                    <Text style={styles.configHint}>2. Each chat opens as a tab in Chats.</Text>
                    <Text style={styles.configHint}>3. Tap and hold your phone in portrait for best readability.</Text>
                  </View>
                </ScrollView>
              ) : null}

              {mobileSection === "obs" ? (
                <ScrollView
                  style={styles.scrollSection}
                  contentContainerStyle={styles.sectionContent}
                  keyboardShouldPersistTaps="handled"
                >
                  <View style={styles.obsCard}>
                    <View style={styles.obsDashboardHeader}>
                      <Text style={obsCompact ? [styles.obsDashboardTitle, styles.obsDashboardTitleCompact] : styles.obsDashboardTitle}>
                        Dashboard
                      </Text>
                      <View style={obsCompact ? [styles.obsHeaderStates, styles.obsHeaderStatesCompact] : styles.obsHeaderStates}>
                        <View style={styles.obsHeaderStateItem}>
                          <View style={[styles.obsStateDot, obsStreamActive ? styles.obsStateDotLive : styles.obsStateDotOff]} />
                          <Text style={styles.obsHeaderStateText}>{obsStreamActive ? "Live" : "Not Live"}</Text>
                        </View>
                        <View style={styles.obsHeaderStateItem}>
                          <View style={[styles.obsStateDot, obsRecordActive ? styles.obsStateDotLive : styles.obsStateDotOff]} />
                          <Text style={styles.obsHeaderStateText}>{obsRecordActive ? "Recording" : "Not Recording"}</Text>
                        </View>
                      </View>
                    </View>

                    <View style={obsCompact ? [styles.obsTimerBar, styles.obsTimerBarCompact] : styles.obsTimerBar}>
                      <Text style={obsCompact ? [styles.obsTimerText, styles.obsTimerTextCompact] : styles.obsTimerText}>
                        Stream {formatObsDuration(obsStreamDurationMs)}
                      </Text>
                      <Text style={obsCompact ? [styles.obsTimerText, styles.obsTimerTextCompact] : styles.obsTimerText}>
                        Record {formatObsDuration(obsRecordDurationMs)}
                      </Text>
                    </View>

                    <View style={styles.obsConnectionCard}>
                      <View style={obsCompact ? [styles.addRow, styles.addRowStack] : styles.addRow}>
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
                          style={obsCompact ? [styles.portInput, styles.portInputCompact] : styles.portInput}
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

                      <View style={styles.obsActionsRow}>
                        <Pressable
                          onPress={obsConnected ? () => disconnectObs("Disconnected") : () => connectObs()}
                          style={[
                            obsConnected ? styles.warningButton : styles.primaryButton,
                            styles.obsActionButton,
                            obsCompact ? styles.obsActionButtonCompact : null
                          ]}
                        >
                          <Text style={styles.primaryButtonText}>
                            {obsConnected ? "Disconnect" : obsConnecting ? "Connecting..." : "Connect"}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => void refreshObsState()}
                          disabled={!obsConnected}
                          style={[styles.secondaryButton, styles.obsActionButton, obsCompact ? styles.obsActionButtonCompact : null]}
                        >
                          <Text style={styles.secondaryButtonText}>Refresh</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => void openObsQrScanner()}
                          style={[styles.secondaryButton, styles.obsActionButton, obsCompact ? styles.obsActionButtonCompact : null]}
                        >
                          <Text style={styles.secondaryButtonText}>Scan QR</Text>
                        </Pressable>
                      </View>
                      <Text style={styles.obsConnectionStatus}>{obsStatusText}</Text>

                      <View style={obsCompact ? [styles.addRow, styles.addRowStack] : styles.addRow}>
                        <TextInput
                          value={obsSavedName}
                          onChangeText={setObsSavedName}
                          placeholder="Connection name (optional)"
                          placeholderTextColor="#6c7888"
                          style={[styles.input, styles.grow]}
                        />
                        <Pressable onPress={saveObsConnection} style={styles.secondaryButton}>
                          <Text style={styles.secondaryButtonText}>{obsEditingConnectionId ? "Update" : "Save"}</Text>
                        </Pressable>
                        {obsEditingConnectionId ? (
                          <Pressable
                            onPress={() => {
                              setObsEditingConnectionId(null);
                              setObsSavedName("");
                            }}
                            style={styles.secondaryButton}
                          >
                            <Text style={styles.secondaryButtonText}>Cancel</Text>
                          </Pressable>
                        ) : null}
                      </View>

                      {obsQrScannerOpen ? (
                        <View style={styles.qrScannerCard}>
                          <CameraView
                            facing="back"
                            style={styles.qrCamera}
                            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                            onBarcodeScanned={obsQrScanLocked ? undefined : onObsQrScanned}
                          />
                          <View style={styles.qrScannerFooter}>
                            <Text style={styles.configHint}>Point camera at OBS connection QR code.</Text>
                            <Pressable onPress={closeObsQrScanner} style={styles.secondaryButton}>
                              <Text style={styles.secondaryButtonText}>Close</Text>
                            </Pressable>
                          </View>
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.savedConnectionsSection}>
                      <Text style={styles.savedConnectionsTitle}>Saved Connections</Text>
                      {obsSavedConnections.length > 0 ? (
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.savedConnectionsRow}
                        >
                          {obsSavedConnections.map((connection) => {
                            const reachability = obsReachabilityById[connection.id] ?? "checking";
                            const statusLabel =
                              reachability === "reachable" ? "Reachable" : reachability === "offline" ? "Offline" : "Checking";
                            return (
                              <View key={connection.id} style={styles.savedConnectionCard}>
                                <Pressable onPress={() => removeObsConnection(connection.id)} style={styles.savedConnectionDelete}>
                                  <Text style={styles.savedConnectionDeleteText}>×</Text>
                                </Pressable>
                                <Text numberOfLines={1} style={styles.savedConnectionName}>
                                  {connection.name}
                                </Text>
                                <Text numberOfLines={1} style={styles.savedConnectionHost}>
                                  {connection.host}:{connection.port}
                                </Text>
                                <View style={styles.savedConnectionStatusRow}>
                                  <View
                                    style={[
                                      styles.savedConnectionStatusDot,
                                      reachability === "reachable"
                                        ? styles.savedConnectionStatusReachable
                                        : reachability === "offline"
                                          ? styles.savedConnectionStatusOffline
                                          : styles.savedConnectionStatusChecking
                                    ]}
                                  />
                                  <Text style={styles.savedConnectionStatusText}>{statusLabel}</Text>
                                </View>
                                <View style={styles.savedConnectionActions}>
                                  <Pressable
                                    onPress={() => connectObsConnection(connection)}
                                    style={[styles.primaryButton, styles.savedConnectionActionButton]}
                                  >
                                    <Text style={styles.primaryButtonText}>Connect</Text>
                                  </Pressable>
                                  <Pressable
                                    onPress={() => editObsConnection(connection)}
                                    style={[styles.secondaryButton, styles.savedConnectionActionButton]}
                                  >
                                    <Text style={styles.secondaryButtonText}>Edit</Text>
                                  </Pressable>
                                </View>
                              </View>
                            );
                          })}
                        </ScrollView>
                      ) : (
                        <Text style={styles.configHint}>Save the current host/port to reuse it fast.</Text>
                      )}
                    </View>

                    {obsConnected ? (
                      <>
                        <View style={obsCompact ? [styles.obsActionsRow, styles.obsActionsRowCompact] : styles.obsActionsRow}>
                          <Pressable
                            onPress={requestObsStreamToggle}
                            style={[styles.primaryButton, styles.obsActionButton, obsCompact ? styles.obsActionButtonCompact : null]}
                          >
                            <Text style={styles.primaryButtonText}>{obsStreamActive ? "Stop Stream" : "Start Stream"}</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => void toggleObsRecord()}
                            style={[styles.primaryButton, styles.obsActionButton, obsCompact ? styles.obsActionButtonCompact : null]}
                          >
                            <Text style={styles.primaryButtonText}>{obsRecordActive ? "Stop Record" : "Start Record"}</Text>
                          </Pressable>
                        </View>

                        {obsScenes.length > 0 ? (
                          <View style={styles.obsSceneGrid} onLayout={(event) => setObsSceneGridWidth(event.nativeEvent.layout.width)}>
                            {obsScenes.map((scene) => {
                              const active = scene === obsCurrentScene;
                              return (
                                <Pressable
                                  key={scene}
                                  onPress={() => void switchObsScene(scene)}
                                  style={[
                                    styles.obsSceneTile,
                                    { width: obsSceneTileWidth, height: obsSceneTileHeight },
                                    obsCompact ? styles.obsSceneTileCompact : null,
                                    active ? styles.obsSceneTileActive : null
                                  ]}
                                >
                                  <Text
                                    numberOfLines={2}
                                    style={[
                                      styles.obsSceneTileText,
                                      obsCompact ? styles.obsSceneTileTextCompact : null,
                                      active ? styles.obsSceneTileTextActive : null
                                    ]}
                                  >
                                    {scene}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        ) : (
                          <Text style={styles.emptyText}>No scenes loaded yet.</Text>
                        )}

                        <Pressable onPress={() => setObsPreviewExpanded((previous) => !previous)} style={styles.obsPreviewHeader}>
                          <Text style={styles.obsPreviewHeaderText}>Current OBS scene preview</Text>
                          <Text style={styles.obsPreviewChevron}>{obsPreviewExpanded ? "⌄" : "›"}</Text>
                        </Pressable>

                        {obsPreviewExpanded ? (
                          <>
                            <View style={styles.obsPreviewMediaCard}>
                              {obsPreviewImageUri ? (
                                <Image source={{ uri: obsPreviewImageUri }} style={styles.obsPreviewImage} resizeMode="cover" />
                              ) : (
                                <Text style={styles.obsPreviewEmptyText}>
                                  {obsPreviewLoading ? "Loading preview..." : "Preview unavailable. Tap Refresh to retry."}
                                </Text>
                              )}
                            </View>
                            <View style={styles.obsDetailTabs}>
                              <Pressable
                                onPress={() => setObsDetailTab("sceneItems")}
                                style={obsDetailTab === "sceneItems" ? [styles.obsDetailTab, styles.obsDetailTabActive] : styles.obsDetailTab}
                              >
                                <Text
                                  style={
                                    obsDetailTab === "sceneItems"
                                      ? [styles.obsDetailTabText, styles.obsDetailTabTextActive]
                                      : styles.obsDetailTabText
                                  }
                                >
                                  Scene Items
                                </Text>
                              </Pressable>
                              <Pressable
                                onPress={() => setObsDetailTab("audio")}
                                style={obsDetailTab === "audio" ? [styles.obsDetailTab, styles.obsDetailTabActive] : styles.obsDetailTab}
                              >
                                <Text
                                  style={obsDetailTab === "audio" ? [styles.obsDetailTabText, styles.obsDetailTabTextActive] : styles.obsDetailTabText}
                                >
                                  Audio
                                </Text>
                              </Pressable>
                            </View>

                            {obsDetailTab === "sceneItems" ? (
                              obsSceneItems.length > 0 ? (
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
                              )
                            ) : obsAudioInputs.length > 0 ? (
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
                                      <Pressable
                                        onPress={() => void toggleObsInputMute(input)}
                                        style={input.muted ? styles.warningButton : styles.primaryButton}
                                      >
                                        <Text style={styles.primaryButtonText}>{input.muted ? "Muted" : "Live"}</Text>
                                      </Pressable>
                                    </View>
                                  </View>
                                ))}
                              </View>
                            ) : (
                              <Text style={styles.emptyText}>No audio inputs found.</Text>
                            )}
                          </>
                        ) : null}

                        <View style={obsCompact ? [styles.obsStatsStrip, styles.obsStatsStripCompact] : styles.obsStatsStrip}>
                          <Text style={styles.metaText}>CPU: {obsStats.cpuUsage !== null ? `${obsStats.cpuUsage.toFixed(1)}%` : "n/a"}</Text>
                          <Text style={styles.metaText}>FPS: {obsStats.activeFps !== null ? obsStats.activeFps.toFixed(1) : "n/a"}</Text>
                          <Text style={styles.metaText}>
                            Dropped: {obsDroppedFramePercent !== null ? `${obsDroppedFramePercent.toFixed(2)}%` : "n/a"}
                          </Text>
                        </View>
                      </>
                    ) : (
                      <Text style={styles.emptyText}>Connect to OBS to load scenes and controller panels.</Text>
                    )}
                  </View>
                </ScrollView>
              ) : null}

              {mobileSection === "accounts" ? (
                <ScrollView
                  style={styles.scrollSection}
                  contentContainerStyle={styles.sectionContent}
                  keyboardShouldPersistTaps="handled"
                >
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
                        <Text style={styles.primaryButtonText}>
                          {authBusy === "kick" ? "Working..." : kickToken ? "Sign Out" : "Sign In"}
                        </Text>
                      </Pressable>
                    </View>
                    <Text style={styles.configHint}>Kick redirect: {kickRedirectUri}</Text>
                    {kickRefreshToken ? <Text style={styles.configHint}>Kick refresh token saved.</Text> : null}

                    <View style={styles.accountRow}>
                      <View style={styles.accountCopy}>
                        <Text style={styles.accountLabel}>YouTube</Text>
                        <Text style={styles.accountValue}>
                          {youtubeAccessToken || youtubeRefreshToken
                            ? `Connected as ${youtubeUsername || "account"}`
                            : "Not connected"}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => void (youtubeAccessToken || youtubeRefreshToken ? signOutYouTube() : signInYouTube())}
                        disabled={authBusy !== null}
                        style={youtubeAccessToken || youtubeRefreshToken ? styles.warningButton : styles.primaryButton}
                      >
                        <Text style={styles.primaryButtonText}>
                          {authBusy === "youtube"
                            ? "Working..."
                            : youtubeAccessToken || youtubeRefreshToken
                              ? "Sign Out"
                              : "Sign In"}
                        </Text>
                      </Pressable>
                    </View>
                    <Text style={styles.configHint}>YouTube redirect: {youtubeRedirectUri}</Text>
                    {youtubeRefreshToken ? <Text style={styles.configHint}>YouTube refresh token saved.</Text> : null}
                  </View>
                </ScrollView>
              ) : null}
            </View>

            <View style={styles.bottomNav}>
              <Pressable
                onPress={() => setMobileSection("chats")}
                style={mobileSection === "chats" ? [styles.navButton, styles.navButtonActive] : styles.navButton}
              >
                <Text style={mobileSection === "chats" ? [styles.navButtonText, styles.navButtonTextActive] : styles.navButtonText}>
                  Chats
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setMobileSection("add")}
                style={mobileSection === "add" ? [styles.navButton, styles.navButtonActive] : styles.navButton}
              >
                <Text style={mobileSection === "add" ? [styles.navButtonText, styles.navButtonTextActive] : styles.navButtonText}>
                  Add
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setMobileSection("obs")}
                style={mobileSection === "obs" ? [styles.navButton, styles.navButtonActive] : styles.navButton}
              >
                <Text style={mobileSection === "obs" ? [styles.navButtonText, styles.navButtonTextActive] : styles.navButtonText}>
                  OBS
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setMobileSection("accounts")}
                style={mobileSection === "accounts" ? [styles.navButton, styles.navButtonActive] : styles.navButton}
              >
                <Text
                  style={mobileSection === "accounts" ? [styles.navButtonText, styles.navButtonTextActive] : styles.navButtonText}
                >
                  Accounts
                </Text>
              </Pressable>
            </View>

            {obsStreamConfirmAction ? (
              <Modal transparent animationType="fade" visible onRequestClose={cancelObsStreamToggle}>
                <View style={styles.confirmOverlay}>
                  <View style={styles.confirmCard}>
                    <Text style={styles.confirmTitle}>
                      {obsStreamConfirmAction === "start" ? "Start stream now?" : "Stop stream now?"}
                    </Text>
                    <Text style={styles.confirmText}>
                      {obsStreamConfirmAction === "start"
                        ? "This will immediately start your OBS stream output."
                        : "This will immediately end your OBS stream output."}
                    </Text>
                    <View style={styles.confirmActions}>
                      <Pressable
                        onPress={cancelObsStreamToggle}
                        disabled={obsStreamConfirmBusy}
                        style={[styles.secondaryButton, obsStreamConfirmBusy ? styles.primaryButtonDisabled : null]}
                      >
                        <Text style={styles.secondaryButtonText}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => void confirmObsStreamToggle()}
                        disabled={obsStreamConfirmBusy}
                        style={[
                          obsStreamConfirmAction === "start" ? styles.primaryButton : styles.warningButton,
                          obsStreamConfirmBusy ? styles.primaryButtonDisabled : null
                        ]}
                      >
                        <Text style={styles.primaryButtonText}>
                          {obsStreamConfirmBusy
                            ? obsStreamConfirmAction === "start"
                              ? "Starting..."
                              : "Stopping..."
                            : obsStreamConfirmAction === "start"
                              ? "Start Stream"
                              : "Stop Stream"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              </Modal>
            ) : null}

            {notice ? (
              <Pressable onPress={() => setNotice(null)} style={styles.noticeBar}>
                <Text style={styles.noticeText}>{notice}</Text>
              </Pressable>
            ) : null}
          </View>
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
    backgroundColor: "#070a10"
  },
  appShell: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 10
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
    fontSize: 24,
    fontWeight: "700"
  },
  subtitle: {
    color: "#92a0b3",
    fontSize: 13,
    marginTop: 3
  },
  screenBody: {
    flex: 1
  },
  chatSection: {
    flex: 1
  },
  chatToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 4
  },
  toolbarMeta: {
    color: "#9cb0c7",
    fontSize: 11,
    flex: 1,
    textTransform: "capitalize"
  },
  toolbarMetaSecondary: {
    color: "#7f97b3",
    fontSize: 10,
    textTransform: "capitalize"
  },
  scrollSection: {
    flex: 1
  },
  sectionContent: {
    paddingBottom: 92,
    gap: 10
  },
  sectionTitle: {
    color: "#dce7f6",
    fontSize: 14,
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
    borderRadius: 14,
    backgroundColor: "#101722",
    padding: 12,
    gap: 9
  },
  configTitle: {
    color: "#d8e2f0",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 4,
    marginTop: 4
  },
  configHint: {
    color: "#8395ad",
    fontSize: 12
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  accountCopy: {
    flex: 1,
    gap: 3
  },
  accountLabel: {
    color: "#c9d5e5",
    fontSize: 13,
    fontWeight: "700"
  },
  accountValue: {
    color: "#93a4bb",
    fontSize: 12
  },
  addCard: {
    borderWidth: 1,
    borderColor: "#1c2533",
    borderRadius: 14,
    backgroundColor: "#101722",
    padding: 12,
    gap: 12
  },
  platformRow: {
    flexDirection: "row",
    gap: 8
  },
  platformPill: {
    borderWidth: 1,
    borderColor: "#2a3344",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14
  },
  platformPillActive: {
    borderColor: "#2dd4bf",
    backgroundColor: "#17353f"
  },
  platformPillText: {
    color: "#9eb0c8",
    fontSize: 13,
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
  mergeTabList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  mergeTabChip: {
    borderWidth: 1,
    borderColor: "#2a3344",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#121a27"
  },
  mergeTabChipActive: {
    borderColor: "#2dd4bf",
    backgroundColor: "#17353f"
  },
  mergeTabChipText: {
    color: "#9db0c7",
    fontSize: 12,
    fontWeight: "600"
  },
  mergeTabChipTextActive: {
    color: "#d9fff7"
  },
  addRowStack: {
    flexDirection: "column",
    alignItems: "stretch"
  },
  tabsStrip: {
    marginBottom: 4,
    maxHeight: 38
  },
  tabsRow: {
    flexDirection: "row",
    gap: 6
  },
  tabCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#283346",
    borderRadius: 999,
    backgroundColor: "#121a27",
    minWidth: 86,
    maxWidth: 138
  },
  tabCardActive: {
    borderColor: "#2dd4bf"
  },
  tabSelect: {
    flex: 1,
    paddingVertical: 5,
    paddingHorizontal: 8
  },
  tabTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5
  },
  tabLogo: {
    width: 14,
    height: 14,
    borderRadius: 7
  },
  tabLogoFallback: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#2d3a50",
    alignItems: "center",
    justifyContent: "center"
  },
  tabLogoFallbackText: {
    color: "#d8e5f7",
    fontSize: 9,
    fontWeight: "700"
  },
  tabTag: {
    color: "#7fdff8",
    fontSize: 10,
    fontWeight: "700"
  },
  tabLabel: {
    color: "#dfe9f6",
    fontSize: 12,
    fontWeight: "600",
    flexShrink: 1
  },
  tabMergedBadge: {
    color: "#7fe8d7",
    fontSize: 8,
    fontWeight: "700",
    marginLeft: 3
  },
  tabClose: {
    paddingHorizontal: 6,
    paddingVertical: 4
  },
  tabCloseText: {
    color: "#8ca3c1",
    fontSize: 13,
    fontWeight: "700"
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8
  },
  metaText: {
    color: "#8ea1b9",
    fontSize: 12,
    textTransform: "capitalize"
  },
  messagesList: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#1f2938",
    borderRadius: 12,
    backgroundColor: "#0f1622",
    minHeight: 0
  },
  messagesContent: {
    padding: 10,
    gap: 8
  },
  messagesContentEmpty: {
    flexGrow: 1,
    justifyContent: "center"
  },
  messageCard: {
    borderWidth: 1,
    borderColor: "#1f2a3a",
    borderRadius: 10,
    backgroundColor: "#0b1220",
    padding: 10,
    gap: 4
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
    fontSize: 14,
    fontWeight: "700"
  },
  messageAuthorRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4
  },
  badgeIcon: {
    width: 18,
    height: 18
  },
  badgePill: {
    borderWidth: 1,
    borderColor: "#2a3f66",
    borderRadius: 999,
    backgroundColor: "#0f1a2d",
    paddingHorizontal: 5,
    paddingVertical: 2
  },
  badgePillText: {
    color: "#d5e4f7",
    fontSize: 9,
    fontWeight: "700"
  },
  messageText: {
    color: "#edf3ff",
    fontSize: 15
  },
  messageInlineRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 2
  },
  inlineEmote: {
    width: 28,
    height: 28,
    marginHorizontal: 1
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
    marginBottom: 92
  },
  input: {
    borderWidth: 1,
    borderColor: "#253246",
    borderRadius: 10,
    backgroundColor: "#0f1622",
    color: "#e5eefb",
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15
  },
  portInput: {
    width: 92,
    borderWidth: 1,
    borderColor: "#253246",
    borderRadius: 10,
    backgroundColor: "#0f1622",
    color: "#e5eefb",
    paddingHorizontal: 10,
    paddingVertical: 11,
    fontSize: 15
  },
  portInputCompact: {
    width: "100%"
  },
  obsCard: {
    borderRadius: 16,
    backgroundColor: "#1c1f25",
    padding: 12,
    gap: 12
  },
  obsDashboardHeader: {
    alignItems: "center",
    gap: 5
  },
  obsDashboardTitle: {
    color: "#f0f6ff",
    fontSize: 38,
    fontWeight: "800",
    letterSpacing: -1
  },
  obsDashboardTitleCompact: {
    fontSize: 30
  },
  obsHeaderStates: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  obsHeaderStatesCompact: {
    flexWrap: "wrap",
    justifyContent: "center"
  },
  obsHeaderStateItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  obsStateDot: {
    width: 10,
    height: 10,
    borderRadius: 99
  },
  obsStateDotLive: {
    backgroundColor: "#28d79d"
  },
  obsStateDotOff: {
    backgroundColor: "#ff5447"
  },
  obsHeaderStateText: {
    color: "#d2d7df",
    fontSize: 17,
    fontWeight: "600"
  },
  obsTimerBar: {
    borderRadius: 12,
    backgroundColor: "#0b1324",
    borderWidth: 1,
    borderColor: "#22304a",
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    justifyContent: "space-between"
  },
  obsTimerBarCompact: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 6
  },
  obsTimerText: {
    color: "#edf4ff",
    fontSize: 15,
    fontWeight: "700"
  },
  obsTimerTextCompact: {
    fontSize: 14
  },
  obsConnectionCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#243045",
    backgroundColor: "#111827",
    padding: 10,
    gap: 8
  },
  obsConnectionStatus: {
    color: "#90a5c5",
    fontSize: 12
  },
  savedConnectionsSection: {
    borderWidth: 1,
    borderColor: "#243045",
    borderRadius: 12,
    backgroundColor: "#111827",
    padding: 10,
    gap: 8
  },
  savedConnectionsTitle: {
    color: "#dce8f8",
    fontSize: 17,
    fontWeight: "700"
  },
  savedConnectionsRow: {
    gap: 10,
    paddingRight: 8
  },
  savedConnectionCard: {
    width: 252,
    borderWidth: 1,
    borderColor: "#1e3d72",
    borderRadius: 14,
    backgroundColor: "#031535",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 8
  },
  savedConnectionDelete: {
    position: "absolute",
    right: 8,
    top: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center"
  },
  savedConnectionDeleteText: {
    color: "#9eb4d3",
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 19
  },
  savedConnectionName: {
    color: "#f1f7ff",
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    paddingRight: 14
  },
  savedConnectionHost: {
    color: "#9ba8be",
    fontSize: 12,
    textAlign: "center"
  },
  savedConnectionStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8
  },
  savedConnectionStatusDot: {
    width: 12,
    height: 12,
    borderRadius: 999
  },
  savedConnectionStatusReachable: {
    backgroundColor: "#34d86a"
  },
  savedConnectionStatusOffline: {
    backgroundColor: "#ff5f63"
  },
  savedConnectionStatusChecking: {
    backgroundColor: "#f9d151"
  },
  savedConnectionStatusText: {
    color: "#d6e3f4",
    fontSize: 12,
    fontWeight: "600"
  },
  savedConnectionActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2
  },
  savedConnectionActionButton: {
    flex: 1,
    alignItems: "center"
  },
  obsActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap"
  },
  obsActionsRowCompact: {
    justifyContent: "space-between"
  },
  obsActionButton: {
    minWidth: 96,
    alignItems: "center",
    justifyContent: "center"
  },
  obsActionButtonCompact: {
    flex: 1
  },
  qrScannerCard: {
    borderWidth: 1,
    borderColor: "#243040",
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#0d1522"
  },
  qrCamera: {
    width: "100%",
    height: 220
  },
  qrScannerFooter: {
    padding: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  obsSceneGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between"
  },
  obsSceneTile: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#1f3152",
    backgroundColor: "#071730",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    minHeight: 86,
    marginBottom: OBS_SCENE_TILE_ROW_GAP
  },
  obsSceneTileCompact: {
    borderRadius: 14
  },
  obsSceneTileActive: {
    backgroundColor: "#ea545d",
    borderColor: "#f36c74"
  },
  obsSceneTileText: {
    color: "#f3f7ff",
    textAlign: "center",
    fontSize: 15,
    fontWeight: "600"
  },
  obsSceneTileTextCompact: {
    fontSize: 13
  },
  obsSceneTileTextActive: {
    color: "#fff8f9"
  },
  obsPreviewHeader: {
    borderRadius: 12,
    backgroundColor: "#091934",
    borderWidth: 1,
    borderColor: "#203560",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  obsPreviewHeaderText: {
    color: "#eef5ff",
    fontSize: 16,
    fontWeight: "600"
  },
  obsPreviewChevron: {
    color: "#d9e6fb",
    fontSize: 18,
    fontWeight: "700"
  },
  obsPreviewMediaCard: {
    borderWidth: 1,
    borderColor: "#243040",
    borderRadius: 10,
    backgroundColor: "#0b1320",
    overflow: "hidden",
    minHeight: 136,
    alignItems: "center",
    justifyContent: "center"
  },
  obsPreviewImage: {
    width: "100%",
    height: 188
  },
  obsPreviewEmptyText: {
    color: "#8ea2b9",
    fontSize: 12,
    textAlign: "center",
    paddingHorizontal: 12
  },
  obsDetailTabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#24406f",
    marginTop: -2
  },
  obsDetailTab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: "transparent"
  },
  obsDetailTabActive: {
    borderBottomColor: "#2c78ff"
  },
  obsDetailTabText: {
    color: "#9eb0cc",
    fontSize: 14,
    fontWeight: "600"
  },
  obsDetailTabTextActive: {
    color: "#e6f0ff"
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
  obsStatsStrip: {
    borderWidth: 1,
    borderColor: "#2a3d63",
    borderRadius: 12,
    backgroundColor: "#08152d",
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  obsStatsStripCompact: {
    flexWrap: "wrap",
    justifyContent: "flex-start"
  },
  grow: {
    flex: 1
  },
  primaryButton: {
    borderRadius: 10,
    backgroundColor: "#186d60",
    paddingHorizontal: 13,
    paddingVertical: 11
  },
  secondaryButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2f3e56",
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  warningButton: {
    borderRadius: 10,
    backgroundColor: "#7a3b3b",
    paddingHorizontal: 12,
    paddingVertical: 11
  },
  primaryButtonDisabled: {
    opacity: 0.45
  },
  primaryButtonText: {
    color: "#f1fffc",
    fontSize: 13,
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
    gap: 10,
    paddingHorizontal: 24
  },
  emptyTitle: {
    color: "#d7e5f7",
    fontSize: 20,
    fontWeight: "700"
  },
  emptyText: {
    color: "#8ea2b9",
    fontSize: 13,
    textAlign: "center"
  },
  bottomNav: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#243249",
    backgroundColor: "#0c121d",
    flexDirection: "row",
    gap: 8,
    padding: 8
  },
  navButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 10
  },
  navButtonActive: {
    backgroundColor: "#17353f"
  },
  navButtonText: {
    color: "#8ea3bc",
    fontSize: 12,
    fontWeight: "700"
  },
  navButtonTextActive: {
    color: "#d9fff7"
  },
  confirmOverlay: {
    flex: 1,
    backgroundColor: "rgba(3, 7, 14, 0.72)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18
  },
  confirmCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2a3f62",
    backgroundColor: "#0c1526",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10
  },
  confirmTitle: {
    color: "#ecf4ff",
    fontSize: 17,
    fontWeight: "700"
  },
  confirmText: {
    color: "#9eb3cb",
    fontSize: 13,
    lineHeight: 18
  },
  confirmActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8
  },
  noticeBar: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 78,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1e6f65",
    backgroundColor: "#103b36",
    paddingHorizontal: 10,
    paddingVertical: 9
  },
  noticeText: {
    color: "#d8fffa",
    fontSize: 12
  }
});
