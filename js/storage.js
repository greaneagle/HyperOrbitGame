// ======= STORAGE MODULE (Pv02.2 - Step 7) =======
// Handles versioned localStorage, V1 migration, and data persistence

import { APP_VERSION } from './version.js';

const PV02_VERSION = APP_VERSION; // Use centralized version
const PO_DATA_KEY = 'po_data';
const PO_VERSION_KEY = 'po_version';

// V1 keys (for migration)
const V1_BEST_KEY = 'perfect_orbit_best_v1';
const V1_EXPERT_KEY = 'perfect_orbit_expert_v1';

// Player data template (complete default structure)
const PLAYER_DATA_TEMPLATE = {
  version: PV02_VERSION,

  // Best scores per mode
  bestScore: {
    endless: 0,
    daily: 0,
    sprint: 0
  },

  // Current session stats
  stats: {
    totalRuns: 0,
    totalRings: 0,
    deaths: {
      pressure_fail: 0,
      obstacle: 0,
      time: 0
    },
    criticalEscapes: 0,
    dailyStreak: 0,
    lastDailyDate: null
  },

  // Settings
  settings: {
    expert: false,
    soundEnabled: true,
    hapticEnabled: true
  },

  // A/B testing (assigned once, never changes)
  abGroup: null,  // Will be 'A' or 'B'

  // Missions
  missions: {
    active: [],
    dateRolled: null,
    rerollsUsedToday: 0,
    cooldown: [] // Last 6 mission IDs to avoid repeats
  },

  // Progression
  xp: 0,
  level: 1,

  // Unlocks
  unlocks: {
    cosmetics: [],
    achievements: []
  },

  // Selected cosmetics
  cosmetics: {
    trailId: 'default',
    themeId: 'default'
  },

  // Environment tracking (for analytics, not identifying)
  env: {
    platform: null,
    isStandalone: false,
    pwaInstalled: false,
    installPromptAvailable: false,
    installPromptShown: 0,
    installPromptLastShown: 0
  }
};

/**
 * Deep merge helper - merges b into a
 */
function deepMerge(a, b) {
  const result = { ...a };

  for (const key in b) {
    if (b[key] && typeof b[key] === 'object' && !Array.isArray(b[key])) {
      result[key] = deepMerge(a[key] || {}, b[key]);
    } else if (b[key] !== undefined) {
      result[key] = b[key];
    }
  }

  return result;
}

/**
 * Load raw data from localStorage
 */
function loadRaw() {
  try {
    const raw = localStorage.getItem(PO_DATA_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('[Storage] Failed to load data:', e);
  }
  return null;
}

/**
 * Migrate V1 data if it exists
 */
function migrateV1() {
  const v1Best = localStorage.getItem(V1_BEST_KEY);
  const v1Expert = localStorage.getItem(V1_EXPERT_KEY);

  const migrated = {};

  if (v1Best !== null) {
    const bestScore = parseInt(v1Best, 10) || 0;
    migrated.bestScore = { ...PLAYER_DATA_TEMPLATE.bestScore, endless: bestScore };
    console.log(`[Storage] Migrated V1 best score: ${bestScore}`);
  }

  if (v1Expert !== null) {
    migrated.settings = { ...PLAYER_DATA_TEMPLATE.settings, expert: v1Expert === '1' };
    console.log(`[Storage] Migrated V1 expert mode: ${v1Expert === '1'}`);
  }

  return migrated;
}

/**
 * Migrate from older Pv02 versions (future-proof)
 */
function migrateVersion(data, fromVersion) {
  console.log(`[Storage] Migrating from ${fromVersion} to ${PV02_VERSION}`);

  // Add version-specific migrations here as needed
  // Example:
  // if (fromVersion === 'pv02.1') {
  //   data.newField = defaultValue;
  // }

  return data;
}

/**
 * Initialize and load player data
 * Returns fully merged data with all template fields
 */
export function initPlayerData() {
  console.log('[Storage] Initializing player data...');

  // Step 1: Try loading existing data
  let existing = loadRaw();
  let migrated = {};

  // Step 2: Check for V1 migration
  const v1Exists = localStorage.getItem(V1_BEST_KEY) !== null;
  if (v1Exists && !existing) {
    console.log('[Storage] V1 data detected, migrating...');
    migrated = migrateV1();
  }

  // Step 3: Merge with template (ensures all fields exist)
  let playerData = deepMerge(PLAYER_DATA_TEMPLATE, existing || migrated);

  // Step 4: Version migration if needed
  if (existing && existing.version && existing.version !== PV02_VERSION) {
    playerData = migrateVersion(playerData, existing.version);
  }

  // Step 5: Update version
  playerData.version = PV02_VERSION;

  // Step 6: Save merged data
  savePlayerData(playerData);

  console.log('[Storage] Player data initialized:', playerData);
  return playerData;
}

/**
 * Save player data to localStorage
 */
export function savePlayerData(data) {
  try {
    localStorage.setItem(PO_DATA_KEY, JSON.stringify(data));
    localStorage.setItem(PO_VERSION_KEY, PV02_VERSION);
    return true;
  } catch (e) {
    console.error('[Storage] Failed to save data:', e);
    return false;
  }
}

/**
 * Reset all data (for testing or user request)
 */
export function resetPlayerData() {
  console.log('[Storage] Resetting all player data...');
  localStorage.removeItem(PO_DATA_KEY);
  localStorage.removeItem(PO_VERSION_KEY);
  // Also clear V1 keys
  localStorage.removeItem(V1_BEST_KEY);
  localStorage.removeItem(V1_EXPERT_KEY);

  return initPlayerData();
}

/**
 * Get current version
 */
export function getVersion() {
  return PV02_VERSION;
}
