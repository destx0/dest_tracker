import browser from "webextension-polyfill";

console.log("[TabTimeTracker] Content script loaded on", window.location.hostname);

function isHostnameMatch(hostname: string, sitePattern: string): boolean {
  return hostname === sitePattern || hostname.endsWith('.' + sitePattern);
}

// Shared Raycast-style tokens injected once per surface.
const RAYCAST_STYLE_ID = "tabtime-raycast-tokens";
function ensureTokens(parent: HTMLElement = document.head) {
  if (parent.querySelector(`#${RAYCAST_STYLE_ID}`)) return;
  const style = document.createElement("style");
  style.id = RAYCAST_STYLE_ID;
  style.textContent = `
    :root {
      --tt-canvas: #07080a;
      --tt-surface: #0d0d0d;
      --tt-surface-elevated: #101111;
      --tt-surface-card: #121212;
      --tt-hairline: #242728;
      --tt-hairline-soft: rgba(255,255,255,0.08);
      --tt-hairline-strong: rgba(255,255,255,0.16);
      --tt-ink: #f4f4f6;
      --tt-body: #cdcdcd;
      --tt-mute: #9c9c9d;
      --tt-ash: #6a6b6c;
      --tt-on-dark: #ffffff;
      --tt-on-dark-mute: rgba(255,255,255,0.72);
      --tt-primary: #ffffff;
      --tt-primary-pressed: #e8e8e8;
      --tt-on-primary: #000000;
      --tt-accent-blue: #57c1ff;
      --tt-accent-red: #ff6161;
      --tt-accent-green: #59d499;
      --tt-accent-yellow: #ffc533;
      --tt-hero-stripe-start: #ff5757;
      --tt-hero-stripe-end: #a1131a;
    }
  `;
  parent.appendChild(style);
}

function ttFont(): string {
  return '"Inter","Inter Fallback",system-ui,-apple-system,sans-serif';
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function shortTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${total}s`;
}

function hostLabel(host: string): string {
  return host.replace(/^www\./, "");
}

// Single click opens modal; double click hides pill for 1 min.
// A timer distinguishes the two so dblclick doesn't trigger the modal.
function bindPillClicks(pill: HTMLElement) {
  let clickTimer: number | null = null;
  pill.addEventListener("click", () => {
    if (clickTimer !== null) return; // wait for possible dblclick
    clickTimer = window.setTimeout(() => {
      clickTimer = null;
      openManagementModal();
    }, 250);
  });
  pill.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    if (clickTimer !== null) { clearTimeout(clickTimer); clickTimer = null; }
    pill.style.display = "none";
    setTimeout(() => { pill.style.display = ""; }, 60000);
  });
}

// ---------- Site access (blocked page) ----------
async function checkSiteAccess() {
  const hostname = window.location.hostname;
  try {
    const response = await browser.runtime.sendMessage({ type: "canAccessSite", hostname });
    if (!response.allowed) {
      showBlockedPage(response.reason, response.cooldownEnd);
      return false;
    }
    if (isHostnameMatch(hostname, "amazon.in")) {
      await browser.runtime.sendMessage({ type: "logSiteAccess", hostname: "amazon.in" });
    }
    return true;
  } catch (err) {
    console.error("[TabTimeTracker] checkSiteAccess failed:", err);
    return true;
  }
}

async function showBlockedPage(reason: string, cooldownEnd?: number) {
  ensureTokens();
  const result = await browser.storage.local.get("redirectSites");
  const redirectSites = result.redirectSites || [{ name: "NeetCode", url: "https://neetcode.io" }];
  const randomSite = redirectSites[Math.floor(Math.random() * redirectSites.length)];

  document.body.innerHTML = "";
  document.body.style.margin = "0";
  document.body.style.padding = "0";
  document.body.style.overflow = "hidden";

  const overlay = document.createElement("div");
  overlay.id = "tt-blocked-overlay";

  let cooldownHtml = "";
  if (cooldownEnd) {
    const remainingDays = Math.ceil((cooldownEnd - Date.now()) / (1000 * 60 * 60 * 24));
    cooldownHtml = `<div class="tt-cooldown">Available again in ${Math.max(1, remainingDays)} day${remainingDays === 1 ? '' : 's'}</div>`;
  }

  overlay.innerHTML = `
    <div class="tt-hero-stripes" aria-hidden="true"></div>
    <div class="tt-blocked-card">
      <div class="tt-blocked-eyebrow">Blocked</div>
      <h1 class="tt-blocked-title">Step away</h1>
      <p class="tt-blocked-reason">${reason}</p>
      ${cooldownHtml}
      <div class="tt-suggest">
        <div class="tt-suggest-label">Earn more time</div>
        <a class="tt-btn tt-btn-primary tt-suggest-link" href="${randomSite.url}">
          <span>Open ${randomSite.name}</span>
          <span class="tt-arrow">→</span>
        </a>
      </div>
      <button class="tt-btn tt-btn-secondary tt-back-btn">Back</button>
    </div>
  `;

  const style = document.createElement("style");
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
    #tt-blocked-overlay {
      position: fixed;
      inset: 0;
      background: var(--tt-canvas);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999999;
      font-family: ${ttFont()};
      font-feature-settings: "calt","kern","liga","ss03";
      -webkit-font-smoothing: antialiased;
      color: var(--tt-ink);
      padding: 48px 24px;
      overflow: hidden;
    }
    #tt-blocked-overlay .tt-hero-stripes {
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 220px;
      background:
        repeating-linear-gradient(116deg,
          transparent 0 18px,
          rgba(255,87,87,0.55) 18px 22px,
          transparent 22px 40px,
          rgba(161,19,26,0.55) 40px 44px),
        linear-gradient(180deg, rgba(7,8,10,0) 0%, var(--tt-canvas) 100%);
      opacity: 0.9;
      pointer-events: none;
    }
    #tt-blocked-overlay .tt-blocked-card {
      position: relative;
      width: 100%;
      max-width: 520px;
      background: var(--tt-surface);
      border: 1px solid var(--tt-hairline);
      border-radius: 16px;
      padding: 32px 28px 24px;
      text-align: center;
      display: flex;
      flex-direction: column;
      gap: 14px;
      animation: ttIn 200ms ease-out;
    }
    @keyframes ttIn { from { opacity: 0; transform: translateY(6px);} to { opacity: 1; transform: none; } }
    #tt-blocked-overlay .tt-blocked-eyebrow {
      font-size: 12px;
      letter-spacing: 0.4px;
      text-transform: uppercase;
      color: var(--tt-accent-red);
      font-weight: 500;
    }
    #tt-blocked-overlay .tt-blocked-title {
      margin: 0;
      font-size: 36px;
      line-height: 1.1;
      font-weight: 600;
      letter-spacing: 0;
      color: var(--tt-ink);
    }
    #tt-blocked-overlay .tt-blocked-reason {
      margin: 0;
      font-size: 15px;
      line-height: 1.6;
      color: var(--tt-body);
    }
    #tt-blocked-overlay .tt-cooldown {
      font-size: 13px;
      color: var(--tt-mute);
      padding: 6px 12px;
      background: var(--tt-surface-elevated);
      border: 1px solid var(--tt-hairline);
      border-radius: 9999px;
      align-self: center;
    }
    #tt-blocked-overlay .tt-suggest {
      margin-top: 8px;
      padding: 16px;
      background: var(--tt-surface-elevated);
      border: 1px solid var(--tt-hairline);
      border-radius: 10px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      align-items: center;
    }
    #tt-blocked-overlay .tt-suggest-label {
      font-size: 12px;
      letter-spacing: 0.4px;
      text-transform: uppercase;
      color: var(--tt-mute);
      font-weight: 500;
    }
    #tt-blocked-overlay .tt-btn {
      font-family: inherit;
      font-feature-settings: "calt","kern","liga","ss03";
      font-size: 14px;
      font-weight: 500;
      line-height: 1.6;
      border-radius: 8px;
      cursor: pointer;
      border: 1px solid transparent;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: background 150ms, color 150ms, border-color 150ms;
    }
    #tt-blocked-overlay .tt-btn-primary {
      background: var(--tt-primary);
      color: var(--tt-on-primary);
      padding: 10px 18px;
    }
    #tt-blocked-overlay .tt-btn-primary:hover { background: var(--tt-primary-pressed); }
    #tt-blocked-overlay .tt-arrow { font-weight: 600; }
    #tt-blocked-overlay .tt-btn-secondary {
      background: transparent;
      color: var(--tt-on-dark);
      border-color: var(--tt-hairline);
      padding: 8px 16px;
    }
    #tt-blocked-overlay .tt-btn-secondary:hover {
      background: var(--tt-surface-elevated);
      border-color: var(--tt-hairline-strong);
    }
    #tt-blocked-overlay .tt-back-btn { align-self: center; margin-top: 4px; }
  `;

  document.head.appendChild(style);
  document.body.appendChild(overlay);

  const backBtn = overlay.querySelector(".tt-back-btn") as HTMLButtonElement;
  backBtn?.addEventListener("click", () => window.history.back());
}

