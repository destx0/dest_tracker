import { useEffect, useState } from 'react';
import browser from "webextension-polyfill";
import "./Popup.css";

interface TabTimeData {
  url: string;
  title: string;
  timeSpent: number;
  lastActive: number;
}

interface DailyBalance {
  date: string;
  earned: number;
  spent: number;
  bonus: number;
  total: number;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.floor(seconds)}s`;
}

export default function() {
  const [timeData, setTimeData] = useState<TabTimeData[]>([]);
  const [limitedSites, setLimitedSites] = useState<string[]>([]);
  const [productiveSites, setProductiveSites] = useState<string[]>([]);
  const [dailyBalance, setDailyBalance] = useState<DailyBalance | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number>(0);
  const [resetOpen, setResetOpen] = useState(false);

  useEffect(() => {
    loadAll();
    const onMsg = (m: any) => { if (m.type === "syncComplete") loadAll(); };
    browser.runtime.onMessage.addListener(onMsg);
    const t = setInterval(loadAll, 5000);
    return () => { clearInterval(t); browser.runtime.onMessage.removeListener(onMsg); };
  }, []);

  async function loadAll() {
    await Promise.all([loadTime(), loadLimited(), loadProductive(), loadBalance(), loadSync()]);
  }
  async function loadTime() {
    const r = await browser.storage.local.get("timeTracking");
    setTimeData(Object.values(r.timeTracking || {}) as TabTimeData[]);
  }
  async function loadLimited() {
    const r = await browser.runtime.sendMessage({ type: "getLimitedSites" });
    setLimitedSites(r.limitedSites || []);
  }
  async function loadProductive() {
    const r = await browser.runtime.sendMessage({ type: "getProductiveSites" });
    setProductiveSites(r.productiveSites || []);
  }
  async function loadBalance() {
    const r = await browser.runtime.sendMessage({ type: "getDailyBalance" });
    setDailyBalance(r.balance);
  }
  async function loadSync() {
    const r = await browser.storage.local.get("lastSync");
    setLastSyncTime(r.lastSync || 0);
  }

  async function sync() {
    setSyncing(true);
    try { await browser.runtime.sendMessage({ type: "manualSync" }); } finally { setSyncing(false); loadAll(); }
  }
  async function reset() {
    await browser.runtime.sendMessage({ type: "resetUsage" });
    setResetOpen(false);
    loadAll();
  }

  const productiveTime = timeData
    .filter(i => productiveSites.some(s => i.url.includes(s)))
    .reduce((a, i) => a + i.timeSpent, 0);
  const distractingTime = timeData
    .filter(i => limitedSites.some(s => i.url.includes(s)))
    .reduce((a, i) => a + i.timeSpent, 0);

  const BALANCE_RATIO = 0.5;
  const earned = dailyBalance ? dailyBalance.earned : Math.floor(productiveTime * BALANCE_RATIO);
  const bonus = dailyBalance ? dailyBalance.bonus : 900;
  const spent = dailyBalance ? dailyBalance.spent : distractingTime;
  const totalEarned = earned + bonus;
  const remaining = dailyBalance ? Math.max(0, dailyBalance.total) : Math.max(0, totalEarned - spent);

  const synced = lastSyncTime > 0 && Date.now() - lastSyncTime <= 5 * 60 * 1000;

  return (
    <div className="container">
      <header className="header">
        <div className="brand">
          <div className="mark" />
          <span className="title">Tab Time</span>
        </div>
        <div className="header-right">
          <span className={`dot ${synced ? "" : "stub"}`} title={lastSyncTime ? `Synced ${new Date(lastSyncTime).toLocaleString()}` : ""} />
          <button className="icon-btn" onClick={() => setResetOpen(v => !v)} title="Reset">↺</button>
        </div>
      </header>

      <section className="hero">
        <span className="hero-label">Available</span>
        <span className="hero-value">{formatTime(remaining)}</span>
        <span className="hero-meta">{formatTime(totalEarned)} earned</span>
      </section>

      <section className="stats">
        <div className="stat productive">
          <span className="stat-label">Productive</span>
          <span className="stat-value">{formatTime(productiveTime)}</span>
        </div>
        <div className="stat distracting">
          <span className="stat-label">Distracting</span>
          <span className="stat-value">{formatTime(distractingTime)}</span>
        </div>
      </section>

      {resetOpen ? (
        <footer className="footer">
          <button className="btn ghost" onClick={() => setResetOpen(false)}>Cancel</button>
          <button className="btn danger" onClick={reset}>Reset usage</button>
        </footer>
      ) : (
        <footer className="footer">
          <button className="btn primary" onClick={sync} disabled={syncing}>{syncing ? "Syncing…" : "Sync"}</button>
        </footer>
      )}
    </div>
  );
}
