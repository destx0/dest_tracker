# Product Overview

**Tab Time Tracker** is a cross-browser extension (Chrome/Firefox) that tracks time spent on websites and helps users manage their browsing habits.

## Core Features

- **Automatic Time Tracking**: Monitors active tab time and aggregates by hostname
- **Time Limits**: Users can set time limits on distracting sites (Instagram, YouTube, Reddit, etc.)
- **Productivity Insights**: Categorizes sites as "productive" or "distracting" with visual statistics
- **Active Countdown**: Shows remaining time for limited sites with color-coded warnings
- **Persistent Storage**: Uses browser.storage.local to maintain tracking data across sessions
- **Productive Sites Management**: Users can add productive sites (like LeetCode, GitHub, etc.) to a whitelist
- **Gentle Reminders**: For productive sites, shows a popup reminder instead of closing tabs when time is up

## User Experience

- Popup interface displays time statistics, site breakdown, and productivity metrics
- Content script injects time limit prompts and countdown overlays on limited sites
- Background service worker handles tab tracking, time updates, and automatic tab closure when limits expire
- Settings panel allows managing both limited (distracting) and productive site lists
- Productive sites show encouraging popups instead of forced closures when time limits are reached
