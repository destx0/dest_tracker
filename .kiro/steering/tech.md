# Technology Stack

## Build System

- **Vite 5.x**: Fast build tool and dev server
- **vite-plugin-web-extension**: Handles browser extension bundling and manifest generation
- **TypeScript 5.6.3**: Strict type checking enabled

## Frontend

- **React 18.2**: UI framework for popup interface
- **React DOM**: Rendering layer
- **CSS**: Custom styling (no framework)

## Browser APIs

- **webextension-polyfill**: Cross-browser compatibility layer for Chrome/Firefox
- **Manifest V3** (Chrome) and **V2** (Firefox) support via conditional manifest fields

## Firebase Integration

- **Firebase Firestore**: Cloud database for syncing data across devices
- **Firebase Auth**: Anonymous authentication for user identification
- **Real-time Sync**: Bidirectional sync with conflict resolution
- **Auto-sync**: Every 30 seconds + on data changes
- **Environment Variables**: Firebase config stored in .env file

## Key Dependencies

- `@vitejs/plugin-react`: React support in Vite
- `@types/webextension-polyfill`: TypeScript definitions for browser APIs

## Common Commands

```bash
# Development mode with hot reload
pnpm dev

# Production build (compiles TypeScript + bundles)
pnpm build

# Output directory: dist/
```

## TypeScript Configuration

- Target: ESNext
- Strict mode enabled
- JSX: react-jsx (automatic runtime)
- Module resolution: Node
