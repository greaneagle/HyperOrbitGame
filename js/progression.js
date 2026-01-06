// ======= PROGRESSION MODULE (Pv02.2 - Step 4 + Step 6) =======
// Handles XP, levels, unlocks, achievements, and cosmetics

import { savePlayerData } from './storage.js';
import * as telemetry from './telemetry.js';

// ======= XP SYSTEM =======

/**
 * Calculate XP for a run based on performance
 * Formula (stable, non-grindy):
 * - baseXp = floor(15 * sqrt(rings))
 * - chainXp = maxChain * 20
 * - criticalXp = criticalEscapes * 30
 * - modeBonus = sprintWin ? 80 : 0
 * - missionXp added separately
 */
export function calculateRunXP(summary) {
  const { rings, maxChain, criticalEscapes, sprintWin } = summary;

  const baseXp = Math.floor(15 * Math.sqrt(rings || 0));
  const chainXp = (maxChain || 1) * 20;
  const criticalXp = (criticalEscapes || 0) * 30;
  const modeBonus = sprintWin ? 80 : 0;

  const totalXp = baseXp + chainXp + criticalXp + modeBonus;

  return {
    total: totalXp,
    breakdown: {
      base: baseXp,
      chain: chainXp,
      critical: criticalXp,
      modeBonus: modeBonus
    }
  };
}

/**
 * Calculate XP needed for next level
 * Formula: floor(120 * pow(1.35, level-1))
 * This ensures early levels pop fast (Level 2 within 2-3 runs)
 */
export function getXPToNextLevel(level) {
  return Math.floor(120 * Math.pow(1.35, level - 1));
}

/**
 * Get total XP needed to reach a specific level
 */
export function getTotalXPForLevel(targetLevel) {
  let total = 0;
  for (let lvl = 1; lvl < targetLevel; lvl++) {
    total += getXPToNextLevel(lvl);
  }
  return total;
}

/**
 * Add XP to player and handle level-ups
 * Returns { levelsGained: number, newLevel: number, unlocks: [] }
 */
export function addXP(playerData, xpToAdd) {
  const startLevel = playerData.level;
  playerData.xp += xpToAdd;

  const levelsGained = [];
  const newUnlocks = [];

  // Check for level-ups (can gain multiple levels at once)
  while (true) {
    const xpNeeded = getXPToNextLevel(playerData.level);
    if (playerData.xp >= xpNeeded) {
      playerData.xp -= xpNeeded;
      playerData.level++;
      levelsGained.push(playerData.level);

      // Step 6: Log level up event
      telemetry.logLevelUp(playerData.level);

      // Check for level-based unlocks
      const levelUnlocks = checkLevelUnlocks(playerData, playerData.level);
      newUnlocks.push(...levelUnlocks);
    } else {
      break;
    }
  }

  return {
    levelsGained,
    newLevel: playerData.level,
    unlocks: newUnlocks
  };
}

// ======= UNLOCK SYSTEM =======

/**
 * Cosmetic definitions (trails, themes)
 */
export const COSMETICS = {
  trails: [
    { id: 'default', name: 'Default', unlockType: 'default' },
    { id: 'sparkle', name: 'Sparkle', unlockType: 'level', unlockValue: 2 },
    { id: 'rainbow', name: 'Rainbow', unlockType: 'achievement', unlockValue: 'ach_chain_5' },
    { id: 'inferno', name: 'Inferno', unlockType: 'achievement', unlockValue: 'ach_critical_pro' },
    { id: 'lightning', name: 'Lightning', unlockType: 'achievement', unlockValue: 'ach_sprint_fast' },
    { id: 'neon', name: 'Neon Glow', unlockType: 'level', unlockValue: 8 },
    { id: 'cosmic', name: 'Cosmic', unlockType: 'level', unlockValue: 15 }
  ],
  themes: [
    { id: 'default', name: 'Default', unlockType: 'default' },
    { id: 'neon', name: 'Neon', unlockType: 'level', unlockValue: 5 },
    { id: 'sunset', name: 'Sunset', unlockType: 'achievement', unlockValue: 'ach_daily_streak_7' },
    { id: 'midnight', name: 'Midnight', unlockType: 'achievement', unlockValue: 'ach_total_runs_100' },
    { id: 'ocean', name: 'Ocean', unlockType: 'level', unlockValue: 12 }
  ]
};

