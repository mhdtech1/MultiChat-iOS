# MultiChat iOS

Standalone workspace for the MultiChat iOS app.

## Contents

- `apps/ios`: Expo React Native app
- `packages/chat-core`: shared chat adapters/types used by iOS

## Setup

```bash
pnpm install
pnpm run build:chat-core
pnpm run ios
```

## Notes

- iOS app OAuth/client settings currently live in `apps/ios/App.tsx`.
