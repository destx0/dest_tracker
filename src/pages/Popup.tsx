import { useEffect, useState } from 'react';
import browser from "webextension-polyfill";
import "./Popup.css";

interface TabTimeData {
  url: string;
  title: string;
  timeSpent: number;
  lastActive: number;
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
  date: string;
  totalTime: number;
  productiveTime: number;
  distractingTime: number;
}

interface WeeklyHistory {
  [date: string]: DailyHistory;
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  } else if (seconds > 0) {
    return `${secs}s`;
  } else {
    return "0m";
  }
}

export default function() {
  const [timeData, setTimeData] = useState<TabTimeData[]>([]);
  const [currentTab, setCurrentTab] = useState<string>("");
  const [limitedSites, setLimitedSites] = useState<string[]>([]);
  const [productiveSites, setProductiveSites] = useState<string[]>([]);
  const [activeLimits, setActiveLimits] = useState<ActiveLimits>({});
  const [weeklyHistory, setWeeklyHistory] = useState<WeeklyHistory>({});
  const [newSite, setNewSite] = useState("");
  const [newProductiveSite, setNewProductiveSite] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'limited' | 'productive'>('limited');

  useEffect(() => {
    loadTimeData();
    loadLimitedSites();
    loadProductiveSites();
    loadActiveLimits();
    loadWeeklyHistory();
    
    // Refresh data every second
    const interval = setInterval(() => {
      loadTimeData();
      loadActiveLimits();
      loadWeeklyHistory();
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);

  async function loadTimeData() {
    const result = await browser.storage.local.get("timeTracking");
    const data = result.timeTracking || {};
    
    // Get current tab
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      const currentUrl = new URL(tabs[0].url || "").hostname || tabs[0].url || "";
      setCurrentTab(currentUrl);
    }
    
    // Convert to array and sort by time spent
    const dataArray = Object.values(data) as TabTimeData[];
    dataArray.sort((a, b) => b.timeSpent - a.timeSpent);
    
    setTimeData(dataArray);
  }

  async function loadLimitedSites() {
    const response = await browser.runtime.sendMessage({ type: "getLimitedSites" });
    setLimitedSites(response.limitedSites || []);
  }

  async function loadProductiveSites() {
    const response = await browser.runtime.sendMessage({ type: "getProductiveSites" });
    setProductiveSites(response.productiveSites || []);
  }

  async function loadActiveLimits() {
    const response = await browser.runtime.sendMessage({ type: "getActiveLimits" });
    setActiveLimits(response.activeLimits || {});
  }

  async function loadWeeklyHistory() {
    const response = await browser.runtime.sendMessage({ type: "getWeeklyHistory" });
    setWeeklyHistory(response.weeklyHistory || {});
  }

  async function clearData() {
    await browser.storage.local.set({ timeTracking: {} });
    setTimeData([]);
  }

  async function addLimitedSite() {
    if (newSite.trim()) {
      const updated = [...limitedSites, newSite.trim()];
      await browser.runtime.sendMessage({ type: "updateLimitedSites", sites: updated });
      setLimitedSites(updated);
      setNewSite("");
    }
  }

  async function removeLimitedSite(site: string) {
    const updated = limitedSites.filter(s => s !== site);
    await browser.runtime.sendMessage({ type: "updateLimitedSites", sites: updated });
    setLimitedSites(updated);
  }

  async function addProductiveSite() {
    if (newProductiveSite.trim()) {
      const updated = [...productiveSites, newProductiveSite.trim()];
      await browser.runtime.sendMessage({ type: "updateProductiveSites", sites: updated });
      setProductiveSites(updated);
      setNewProductiveSite("");
    }
  }

  async function removeProductiveSite(site: string) {
    const updated = productiveSites.filter(s => s !== site);
    await browser.runtime.sendMessage({ type: "updateProductiveSites", sites: updated });
    setProductiveSites(updated);
  }

  const totalTime = timeData.reduce((sum, item) => sum + item.timeSpent, 0);
  
  // Calculate productive vs distracting time
  const productiveTime = timeData
    .filter(item => productiveSites.some(site => item.url.includes(site)))
    .reduce((sum, item) => sum + item.timeSpent, 0);
  
  const distractingTime = timeData
    .filter(item => limitedSites.some(site => item.url.includes(site)))
    .reduce((sum, item) => sum + item.timeSpent, 0);

  const productivePercentage = totalTime > 0 ? Math.round((productiveTime / totalTime) * 100) : 0;
  const distractingPercentage = totalTime > 0 ? Math.round((distractingTime / totalTime) * 100) : 0;

  // Get last 7 days for chart
  const getLast7Days = () => {
    const days = [];
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const historyData = weeklyHistory[dateStr] || { totalTime: 0, productiveTime: 0, distractingTime: 0 };
      days.push({
        date: dateStr,
        dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
        totalTime: historyData.totalTime,
        productiveTime: historyData.productiveTime,
        distractingTime: historyData.distractingTime
      });
    }
    
    return days;
  };

  const last7Days = getLast7Days();
  const maxTime = Math.max(...last7Days.map(d => d.totalTime), 1);

  return (
    <div className="container">
      <div className="header">
        <h1>Time Tracker</h1>
        <button onClick={() => setShowSettings(!showSettings)} className="settings-btn">
          {showSettings ? "Stats" : "Settings"}
        </button>
      </div>
      
      {!showSettings ? (
        <>
          <div className="stats-compact">
            <div className="stat-row">
              <span className="stat-label">Total</span>
              <span className="stat-value">{formatTime(totalTime)}</span>
            </div>
            <div className="stat-row productive">
              <span className="stat-label">Productive</span>
              <span className="stat-value">{formatTime(productiveTime)}</span>
            </div>
            <div className="stat-row distracting">
              <span className="stat-label">Distracting</span>
              <span className="stat-value">{formatTime(distractingTime)}</span>
            </div>
          </div>

          <div className="weekly-history">
            <h3>Weekly Usage</h3>
            <div className="chart">
              {last7Days.map((day, index) => {
                const heightPercent = maxTime > 0 ? (day.totalTime / maxTime) * 100 : 0;
                const productivePercent = day.totalTime > 0 ? (day.productiveTime / day.totalTime) * 100 : 0;
                const distractingPercent = day.totalTime > 0 ? (day.distractingTime / day.totalTime) * 100 : 0;
                
                return (
                  <div key={index} className="chart-bar-wrapper">
                    <div className="chart-bar" style={{ height: `${Math.max(heightPercent, 2)}%` }}>
                      <div 
                        className="bar-segment productive" 
                        style={{ height: `${productivePercent}%` }}
                        title={`Productive: ${formatTime(day.productiveTime)}`}
                      />
                      <div 
                        className="bar-segment distracting" 
                        style={{ height: `${distractingPercent}%` }}
                        title={`Distracting: ${formatTime(day.distractingTime)}`}
                      />
                    </div>
                    <div className="chart-label">{day.dayName}</div>
                    <div className="chart-time">{formatTime(day.totalTime)}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {Object.keys(activeLimits).length > 0 && (
            <div className="active-limits">
              <h3>Active Limits</h3>
              {Object.entries(activeLimits).map(([hostname, limit]) => {
                const remaining = Math.max(0, Math.floor((limit.endTime - Date.now()) / 1000));
                return (
                  <div key={hostname} className="limit-item">
                    <span className="limit-site">{hostname}</span>
                    <span className="limit-time">{formatTime(remaining)}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="list">
            {timeData.length === 0 ? (
              <p className="empty">No data</p>
            ) : (
              timeData.map((item) => {
                const isProductive = productiveSites.some(site => item.url.includes(site));
                const isDistracting = limitedSites.some(site => item.url.includes(site));
                
                return (
                  <div 
                    key={item.url} 
                    className={`list-item ${item.url === currentTab ? 'active' : ''} ${isProductive ? 'productive-site' : ''} ${isDistracting ? 'distracting-site' : ''}`}
                  >
                    <div className="item-header">
                      <span className="item-title">{item.title}</span>
                      {item.url === currentTab && <span className="active-badge">•</span>}
                    </div>
                    <div className="item-url">{item.url}</div>
                    <div className="item-time">{formatTime(item.timeSpent)}</div>
                  </div>
                );
              })
            )}
          </div>
          
          <div className="footer">
            <button onClick={clearData} className="clear-btn">Clear Data</button>
          </div>
        </>
      ) : (
        <div className="settings">
          <div className="settings-tabs">
            <button 
              className={`settings-tab ${settingsTab === 'limited' ? 'active' : ''}`}
              onClick={() => setSettingsTab('limited')}
            >
              Limited
            </button>
            <button 
              className={`settings-tab ${settingsTab === 'productive' ? 'active' : ''}`}
              onClick={() => setSettingsTab('productive')}
            >
              Productive
            </button>
          </div>

          {settingsTab === 'limited' ? (
            <>
              <div className="add-site">
                <input
                  type="text"
                  placeholder="instagram.com"
                  value={newSite}
                  onChange={(e) => setNewSite(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addLimitedSite()}
                />
                <button onClick={addLimitedSite}>+</button>
              </div>

              <div className="sites-list">
                {limitedSites.map((site) => (
                  <div key={site} className="site-item distracting">
                    <span>{site}</span>
                    <button onClick={() => removeLimitedSite(site)} className="remove-btn">×</button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="add-site">
                <input
                  type="text"
                  placeholder="github.com"
                  value={newProductiveSite}
                  onChange={(e) => setNewProductiveSite(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addProductiveSite()}
                />
                <button onClick={addProductiveSite}>+</button>
              </div>

              <div className="sites-list">
                {productiveSites.map((site) => (
                  <div key={site} className="site-item productive">
                    <span>{site}</span>
                    <button onClick={() => removeProductiveSite(site)} className="remove-btn">×</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
