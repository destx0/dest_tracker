import browser from "webextension-polyfill";
import { initializeSync, syncToRemote } from "./services/syncService";

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

interface SiteAccessLog {
  [hostname: string]: {
    lastAccessed: number; // timestamp
    accessCount: number;
  };
}

interface DailyBalance {
  date: string;
  earned: number; // from productive time
  spent: number; // on distracting time
  bonus: number; // daily starting bonus (900 seconds = 15 min)
  total: number; // earned + bonus - spent
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
  "netflix.com",
  "amazon.in"
];

// Special blocked sites with cooldown
const SPECIAL_BLOCKED_SITES = {
  "amazon.in": {
    cooldownDays: 2,
    message: "Amazon is blocked for 2 days after each visit"
  }
};

const DAILY_BONUS_SECONDS = 900; // 15 minutes
const BALANCE_RATIO = 0.5; // 1 min productive = 0.5 min distracting

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

// Default redirect sites for blocked/time-up popups
const DEFAULT_REDIRECT_SITES = [
  { name: "LeetCode", url: "https://leetcode.com" },
  { name: "NeetCode", url: "https://neetcode.io" },
  { name: "GitHub", url: "https://github.com" },
  { name: "Stack Overflow", url: "https://stackoverflow.com" }
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
  
  // Check if we need to reset data for a new day
  await checkAndResetForNewDay();
  
  // Initialize Firebase sync
  await initializeSync();
});

// Initialize on install
browser.runtime.onInstalled.addListener(async () => {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]) {
    currentTabId = tabs[0].id || null;
    startTime = Date.now();
  }
  
  // Set default limited sites if not already set
  const result = await browser.storage.local.get(["limitedSites", "productiveSites", "redirectSites"]);
  if (!result.limitedSites) {
    await browser.storage.local.set({ limitedSites: DEFAULT_LIMITED_SITES });
  }
  if (!result.productiveSites) {
    await browser.storage.local.set({ productiveSites: DEFAULT_PRODUCTIVE_SITES });
  }
  if (!result.redirectSites) {
    await browser.storage.local.set({ redirectSites: DEFAULT_REDIRECT_SITES });
  }
  
  // Check if we need to reset data for a new day
  await checkAndResetForNewDay();
  
  // Initialize Firebase sync
  await initializeSync();
});

// Update time periodically (every 10 seconds)
setInterval(updateCurrentTabTime, 10000);

// Sync to Firebase every 30 seconds
setInterval(syncToRemote, 30000);

// Check balance and update daily bonus
async function checkAndUpdateDailyBalance() {
  const today = new Date().toISOString().split('T')[0];
  const result = await browser.storage.local.get(["dailyBalance", "timeTracking", "productiveSites", "limitedSites"]);
  
  const dailyBalance: DailyBalance = result.dailyBalance || {
    date: today,
    earned: 0,
    spent: 0,
    bonus: DAILY_BONUS_SECONDS,
    total: DAILY_BONUS_SECONDS
  };
  
  // Reset if new day
  if (dailyBalance.date !== today) {
    dailyBalance.date = today;
    dailyBalance.earned = 0;
    dailyBalance.spent = 0;
    dailyBalance.bonus = DAILY_BONUS_SECONDS;
    dailyBalance.total = DAILY_BONUS_SECONDS;
  }
  
  // Calculate earned and spent from today's tracking
  const timeTracking = result.timeTracking || {};
  const productiveSites = result.productiveSites || DEFAULT_PRODUCTIVE_SITES;
  const limitedSites = result.limitedSites || DEFAULT_LIMITED_SITES;
  
  let productiveTime = 0;
  let distractingTime = 0;
  
  for (const item of Object.values(timeTracking) as TabTimeData[]) {
    if (productiveSites.some((site: string) => item.url.includes(site))) {
      productiveTime += item.timeSpent;
    }
    if (limitedSites.some((site: string) => item.url.includes(site))) {
      distractingTime += item.timeSpent;
    }
  }
  
  dailyBalance.earned = Math.floor(productiveTime * BALANCE_RATIO);
  dailyBalance.spent = distractingTime;
  dailyBalance.total = dailyBalance.bonus + dailyBalance.earned - dailyBalance.spent;
  
  await browser.storage.local.set({ dailyBalance });
  return dailyBalance;
}

// Check if site can be accessed
async function canAccessSite(hostname: string): Promise<{ allowed: boolean; reason?: string; cooldownEnd?: number }> {
  const result = await browser.storage.local.get(["siteAccessLog", "dailyBalance", "limitedSites"]);
  const siteAccessLog: SiteAccessLog = result.siteAccessLog || {};
  const limitedSites = result.limitedSites || DEFAULT_LIMITED_SITES;
  
  // Check if it's a limited site
  const isLimited = limitedSites.some((site: string) => hostname.includes(site) || site.includes(hostname));
  
  if (!isLimited) {
    return { allowed: true };
  }
  
  // Check special blocked sites (like Amazon)
  for (const [blockedSite, config] of Object.entries(SPECIAL_BLOCKED_SITES)) {
    if (hostname.includes(blockedSite)) {
      const lastAccess = siteAccessLog[blockedSite]?.lastAccessed || 0;
      const cooldownMs = config.cooldownDays * 24 * 60 * 60 * 1000;
      const cooldownEnd = lastAccess + cooldownMs;
      
      if (Date.now() < cooldownEnd) {
        return { 
          allowed: false, 
          reason: config.message,
          cooldownEnd 
        };
      }
    }
  }
  
  // Check balance
  const dailyBalance = await checkAndUpdateDailyBalance();
  
  if (dailyBalance.total <= 0) {
    return { 
      allowed: false, 
      reason: "Insufficient balance. Earn more time by being productive!" 
    };
  }
  
  return { allowed: true };
}

