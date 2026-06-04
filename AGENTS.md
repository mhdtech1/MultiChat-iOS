# AGENTS.md

Guidance for AI agents working in this repository.

## Project overview

MultiChat iOS is a pnpm monorepo:

- `apps/ios` — React Native / Expo iOS app
- `packages/chat-core` — shared chat adapters (Twitch IRC, Kick Pusher, YouTube polling)

There is no backend server in this repo. The app talks directly to third-party APIs and WebSockets.

## Common commands

From the repo root:

```bash
pnpm install
pnpm build:chat-core
pnpm --filter @multichat/chat-core test
pnpm --filter @multichat/chat-core lint
pnpm ios   # macOS only — builds chat-core then runs expo start --ios
```

## Requirements

- Node.js 20+ (repo pins pnpm 9.12.3 via `packageManager`)
- **Native iOS development requires macOS** with Xcode, CocoaPods, and an iOS simulator or device
- Linux cloud VMs can develop and test `packages/chat-core` but cannot run the iOS simulator or Xcode builds

## Cursor Cloud specific instructions

### Update script vs manual setup

The VM update script runs `corepack enable`, activates pnpm 9.12.3, `pnpm install`, and `pnpm build:chat-core`. That is enough for shared-library work and unit tests.

### What works on Linux (Cloud Agent VM)

| Task | Command | Notes |
|------|---------|-------|
| Install deps | `pnpm install` | Use corepack for pnpm 9.12.3 |
| Build shared lib | `pnpm build:chat-core` | Required before iOS app imports chat-core |
| Unit tests | `pnpm --filter @multichat/chat-core test` | Vitest; 6 IRC parser tests, no external services |
| Live chat adapter smoke test | `pnpm dlx tsx /tmp/twitch-demo.ts` | See demo script below; needs outbound internet |
| Expo Metro bundler | `cd apps/ios && CI=1 pnpm exec expo start --port 8081` | Bundler starts and serves JS successfully |

### What requires macOS

- `pnpm ios` / `expo start --ios`
- `cd apps/ios/ios && pod install`
- Opening `apps/ios/ios/MultiChatiOS.xcworkspace` in Xcode
- Full native iOS UI testing on simulator or device

### Expo web on Linux

The repo includes a `web` script in `apps/ios/package.json`, but web dependencies (`react-dom`, `react-native-web`) are not committed. Even after installing them, the app currently renders a blank page in the browser due to React hook errors — web is not a supported dev target today. Prefer `chat-core` tests and live adapter smoke tests on Linux.

### Lint caveat

`pnpm --filter @multichat/chat-core lint` fails because there is no `eslint.config.js` in `packages/chat-core` (ESLint 9 flat config). This is a pre-existing repo gap, not an environment issue.

### Live Twitch adapter smoke test (hello world on Linux)

Create a temporary script (do not commit):

```typescript
// /tmp/twitch-demo.ts
import { TwitchAdapter } from "/workspace/packages/chat-core/src/adapters/twitch/twitchAdapter.ts";

async function main() {
  const adapter = new TwitchAdapter({ channel: "xqc", logger: console.log });
  adapter.onStatus(console.log);
  adapter.onMessage((m) => console.log(m.displayName + ":", m.message));
  await adapter.connect();
  setTimeout(() => process.exit(0), 10000);
}
main();
```

Run: `cd packages/chat-core && pnpm dlx tsx /tmp/twitch-demo.ts`

### Starting Expo Metro (optional)

Use tmux for long-running dev servers:

```bash
SESSION_NAME="expo-metro"
tmux -f /exec-daemon/tmux.portal.conf new-session -d -s "$SESSION_NAME" -c "/workspace/apps/ios"
tmux -f /exec-daemon/tmux.portal.conf send-keys -t "$SESSION_NAME:0.0" 'CI=1 pnpm exec expo start --port 8081' C-m
```

No secrets are required for read-only Twitch chat (anonymous `justinfan` nick). YouTube chat needs an API key entered in-app. OBS control needs a reachable obs-websocket server.
