import browser from "webextension-polyfill";

// Check if site access is allowed
async function checkSiteAccess() {
  const hostname = window.location.hostname;
  const response = await browser.runtime.sendMessage({ 
    type: "canAccessSite", 
    hostname 
  });
  
  if (!response.allowed) {
    showBlockedPage(response.reason, response.cooldownEnd);
    return false;
  }
  
  // Log access for special sites
  if (hostname.includes("amazon.in")) {
    await browser.runtime.sendMessage({ 
      type: "logSiteAccess", 
      hostname: "amazon.in" 
    });
  }
  
  return true;
}

// Show blocked page
async function showBlockedPage(reason: string, cooldownEnd?: number) {
  // Get redirect sites from storage
  const result = await browser.storage.local.get("redirectSites");
  const redirectSites = result.redirectSites || [
    { name: "NeetCode", url: "https://neetcode.io" }
  ];
  
  // Pick a random redirect site
  const randomSite = redirectSites[Math.floor(Math.random() * redirectSites.length)];
  
  // Clear the page
  document.body.innerHTML = "";
  document.body.style.margin = "0";
  document.body.style.padding = "0";
  document.body.style.overflow = "hidden";
  
  const blockedPage = document.createElement("div");
  blockedPage.id = "site-blocked-overlay";
  
  let cooldownMessage = "";
  if (cooldownEnd) {
    const remainingTime = Math.ceil((cooldownEnd - Date.now()) / (1000 * 60 * 60 * 24));
    cooldownMessage = `<div class="cooldown-info">Available in ${remainingTime} day(s)</div>`;
  }
  
  blockedPage.innerHTML = `
    <div class="blocked-container">
      <div class="blocked-icon">BLOCKED</div>
      <h1 class="blocked-title">ACCESS_DENIED</h1>
      <div class="blocked-reason">${reason}</div>
      ${cooldownMessage}
      
      <div class="blocked-suggestion">
        <div class="suggestion-title">Earn More Time</div>
        <a href="${randomSite.url}" class="suggestion-link">
          <span class="link-icon">→</span>
          ${randomSite.name}
        </a>
      </div>
      
      <div class="blocked-footer">
        <button class="back-btn" onclick="window.history.back()">Go Back</button>
      </div>
    </div>
  `;
  
  const style = document.createElement("style");
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=JetBrains+Mono:wght@400;600&display=swap');
    
    #site-blocked-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: linear-gradient(135deg, #0a0a0f 0%, #1a0a1f 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999999;
      font-family: 'JetBrains Mono', monospace;
    }
    
    .blocked-container {
      max-width: 600px;
      padding: 48px;
      background: #12121a;
      border: 2px solid #ff3366;
      box-shadow: 
        0 0 30px rgba(255, 51, 102, 0.4),
        0 0 60px rgba(255, 51, 102, 0.2),
        inset 0 0 80px rgba(255, 51, 102, 0.05);
      clip-path: polygon(
        0 20px, 20px 0,
        calc(100% - 20px) 0, 100% 20px,
        100% calc(100% - 20px), calc(100% - 20px) 100%,
        20px 100%, 0 calc(100% - 20px)
      );
      text-align: center;
      animation: blockAppear 0.4s ease-out;
    }
    
    @keyframes blockAppear {
      0% { 
        opacity: 0;
        transform: scale(0.9) translateY(30px);
      }
      100% { 
        opacity: 1;
        transform: scale(1) translateY(0);
      }
    }
    
    .blocked-icon {
      font-size: 18px;
      font-weight: 900;
      font-family: 'Orbitron', monospace;
      color: #ff3366;
      margin-bottom: 24px;
      letter-spacing: 0.2em;
    }
    
    .blocked-title {
      font-family: 'Orbitron', monospace;
      font-size: 42px;
      font-weight: 900;
      margin: 0 0 16px 0;
      color: #ff3366;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      text-shadow: 
        0 0 20px rgba(255, 51, 102, 1),
        3px 0 0 rgba(0, 212, 255, 0.3),
        -3px 0 0 rgba(255, 0, 255, 0.3);
    }
    
    .blocked-reason {
      font-size: 16px;
      color: #e0e0e0;
      margin-bottom: 24px;
      line-height: 1.6;
    }
    
    .cooldown-info {
      font-size: 14px;
      color: #ff9800;
      background: rgba(255, 152, 0, 0.1);
      padding: 12px 20px;
      border: 1px solid #ff9800;
      margin-bottom: 32px;
      clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%);
    }
    
    .blocked-suggestion {
      background: #1c1c2e;
      padding: 24px;
      border: 1px solid #00ff88;
      margin-bottom: 32px;
      clip-path: polygon(
        0 0, calc(100% - 12px) 0, 100% 12px,
        100% 100%, 12px 100%, 0 calc(100% - 12px)
      );
    }
    
    .suggestion-title {
      font-size: 14px;
      color: #00ff88;
      font-weight: 700;
      margin-bottom: 16px;
      font-family: 'Orbitron', monospace;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }
    
    .suggestion-link {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 24px;
      background: #00ff88;
      color: #0a0a0f;
      text-decoration: none;
      font-weight: 700;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      transition: all 200ms;
      clip-path: polygon(
        0 0, calc(100% - 8px) 0, 100% 8px,
        100% 100%, 8px 100%, 0 calc(100% - 8px)
      );
      box-shadow: 0 0 20px rgba(0, 255, 136, 0.4);
    }
    
    .suggestion-link:hover {
      transform: translateY(-3px);
      box-shadow: 
        0 0 30px rgba(0, 255, 136, 0.8),
        0 0 60px rgba(0, 255, 136, 0.4);
      filter: brightness(1.1);
    }
    
    .link-icon {
      font-size: 16px;
      font-weight: 900;
    }
    
    .back-btn {
      background: transparent;
      color: #6b7280;
      border: 1px solid #2a2a3a;
      padding: 12px 24px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      cursor: pointer;
      transition: all 150ms;
      clip-path: polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 0 100%);
    }
    
    .back-btn:hover {
      border-color: #00ff88;
      color: #00ff88;
      box-shadow: 0 0 10px rgba(0, 255, 136, 0.3);
    }
  `;
  
  document.head.appendChild(style);
  document.body.appendChild(blockedPage);
}

// Check on page load
checkSiteAccess();

// Check if this site needs a time limit
async function checkTimeLimit() {
  const hostname = window.location.hostname;
  const result = await browser.storage.local.get(["limitedSites", "activeLimits"]);
  const limitedSites = result.limitedSites || [];
  const activeLimits = result.activeLimits || {};

  // Check if this site is in the limited list
  const isLimited = limitedSites.some((site: string) => 
    hostname.includes(site) || site.includes(hostname)
  );

  if (isLimited && !activeLimits[hostname]) {
    showTimeLimitPrompt();
  }
}

function showTimeLimitPrompt() {
  // Create overlay
  const overlay = document.createElement("div");
  overlay.id = "time-limit-overlay";
  overlay.innerHTML = `
    <div class="cyber-modal">
      <div class="cyber-header">
        <div class="cyber-header-bar"></div>
        <h2 class="cyber-title">SYSTEM_OVERRIDE</h2>
        <div class="cyber-subtitle">// SET_TIME_LIMIT</div>
      </div>
      
      <div class="cyber-body">
        <div class="cyber-display">
          <span class="cyber-prompt">&gt;</span>
          <span class="cyber-value">5</span>
          <span class="cyber-unit">MIN</span>
        </div>
        
        <div class="cyber-quick-btns">
          <button class="cyber-quick-btn" data-minutes="0.17">10s</button>
          <button class="cyber-quick-btn" data-minutes="5">5m</button>
          <button class="cyber-quick-btn" data-minutes="30">30m</button>
        </div>
        
        <div class="cyber-slider-wrapper">
          <input type="range" class="cyber-slider" min="1" max="60" value="5" step="1">
          <div class="cyber-slider-track"></div>
          <div class="cyber-marks">
            <span>1</span>
            <span>60</span>
          </div>
        </div>
        
        <button class="cyber-confirm">EXECUTE</button>
      </div>
      
      <div class="cyber-scanlines"></div>
    </div>
  `;

  // Add styles
  const style = document.createElement("style");
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=JetBrains+Mono:wght@400;600;700&display=swap');
    
    #time-limit-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(10, 10, 15, 0.95);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999999;
      font-family: 'JetBrains Mono', monospace;
      backdrop-filter: blur(4px);
    }
    
    .cyber-modal {
      background: #12121a;
      width: 420px;
      max-width: 90vw;
      border: 2px solid #00ff88;
      box-shadow: 
        0 0 20px rgba(0, 255, 136, 0.4),
        0 0 40px rgba(0, 255, 136, 0.2),
        inset 0 0 60px rgba(0, 255, 136, 0.05);
      position: relative;
      clip-path: polygon(
        0 12px, 12px 0,
        calc(100% - 12px) 0, 100% 12px,
        100% calc(100% - 12px), calc(100% - 12px) 100%,
        12px 100%, 0 calc(100% - 12px)
      );
      animation: modalGlitch 0.3s ease-out;
    }
    
    @keyframes modalGlitch {
      0% { 
        opacity: 0;
        transform: scale(0.95) translateY(20px);
      }
      50% {
        transform: scale(1.02) translateY(-2px);
      }
      100% { 
        opacity: 1;
        transform: scale(1) translateY(0);
      }
    }
    
    .cyber-header {
      background: linear-gradient(180deg, #1c1c2e 0%, #12121a 100%);
      padding: 20px 24px;
      border-bottom: 1px solid #00ff88;
      position: relative;
    }
    
    .cyber-header-bar {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 3px;
      background: linear-gradient(90deg, 
        #00ff88 0%, 
        #00d4ff 50%, 
        #ff00ff 100%
      );
      box-shadow: 0 0 10px rgba(0, 255, 136, 0.8);
    }
    
    .cyber-title {
      font-family: 'Orbitron', monospace;
      font-size: 24px;
      font-weight: 900;
      margin: 0 0 4px 0;
      color: #00ff88;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      text-shadow: 
        0 0 10px rgba(0, 255, 136, 0.8),
        2px 0 0 rgba(255, 0, 255, 0.3),
        -2px 0 0 rgba(0, 212, 255, 0.3);
      animation: titlePulse 3s ease-in-out infinite;
    }
    
    @keyframes titlePulse {
      0%, 100% { 
        text-shadow: 
          0 0 10px rgba(0, 255, 136, 0.8),
          2px 0 0 rgba(255, 0, 255, 0.3),
          -2px 0 0 rgba(0, 212, 255, 0.3);
      }
      50% { 
        text-shadow: 
          0 0 20px rgba(0, 255, 136, 1),
          3px 0 0 rgba(255, 0, 255, 0.5),
          -3px 0 0 rgba(0, 212, 255, 0.5);
      }
    }
    
    .cyber-subtitle {
      font-size: 11px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.2em;
      font-weight: 600;
    }
    
    .cyber-body {
      padding: 32px 24px 24px;
      background: #0a0a0f;
      position: relative;
    }
    
    .cyber-display {
      display: flex;
      align-items: baseline;
      justify-content: center;
      gap: 8px;
      margin-bottom: 24px;
      padding: 16px;
      background: #12121a;
      border: 1px solid #2a2a3a;
      clip-path: polygon(
        0 0, calc(100% - 8px) 0, 100% 8px,
        100% 100%, 8px 100%, 0 calc(100% - 8px)
      );
    }
    
    .cyber-prompt {
      font-size: 20px;
      color: #00ff88;
      font-weight: 700;
      text-shadow: 0 0 10px rgba(0, 255, 136, 0.8);
    }
    
    .cyber-value {
      font-family: 'Orbitron', monospace;
      font-size: 56px;
      font-weight: 900;
      color: #00ff88;
      text-shadow: 
        0 0 20px rgba(0, 255, 136, 0.8),
        0 0 40px rgba(0, 255, 136, 0.4);
      line-height: 1;
      min-width: 80px;
      text-align: center;
    }
    
    .cyber-unit {
      font-size: 16px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.2em;
      font-weight: 700;
    }
    
    .cyber-quick-btns {
      display: flex;
      gap: 8px;
      margin-bottom: 24px;
      justify-content: center;
    }
    
    .cyber-quick-btn {
      background: transparent;
      border: 2px solid #00ff88;
      color: #00ff88;
      padding: 10px 20px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      cursor: pointer;
      transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
      clip-path: polygon(
        0 0, calc(100% - 6px) 0, 100% 6px,
        100% 100%, 0 100%
      );
      position: relative;
    }
    
    .cyber-quick-btn:hover {
      background: #00ff88;
      color: #0a0a0f;
      box-shadow: 
        0 0 10px rgba(0, 255, 136, 0.6),
        0 0 20px rgba(0, 255, 136, 0.4);
      transform: translateY(-2px);
    }
    
    .cyber-quick-btn.selected {
      background: #00ff88;
      color: #0a0a0f;
      box-shadow: 
        0 0 10px rgba(0, 255, 136, 0.6),
        0 0 20px rgba(0, 255, 136, 0.4);
    }
    
    .cyber-slider-wrapper {
      margin-bottom: 24px;
      position: relative;
    }
    
    .cyber-slider {
      width: 100%;
      height: 6px;
      background: #1c1c2e;
      outline: none;
      -webkit-appearance: none;
      appearance: none;
      border-radius: 0;
      position: relative;
      z-index: 2;
      cursor: pointer;
    }
    
    .cyber-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 20px;
      height: 20px;
      background: #00ff88;
      cursor: pointer;
      border: 2px solid #0a0a0f;
      clip-path: polygon(
        0 0, calc(100% - 4px) 0, 100% 4px,
        100% calc(100% - 4px), calc(100% - 4px) 100%,
        4px 100%, 0 calc(100% - 4px)
      );
      box-shadow: 
        0 0 10px rgba(0, 255, 136, 0.8),
        0 0 20px rgba(0, 255, 136, 0.4);
      transition: all 150ms;
    }
    
    .cyber-slider::-webkit-slider-thumb:hover {
      transform: scale(1.2);
      box-shadow: 
        0 0 15px rgba(0, 255, 136, 1),
        0 0 30px rgba(0, 255, 136, 0.6);
    }
    
    .cyber-slider::-moz-range-thumb {
      width: 20px;
      height: 20px;
      background: #00ff88;
      cursor: pointer;
      border: 2px solid #0a0a0f;
      border-radius: 0;
      box-shadow: 
        0 0 10px rgba(0, 255, 136, 0.8),
        0 0 20px rgba(0, 255, 136, 0.4);
      transition: all 150ms;
    }
    
    .cyber-slider::-moz-range-thumb:hover {
      transform: scale(1.2);
      box-shadow: 
        0 0 15px rgba(0, 255, 136, 1),
        0 0 30px rgba(0, 255, 136, 0.6);
    }
    
    .cyber-marks {
      display: flex;
      justify-content: space-between;
      margin-top: 8px;
      font-size: 10px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }
    
    .cyber-confirm {
      width: 100%;
      background: #00ff88;
      color: #0a0a0f;
      border: none;
      padding: 14px 24px;
      font-family: 'Orbitron', monospace;
      font-size: 16px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.2em;
      cursor: pointer;
      transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
      clip-path: polygon(
        0 0, calc(100% - 10px) 0, 100% 10px,
        100% 100%, 10px 100%, 0 calc(100% - 10px)
      );
      box-shadow: 
        0 0 20px rgba(0, 255, 136, 0.4),
        0 4px 12px rgba(0, 0, 0, 0.3);
      position: relative;
      overflow: hidden;
    }
    
    .cyber-confirm::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, 
        transparent, 
        rgba(255, 255, 255, 0.3), 
        transparent
      );
      transition: left 0.5s;
    }
    
    .cyber-confirm:hover {
      transform: translateY(-2px);
      box-shadow: 
        0 0 30px rgba(0, 255, 136, 0.8),
        0 0 60px rgba(0, 255, 136, 0.4),
        0 6px 16px rgba(0, 0, 0, 0.4);
      filter: brightness(1.1);
    }
    
    .cyber-confirm:hover::before {
      left: 100%;
    }
    
    .cyber-confirm:active {
      transform: translateY(0);
    }
    
    .cyber-scanlines {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: repeating-linear-gradient(
        0deg,
        transparent,
        transparent 2px,
        rgba(0, 0, 0, 0.3) 2px,
        rgba(0, 0, 0, 0.3) 4px
      );
      pointer-events: none;
      opacity: 0.3;
    }
    
    /* Circuit pattern background */
    .cyber-body::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-image:
        linear-gradient(rgba(0, 255, 136, 0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0, 255, 136, 0.03) 1px, transparent 1px);
      background-size: 20px 20px;
      pointer-events: none;
      opacity: 0.5;
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(overlay);

  const slider = overlay.querySelector(".cyber-slider") as HTMLInputElement;
  const valueDisplay = overlay.querySelector(".cyber-value") as HTMLElement;
  const unitDisplay = overlay.querySelector(".cyber-unit") as HTMLElement;
  const quickBtns = overlay.querySelectorAll(".cyber-quick-btn");
  const confirmBtn = overlay.querySelector(".cyber-confirm") as HTMLButtonElement;
  
  let selectedMinutes = 5;

  // Update display
  function updateDisplay(minutes: number) {
    selectedMinutes = minutes;
    if (minutes < 1) {
      const seconds = Math.round(minutes * 60);
      valueDisplay.textContent = seconds.toString();
      unitDisplay.textContent = "SEC";
    } else if (minutes < 60) {
      valueDisplay.textContent = Math.round(minutes).toString();
      unitDisplay.textContent = "MIN";
    } else {
      valueDisplay.textContent = "60";
      unitDisplay.textContent = "MIN";
    }
  }

  // Slider handler
  slider.addEventListener("input", () => {
    const minutes = parseFloat(slider.value);
    updateDisplay(minutes);
    quickBtns.forEach(btn => btn.classList.remove("selected"));
  });

  // Quick button handlers
  quickBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const minutes = parseFloat((btn as HTMLElement).dataset.minutes || "5");
      slider.value = minutes.toString();
      updateDisplay(minutes);
      
      quickBtns.forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
    });
  });

  // Confirm handler
  confirmBtn.addEventListener("click", async () => {
    const seconds = Math.round(selectedMinutes * 60);
    await setTimeLimit(seconds);
    overlay.remove();
  });

  // Enter key handler
  overlay.addEventListener("keypress", async (e) => {
    if (e.key === "Enter") {
      const seconds = Math.round(selectedMinutes * 60);
      await setTimeLimit(seconds);
      overlay.remove();
    }
  });
}

async function setTimeLimit(seconds: number) {
  const hostname = window.location.hostname;
  const endTime = Date.now() + seconds * 1000;

  // Save the time limit
  const result = await browser.storage.local.get("activeLimits");
  const activeLimits = result.activeLimits || {};
  activeLimits[hostname] = {
    endTime,
    seconds,
    startTime: Date.now()
  };
  await browser.storage.local.set({ activeLimits });

  // Show countdown
  showCountdown(seconds);
}

function showCountdown(totalSeconds: number) {
  const countdown = document.createElement("div");
  countdown.id = "time-limit-countdown";
  countdown.title = "Click to open Tab Time Tracker";
  countdown.innerHTML = `
    <div class="countdown-content">
      <span class="countdown-time"></span>
      <span class="countdown-today"></span>
    </div>
  `;

  const style = document.createElement("style");
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500&display=swap');
    
    #time-limit-countdown {
      position: fixed;
      top: 12px;
      right: 12px;
      background: rgba(18, 18, 26, 0.85);
      padding: 6px 10px;
      z-index: 999998;
      font-family: 'JetBrains Mono', monospace;
      border: 1px solid rgba(0, 255, 136, 0.3);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      backdrop-filter: blur(8px);
      border-radius: 3px;
      transition: all 200ms ease;
      opacity: 0.7;
      cursor: pointer;
      user-select: none;
    }
    
    #time-limit-countdown:hover {
      opacity: 1;
      border-color: rgba(0, 255, 136, 0.6);
      cursor: pointer;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    }
    
    .countdown-content {
      display: flex;
      gap: 8px;
      align-items: center;
      font-size: 11px;
    }
    
    .countdown-time {
      color: #00ff88;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.02em;
    }
    
    .countdown-today {
      color: #6b7280;
      font-size: 10px;
      font-weight: 500;
    }
    
    .countdown-today::before {
      content: '·';
      margin-right: 6px;
      color: #2a2a3a;
    }
    
    #time-limit-countdown.warning {
      border-color: rgba(255, 152, 0, 0.4);
    }
    
    #time-limit-countdown.warning .countdown-time {
      color: #ff9800;
    }
    
    #time-limit-countdown.danger {
      border-color: rgba(255, 51, 102, 0.5);
      opacity: 1;
      animation: subtlePulse 2s ease-in-out infinite;
    }
    
    #time-limit-countdown.danger .countdown-time {
      color: #ff3366;
    }
    
    @keyframes subtlePulse {
      0%, 100% { 
        opacity: 1;
      }
      50% { 
        opacity: 0.85;
      }
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(countdown);

  // Make countdown clickable to open popup
  countdown.addEventListener("click", () => {
    browser.runtime.sendMessage({ action: "openPopup" });
  });

  // Double-click to hide for 1 minute
  countdown.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    countdown.style.display = "none";
    setTimeout(() => {
      countdown.style.display = "block";
    }, 60000); // 1 minute
  });

  const timeDisplay = countdown.querySelector(".countdown-time");
  const todayTimeDisplay = countdown.querySelector(".countdown-today");
  let remaining = totalSeconds;

  // Function to get today's total time for this site
  async function updateTodayTime() {
    const hostname = window.location.hostname;
    const result = await browser.storage.local.get("timeTracking");
    const timeTracking = result.timeTracking || {};
    
    if (timeTracking[hostname]) {
      const totalSeconds = timeTracking[hostname].timeSpent;
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      
      let timeStr = "";
      if (hours > 0) {
        timeStr = `${hours}h${minutes}m`;
      } else if (minutes > 0) {
        timeStr = `${minutes}m`;
      } else {
        timeStr = `${totalSeconds}s`;
      }
      
      if (todayTimeDisplay) {
        todayTimeDisplay.textContent = timeStr;
      }
    } else {
      if (todayTimeDisplay) {
        todayTimeDisplay.textContent = "0m";
      }
    }
  }

  // Update today's time initially and every 5 seconds
  updateTodayTime();
  setInterval(updateTodayTime, 5000);

  const interval = setInterval(() => {
    remaining--;
    
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    if (timeDisplay) {
      timeDisplay.textContent = timeStr;
    }

    // Change color based on remaining time
    if (remaining <= 10) {
      countdown.className = "danger";
    } else if (remaining <= 30) {
      countdown.className = "warning";
    }

    if (remaining <= 0) {
      clearInterval(interval);
    }
  }, 1000);

  // Initial display
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  if (timeDisplay) {
    timeDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
}

// Check on page load
checkTimeLimit();

// Also check if there's already an active limit for this site
async function checkExistingLimit() {
  const hostname = window.location.hostname;
  const result = await browser.storage.local.get("activeLimits");
  const activeLimits = result.activeLimits || {};
  
  if (activeLimits[hostname]) {
    const limit = activeLimits[hostname];
    const remaining = Math.max(0, Math.floor((limit.endTime - Date.now()) / 1000));
    
    if (remaining > 0) {
      showCountdown(remaining);
    }
  }
}

checkExistingLimit();

// Check if this is a productive site and show count-up timer
async function checkProductiveSite() {
  const hostname = window.location.hostname;
  const result = await browser.storage.local.get("productiveSites");
  const productiveSites = result.productiveSites || [];
  
  const isProductive = productiveSites.some((site: string) => 
    hostname.includes(site) || site.includes(hostname)
  );
  
  if (isProductive) {
    showProductiveTimer();
  }
}

function showProductiveTimer() {
  const timer = document.createElement("div");
  timer.id = "productive-timer";
  timer.innerHTML = `
    <div class="timer-content">
      <span class="timer-time"></span>
      <span class="timer-label">Earning</span>
    </div>
  `;

  const style = document.createElement("style");
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500&display=swap');
    
    #productive-timer {
      position: fixed;
      top: 12px;
      right: 12px;
      background: rgba(18, 18, 26, 0.85);
      padding: 6px 10px;
      z-index: 999998;
      font-family: 'JetBrains Mono', monospace;
      border: 1px solid rgba(0, 255, 136, 0.3);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      backdrop-filter: blur(8px);
      border-radius: 3px;
      transition: all 200ms ease;
      opacity: 0.7;
      cursor: pointer;
    }
    
    #productive-timer:hover {
      opacity: 1;
      border-color: rgba(0, 255, 136, 0.6);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    }
    
    .timer-content {
      display: flex;
      gap: 8px;
      align-items: center;
      font-size: 11px;
    }
    
    .timer-time {
      color: #00ff88;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.02em;
    }
    
    .timer-label {
      color: #6b7280;
      font-size: 10px;
      font-weight: 500;
    }
    
    .timer-label::before {
      content: '·';
      margin-right: 6px;
      color: #2a2a3a;
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(timer);

  // Make timer clickable to open popup
  timer.addEventListener("click", () => {
    browser.runtime.sendMessage({ action: "openPopup" });
  });

  // Double-click to hide for 1 minute
  timer.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    timer.style.display = "none";
    setTimeout(() => {
      timer.style.display = "block";
    }, 60000); // 1 minute
  });

  const timeDisplay = timer.querySelector(".timer-time");
  let elapsed = 0;

  // Get initial time from storage
  async function getInitialTime() {
    const hostname = window.location.hostname;
    const result = await browser.storage.local.get("timeTracking");
    const timeTracking = result.timeTracking || {};
    
    if (timeTracking[hostname]) {
      elapsed = timeTracking[hostname].timeSpent;
    }
  }

  getInitialTime();

  // Update timer every second
  setInterval(() => {
    elapsed++;
    
    const hours = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed % 3600) / 60);
    const seconds = elapsed % 60;
    
    let timeStr = "";
    if (hours > 0) {
      timeStr = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
      timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    
    if (timeDisplay) {
      timeDisplay.textContent = timeStr;
    }
  }, 1000);
}

checkProductiveSite();

// Listen for messages from background
browser.runtime.onMessage.addListener((message) => {
  console.log("Content script received message:", message);
  if (message.type === "showProductiveTimeUpPopup") {
    console.log("Showing productive time-up popup");
    showProductiveTimeUpPopup();
    return true; // Keep the message channel open for async response
  }
});

// Show popup when time is up on productive sites
async function showProductiveTimeUpPopup() {
  // Remove any existing popup
  const existing = document.getElementById("productive-time-up-overlay");
  if (existing) {
    existing.remove();
  }

  // Get redirect sites from storage
  const result = await browser.storage.local.get("redirectSites");
  const redirectSites = result.redirectSites || [
    { name: "LeetCode", url: "https://leetcode.com" }
  ];
  
  // Pick a random redirect site
  const randomSite = redirectSites[Math.floor(Math.random() * redirectSites.length)];

  const overlay = document.createElement("div");
  overlay.id = "productive-time-up-overlay";
  overlay.innerHTML = `
    <div class="productive-popup">
      <div class="popup-header">
        <div class="popup-icon">✓</div>
        <h2 class="popup-title">TIME_COMPLETE</h2>
        <div class="popup-subtitle">// PRODUCTIVE_SESSION_ENDED</div>
      </div>
      
      <div class="popup-body">
        <div class="popup-message">
          Your scheduled time on this productive site has ended.
        </div>
        
        <div class="popup-encouragement">
          <div class="encouragement-icon">⚡</div>
          <div class="encouragement-text">
            Great work! You've been productive.
            <br>
            Feel free to continue or take a break.
          </div>
        </div>
        
        <div class="popup-actions">
          <button class="popup-btn continue-btn">Continue Working</button>
          <button class="popup-btn break-btn">Visit ${randomSite.name}</button>
        </div>
      </div>
      
      <div class="popup-scanlines"></div>
    </div>
  `;

  const style = document.createElement("style");
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=JetBrains+Mono:wght@400;600&display=swap');
    
    #productive-time-up-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(10, 10, 15, 0.95);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999999;
      font-family: 'JetBrains Mono', monospace;
      backdrop-filter: blur(8px);
      animation: overlayFadeIn 0.3s ease-out;
    }
    
    @keyframes overlayFadeIn {
      0% { opacity: 0; }
      100% { opacity: 1; }
    }
    
    .productive-popup {
      background: #12121a;
      width: 480px;
      max-width: 90vw;
      border: 2px solid #00ff88;
      box-shadow: 
        0 0 30px rgba(0, 255, 136, 0.5),
        0 0 60px rgba(0, 255, 136, 0.3),
        inset 0 0 80px rgba(0, 255, 136, 0.05);
      position: relative;
      clip-path: polygon(
        0 16px, 16px 0,
        calc(100% - 16px) 0, 100% 16px,
        100% calc(100% - 16px), calc(100% - 16px) 100%,
        16px 100%, 0 calc(100% - 16px)
      );
      animation: popupSlideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    
    @keyframes popupSlideIn {
      0% { 
        opacity: 0;
        transform: scale(0.9) translateY(30px);
      }
      100% { 
        opacity: 1;
        transform: scale(1) translateY(0);
      }
    }
    
    .popup-header {
      background: linear-gradient(180deg, #1c1c2e 0%, #12121a 100%);
      padding: 24px 28px;
      border-bottom: 1px solid #00ff88;
      position: relative;
      text-align: center;
    }
    
    .popup-icon {
      font-size: 48px;
      color: #00ff88;
      margin-bottom: 12px;
      text-shadow: 0 0 20px rgba(0, 255, 136, 0.8);
      animation: iconPulse 2s ease-in-out infinite;
    }
    
    @keyframes iconPulse {
      0%, 100% { 
        transform: scale(1);
        text-shadow: 0 0 20px rgba(0, 255, 136, 0.8);
      }
      50% { 
        transform: scale(1.1);
        text-shadow: 0 0 30px rgba(0, 255, 136, 1);
      }
    }
    
    .popup-title {
      font-family: 'Orbitron', monospace;
      font-size: 28px;
      font-weight: 900;
      margin: 0 0 8px 0;
      color: #00ff88;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      text-shadow: 
        0 0 15px rgba(0, 255, 136, 0.8),
        2px 0 0 rgba(0, 212, 255, 0.3),
        -2px 0 0 rgba(255, 0, 255, 0.3);
    }
    
    .popup-subtitle {
      font-size: 11px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.2em;
      font-weight: 600;
    }
    
    .popup-body {
      padding: 32px 28px 28px;
      background: #0a0a0f;
      position: relative;
    }
    
    .popup-message {
      font-size: 15px;
      color: #e0e0e0;
      text-align: center;
      margin-bottom: 24px;
      line-height: 1.6;
    }
    
    .popup-encouragement {
      background: #1c1c2e;
      padding: 20px;
      border: 1px solid #00ff88;
      margin-bottom: 28px;
      display: flex;
      align-items: center;
      gap: 16px;
      clip-path: polygon(
        0 0, calc(100% - 12px) 0, 100% 12px,
        100% 100%, 12px 100%, 0 calc(100% - 12px)
      );
    }
    
    .encouragement-icon {
      font-size: 32px;
      flex-shrink: 0;
      animation: iconGlow 2s ease-in-out infinite;
    }
    
    @keyframes iconGlow {
      0%, 100% { 
        filter: drop-shadow(0 0 5px rgba(0, 255, 136, 0.5));
      }
      50% { 
        filter: drop-shadow(0 0 15px rgba(0, 255, 136, 0.8));
      }
    }
    
    .encouragement-text {
      font-size: 14px;
      color: #00ff88;
      line-height: 1.6;
      font-weight: 600;
    }
    
    .popup-actions {
      display: flex;
      gap: 12px;
    }
    
    .popup-btn {
      flex: 1;
      padding: 14px 20px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      cursor: pointer;
      transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
      border: none;
      position: relative;
      overflow: hidden;
    }
    
    .continue-btn {
      background: #00ff88;
      color: #0a0a0f;
      clip-path: polygon(
        0 0, calc(100% - 10px) 0, 100% 10px,
        100% 100%, 0 100%
      );
      box-shadow: 0 0 20px rgba(0, 255, 136, 0.4);
    }
    
    .continue-btn:hover {
      transform: translateY(-2px);
      box-shadow: 
        0 0 30px rgba(0, 255, 136, 0.8),
        0 0 60px rgba(0, 255, 136, 0.4);
      filter: brightness(1.1);
    }
    
    .break-btn {
      background: transparent;
      color: #6b7280;
      border: 2px solid #2a2a3a;
      clip-path: polygon(
        0 0, calc(100% - 8px) 0, 100% 8px,
        100% 100%, 0 100%
      );
    }
    
    .break-btn:hover {
      border-color: #00ff88;
      color: #00ff88;
      box-shadow: 0 0 15px rgba(0, 255, 136, 0.3);
    }
    
    .popup-btn:active {
      transform: translateY(0);
    }
    
    .popup-scanlines {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: repeating-linear-gradient(
        0deg,
        transparent,
        transparent 2px,
        rgba(0, 0, 0, 0.3) 2px,
        rgba(0, 0, 0, 0.3) 4px
      );
      pointer-events: none;
      opacity: 0.2;
    }
    
    .popup-body::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-image:
        linear-gradient(rgba(0, 255, 136, 0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0, 255, 136, 0.03) 1px, transparent 1px);
      background-size: 20px 20px;
      pointer-events: none;
      opacity: 0.5;
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(overlay);

  // Continue button - just close the popup
  const continueBtn = overlay.querySelector(".continue-btn");
  continueBtn?.addEventListener("click", () => {
    overlay.remove();
  });

  // Break button - go back or close tab
  const breakBtn = overlay.querySelector(".break-btn");
  breakBtn?.addEventListener("click", () => {
    overlay.remove();
    // Redirect to the selected productive site
    window.location.href = randomSite.url;
  });

  // ESC key to close
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      overlay.remove();
      document.removeEventListener("keydown", handleEscape);
    }
  };
  document.addEventListener("keydown", handleEscape);
}
