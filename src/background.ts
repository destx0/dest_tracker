import browser from "webextension-polyfill";

interface TabTimeData {
  url: string;
  title: string;
  timeSpent: number; // in seconds
  lastActive: number;
}

interface TimeTrackingData {
  [key: string]: TabTimeData;
}

interface TimeLimit {
  endTime: number;
  seconds: number;
  startTime: number;
}

interface ActiveLimits {
  [hostname: string]: TimeLimit;
}

interface DailyHistory {
  date: string; // YYYY-MM-DD format
  totalTime: number; // in seconds
  productiveTime: number;
  distractingTime: number;
}

interface WeeklyHistory {
  [date: string]: DailyHistory;
}

let currentTabId: number | null = null;
let startTime: number = Date.now();

// Default limited sites
const DEFAULT_LIMITED_SITES = [
  "instagram.com",
  "youtube.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "reddit.com",
  "netflix.com"
];

// Default productive sites
const DEFAULT_PRODUCTIVE_SITES = [
  "github.com",
  "stackoverflow.com",
  "developer.mozilla.org",
  "docs.python.org",
  "leetcode.com",
  "coursera.org",
  "udemy.com",
  "medium.com"
];

// Load existing data
async function loadData(): Promise<TimeTrackingData> {
  const result = await browser.storage.local.get("timeTracking");
  return result.timeTracking || {};
}

// Save data
async function saveData(data: TimeTrackingData) {
  await browser.storage.local.set({ timeTracking: data });
}

// Update time for current tab
async function updateCurrentTabTime() {
  if (currentTabId === null) return;

  const now = Date.now();
  const timeSpent = Math.floor((now - startTime) / 1000);
  
  if (timeSpent > 0) {
    const data = await loadData();
    const tab = await browser.tabs.get(currentTabId);
    const url = new URL(tab.url || "").hostname || tab.url || "unknown";
    
    if (!data[url]) {
      data[url] = {
        url,
        title: tab.title || "Untitled",
        timeSpent: 0,
        lastActive: now
      };
    }
    
    data[url].timeSpent += timeSpent;
    data[url].lastActive = now;
    data[url].title = tab.title || data[url].title;
    
    await saveData(data);
  }
  
  startTime = now;
}

// Track active tab changes
browser.tabs.onActivated.addListener(async (activeInfo) => {
  await updateCurrentTabTime();
  currentTabId = activeInfo.tabId;
  startTime = Date.now();
});

// Track tab updates (URL changes)
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tabId === currentTabId && changeInfo.url) {
    await updateCurrentTabTime();
    startTime = Date.now();
  }
});

// Track window focus changes
browser.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === browser.windows.WINDOW_ID_NONE) {
    await updateCurrentTabTime();
    currentTabId = null;
  } else {
    const tabs = await browser.tabs.query({ active: true, windowId });
    if (tabs[0]) {
      currentTabId = tabs[0].id || null;
      startTime = Date.now();
    }
  }
});

// Initialize on startup
browser.runtime.onStartup.addListener(async () => {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]) {
    currentTabId = tabs[0].id || null;
    startTime = Date.now();
  }
});

// Initialize on install
browser.runtime.onInstalled.addListener(async () => {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]) {
    currentTabId = tabs[0].id || null;
    startTime = Date.now();
  }
  
  // Set default limited sites if not already set
  const result = await browser.storage.local.get(["limitedSites", "productiveSites"]);
  if (!result.limitedSites) {
    await browser.storage.local.set({ limitedSites: DEFAULT_LIMITED_SITES });
  }
  if (!result.productiveSites) {
    await browser.storage.local.set({ productiveSites: DEFAULT_PRODUCTIVE_SITES });
  }
});

// Update time periodically (every 10 seconds)
setInterval(updateCurrentTabTime, 10000);

// Update daily history at midnight
setInterval(updateDailyHistory, 60000); // Check every minute

