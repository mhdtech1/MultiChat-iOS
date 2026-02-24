# MultiChat iOS

MultiChat iOS is the mobile version of MultiChat. It lets you monitor chat from multiple platforms in one app and includes an OBS Controller tab for mobile stream control.

## What The App Does

- Connect Twitch, Kick, and YouTube chats
- View single or merged chat tabs
- Render badges and emotes (including 7TV support)
- Control OBS over WebSocket (scenes, stream/record, audio, preview)
- Save OBS connections and connect quickly

## Repo Layout

- `apps/ios` — React Native / Expo iOS app
- `packages/chat-core` — shared adapters and chat models used by the app

## Requirements (Mac)

- macOS with Xcode installed
- Apple Developer account signed into Xcode
- Node.js 20+
- pnpm 9+
- CocoaPods (`sudo gem install cocoapods` if needed)
- iPhone with Developer Mode enabled (for device install)

## Install And Run With Xcode (Mac)

1. Clone and install dependencies:

```bash
git clone https://github.com/mhdtech1/MultiChat-iOS.git
cd MultiChat-iOS
pnpm install
pnpm --filter @multichat/chat-core build
```

2. Install iOS pods:

```bash
cd apps/ios/ios
pod install
cd ../../..
```

3. Open the workspace in Xcode:

```bash
open apps/ios/ios/MultiChatiOS.xcworkspace
```

4. In Xcode:

- Select target: `MultiChatiOS`
- Set your Team in **Signing & Capabilities**
- Confirm bundle id is unique for your account if needed
- Choose your iPhone as run destination
- Press **Run**

## Optional: Launch From CLI

```bash
pnpm --filter @multichat/ios ios
```

## Troubleshooting

- If code signing fails with `resource fork, Finder information, or similar detritus not allowed`, move the repo out of iCloud-synced folders and rebuild.
- If pods are out of date, run:

```bash
cd apps/ios/ios
pod install --repo-update
```