// Log site access
async function logSiteAccess(hostname: string) {
  const result = await browser.storage.local.get("siteAccessLog");
  const siteAccessLog: SiteAccessLog = result.siteAccessLog || {};
  
  siteAccessLog[hostname] = {
    lastAccessed: Date.now(),
    accessCount: (siteAccessLog[hostname]?.accessCount || 0) + 1
  };
  
  await browser.storage.local.set({ siteAccessLog });
}

// Check and reset for new day on startup
async function checkAndResetForNewDay() {
  const today = new Date().toISOString().split('T')[0];
  const result = await browser.storage.local.get("lastHistoryUpdate");
  const lastUpdate = result.lastHistoryUpdate;
  
  // If it's a new day, reset tracking data
  if (lastUpdate && lastUpdate !== today) {
    console.log(`New day detected! Resetting data from ${lastUpdate} to ${today}`);
    await browser.storage.local.set({ 
      timeTracking: {},
      lastHistoryUpdate: today
    });
  } else if (!lastUpdate) {
    // First time running, set the date
    await browser.storage.local.set({ lastHistoryUpdate: today });
  }
}

// Initialize daily balance
checkAndUpdateDailyBalance();
setInterval(checkAndUpdateDailyBalance, 60000); // Update every minute

// Check for new day every minute
setInterval(checkAndResetForNewDay, 60000);

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
  
  // Sync to Firebase after updating history
  await syncToRemote();
}

// Initialize history on startup
updateDailyHistory();

// Check time limits every second
setInterval(checkTimeLimits, 1000);

// Track which limits are being processed to prevent duplicate actions
const processingLimits = new Set<string>();

async function checkTimeLimits() {
  const result = await browser.storage.local.get(["activeLimits", "productiveSites"]);
  const activeLimits: ActiveLimits = result.activeLimits || {};
  const productiveSites = result.productiveSites || DEFAULT_PRODUCTIVE_SITES;
  const now = Date.now();
  
  for (const [hostname, limit] of Object.entries(activeLimits)) {
    // Skip if already processing this hostname
    if (processingLimits.has(hostname)) {
      continue;
    }
    
    if (now >= limit.endTime) {
      // Mark as processing
      processingLimits.add(hostname);
      
      // Check if this is a productive site
      const isProductive = productiveSites.some((site: string) => 
        hostname.includes(site) || site.includes(hostname)
      );
      
      if (isProductive) {
        // For productive sites, send message to show popup instead of closing
        const tabs = await browser.tabs.query({});
        let messageSent = false;
        
        for (const tab of tabs) {
          if (tab.url && tab.url.includes(hostname) && tab.id) {
            try {
              await browser.tabs.sendMessage(tab.id, { 
                type: "showProductiveTimeUpPopup" 
              });
              messageSent = true;
              console.log(`Sent productive time-up popup to tab ${tab.id} for ${hostname}`);
            } catch (error) {
              console.log(`Could not send message to tab ${tab.id}:`, error);
            }
          }
        }
        
        if (messageSent) {
          // Remove the limit for productive sites after showing popup
          delete activeLimits[hostname];
          await browser.storage.local.set({ activeLimits });
          console.log(`Removed time limit for productive site: ${hostname}`);
        }
      } else {
        // For distracting sites, close all tabs with this hostname
        const tabs = await browser.tabs.query({});
        const tabsToClose = tabs.filter(tab => tab.url && tab.url.includes(hostname) && tab.id);
        
        for (const tab of tabsToClose) {
          try {
            await browser.tabs.remove(tab.id!);
            console.log(`Closed distracting site tab ${tab.id} for ${hostname}`);
          } catch (error) {
            console.log(`Could not close tab ${tab.id}:`, error);
          }
        }
        
        // Remove the limit after closing tabs
        delete activeLimits[hostname];
        await browser.storage.local.set({ activeLimits });
        console.log(`Removed time limit for distracting site: ${hostname}`);
      }
      
      // Remove from processing set after a delay
      setTimeout(() => {
        processingLimits.delete(hostname);
      }, 2000);
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
    await syncToRemote();
    return { success: true };
  }
  
  if (message.type === "getProductiveSites") {
    const result = await browser.storage.local.get("productiveSites");
    return { productiveSites: result.productiveSites || DEFAULT_PRODUCTIVE_SITES };
  }
  
  if (message.type === "updateProductiveSites") {
    await browser.storage.local.set({ productiveSites: message.sites });
    await syncToRemote();
    return { success: true };
  }
  
  if (message.type === "getRedirectSites") {
    const result = await browser.storage.local.get("redirectSites");
    return { redirectSites: result.redirectSites || DEFAULT_REDIRECT_SITES };
  }
  
  if (message.type === "updateRedirectSites") {
    await browser.storage.local.set({ redirectSites: message.sites });
    await syncToRemote();
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
  
  if (message.type === "manualSync") {
    const result = await syncToRemote();
    return result;
  }
  
  if (message.type === "getSyncStatus") {
    const { getSyncStatus } = await import("./services/syncService");
    return getSyncStatus();
  }
  
  if (message.type === "setAdminUserId") {
    const { setAdminUserId } = await import("./services/syncService");
    await browser.storage.local.set({ adminUserId: message.userId });
    const result = await setAdminUserId(message.userId);
    return result;
  }
  
  if (message.type === "getDailyBalance") {
    const balance = await checkAndUpdateDailyBalance();
    return { balance };
  }
  
  if (message.type === "canAccessSite") {
    const result = await canAccessSite(message.hostname);
    return result;
  }
  
  if (message.type === "logSiteAccess") {
    await logSiteAccess(message.hostname);
    return { success: true };
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