/**
 * Check if a cosmetic is unlocked
 */
export function isCosmeticUnlocked(playerData, type, id) {
  const cosmetic = COSMETICS[type].find(c => c.id === id);
  if (!cosmetic) return false;

  if (cosmetic.unlockType === 'default') return true;
  if (cosmetic.unlockType === 'level') {
    return playerData.level >= cosmetic.unlockValue;
  }
  if (cosmetic.unlockType === 'achievement') {
    return playerData.unlocks.achievements.includes(cosmetic.unlockValue);
  }

  return false;
}

/**
 * Check for level-based unlocks
 */
function checkLevelUnlocks(playerData, level) {
  const unlocks = [];

  // Check trails
  for (const trail of COSMETICS.trails) {
    if (trail.unlockType === 'level' && trail.unlockValue === level) {
      const cosmeticId = `trail_${trail.id}`;
      if (!playerData.unlocks.cosmetics.includes(cosmeticId)) {
        playerData.unlocks.cosmetics.push(cosmeticId);
        unlocks.push({
          type: 'cosmetic',
          category: 'trail',
          id: trail.id,
          name: trail.name
        });
      }
    }
  }

  // Check themes
  for (const theme of COSMETICS.themes) {
    if (theme.unlockType === 'level' && theme.unlockValue === level) {
      const cosmeticId = `theme_${theme.id}`;
      if (!playerData.unlocks.cosmetics.includes(cosmeticId)) {
        playerData.unlocks.cosmetics.push(cosmeticId);
        unlocks.push({
          type: 'cosmetic',
          category: 'theme',
          id: theme.id,
          name: theme.name
        });
      }
    }
  }

  return unlocks;
}

// ======= ACHIEVEMENT SYSTEM =======

/**
 * Load achievements from data file
 */
let achievementsCache = null;

export async function loadAchievements() {
  if (achievementsCache) return achievementsCache;

  try {
    const response = await fetch('./data/achievements.json');
    achievementsCache = await response.json();
    console.log('[Progression] Loaded achievements:', achievementsCache.length);
    return achievementsCache;
  } catch (error) {
    console.error('[Progression] Failed to load achievements:', error);
    return [];
  }
}

/**
 * Check achievements after a run
 * Returns array of newly unlocked achievements
 */
export function checkAchievements(playerData, runSummary) {
  if (!achievementsCache) {
    console.warn('[Progression] Achievements not loaded yet');
    return [];
  }

  const newAchievements = [];

  for (const achievement of achievementsCache) {
    // Skip if already unlocked
    if (playerData.unlocks.achievements.includes(achievement.id)) {
      continue;
    }

    let unlocked = false;

    // Check achievement conditions
    switch (achievement.type) {
      case 'rings':
        unlocked = runSummary.rings >= achievement.threshold;
        break;

      case 'bestScore':
        const maxBest = Math.max(
          playerData.bestScore.endless,
          playerData.bestScore.daily,
          playerData.bestScore.sprint || 0
        );
        unlocked = maxBest >= achievement.threshold;
        break;

      case 'maxChain':
        unlocked = runSummary.maxChain >= achievement.threshold;
        break;

      case 'criticalEscapes':
        unlocked = runSummary.criticalEscapes >= achievement.threshold;
        break;

      case 'sprintComplete':
        unlocked = runSummary.sprintWin === true;
        break;

      case 'sprintTime':
        unlocked = runSummary.sprintWin && runSummary.time_ms <= achievement.threshold;
        break;

      case 'dailyStreak':
        unlocked = playerData.stats.dailyStreak >= achievement.threshold;
        break;

      case 'level':
        unlocked = playerData.level >= achievement.threshold;
        break;

      case 'totalRuns':
        unlocked = playerData.stats.totalRuns >= achievement.threshold;
        break;

      default:
        console.warn('[Progression] Unknown achievement type:', achievement.type);
    }

    if (unlocked) {
      // Unlock achievement
      playerData.unlocks.achievements.push(achievement.id);
      newAchievements.push(achievement);

      // Award cosmetic if specified
      if (achievement.reward.cosmetic) {
        if (!playerData.unlocks.cosmetics.includes(achievement.reward.cosmetic)) {
          playerData.unlocks.cosmetics.push(achievement.reward.cosmetic);
        }
      }

      // Log achievement unlock
      telemetry.log('achievement_unlock', {
        achievement_id: achievement.id,
        achievement_name: achievement.name,
        xp_reward: achievement.reward.xp || 0
      });
    }
  }

  return newAchievements;
}

