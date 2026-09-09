'use strict';

/**
 * Pure functions for sleep debt tier evaluation.
 * No I/O, no side effects.
 */

/**
 * Returns true if a single wellness entry represents poor sleep.
 * Poor = sleep_hours < 6 OR sleep_quality_1_5 <= 2.
 *
 * @param {{ sleep_hours: number, sleep_quality_1_5: number }} wellnessEntry
 * @returns {boolean}
 */
function isSleepPoor(wellnessEntry) {
  if (wellnessEntry == null) return false;
  return (
    (wellnessEntry.sleep_hours != null && wellnessEntry.sleep_hours < 6) ||
    (wellnessEntry.sleep_quality_1_5 != null && wellnessEntry.sleep_quality_1_5 <= 2)
  );
}

/**
 * Evaluate sleep debt tier from rolling history plus today's entry.
 *
 * Tier hierarchy (highest priority first):
 *   SEVERE  — 4+ poor nights in last 7 days AND pain_flag = true
 *   AMBER   — 4+ poor nights in last 7 days, no pain
 *   REDUCE  — last 2 consecutive entries are both poor
 *   CAUTION — today is poor but previous night was OK
 *   OK      — otherwise
 *
 * @param {Array}  wellnessHistory  Daily wellness rows (most recent LAST).
 * @param {Object} todayWellness    Today's wellness entry.
 * @returns {'OK'|'CAUTION'|'REDUCE'|'AMBER'|'SEVERE'}
 */
function evaluateSleepTier(wellnessHistory, todayWellness) {
  // Build a combined window of up to the last 7 days (history + today).
  const historyLast7 = wellnessHistory.slice(-6); // up to 6 from history
  const window7 = [...historyLast7, todayWellness].filter(Boolean);

  // Count poor nights in the 7-day window.
  const poorInWindow = window7.filter(isSleepPoor).length;

  // Check pain flag (today or any recent).
  const painFlagged = window7.some(e => e && e.pain_flag);

  // SEVERE: 4+ poor nights in 7-day window AND pain
  if (poorInWindow >= 4 && painFlagged) return 'SEVERE';

  // AMBER: 4+ poor nights in 7-day window (no pain required here for AMBER)
  if (poorInWindow >= 4) return 'AMBER';

  // REDUCE: last 2 entries (history[-1] and today) are both poor
  const lastHistoryEntry = wellnessHistory.length > 0
    ? wellnessHistory[wellnessHistory.length - 1]
    : null;
  if (isSleepPoor(todayWellness) && isSleepPoor(lastHistoryEntry)) return 'REDUCE';

  // CAUTION: today is poor but previous night was OK (or no history)
  if (isSleepPoor(todayWellness)) return 'CAUTION';

  return 'OK';
}

/**
 * Given a sleep tier and a planned session, return an adjustment recommendation.
 *
 * @param {'OK'|'CAUTION'|'REDUCE'|'AMBER'|'SEVERE'} sleepTier
 * @param {{ target_duration: number, target_intensity_zone: number, importance: string, type: string }} session
 * @returns {{ action: string, reason: string, recommended_duration: number, recommended_intensity: number }}
 */
function getSessionRecommendation(sleepTier, session) {
  const { target_duration, target_intensity_zone, importance } = session;

  switch (sleepTier) {
    case 'OK':
      return {
        action: 'proceed',
        reason: 'Sleep is adequate. No adjustments needed.',
        recommended_duration: target_duration,
        recommended_intensity: target_intensity_zone,
      };

    case 'CAUTION':
      if (target_intensity_zone >= 4) {
        return {
          action: 'reduce_intensity',
          reason: 'One poor night of sleep. High-intensity session reduced to Z2.',
          recommended_duration: target_duration,
          recommended_intensity: 2,
        };
      }
      return {
        action: 'proceed',
        reason: 'One poor night of sleep. Low-intensity session can proceed.',
        recommended_duration: target_duration,
        recommended_intensity: target_intensity_zone,
      };

    case 'REDUCE': {
      if (importance === 'optional') {
        return {
          action: 'skip',
          reason: 'Two consecutive poor nights. Optional session skipped.',
          recommended_duration: 0,
          recommended_intensity: 1,
        };
      }
      const reducedDuration = Math.round(target_duration * 0.8);
      const reducedIntensity = Math.max(1, target_intensity_zone - 1);
      return {
        action: 'reduce_volume',
        reason: 'Two consecutive poor nights. Reducing both volume and intensity by ~20%.',
        recommended_duration: reducedDuration,
        recommended_intensity: reducedIntensity,
      };
    }

    case 'AMBER': {
      if (importance === 'optional') {
        return {
          action: 'skip',
          reason: 'Persistent sleep debt (4+ poor nights). Optional session skipped.',
          recommended_duration: 0,
          recommended_intensity: 1,
        };
      }
      const ambDuration = Math.round(target_duration * 0.8);
      const ambIntensity = Math.max(1, Math.round(target_intensity_zone * 0.8));
      return {
        action: 'hold',
        reason: 'Persistent sleep debt. Key/supporting session held at 80% volume and intensity.',
        recommended_duration: ambDuration,
        recommended_intensity: ambIntensity,
      };
    }

    case 'SEVERE':
      return {
        action: 'recover',
        reason: 'Severe sleep debt combined with pain flag. Replace all sessions with Z1 or rest.',
        recommended_duration: Math.min(30, target_duration),
        recommended_intensity: 1,
      };

    default:
      return {
        action: 'proceed',
        reason: 'Unknown sleep tier — defaulting to proceed.',
        recommended_duration: target_duration,
        recommended_intensity: target_intensity_zone,
      };
  }
}

module.exports = { isSleepPoor, evaluateSleepTier, getSessionRecommendation };