checkSiteAccess();

// ---------- Time limit auto-set ----------
async function checkTimeLimit() {
  const hostname = window.location.hostname;

  let accessResponse;
  try {
    accessResponse = await browser.runtime.sendMessage({ type: "canAccessSite", hostname });
  } catch (err) {
    console.error("[TabTimeTracker] canAccessSite failed:", err);
    return;
  }
  if (accessResponse.cooldownEnd) return;
  if (!accessResponse.allowed) return;

  const limitedResponse = await browser.runtime.sendMessage({ type: "getLimitedSites" });
  const limitedSites = limitedResponse.limitedSites || [];
  const result = await browser.storage.local.get("activeLimits");
  const activeLimits = result.activeLimits || {};

  const isLimited = limitedSites.some((site: string) => isHostnameMatch(hostname, site));
  if (!isLimited || activeLimits[hostname]) return;

  let remainingBalance = 0;
  try {
    const balanceResponse = await browser.runtime.sendMessage({ type: "getDailyBalance" });
    remainingBalance = balanceResponse.balance?.total || 0;
  } catch (err) {
    remainingBalance = 300;
  }
  if (remainingBalance <= 0) return;

  const defaultSeconds = Math.min(remainingBalance, 300);
  const endTime = Date.now() + defaultSeconds * 1000;
  activeLimits[hostname] = { endTime, seconds: defaultSeconds };
  await browser.storage.local.set({ activeLimits });

  showCountdown(defaultSeconds);
}

