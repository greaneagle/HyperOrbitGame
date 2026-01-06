// ======= DEBUG PANEL MODULE (Step 7) =======
// Only shown when ?debug=1 is in URL

import { getVersionInfo } from './version.js';
import { getExperimentInfo } from './ab.js';

let debugEnabled = false;
let eventLog = [];
const MAX_EVENTS = 15; // Show last 15 events

/**
 * Check if debug mode is enabled via URL parameter
 */
export function isDebugEnabled() {
  const params = new URLSearchParams(window.location.search);
  return params.get('debug') === '1';
}

/**
 * Initialize debug panel if ?debug=1
 */
export function initDebugPanel(playerData, envInfo) {
  debugEnabled = isDebugEnabled();

  if (!debugEnabled) {
    console.log('[Debug] Debug panel disabled. Add ?debug=1 to URL to enable.');
    return;
  }

  console.log('[Debug] Debug panel ENABLED');
  createDebugPanel();
  updateDebugPanel(playerData, envInfo);
}

/**
 * Log telemetry event to debug panel
 */
export function logDebugEvent(eventName, params) {
  if (!debugEnabled) return;

  const timestamp = new Date().toLocaleTimeString();
  eventLog.unshift({
    timestamp,
    name: eventName,
    params: JSON.stringify(params, null, 2)
  });

  // Keep only last MAX_EVENTS
  if (eventLog.length > MAX_EVENTS) {
    eventLog = eventLog.slice(0, MAX_EVENTS);
  }

  updateEventLog();
}

/**
 * Create debug panel HTML
 */
function createDebugPanel() {
  const panel = document.createElement('div');
  panel.id = 'debugPanel';
  panel.className = 'debugPanel';

  panel.innerHTML = `
    <div class="debugHeader">
      <span>🐛 Debug Panel</span>
      <button id="debugToggle" class="debugToggleBtn">−</button>
    </div>
    <div class="debugContent" id="debugContent">
      <div class="debugSection">
        <div class="debugSectionTitle">Version Info</div>
        <div id="debugVersion"></div>
      </div>

      <div class="debugSection">
        <div class="debugSectionTitle">Environment</div>
        <div id="debugEnv"></div>
      </div>

      <div class="debugSection">
        <div class="debugSectionTitle">A/B Experiment</div>
        <div id="debugExperiment"></div>
      </div>

      <div class="debugSection">
        <div class="debugSectionTitle">Recent Events</div>
        <div id="debugEvents" class="debugEvents"></div>
      </div>
    </div>
  `;

  document.body.appendChild(panel);

  // Toggle collapse/expand
  const toggleBtn = document.getElementById('debugToggle');
  const content = document.getElementById('debugContent');
  toggleBtn.addEventListener('click', () => {
    const isCollapsed = content.style.display === 'none';
    content.style.display = isCollapsed ? 'block' : 'none';
    toggleBtn.textContent = isCollapsed ? '−' : '+';
  });
}

/**
 * Update debug panel with current data
 */
function updateDebugPanel(playerData, envInfo) {
  if (!debugEnabled) return;

  // Version info
  const versionInfo = getVersionInfo();
  const versionEl = document.getElementById('debugVersion');
  if (versionEl) {
    versionEl.innerHTML = `
      <div><strong>Version:</strong> ${versionInfo.version}</div>
      <div><strong>Build:</strong> ${versionInfo.build}</div>
      <div><strong>Full:</strong> ${versionInfo.full}</div>
      <div><strong>Modified:</strong> ${versionInfo.timestamp}</div>
    `;
  }

  // Environment info
  const envEl = document.getElementById('debugEnv');
  if (envEl) {
    envEl.innerHTML = `
      <div><strong>Platform:</strong> ${envInfo.platform}</div>
      <div><strong>Standalone:</strong> ${envInfo.isStandalone}</div>
      <div><strong>PWA Installed:</strong> ${playerData.env.pwaInstalled}</div>
      <div><strong>User Agent:</strong> ${navigator.userAgent.substring(0, 50)}...</div>
    `;
  }

  // Experiment info
  const expInfo = getExperimentInfo(playerData.abGroup);
  const expEl = document.getElementById('debugExperiment');
  if (expEl) {
    expEl.innerHTML = `
      <div><strong>Name:</strong> ${expInfo.name}</div>
      <div><strong>Cohort:</strong> ${expInfo.cohort}</div>
      <div><strong>Knob:</strong> ${expInfo.knob}</div>
      <div><strong>Value:</strong> ${expInfo.value}</div>
    `;
  }
}

/**
 * Update event log display
 */
function updateEventLog() {
  if (!debugEnabled) return;

  const eventsEl = document.getElementById('debugEvents');
  if (!eventsEl) return;

  if (eventLog.length === 0) {
    eventsEl.innerHTML = '<div class="debugEventItem">No events yet</div>';
    return;
  }

  eventsEl.innerHTML = eventLog.map(event => `
    <div class="debugEventItem">
      <div class="debugEventTime">${event.timestamp}</div>
      <div class="debugEventName">${event.name}</div>
      <pre class="debugEventParams">${event.params}</pre>
    </div>
  `).join('');
}

/**
 * Export for telemetry module to call
 */
export { debugEnabled };