async function updateDailyHistory() {
  const now = new Date();
  const today = now.toISOString().split('T')[0]; // YYYY-MM-DD
  
  // Get current tracking data
  const timeData = await loadData();
  const result = await browser.storage.local.get(["weeklyHistory", "limitedSites", "productiveSites", "lastHistoryUpdate"]);
  
  const weeklyHistory: WeeklyHistory = result.weeklyHistory || {};
  const limitedSites = result.limitedSites || DEFAULT_LIMITED_SITES;
  const productiveSites = result.productiveSites || DEFAULT_PRODUCTIVE_SITES;
  const lastUpdate = result.lastHistoryUpdate || today;
  
  // Calculate today's stats
  let totalTime = 0;
  let productiveTime = 0;
  let distractingTime = 0;
  
  for (const item of Object.values(timeData)) {
    totalTime += item.timeSpent;
    
    if (productiveSites.some((site: string) => item.url.includes(site))) {
      productiveTime += item.timeSpent;
    }
    
    if (limitedSites.some((site: string) => item.url.includes(site))) {
      distractingTime += item.timeSpent;
    }
  }
  
  // Update today's entry
  weeklyHistory[today] = {
    date: today,
    totalTime,
    productiveTime,
    distractingTime
  };
  
  // Clean up old entries (keep only last 30 days)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const cutoffDate = thirtyDaysAgo.toISOString().split('T')[0];
  
  for (const date in weeklyHistory) {
    if (date < cutoffDate) {
      delete weeklyHistory[date];
    }
  }
  
  // If it's a new day, reset today's tracking
  if (lastUpdate !== today) {
    await browser.storage.local.set({ 
      timeTracking: {},
      lastHistoryUpdate: today
    });
  }
  
  await browser.storage.local.set({ weeklyHistory });
}

// Initialize history on startup
updateDailyHistory();

// Check time limits every second
setInterval(checkTimeLimits, 1000);

async function checkTimeLimits() {
  const result = await browser.storage.local.get("activeLimits");
  const activeLimits: ActiveLimits = result.activeLimits || {};
  const now = Date.now();
  
  for (const [hostname, limit] of Object.entries(activeLimits)) {
    if (now >= limit.endTime) {
      // Time's up! Close all tabs with this hostname
      const tabs = await browser.tabs.query({});
      for (const tab of tabs) {
        if (tab.url && tab.url.includes(hostname)) {
          await browser.tabs.remove(tab.id!);
        }
      }
      
      // Remove the limit
      delete activeLimits[hostname];
      await browser.storage.local.set({ activeLimits });
    }
  }
}

// Listen for messages from popup
browser.runtime.onMessage.addListener(async (message) => {
  if (message.type === "getLimitedSites") {
    const result = await browser.storage.local.get("limitedSites");
    return { limitedSites: result.limitedSites || DEFAULT_LIMITED_SITES };
  }
  
  if (message.type === "updateLimitedSites") {
    await browser.storage.local.set({ limitedSites: message.sites });
    return { success: true };
  }
  
  if (message.type === "getProductiveSites") {
    const result = await browser.storage.local.get("productiveSites");
    return { productiveSites: result.productiveSites || DEFAULT_PRODUCTIVE_SITES };
  }
  
  if (message.type === "updateProductiveSites") {
    await browser.storage.local.set({ productiveSites: message.sites });
    return { success: true };
  }
  
  if (message.type === "getActiveLimits") {
    const result = await browser.storage.local.get("activeLimits");
    return { activeLimits: result.activeLimits || {} };
  }
  
  if (message.type === "getWeeklyHistory") {
    const result = await browser.storage.local.get("weeklyHistory");
    return { weeklyHistory: result.weeklyHistory || {} };
  }
  
  if (message.action === "openPopup") {
    // Try to open the popup (works in Firefox, limited in Chrome)
    try {
      // @ts-ignore - openPopup may not be available in all browsers
      if (browser.action && browser.action.openPopup) {
        // @ts-ignore
        await browser.action.openPopup();
      } else if (browser.browserAction && browser.browserAction.openPopup) {
        // @ts-ignore - for older API
        await browser.browserAction.openPopup();
      }
    } catch (error) {
      console.log("Could not open popup programmatically:", error);
      // Fallback: In Chrome, we can't open popup from content script
      // The user will need to click the extension icon manually
    }
    return { success: true };
  }
});
