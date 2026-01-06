// ======= TELEMETRY MODULE =======
// Step 6 (Phase 5): Firebase Analytics integration
// Step 7: Debug panel event logging
// Event volume limited to ~8-10 event types (as per Step 6 spec)

import { logEvent, setUserProperties } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js';
import { initFirebase } from '../config/firebase-config.js';
import { logDebugEvent } from './debug.js';

let initialized = false;
let debugMode = false;
let analytics = null;
let cachedUserProps = {}; // Cache ab_group and other props for automatic inclusion

/**
 * Initialize telemetry with Firebase Analytics
 *
 * Step 6 initialization order (from spec):
 * 1. load/migrate playerData ✓ (done before this)
 * 2. detect platform / standalone ✓ (done before this)
 * 3. assign A/B if missing ✓ (done before this)
 * 4. init Firebase ← WE ARE HERE
 * 5. set user properties
 * 6. start logging events
 *
 * @param {object} config - configuration options
 * @param {boolean} config.debug - enable debug logging
 */
export function init(config = {}) {
  debugMode = config.debug || false;

  try {
    // Initialize Firebase
    analytics = initFirebase();

    if (analytics) {
      console.log('[Telemetry] Firebase Analytics initialized successfully');
    } else {
      console.log('[Telemetry] Running in stub mode (no Firebase config or init failed)');
      console.log('[Telemetry] Events will be logged to console only');
    }

    initialized = true;

    if (debugMode) {
      console.log('[Telemetry] Debug mode enabled');
    }
  } catch (error) {
    console.error('[Telemetry] Initialization error:', error);
    console.log('[Telemetry] Falling back to stub mode - analytics will not block gameplay');
    initialized = true; // Still mark as initialized to allow gameplay
  }
}

/**
 * Log an event to Firebase Analytics
 *
 * Step 6 spec: Keep to ~8-10 event types total
 * Current events:
 * - session_start
 * - mode_selected
 * - run_start
 * - run_end
 * - daily_complete
 * - sprint_complete
 * - mission_complete
 * - level_up
 * - install_prompt_shown
 * - install_accepted
 *
 * CRITICAL (Step 6 requirement): Every event includes ab_group automatically
 *
 * @param {string} name - event name
 * @param {object} params - event parameters
 */
export function log(name, params = {}) {
  if (!initialized) {
    console.warn('[Telemetry] Not initialized, call init() first');
    return;
  }

  // Step 6 requirement: Include ab_group in every event
  const enrichedParams = {
    ...params,
    ab_group: cachedUserProps.ab_group || 'unknown'
  };

  // Step 7: Log to debug panel if enabled
  logDebugEvent(name, enrichedParams);

  // Always log to console in debug mode
  if (debugMode) {
    console.log(`[Telemetry Event] ${name}`, enrichedParams);
  }

  // Send to Firebase Analytics if available
  if (analytics) {
    try {
      logEvent(analytics, name, enrichedParams);
    } catch (error) {
      console.error('[Telemetry] Error logging event:', error);
      // Fail gracefully - don't block gameplay
    }
  } else {
    // Stub mode: just console log
    if (!debugMode) {
      console.log(`[Telemetry Event] ${name}`, enrichedParams);
    }
  }
}

/**
 * Set user properties for Firebase Analytics
 *
 * Step 6 spec: Keep small and stable
 * User properties:
 * - ab_group (never changes)
 * - platform (never changes)
 * - is_standalone (may change if user installs later)
 * - pwa_installed (may change)
 * - player_level (changes slowly)
 *
 * CRITICAL: Do not send any unique ID (playerId removed - good!)
 *
 * @param {object} props - user properties
 */
export function setUserProps(props) {
  if (!initialized) {
    console.warn('[Telemetry] Not initialized, call init() first');
    return;
  }

  // Cache ab_group for automatic inclusion in all events
  if (props.ab_group) {
    cachedUserProps.ab_group = props.ab_group;
  }

  // Always log to console in debug mode
  if (debugMode) {
    console.log('[Telemetry UserProps]', props);
  }

  // Send to Firebase Analytics if available
  if (analytics) {
    try {
      setUserProperties(analytics, props);
    } catch (error) {
      console.error('[Telemetry] Error setting user properties:', error);
      // Fail gracefully - don't block gameplay
    }
  } else {
    // Stub mode: just console log
    if (!debugMode) {
      console.log('[Telemetry UserProps]', props);
    }
  }
}

/**
 * Helper: Log session start
 */
export function logSessionStart(mode = 'endless') {
  log('session_start', { mode });
}

/**
 * Helper: Log mode selected
 */
export function logModeSelected(mode) {
  log('mode_selected', { mode });
}

/**
 * Helper: Log run start
 */
export function logRunStart(mode = 'endless') {
  log('run_start', { mode });
}

/**
 * Helper: Log run end
 */
export function logRunEnd(summary) {
  log('run_end', {
    mode: summary.mode || 'endless',
    rings: summary.rings || 0,
    cause: summary.cause || 'unknown',
    time_ms: summary.time_ms || 0,
    max_chain: summary.max_chain || 1,
    critical_entries: summary.critical_entries || 0,
    critical_escapes: summary.critical_escapes || 0
  });
}

/**
 * Helper: Log level up
 */
export function logLevelUp(level) {
  log('level_up', { level });
}

/**
 * Helper: Log mission complete
 */
export function logMissionComplete(missionId, rewardXp) {
  log('mission_complete', {
    mission_id: missionId,
    reward_xp: rewardXp
  });
}

/**
 * Enable/disable debug mode
 */
export function setDebugMode(enabled) {
  debugMode = enabled;
  console.log(`[Telemetry] Debug mode ${enabled ? 'enabled' : 'disabled'}`);
}
