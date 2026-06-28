# AGENTS.md

## Build for Firefox (Zen Browser)

```bash
pnpm build:firefox
```

Then reload the extension in Zen: `about:debugging#/runtime/this-firefox` → click Reload next to "Tab Time Tracker", or restart Zen.

The extension is loaded live from `dist/` via a proxy file at
`~/.zen/yehdp2a0.Default (release)/extensions/tab-time-tracker@dest_tracker.local`
(pointing to `/home/omu/cud/dest_tracker/dist`), so rebuilding `dist/` is enough — no copy/install step needed.