/**
 * Process run completion and award XP, level-ups, and achievements
 * This is the main entry point called after a run ends
 */
export async function processRunCompletion(playerData, runSummary) {
  // 1. Calculate base XP from run performance
  const xpResult = calculateRunXP({
    rings: runSummary.rings,
    maxChain: runSummary.max_chain,
    criticalEscapes: runSummary.critical_escapes,
    sprintWin: runSummary.sprintWin || false
  });

  // 2. Add mission XP (already completed missions during run)
  let missionXp = 0;
  if (runSummary.completedMissions) {
    missionXp = runSummary.completedMissions.reduce((sum, m) => sum + (m.reward || 0), 0);
  }

  const totalXp = xpResult.total + missionXp;

  // 3. Add XP and check for level-ups
  const levelResult = addXP(playerData, totalXp);

  // 4. Check for achievements (must happen after level-ups)
  const newAchievements = checkAchievements(playerData, {
    ...runSummary,
    maxChain: runSummary.max_chain
  });

  // 5. Award achievement XP (if any achievements were unlocked)
  let achievementXp = 0;
  if (newAchievements.length > 0) {
    achievementXp = newAchievements.reduce((sum, ach) => sum + (ach.reward.xp || 0), 0);

    // Add achievement XP and check for additional level-ups
    if (achievementXp > 0) {
      const achievementLevelResult = addXP(playerData, achievementXp);

      // Merge level-up results
      levelResult.levelsGained.push(...achievementLevelResult.levelsGained);
      levelResult.newLevel = achievementLevelResult.newLevel;
      levelResult.unlocks.push(...achievementLevelResult.unlocks);
    }
  }

  // 6. Save player data
  savePlayerData(playerData);

  return {
    xp: {
      earned: totalXp + achievementXp,
      breakdown: {
        ...xpResult.breakdown,
        missions: missionXp,
        achievements: achievementXp
      }
    },
    level: levelResult,
    achievements: newAchievements
  };
}

/**
 * Get all unlockable cosmetics for UI display
 */
export function getAllCosmetics() {
  return COSMETICS;
}

/**
 * Get player's current progression status for UI
 */
export function getProgressionStatus(playerData) {
  const xpNeeded = getXPToNextLevel(playerData.level);
  const xpProgress = playerData.xp / xpNeeded;

  return {
    level: playerData.level,
    xp: playerData.xp,
    xpNeeded,
    xpProgress: Math.min(1, xpProgress),
    xpPercent: Math.round(xpProgress * 100)
  };
}

/**
 * Select a cosmetic (trail or theme)
 */
export function selectCosmetic(playerData, type, id) {
  if (type === 'trail') {
    if (isCosmeticUnlocked(playerData, 'trails', id)) {
      playerData.cosmetics.trailId = id;
      savePlayerData(playerData);
      return true;
    }
  } else if (type === 'theme') {
    if (isCosmeticUnlocked(playerData, 'themes', id)) {
      playerData.cosmetics.themeId = id;
      savePlayerData(playerData);
      return true;
    }
  }
  return false;
}