function showTimeLimitPrompt() {
  ensureTokens();
  const existing = document.getElementById("tt-limit-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "tt-limit-overlay";
  overlay.innerHTML = `
    <div class="tt-limit-card" role="dialog" aria-label="Set time limit">
      <div class="tt-limit-header">
        <div class="tt-window">
          <span></span><span></span><span></span>
        </div>
        <div class="tt-limit-eyebrow">Set time limit</div>
      </div>
      <div class="tt-limit-body">
        <div class="tt-limit-display">
          <span class="tt-limit-value">5</span>
          <span class="tt-limit-unit">min</span>
        </div>
        <div class="tt-quick-row">
          <button class="tt-quick" data-minutes="0.17">10s</button>
          <button class="tt-quick selected" data-minutes="5">5m</button>
          <button class="tt-quick" data-minutes="30">30m</button>
        </div>
        <div class="tt-slider-wrap">
          <input type="range" class="tt-slider" min="1" max="60" value="5" step="1" aria-label="Minutes">
        </div>
        <div class="tt-slider-marks"><span>1m</span><span>60m</span></div>
        <button class="tt-btn-primary tt-confirm">Set limit</button>
        <button class="tt-btn-tertiary tt-cancel">Cancel</button>
      </div>
    </div>
  `;

  const style = document.createElement("style");
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
    #tt-limit-overlay {
      position: fixed; inset: 0;
      background: rgba(7,8,10,0.78);
      backdrop-filter: blur(8px);
      display: flex; align-items: center; justify-content: center;
      z-index: 999999;
      font-family: ${ttFont()};
      font-feature-settings: "calt","kern","liga","ss03";
      -webkit-font-smoothing: antialiased;
      color: var(--tt-ink);
      padding: 24px;
    }
    #tt-limit-overlay .tt-limit-card {
      width: 380px;
      max-width: 100%;
      background: var(--tt-surface);
      border: 1px solid var(--tt-hairline);
      border-radius: 16px;
      overflow: hidden;
      animation: ttIn 180ms ease-out;
    }
    #tt-limit-overlay .tt-limit-header {
      padding: 10px 14px;
      border-bottom: 1px solid var(--tt-hairline);
      display: flex; align-items: center; gap: 10px;
    }
    #tt-limit-overlay .tt-window { display: flex; gap: 6px; }
    #tt-limit-overlay .tt-window span {
      width: 10px; height: 10px; border-radius: 9999px;
      background: var(--tt-hairline-strong);
    }
    #tt-limit-overlay .tt-limit-eyebrow {
      font-size: 12px;
      letter-spacing: 0.4px;
      text-transform: uppercase;
      color: var(--tt-mute);
      font-weight: 500;
      margin-left: 4px;
    }
    #tt-limit-overlay .tt-limit-body {
      padding: 24px 22px 22px;
      display: flex; flex-direction: column; gap: 16px;
    }
    #tt-limit-overlay .tt-limit-display {
      display: flex; align-items: baseline; justify-content: center; gap: 8px;
      padding: 18px 16px;
      background: var(--tt-surface-elevated);
      border: 1px solid var(--tt-hairline);
      border-radius: 10px;
    }
    #tt-limit-overlay .tt-limit-value {
      font-size: 52px; font-weight: 600; line-height: 1;
      color: var(--tt-ink);
      font-variant-numeric: tabular-nums;
    }
    #tt-limit-overlay .tt-limit-unit {
      font-size: 14px; color: var(--tt-mute);
      text-transform: uppercase; letter-spacing: 0.4px;
      font-weight: 500;
    }
    #tt-limit-overlay .tt-quick-row {
      display: flex; gap: 6px; justify-content: center;
    }
    #tt-limit-overlay .tt-quick {
      background: transparent;
      color: var(--tt-on-dark-mute);
      border: 1px solid var(--tt-hairline);
      padding: 8px 16px;
      border-radius: 8px;
      cursor: pointer;
      font-family: inherit;
      font-size: 14px;
      font-weight: 500;
      transition: background 150ms, color 150ms, border-color 150ms;
    }
    #tt-limit-overlay .tt-quick:hover {
      background: var(--tt-surface-elevated);
      color: var(--tt-on-dark);
      border-color: var(--tt-hairline-strong);
    }
    #tt-limit-overlay .tt-quick.selected {
      background: var(--tt-surface-elevated);
      color: var(--tt-on-dark);
      border-color: var(--tt-hairline-strong);
    }
    #tt-limit-overlay .tt-slider-wrap { margin-top: 4px; }
    #tt-limit-overlay .tt-slider {
      width: 100%; height: 4px;
      -webkit-appearance: none; appearance: none;
      background: var(--tt-surface-elevated);
      border-radius: 9999px;
      outline: none;
    }
    #tt-limit-overlay .tt-slider::-webkit-slider-thumb {
      -webkit-appearance: none; appearance: none;
      width: 18px; height: 18px;
      border-radius: 9999px;
      background: var(--tt-primary);
      border: 2px solid var(--tt-surface);
      cursor: pointer;
      box-shadow: 0 0 0 1px var(--tt-hairline-strong);
    }
    #tt-limit-overlay .tt-slider::-moz-range-thumb {
      width: 18px; height: 18px;
      border-radius: 9999px;
      background: var(--tt-primary);
      border: 2px solid var(--tt-surface);
      cursor: pointer;
    }
    #tt-limit-overlay .tt-slider-marks {
      display: flex; justify-content: space-between;
      margin-top: 8px;
      font-size: 12px; color: var(--tt-mute);
      letter-spacing: 0.1px;
    }
    #tt-limit-overlay .tt-btn-primary {
      background: var(--tt-primary);
      color: var(--tt-on-primary);
      border: none;
      padding: 10px 16px;
      border-radius: 8px;
      cursor: pointer;
      font-family: inherit;
      font-size: 14px;
      font-weight: 500;
      line-height: 1.6;
      letter-spacing: 0.2px;
    }
    #tt-limit-overlay .tt-btn-primary:hover { background: var(--tt-primary-pressed); }
    #tt-limit-overlay .tt-btn-tertiary {
      background: transparent;
      color: var(--tt-on-dark-mute);
      border: 1px solid var(--tt-hairline);
      padding: 8px 16px;
      border-radius: 8px;
      cursor: pointer;
      font-family: inherit;
      font-size: 14px;
      font-weight: 500;
    }
    #tt-limit-overlay .tt-btn-tertiary:hover {
      background: var(--tt-surface-elevated);
      color: var(--tt-on-dark);
      border-color: var(--tt-hairline-strong);
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(overlay);

  const slider = overlay.querySelector(".tt-slider") as HTMLInputElement;
  const valueDisplay = overlay.querySelector(".tt-limit-value") as HTMLElement;
  const unitDisplay = overlay.querySelector(".tt-limit-unit") as HTMLElement;
  const quickBtns = overlay.querySelectorAll(".tt-quick");
  const confirmBtn = overlay.querySelector(".tt-confirm") as HTMLButtonElement;
  const cancelBtn = overlay.querySelector(".tt-cancel") as HTMLButtonElement;

  let selectedMinutes = 5;
  function updateDisplay(minutes: number) {
    selectedMinutes = minutes;
    if (minutes < 1) {
      valueDisplay.textContent = String(Math.round(minutes * 60));
      unitDisplay.textContent = "sec";
    } else {
      valueDisplay.textContent = String(Math.round(minutes));
      unitDisplay.textContent = "min";
    }
  }

  slider.addEventListener("input", () => {
    updateDisplay(parseFloat(slider.value));
    quickBtns.forEach(b => b.classList.remove("selected"));
  });
  quickBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const minutes = parseFloat((btn as HTMLElement).dataset.minutes || "5");
      slider.value = String(minutes);
      updateDisplay(minutes);
      quickBtns.forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
    });
  });
  confirmBtn.addEventListener("click", async () => {
    const seconds = Math.round(selectedMinutes * 60);
    await setTimeLimit(seconds);
    overlay.remove();
  });
  cancelBtn.addEventListener("click", () => overlay.remove());
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const seconds = Math.round(selectedMinutes * 60);
      setTimeLimit(seconds).then(() => overlay.remove());
    } else if (e.key === "Escape") {
      overlay.remove();
    }
  });
  slider.focus();
}

async function setTimeLimit(seconds: number) {
  const hostname = window.location.hostname;
  const endTime = Date.now() + seconds * 1000;
  const result = await browser.storage.local.get("activeLimits");
  const activeLimits = result.activeLimits || {};
  activeLimits[hostname] = { endTime, seconds };
  await browser.storage.local.set({ activeLimits });
  showCountdown(seconds);
}

