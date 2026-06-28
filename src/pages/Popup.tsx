import { useEffect, useState } from 'react';
import browser from "webextension-polyfill";
import "./Popup.css";

function formatTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.floor(s)}s`;
}

function favLetter(host: string): string {
  const base = host.replace(/^www\./, "").split(".")[0];
  return base ? base[0].toUpperCase() : "?";
}

export default function() {
  const [host, setHost] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [tag, setTag] = useState<"" | "productive" | "distracting">("");

  useEffect(() => {
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, []);

  async function load() {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    let hostname = "";
    try { hostname = new URL(tab.url || "").hostname; } catch { hostname = ""; }
    setHost(hostname);
    const r = await browser.storage.local.get("timeTracking");
    setSeconds(r.timeTracking?.[hostname]?.timeSpent || 0);
    const [ls, ps] = await Promise.all([
      browser.runtime.sendMessage({ type: "getLimitedSites" }),
      browser.runtime.sendMessage({ type: "getProductiveSites" }),
    ]);
    const limited = ls.limitedSites || [];
    const productive = ps.productiveSites || [];
    if (productive.some((s: string) => hostname.includes(s))) setTag("productive");
    else if (limited.some((s: string) => hostname.includes(s))) setTag("distracting");
    else setTag("");
  }

  return (
    <div className="container">
      <header className="header">
        <div className="brand"><div className="mark" /><span className="title">Tab Time</span></div>
      </header>
      <section className="hero">
        <div className="site">
          <span className="site-icon">{favLetter(host)}</span>
          <span className="site-host">{host || "No site"}</span>
        </div>
        <span className="hero-value">{formatTime(seconds)}</span>
        <span className={`hero-meta ${tag}`}>{tag === "productive" ? "Productive" : tag === "distracting" ? "Distracting" : "Today"}</span>
      </section>
    </div>
  );
}
