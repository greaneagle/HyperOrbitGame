// ======= MISSION SYSTEM MODULE =======
// Phase 2: Event-driven mission progress with 35+ templates
// Step 6: Added telemetry logging for mission completions

import * as telemetry from './telemetry.js';

/**
 * Load missions from JSON file
 */
export async function loadMissions() {
  try {
    const response = await fetch('./data/missions.json');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    console.log('[Missions] Loaded mission templates:', data);
    return data;
  } catch (e) {
    console.error('[Missions] Failed to load missions.json:', e);
    return getDefaultMissions();
  }
}

/**
 * Fallback mission templates (in case JSON fails to load)
 */
function getDefaultMissions() {
  return {
    easy: [
      { id: 'easy_1', name: 'First Steps', desc: 'Complete 3 runs', type: 'runs', target: 3, reward: 50 }
    ],
    skill: [
      { id: 'skill_1', name: 'Chain Master', desc: 'Get a x3 chain', type: 'chain_at_least', target: 3, reward: 80 }
    ],
    mode: [
      { id: 'mode_1', name: 'Daily Challenge', desc: 'Complete Daily Orbit', type: 'daily_complete', target: 1, reward: 100 }
    ]
  };
}

/**
 * Roll 3 new missions (1 from each category)
 * @param {object} missionTemplates - All mission templates
 * @param {array} cooldown - Last 6 mission IDs to avoid
 * @returns {array} Array of 3 missions with progress initialized
 */
export function rollMissions(missionTemplates, cooldown = []) {
  const categories = ['easy', 'skill', 'mode'];
  const rolled = [];

  for (const category of categories) {
    const templates = missionTemplates[category] || [];
    if (templates.length === 0) continue;

    // Filter out missions in cooldown
    let available = templates.filter(m => !cooldown.includes(m.id));

    // If all are in cooldown, allow repeats
    if (available.length === 0) {
      available = templates;
    }

    // Pick random mission from available
    const mission = available[Math.floor(Math.random() * available.length)];

    // Initialize with progress
    rolled.push({
      ...mission,
      progress: 0,
      completed: false,
      category
    });
  }

  return rolled;
}

/**
 * Update mission progress based on event
 * @param {array} missions - Active missions
 * @param {string} eventType - Event type (e.g., 'run_end', 'ring_escape')
 * @param {object} eventData - Event data
 * @returns {array} Updated missions with any newly completed ones
 */
export function updateMissionProgress(missions, eventType, eventData = {}) {
  const completed = [];

  for (const mission of missions) {
    if (mission.completed) continue;

    let shouldIncrement = false;
    let incrementAmount = 1;

    // Map event types to mission types
    switch (mission.type) {
      case 'runs':
        if (eventType === 'run_end') {
          shouldIncrement = true;
        }
        break;

      case 'rings_total':
        if (eventType === 'ring_escape') {
          incrementAmount = eventData.count || 1;
          shouldIncrement = true;
        }
        break;

      case 'best_score':
        if (eventType === 'run_end' && eventData.rings > mission.progress) {
          mission.progress = eventData.rings;
        }
        break;

      case 'chain_at_least':
        if (eventType === 'chain_reached' && eventData.chain >= mission.target) {
          mission.progress = mission.target;
        }
        break;

      case 'survive_seconds':
        if (eventType === 'run_end' && eventData.time_ms / 1000 >= mission.target) {
          mission.progress = mission.target;
        }
        break;

      case 'critical_escapes_single_run':
        if (eventType === 'run_end' && eventData.critical_escapes >= mission.target) {
          mission.progress = mission.target;
        }
        break;

      case 'avoid_death_cause':
        if (eventType === 'run_end' && eventData.cause !== mission.deathCause && eventData.rings > 0) {
          mission.progress = 1;
        }
        break;

      case 'daily_participate':
        if (eventType === 'run_start' && eventData.mode === 'daily') {
          mission.progress = 1;
        }
        break;

      case 'daily_complete':
        if (eventType === 'daily_complete') {
          mission.progress = 1;
        }
        break;

      case 'sprint_participate':
        if (eventType === 'run_start' && eventData.mode === 'sprint') {
          mission.progress = 1;
        }
        break;

      case 'sprint_complete':
        if (eventType === 'sprint_complete') {
          mission.progress = 1;
        }
        break;

      case 'daily_streak':
        if (eventType === 'daily_streak_updated' && eventData.streak >= mission.target) {
          mission.progress = mission.target;
        }
        break;

      case 'endless_score':
        if (eventType === 'run_end' && eventData.mode === 'endless' && eventData.rings >= mission.target) {
          mission.progress = mission.target;
        }
        break;

      case 'play_all_modes':
        if (eventType === 'modes_played_updated' && eventData.modesPlayed >= 3) {
          mission.progress = 1;
        }
        break;

      case 'sprint_time_under':
        if (eventType === 'sprint_complete' && eventData.time_ms < mission.target) {
          mission.progress = 1;
        }
        break;
    }

    // Handle missions without explicit target (boolean missions)
    const booleanMissionTypes = ['daily_participate', 'sprint_participate', 'avoid_death_cause', 'play_all_modes', 'sprint_time_under'];
    if (booleanMissionTypes.includes(mission.type) && !mission.target) {
      mission.target = 1;
    }

    // Increment progress
    if (shouldIncrement) {
      mission.progress = Math.min(mission.progress + incrementAmount, mission.target);
    }

    // Check completion
    if (!mission.completed && mission.progress >= mission.target) {
      mission.completed = true;
      mission.completedAt = Date.now();
      completed.push(mission);
      console.log(`[Mission] Completed: ${mission.name} (+${mission.reward} XP)`);

      // Step 6: Log mission complete event
      telemetry.logMissionComplete(mission.id, mission.reward);
    }
  }

  return completed;
}

/**
 * Get mission progress percentage
 */
export function getMissionProgressPercent(mission) {
  if (!mission || mission.target === 0) return 0;
  return Math.min(100, Math.round((mission.progress / mission.target) * 100));
}

/**
 * Format mission progress text
 */
export function formatMissionProgress(mission) {
  if (!mission) return '';

  switch (mission.type) {
    case 'survive_time':
      // Convert ms to seconds
      const currentSec = Math.floor(mission.progress / 1000);
      const targetSec = Math.floor(mission.target / 1000);
      return `${currentSec}s / ${targetSec}s`;

    case 'chain_at_least':
      return mission.progress >= mission.target ? 'x' + mission.target : '0 / x' + mission.target;

    default:
      return `${mission.progress} / ${mission.target}`;
  }
}