// ---------- Floating countdown pill (Raycast) ----------
function showCountdown(totalSeconds: number) {
  ensureTokens();
  const existing = document.getElementById("tt-countdown");
  if (existing) existing.remove();

  const pill = document.createElement("button");
  pill.id = "tt-countdown";
  pill.type = "button";
  pill.title = "Click to open Tab Time · Double-click to hide for 1 min";
  pill.innerHTML = `<span class="tt-pill-time"></span>`;

  const style = document.createElement("style");
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
    #tt-countdown {
      position: fixed; top: 12px; right: 12px;
      z-index: 999998;
      font-family: ${ttFont()};
      font-feature-settings: "calt","kern","liga","ss03";
      -webkit-font-smoothing: antialiased;
      color: var(--tt-ink);
      background: rgba(13,13,13,0.82);
      backdrop-filter: blur(14px);
      border: 1px solid var(--tt-hairline);
      border-radius: 8px;
      padding: 4px 9px;
      cursor: pointer;
      text-align: left;
      transition: background 180ms, border-color 180ms;
      opacity: 0.9;
      font-variant-numeric: tabular-nums;
      font-size: 13px;
      font-weight: 600;
      line-height: 1;
      letter-spacing: 0;
    }
    #tt-countdown:hover {
      opacity: 1;
      background: rgba(18,18,18,0.92);
      border-color: var(--tt-hairline-strong);
    }
    #tt-countdown.warning .tt-pill-time { color: var(--tt-accent-yellow); }
    #tt-countdown.danger .tt-pill-time { color: var(--tt-accent-red); }
  `;

  document.head.appendChild(style);
  document.body.appendChild(pill);

  bindPillClicks(pill);

  const timeDisplay = pill.querySelector(".tt-pill-time") as HTMLElement;
  const hostname = window.location.hostname;

  const initMin = Math.floor(totalSeconds / 60);
  const initSec = totalSeconds % 60;
  timeDisplay.textContent = `${initMin}:${String(initSec).padStart(2, '0')}`;

  const tickInterval = setInterval(async () => {
    if (!document.body.contains(pill)) { clearInterval(tickInterval); return; }
    const result = await browser.storage.local.get("activeLimits");
    const activeLimits = result.activeLimits || {};
    const limit = activeLimits[hostname];
    if (!limit) { clearInterval(tickInterval); return; }
    const remaining = Math.max(0, Math.ceil((limit.endTime - Date.now()) / 1000));
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    timeDisplay.textContent = `${m}:${String(s).padStart(2, '0')}`;
    pill.classList.remove("warning", "danger");
    if (remaining <= 10) pill.classList.add("danger");
    else if (remaining <= 30) pill.classList.add("warning");
    if (remaining <= 0) clearInterval(tickInterval);
  }, 1000);
}

checkTimeLimit();

async function checkExistingLimit() {
  const hostname = window.location.hostname;
  const result = await browser.storage.local.get("activeLimits");
  const activeLimits = result.activeLimits || {};
  if (activeLimits[hostname]) {
    const limit = activeLimits[hostname];
    const remaining = Math.max(0, Math.floor((limit.endTime - Date.now()) / 1000));
    if (remaining > 0) showCountdown(remaining);
  }
}
checkExistingLimit();

// ---------- Floating productive timer (Raycast, enriched) ----------
async function checkProductiveSite() {
  const hostname = window.location.hostname;
  const result = await browser.storage.local.get("productiveSites");
  const productiveSites = result.productiveSites || [];
  const isProductive = productiveSites.some((site: string) => isHostnameMatch(hostname, site));
  if (isProductive) showProductiveTimer();
}

async function showProductiveTimer() {
  ensureTokens();
  const existing = document.getElementById("tt-productive");
  if (existing) existing.remove();

  const pill = document.createElement("button");
  pill.id = "tt-productive";
  pill.type = "button";
  pill.title = "Click to open Tab Time · Double-click to hide for 1 min";
  pill.innerHTML = `
    <div class="tt-pill-row">
      <span class="tt-pill-dot" aria-hidden="true"></span>
      <span class="tt-pill-host"><span class="tt-pill-hostname"></span></span>
    </div>
    <div class="tt-pill-value">
      <span class="tt-pill-session"></span>
      <span class="tt-pill-sep">·</span>
      <span class="tt-pill-earned"></span>
    </div>
    <div class="tt-pill-meta">
      <span class="tt-pill-balance-label">Balance</span>
      <span class="tt-pill-balance"></span>
    </div>
  `;

  const style = document.createElement("style");
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
    #tt-productive {
      position: fixed; top: 14px; right: 14px;
      z-index: 999998;
      font-family: ${ttFont()};
      font-feature-settings: "calt","kern","liga","ss03";
      -webkit-font-smoothing: antialiased;
      color: var(--tt-ink);
      background: rgba(13,13,13,0.82);
      backdrop-filter: blur(14px);
      border: 1px solid var(--tt-hairline);
      border-radius: 12px;
      padding: 10px 12px;
      display: flex; flex-direction: column; gap: 6px;
      cursor: pointer;
      min-width: 188px;
      text-align: left;
      transition: background 180ms, border-color 180ms, transform 180ms;
      opacity: 0.9;
    }
    #tt-productive:hover {
      opacity: 1;
      background: rgba(18,18,18,0.92);
      border-color: var(--tt-hairline-strong);
      transform: translateY(-1px);
    }
    #tt-productive .tt-pill-row {
      display: flex; align-items: center; gap: 8px;
    }
    #tt-productive .tt-pill-dot {
      width: 7px; height: 7px; border-radius: 9999px;
      background: var(--tt-accent-green);
      box-shadow: 0 0 0 2px rgba(89,212,153,0.18);
    }
    #tt-productive .tt-pill-host {
      font-size: 11px;
      letter-spacing: 0.2px;
      color: var(--tt-mute);
      font-weight: 500;
      max-width: 170px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    #tt-productive .tt-pill-hostname { color: var(--tt-on-dark); }
    #tt-productive .tt-pill-value {
      display: flex; align-items: baseline; gap: 6px;
      font-variant-numeric: tabular-nums;
    }
    #tt-productive .tt-pill-session {
      font-size: 18px; font-weight: 600; line-height: 1;
      color: var(--tt-accent-green);
      letter-spacing: 0;
    }
    #tt-productive .tt-pill-sep { color: var(--tt-stone, var(--tt-hairline)); }
    #tt-productive .tt-pill-earned {
      font-size: 11px; color: var(--tt-mute);
      letter-spacing: 0.1px;
    }
    #tt-productive .tt-pill-meta {
      padding-top: 6px;
      border-top: 1px solid var(--tt-hairline-soft);
      display: flex; justify-content: space-between; align-items: center;
    }
    #tt-productive .tt-pill-balance-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: var(--tt-mute);
      font-weight: 500;
    }
    #tt-productive .tt-pill-balance {
      font-size: 12px;
      font-weight: 500;
      color: var(--tt-on-dark);
      font-variant-numeric: tabular-nums;
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(pill);

  bindPillClicks(pill);

  const sessionDisplay = pill.querySelector(".tt-pill-session") as HTMLElement;
  const earnedDisplay = pill.querySelector(".tt-pill-earned") as HTMLElement;
  const balanceDisplay = pill.querySelector(".tt-pill-balance") as HTMLElement;
  const hostDisplay = pill.querySelector(".tt-pill-hostname") as HTMLElement;
  const hostname = window.location.hostname;
  hostDisplay.textContent = hostLabel(hostname);

  let elapsed = 0;
  async function getInitialTime() {
    const result = await browser.storage.local.get("timeTracking");
    const timeTracking = result.timeTracking || {};
    if (timeTracking[hostname]) elapsed = timeTracking[hostname].timeSpent;
  }
  await getInitialTime();

  function renderSession() {
    const hours = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed % 3600) / 60);
    const seconds = elapsed % 60;
    if (hours > 0) sessionDisplay.textContent = `${hours}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
    else sessionDisplay.textContent = `${minutes}:${String(seconds).padStart(2,'0')}`;
    const earned = Math.floor(elapsed * 0.5);
    earnedDisplay.textContent = `+${shortTime(earned)}`;
  }
  renderSession();

  const sessionInterval = setInterval(() => {
    if (!document.body.contains(pill)) { clearInterval(sessionInterval); return; }
    elapsed++;
    renderSession();
  }, 1000);

  async function refreshBalance() {
    try {
      const response = await browser.runtime.sendMessage({ type: "getDailyBalance" });
      const balance = response.balance;
      const total = balance ? Math.max(0, balance.total) : Math.max(0, Math.floor(elapsed * 0.5) + 900);
      balanceDisplay.textContent = shortTime(total);
    } catch {
      balanceDisplay.textContent = shortTime(Math.max(0, Math.floor(elapsed * 0.5)));
    }
  }
  refreshBalance();
  const balanceInterval = setInterval(() => {
    if (!document.body.contains(pill)) { clearInterval(balanceInterval); return; }
    refreshBalance();
  }, 5000);
}

