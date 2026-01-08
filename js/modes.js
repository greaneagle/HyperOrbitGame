// ======= MODE SYSTEM MODULE =======
// Phase 2: Endless, Daily Orbit, Sprint 30

// Mode configuration
export const MODES = {
  endless: {
    id: 'endless',
    label: 'Endless',
    finiteTarget: null,
    usesDailyPattern: false,
    scoreType: 'rings',
    description: 'Escape as many rings as possible'
  },
  daily: {
    id: 'daily',
    label: 'Daily Orbit',
    finiteTarget: 40, // Complete at 40 rings
    usesDailyPattern: true,
    scoreType: 'rings',
    description: 'Today\'s unique challenge'
  },
  sprint: {
    id: 'sprint',
    label: 'Sprint 30',
    finiteTarget: 30,
    usesDailyPattern: false,
    scoreType: 'time',
    description: 'Reach 30 rings as fast as possible'
  }
};

/**
 * Get current mode configuration
 */
export function getModeConfig(modeId) {
  return MODES[modeId] || MODES.endless;
}

/**
 * Get today's date in YYYY-MM-DD format (local time)
 */
export function getTodayId() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Mulberry32 PRNG (deterministic seeded random)
 * https://stackoverflow.com/a/47593316
 */
function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Convert date string to numeric seed
 */
function dateToSeed(dateStr) {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    const char = dateStr.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Generate deterministic daily pattern
 * @param {string} dateId - Date in YYYY-MM-DD format
 * @param {number} length - Number of rings to generate
 * @returns {object} Pattern with gapCenters array
 */
export function generateDailyPattern(dateId, length = 50) {
  const seed = dateToSeed(dateId);
  const rng = mulberry32(seed);

  const gapCenters = [];
  for (let i = 0; i < length; i++) {
    gapCenters.push(rng() * Math.PI * 2);
  }

  return {
    dateId,
    length,
    gapCenters,
    seed // Store for debugging
  };
}

/**
 * Get cached daily pattern or generate new one
 * @param {string} version - App version for cache key
 * @param {string} dateId - Date in YYYY-MM-DD format
 * @returns {object} Daily pattern
 */
export function getDailyPattern(version, dateId) {
  const cacheKey = `daily_${version}_${dateId}`;

  // Try to load from cache
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const pattern = JSON.parse(cached);
      console.log(`[Daily] Loaded cached pattern for ${dateId}`);
      return pattern;
    }
  } catch (e) {
    console.warn('[Daily] Failed to load cached pattern:', e);
  }

  // Generate new pattern
  console.log(`[Daily] Generating new pattern for ${dateId}`);
  const pattern = generateDailyPattern(dateId, 50);

  // Save to cache
  try {
    localStorage.setItem(cacheKey, JSON.stringify(pattern));
  } catch (e) {
    console.warn('[Daily] Failed to cache pattern:', e);
  }

  return pattern;
}

/**
 * Check if daily pattern needs refresh (new day)
 * @param {object} playerData - Player data object
 * @param {string} currentDateId - Today's date ID
 * @returns {boolean} True if new day
 */
export function isNewDay(playerData, currentDateId) {
  const lastDate = playerData.stats.lastDailyDate;
  return !lastDate || lastDate !== currentDateId;
}

/**
 * Update daily streak when player plays on a new day
 * @param {object} playerData - Player data object
 * @param {string} currentDateId - Today's date ID (YYYYMMDD format)
 */
export function updateDailyStreak(playerData, currentDateId) {
  const lastDate = playerData.stats.lastDailyDate;

  if (!lastDate) {
    // First time playing
    playerData.stats.dailyStreak = 1;
    console.log('[Streak] Started daily streak: 1 day');
  } else if (lastDate === currentDateId) {
    // Already played today, no change
    return;
  } else {
    // Check if it's consecutive days
    const lastDateObj = new Date(
      parseInt(lastDate.slice(0, 4)), // year
      parseInt(lastDate.slice(4, 6)) - 1, // month (0-indexed)
      parseInt(lastDate.slice(6, 8)) // day
    );

    const todayDateObj = new Date(
      parseInt(currentDateId.slice(0, 4)),
      parseInt(currentDateId.slice(4, 6)) - 1,
      parseInt(currentDateId.slice(6, 8))
    );

    // Calculate difference in days
    const diffTime = todayDateObj.getTime() - lastDateObj.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      // Consecutive day - increment streak
      playerData.stats.dailyStreak++;
      console.log(`[Streak] Daily streak continued: ${playerData.stats.dailyStreak} days`);
    } else if (diffDays > 1) {
      // Streak broken - reset to 1
      playerData.stats.dailyStreak = 1;
      console.log('[Streak] Streak broken, resetting to 1 day');
    }
  }
}

/**
 * Get gap center for a ring index in daily mode
 * @param {object} dailyPattern - Daily pattern object
 * @param {number} ringIndex - Ring index
 * @returns {number} Gap center angle
 */
export function getDailyGapCenter(dailyPattern, ringIndex) {
  if (!dailyPattern || !dailyPattern.gapCenters) {
    return Math.random() * Math.PI * 2; // Fallback
  }

  // Wrap around if ring index exceeds pattern length
  const index = ringIndex % dailyPattern.gapCenters.length;
  return dailyPattern.gapCenters[index];
}