checkProductiveSite();

// ---------- Productive time-up popup (Raycast) ----------
browser.runtime.onMessage.addListener((message) => {
  if (message.type === "showProductiveTimeUpPopup") {
    showProductiveTimeUpPopup();
    return true;
  }
});

async function showProductiveTimeUpPopup() {
  ensureTokens();
  const existing = document.getElementById("tt-timeup-overlay");
  if (existing) existing.remove();

  const result = await browser.storage.local.get("redirectSites");
  const redirectSites = result.redirectSites || [{ name: "LeetCode", url: "https://leetcode.com" }];
  const randomSite = redirectSites[Math.floor(Math.random() * redirectSites.length)];

  const overlay = document.createElement("div");
  overlay.id = "tt-timeup-overlay";
  overlay.innerHTML = `
    <div class="tt-timeup-card" role="dialog" aria-label="Session complete">
      <div class="tt-timeup-eyebrow">Session complete</div>
      <h2 class="tt-timeup-title">Take a break?</h2>
      <div class="tt-timeup-actions">
        <button class="tt-btn-primary tt-continue">Keep working</button>
        <a class="tt-btn-secondary tt-break" href="${randomSite.url}">Open ${randomSite.name}</a>
      </div>
    </div>
  `;

  const style = document.createElement("style");
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
    #tt-timeup-overlay {
      position: fixed; inset: 0;
      background: rgba(7,8,10,0.78);
      backdrop-filter: blur(10px);
      display: flex; align-items: center; justify-content: center;
      z-index: 999999;
      font-family: ${ttFont()};
      font-feature-settings: "calt","kern","liga","ss03";
      -webkit-font-smoothing: antialiased;
      color: var(--tt-ink);
      padding: 24px;
      animation: ttIn 180ms ease-out;
    }
    #tt-timeup-overlay .tt-timeup-card {
      width: 460px;
      max-width: 100%;
      background: var(--tt-surface);
      border: 1px solid var(--tt-hairline);
      border-radius: 16px;
      padding: 32px 28px 24px;
      display: flex; flex-direction: column; gap: 14px;
      text-align: center;
      animation: ttIn 200ms ease-out;
    }
    #tt-timeup-overlay .tt-timeup-eyebrow {
      font-size: 12px;
      letter-spacing: 0.4px;
      text-transform: uppercase;
      color: var(--tt-accent-green);
      font-weight: 500;
    }
    #tt-timeup-overlay .tt-timeup-title {
      margin: 0;
      font-size: 26px;
      line-height: 1.2;
      font-weight: 600;
      color: var(--tt-ink);
    }
    #tt-timeup-overlay .tt-timeup-reason {
      margin: 0;
      font-size: 15px;
      line-height: 1.6;
      color: var(--tt-body);
    }
    #tt-timeup-overlay .tt-timeup-actions {
      display: flex; gap: 8px;
      margin-top: 8px;
      justify-content: center;
    }
    #tt-timeup-overlay .tt-btn-primary {
      background: var(--tt-primary);
      color: var(--tt-on-primary);
      border: none;
      padding: 10px 18px;
      border-radius: 8px;
      cursor: pointer;
      font-family: inherit;
      font-size: 14px;
      font-weight: 500;
      line-height: 1.6;
      letter-spacing: 0.2px;
      transition: background 150ms;
    }
    #tt-timeup-overlay .tt-btn-primary:hover { background: var(--tt-primary-pressed); }
    #tt-timeup-overlay .tt-btn-secondary {
      background: transparent;
      color: var(--tt-on-dark);
      border: 1px solid var(--tt-hairline);
      padding: 10px 16px;
      border-radius: 8px;
      text-decoration: none;
      font-family: inherit;
      font-size: 14px;
      font-weight: 500;
      line-height: 1.6;
      transition: background 150ms, border-color 150ms;
    }
    #tt-timeup-overlay .tt-btn-secondary:hover {
      background: var(--tt-surface-elevated);
      border-color: var(--tt-hairline-strong);
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(overlay);

  overlay.querySelector(".tt-continue")?.addEventListener("click", () => overlay.remove());
  overlay.querySelector(".tt-break")?.addEventListener("click", () => { /* navigates via href */ });
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      overlay.remove();
      document.removeEventListener("keydown", handleEscape);
    }
  };
  document.addEventListener("keydown", handleEscape);
}

// ---------- Management modal (page float → screen modal) ----------
const TTM_STYLE_ID = "tt-modal-style";
function ensureModalStyle() {
  ensureTokens();
  if (document.getElementById(TTM_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = TTM_STYLE_ID;
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
    #tt-modal-overlay {
      position: fixed; inset: 0;
      background: rgba(7,8,10,0.78);
      backdrop-filter: blur(10px);
      display: flex; align-items: center; justify-content: center;
      z-index: 999999;
      font-family: ${ttFont()};
      font-feature-settings: "calt","kern","liga","ss03";
      -webkit-font-smoothing: antialiased;
      color: var(--tt-ink);
      padding: 24px;
      animation: ttIn 180ms ease-out;
    }
    #tt-modal-overlay .ttm-card {
      width: 520px; max-width: 100%; max-height: 88vh;
      background: var(--tt-surface);
      border: 1px solid var(--tt-hairline);
      border-radius: 16px;
      overflow: hidden;
      display: flex; flex-direction: column;
      animation: ttIn 200ms ease-out;
    }
    #tt-modal-overlay .ttm-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid var(--tt-hairline);
    }
    #tt-modal-overlay .ttm-brand { display: flex; align-items: center; gap: 8px; }
    #tt-modal-overlay .ttm-mark { width: 14px; height: 14px; border-radius: 4px; background: var(--tt-primary); }
    #tt-modal-overlay .ttm-title { font-size: 13px; font-weight: 600; color: var(--tt-ink); letter-spacing: -0.1px; }
    #tt-modal-overlay .ttm-close {
      background: transparent; color: var(--tt-on-dark-mute);
      border: 1px solid var(--tt-hairline);
      width: 26px; height: 26px; border-radius: 7px;
      cursor: pointer; font-size: 14px; line-height: 1;
      display: flex; align-items: center; justify-content: center;
      transition: background 150ms, border-color 150ms, color 150ms;
    }
    #tt-modal-overlay .ttm-close:hover { background: var(--tt-surface-elevated); border-color: var(--tt-hairline-strong); color: var(--tt-on-dark); }
    #tt-modal-overlay .ttm-body {
      padding: 14px 16px;
      overflow-y: auto;
      display: flex; flex-direction: column; gap: 12px;
    }
    #tt-modal-overlay .ttm-body::-webkit-scrollbar { width: 6px; }
    #tt-modal-overlay .ttm-body::-webkit-scrollbar-thumb { background: var(--tt-hairline-strong); border-radius: 9999px; }

    #tt-modal-overlay .ttm-balance {
      display: flex; flex-direction: column; gap: 4px;
      padding: 14px;
      background: var(--tt-surface-elevated);
      border: 1px solid var(--tt-hairline);
      border-radius: 12px;
    }
    #tt-modal-overlay .ttm-bal-label { font-size: 11px; letter-spacing: 0.3px; text-transform: uppercase; color: var(--tt-mute); font-weight: 500; }
    #tt-modal-overlay .ttm-bal-value { font-size: 30px; font-weight: 600; line-height: 1.1; font-variant-numeric: tabular-nums; }
    #tt-modal-overlay .ttm-bal-meta { font-size: 11px; color: var(--tt-mute); }

    #tt-modal-overlay .ttm-limit-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 12px; background: var(--tt-surface-card);
      border: 1px solid var(--tt-hairline); border-radius: 8px;
      cursor: pointer; font-family: inherit; color: var(--tt-ink);
      transition: background 150ms, border-color 150ms;
    }
    #tt-modal-overlay .ttm-limit-row:hover { border-color: var(--tt-hairline-strong); }
    #tt-modal-overlay .ttm-limit-label { font-size: 12px; font-weight: 500; }
    #tt-modal-overlay .ttm-limit-cta { font-size: 11px; color: var(--tt-mute); letter-spacing: 0.2px; }

    #tt-modal-overlay .ttm-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    #tt-modal-overlay .ttm-stat {
      display: flex; flex-direction: column; gap: 4px;
      padding: 12px; background: var(--tt-surface-elevated);
      border: 1px solid var(--tt-hairline); border-radius: 10px;
    }
    #tt-modal-overlay .ttm-stat-label { font-size: 11px; letter-spacing: 0.3px; text-transform: uppercase; color: var(--tt-mute); font-weight: 500; }
    #tt-modal-overlay .ttm-stat-value { font-size: 18px; font-weight: 600; line-height: 1; font-variant-numeric: tabular-nums; }
    #tt-modal-overlay .ttm-stat.productive .ttm-stat-value { color: var(--tt-accent-green); }
    #tt-modal-overlay .ttm-stat.distracting .ttm-stat-value { color: var(--tt-accent-red); }

    #tt-modal-overlay .ttm-section { display: flex; flex-direction: column; gap: 8px; }
    #tt-modal-overlay .ttm-section-title { margin: 0; font-size: 11px; letter-spacing: 0.3px; text-transform: uppercase; color: var(--tt-mute); font-weight: 500; }

    #tt-modal-overlay .ttm-chart { display: flex; gap: 6px; align-items: flex-end; height: 72px; padding: 6px 0; }
    #tt-modal-overlay .ttm-bar-wrap { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; height: 100%; }
    #tt-modal-overlay .ttm-bar { width: 100%; background: var(--tt-surface-card); border-radius: 4px; display: flex; flex-direction: column-reverse; min-height: 2px; overflow: hidden; }
    #tt-modal-overlay .ttm-seg { width: 100%; }
    #tt-modal-overlay .ttm-seg.productive { background: var(--tt-accent-green); }
    #tt-modal-overlay .ttm-seg.distracting { background: var(--tt-accent-red); }
    #tt-modal-overlay .ttm-bar-label { font-size: 10px; color: var(--tt-ash); }

    #tt-modal-overlay .ttm-list { display: flex; flex-direction: column; gap: 6px; }
    #tt-modal-overlay .ttm-item {
      display: flex; align-items: center; gap: 10px;
      padding: 9px 10px; background: var(--tt-surface-elevated);
      border: 1px solid var(--tt-hairline); border-radius: 9px;
    }
    #tt-modal-overlay .ttm-item.prod { border-left: 2px solid var(--tt-accent-green); }
    #tt-modal-overlay .ttm-item.dist { border-left: 2px solid var(--tt-accent-red); }
    #tt-modal-overlay .ttm-item-icon {
      width: 22px; height: 22px; border-radius: 6px;
      background: var(--tt-surface-card); border: 1px solid var(--tt-hairline);
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 600; color: var(--tt-on-dark); flex-shrink: 0;
    }
    #tt-modal-overlay .ttm-item-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    #tt-modal-overlay .ttm-item-title { font-size: 12px; font-weight: 500; color: var(--tt-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #tt-modal-overlay .ttm-item-sub { font-size: 10px; color: var(--tt-ash); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #tt-modal-overlay .ttm-item-time { font-size: 12px; font-weight: 600; color: var(--tt-on-dark); font-variant-numeric: tabular-nums; }
    #tt-modal-overlay .ttm-empty { text-align: center; color: var(--tt-ash); padding: 16px 8px; font-size: 12px; }

    #tt-modal-overlay .ttm-tabs { display: flex; gap: 4px; padding: 3px; background: var(--tt-surface-elevated); border: 1px solid var(--tt-hairline); border-radius: 10px; }
    #tt-modal-overlay .ttm-tab {
      flex: 1; background: transparent; color: var(--tt-body);
      border: none; padding: 7px 8px; border-radius: 8px; cursor: pointer;
      font-family: inherit; font-size: 12px; font-weight: 500; letter-spacing: 0.2px;
      transition: background 150ms, color 150ms;
    }
    #tt-modal-overlay .ttm-tab.active { background: var(--tt-surface-card); color: var(--tt-on-dark); }
    #tt-modal-overlay .ttm-tab:not(.active):hover { color: var(--tt-on-dark); }

    #tt-modal-overlay .ttm-add { display: flex; gap: 6px; }
    #tt-modal-overlay .ttm-input {
      flex: 1; background: var(--tt-surface-card);
      border: 1px solid var(--tt-hairline); color: var(--tt-on-dark);
      padding: 8px 12px; border-radius: 8px;
      font-family: inherit; font-size: 13px; outline: none;
      transition: border-color 150ms;
    }
    #tt-modal-overlay .ttm-input::placeholder { color: var(--tt-ash); }
    #tt-modal-overlay .ttm-input:focus { border-color: var(--tt-hairline-strong); }
    #tt-modal-overlay .ttm-add-btn {
      background: var(--tt-primary); color: var(--tt-on-primary);
      border: none; padding: 0 14px; border-radius: 8px; cursor: pointer;
      font-family: inherit; font-size: 13px; font-weight: 500; line-height: 1;
    }
    #tt-modal-overlay .ttm-add-btn:hover { background: var(--tt-primary-pressed); }

    #tt-modal-overlay .ttm-row {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      padding: 8px 10px; background: var(--tt-surface-elevated);
      border: 1px solid var(--tt-hairline); border-radius: 8px; font-size: 12px;
    }
    #tt-modal-overlay .ttm-row-name { color: var(--tt-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #tt-modal-overlay .ttm-row-sub { color: var(--tt-ash); font-size: 10px; }
    #tt-modal-overlay .ttm-rm {
      background: transparent; color: var(--tt-mute);
      border: 1px solid var(--tt-hairline);
      width: 22px; height: 22px; border-radius: 6px; cursor: pointer;
      font-size: 13px; line-height: 1;
      display: flex; align-items: center; justify-content: center;
      transition: background 150ms, color 150ms, border-color 150ms;
      flex-shrink: 0;
    }
    #tt-modal-overlay .ttm-rm:hover { background: rgba(255,97,97,0.1); border-color: var(--tt-accent-red); color: var(--tt-accent-red); }

    #tt-modal-overlay .ttm-foot {
      display: flex; gap: 8px; padding: 12px 16px;
      border-top: 1px solid var(--tt-hairline);
    }
    #tt-modal-overlay .ttm-btn {
      flex: 1; font-family: inherit; font-size: 12px; font-weight: 500; letter-spacing: 0.2px;
      border-radius: 8px; cursor: pointer; border: 1px solid transparent;
      padding: 9px 12px; transition: background 150ms, border-color 150ms, color 150ms;
    }
    #tt-modal-overlay .ttm-btn.primary { background: var(--tt-primary); color: var(--tt-on-primary); }
    #tt-modal-overlay .ttm-btn.primary:hover:not(:disabled) { background: var(--tt-primary-pressed); }
    #tt-modal-overlay .ttm-btn.primary:disabled { opacity: 0.5; cursor: not-allowed; }
    #tt-modal-overlay .ttm-btn.ghost { background: transparent; color: var(--tt-on-dark-mute); border-color: var(--tt-hairline); }
    #tt-modal-overlay .ttm-btn.ghost:hover { background: var(--tt-surface-elevated); border-color: var(--tt-hairline-strong); color: var(--tt-on-dark); }
    #tt-modal-overlay .ttm-btn.danger { background: transparent; color: var(--tt-accent-red); border-color: var(--tt-hairline); }
    #tt-modal-overlay .ttm-btn.danger:hover { background: rgba(255,97,97,0.1); border-color: var(--tt-accent-red); }
  `;
  document.head.appendChild(style);
}

async function openManagementModal() {
  ensureModalStyle();
  const existing = document.getElementById("tt-modal-overlay");
  if (existing) { existing.remove(); return; }

  const overlay = document.createElement("div");
  overlay.id = "tt-modal-overlay";
  overlay.innerHTML = `
    <div class="ttm-card" role="dialog" aria-label="Tab Time">
      <div class="ttm-head">
        <div class="ttm-brand"><div class="ttm-mark"></div><span class="ttm-title">Tab Time</span></div>
        <button class="ttm-close" aria-label="Close">×</button>
      </div>
      <div class="ttm-body"></div>
      <div class="ttm-foot">
        <button class="ttm-btn danger ttm-reset">Reset</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const body = overlay.querySelector(".ttm-body") as HTMLElement;
  const close = () => overlay.remove();
  overlay.querySelector(".ttm-close")?.addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  const escHandler = (e: KeyboardEvent) => { if (e.key === "Escape") { close(); document.removeEventListener("keydown", escHandler); } };
  document.addEventListener("keydown", escHandler);

  let tab: "limited" | "productive" | "redirects" = "limited";

  async function fetchAll() {
    const [td, ls, ps, rs, wh, db, al] = await Promise.all([
      browser.storage.local.get("timeTracking"),
      browser.runtime.sendMessage({ type: "getLimitedSites" }),
      browser.runtime.sendMessage({ type: "getProductiveSites" }),
      browser.runtime.sendMessage({ type: "getRedirectSites" }),
      browser.runtime.sendMessage({ type: "getWeeklyHistory" }),
      browser.runtime.sendMessage({ type: "getDailyBalance" }),
      browser.storage.local.get("activeLimits"),
    ]);
    const hostname = window.location.hostname;
    const limit = (al.activeLimits || {})[hostname];
    return {
      timeData: Object.values(td.timeTracking || {}) as { url: string; title: string; timeSpent: number }[],
      limited: ls.limitedSites || [],
      productive: ps.productiveSites || [],
      redirects: rs.redirectSites || [],
      weekly: wh.weeklyHistory || {},
      balance: db.balance,
      activeLimit: limit ? Math.max(0, Math.ceil((limit.endTime - Date.now()) / 1000)) : 0,
    };
  }

  function renderBalance(d: any) {
    const BALANCE_RATIO = 0.5;
    const prodTime = d.timeData.filter((i: any) => d.productive.some((s: string) => i.url.includes(s))).reduce((a: number, i: any) => a + i.timeSpent, 0);
    const distTime = d.timeData.filter((i: any) => d.limited.some((s: string) => i.url.includes(s))).reduce((a: number, i: any) => a + i.timeSpent, 0);
    const earned = d.balance ? d.balance.earned : Math.floor(prodTime * BALANCE_RATIO);
    const bonus = d.balance ? d.balance.bonus : 900;
    const spent = d.balance ? d.balance.spent : distTime;
    const totalEarned = earned + bonus;
    const remaining = d.balance ? Math.max(0, d.balance.total) : Math.max(0, totalEarned - spent);
    return { remaining, totalEarned, prodTime, distTime };
  }

  function last7(weekly: any) {
    const days = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const ds = date.toISOString().split("T")[0];
      const h = weekly[ds] || { totalTime: 0, productiveTime: 0, distractingTime: 0 };
      days.push({ dayName: date.toLocaleDateString("en-US", { weekday: "narrow" }), totalTime: h.totalTime, productiveTime: h.productiveTime, distractingTime: h.distractingTime });
    }
    return days;
  }

  function fav(url: string): string {
    try {
      const host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
      const base = host.replace(/^www\./, "").split(".")[0];
      return base ? base[0].toUpperCase() : "?";
    } catch { return "·"; }
  }

  function renderTop(d: any) {
    const top = [...d.timeData].sort((a, b) => b.timeSpent - a.timeSpent).slice(0, 5);
    if (!top.length) return `<div class="ttm-empty">No activity</div>`;
    return top.map((i) => {
      const isProd = d.productive.some((s: string) => i.url.includes(s));
      const isDist = d.limited.some((s: string) => i.url.includes(s));
      const cls = isProd ? "prod" : isDist ? "dist" : "";
      return `<div class="ttm-item ${cls}">
        <div class="ttm-item-icon">${fav(i.url)}</div>
        <div class="ttm-item-body"><span class="ttm-item-title">${i.title || i.url}</span><span class="ttm-item-sub">${i.url}</span></div>
        <span class="ttm-item-time">${shortTime(i.timeSpent)}</span>
      </div>`;
    }).join("");
  }

  function renderManage(d: any) {
    const list = d[tab] as any[];
    if (tab === "redirects") {
      const items = list.length ? list.map((r: any, idx: number) =>
        `<div class="ttm-row"><div><div class="ttm-row-name">${r.name}</div><div class="ttm-row-sub">${r.url}</div></div><button class="ttm-rm" data-idx="${idx}">×</button></div>`).join("")
        : `<div class="ttm-empty">None</div>`;
      return `
        <div class="ttm-add">
          <input class="ttm-input ttm-r-name" placeholder="Name" />
          <input class="ttm-input ttm-r-url" placeholder="URL" />
          <button class="ttm-add-btn ttm-r-add">Add</button>
        </div>
        <div class="ttm-list">${items}</div>
      `;
    }
    const items = list.length ? list.map((s: string, idx: number) =>
      `<div class="ttm-row"><span class="ttm-row-name">${s}</span><button class="ttm-rm" data-idx="${idx}">×</button></div>`).join("")
      : `<div class="ttm-empty">None</div>`;
    return `
      <div class="ttm-add">
        <input class="ttm-input ttm-site-input" placeholder="${tab === "limited" ? "e.g. reddit.com" : "e.g. leetcode.com"}" />
        <button class="ttm-add-btn ttm-site-add">Add</button>
      </div>
      <div class="ttm-list">${items}</div>
    `;
  }

  async function paint() {
    const d = await fetchAll();
    const b = renderBalance(d);
    const days = last7(d.weekly);
    const maxTime = Math.max(...days.map((x) => x.totalTime), 1);

    body.innerHTML = `
      <div class="ttm-balance">
        <span class="ttm-bal-label">Available</span>
        <span class="ttm-bal-value">${shortTime(b.remaining)}</span>
        <span class="ttm-bal-meta">${shortTime(b.totalEarned)} earned</span>
      </div>
      ${d.activeLimit > 0 ? `<button class="ttm-limit-row"><span class="ttm-limit-label">Limit · ${shortTime(d.activeLimit)}</span><span class="ttm-limit-cta">Adjust</span></button>` : ""}
      <div class="ttm-stats">
        <div class="ttm-stat productive"><span class="ttm-stat-label">Productive</span><span class="ttm-stat-value">${shortTime(b.prodTime)}</span></div>
        <div class="ttm-stat distracting"><span class="ttm-stat-label">Distracting</span><span class="ttm-stat-value">${shortTime(b.distTime)}</span></div>
      </div>
      <div class="ttm-section">
        <h3 class="ttm-section-title">Week</h3>
        <div class="ttm-chart">
          ${days.map((day) => {
            const hpct = maxTime > 0 ? (day.totalTime / maxTime) * 100 : 0;
            const ppct = day.totalTime > 0 ? (day.productiveTime / day.totalTime) * 100 : 0;
            const dpct = day.totalTime > 0 ? (day.distractingTime / day.totalTime) * 100 : 0;
            return `<div class="ttm-bar-wrap" title="${shortTime(day.totalTime)}">
              <div class="ttm-bar" style="height:${Math.max(hpct, 4)}%">
                <div class="ttm-seg productive" style="height:${ppct}%"></div>
                <div class="ttm-seg distracting" style="height:${dpct}%"></div>
              </div>
              <div class="ttm-bar-label">${day.dayName}</div>
            </div>`;
          }).join("")}
        </div>
      </div>
      <div class="ttm-section">
        <h3 class="ttm-section-title">Top</h3>
        <div class="ttm-list">${renderTop(d)}</div>
      </div>
      <div class="ttm-section">
        <div class="ttm-tabs">
          <button class="ttm-tab ${tab === "limited" ? "active" : ""}" data-tab="limited">Limited</button>
          <button class="ttm-tab ${tab === "productive" ? "active" : ""}" data-tab="productive">Productive</button>
          <button class="ttm-tab ${tab === "redirects" ? "active" : ""}" data-tab="redirects">Redirects</button>
        </div>
        ${renderManage(d)}
      </div>
    `;

    body.querySelectorAll(".ttm-tab").forEach((t) => {
      t.addEventListener("click", () => {
        tab = (t as HTMLElement).dataset.tab as any;
        paint();
      });
    });

    const limitRow = body.querySelector(".ttm-limit-row") as HTMLElement | null;
    if (limitRow) {
      limitRow.addEventListener("click", () => {
        overlay.remove();
        document.removeEventListener("keydown", escHandler);
        showTimeLimitPrompt();
      });
    }

    const addBtn = body.querySelector(".ttm-site-add") as HTMLElement | null;
    const siteInput = body.querySelector(".ttm-site-input") as HTMLInputElement | null;
    if (addBtn && siteInput) {
      const addSite = async () => {
        const v = siteInput.value.trim();
        if (!v) return;
        const cur = await browser.runtime.sendMessage({ type: tab === "limited" ? "getLimitedSites" : "getProductiveSites" });
        const key = tab === "limited" ? "limitedSites" : "productiveSites";
        const arr = cur[key === "limitedSites" ? "limitedSites" : "productiveSites"] || [];
        if (arr.includes(v)) return;
        arr.push(v);
        await browser.runtime.sendMessage({ type: tab === "limited" ? "updateLimitedSites" : "updateProductiveSites", sites: arr });
        paint();
      };
      addBtn.addEventListener("click", addSite);
      siteInput.addEventListener("keydown", (e) => { if (e.key === "Enter") addSite(); });
    }

    const rAdd = body.querySelector(".ttm-r-add") as HTMLElement | null;
    const rName = body.querySelector(".ttm-r-name") as HTMLInputElement | null;
    const rUrl = body.querySelector(".ttm-r-url") as HTMLInputElement | null;
    if (rAdd && rName && rUrl) {
      const addRedirect = async () => {
        const name = rName.value.trim();
        let url = rUrl.value.trim();
        if (!name || !url) return;
        if (!/^https?:\/\//.test(url)) url = `https://${url}`;
        const cur = await browser.runtime.sendMessage({ type: "getRedirectSites" });
        const arr = cur.redirectSites || [];
        arr.push({ name, url });
        await browser.runtime.sendMessage({ type: "updateRedirectSites", sites: arr });
        paint();
      };
      rAdd.addEventListener("click", addRedirect);
      rUrl.addEventListener("keydown", (e) => { if (e.key === "Enter") addRedirect(); });
    }

    body.querySelectorAll(".ttm-rm").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const idx = Number((btn as HTMLElement).dataset.idx);
        if (tab === "redirects") {
          const cur = await browser.runtime.sendMessage({ type: "getRedirectSites" });
          const arr = (cur.redirectSites || []).filter((_: any, i: number) => i !== idx);
          await browser.runtime.sendMessage({ type: "updateRedirectSites", sites: arr });
        } else {
          const key = tab === "limited" ? "limitedSites" : "productiveSites";
          const respKey = tab === "limited" ? "limitedSites" : "productiveSites";
          const cur = await browser.runtime.sendMessage({ type: tab === "limited" ? "getLimitedSites" : "getProductiveSites" });
          const arr = (cur[respKey] || []).filter((_: any, i: number) => i !== idx);
          await browser.runtime.sendMessage({ type: tab === "limited" ? "updateLimitedSites" : "updateProductiveSites", sites: arr });
        }
        paint();
      });
    });
  }

  const resetBtn = overlay.querySelector(".ttm-reset") as HTMLButtonElement;
  let resetArmed = false;
  function armReset() {
    resetArmed = true;
    resetBtn.textContent = "Confirm?";
    resetBtn.classList.add("primary");
    resetBtn.classList.remove("danger");
  }
  function disarmReset() {
    resetArmed = false;
    resetBtn.textContent = "Reset";
    resetBtn.classList.add("danger");
    resetBtn.classList.remove("primary");
  }
  resetBtn.addEventListener("click", async () => {
    if (!resetArmed) { armReset(); return; }
    await browser.runtime.sendMessage({ type: "resetUsage" });
    disarmReset();
    paint();
  });

  paint();
}
