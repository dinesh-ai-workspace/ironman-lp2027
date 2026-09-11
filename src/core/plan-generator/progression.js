'use strict';

const { interpolateBikeMax } = require('./constraints');

/**
 * Pure functions for per-discipline progression logic.
 * No I/O, no side effects.
 */

/**
 * Returns the maximum long-bike duration (minutes) for the given week.
 * Uses the BIKE_RAMP_TABLE with linear interpolation.
 *
 * @param {number} weekNum
 * @returns {number}
 */
function getMaxLongBikeDuration(weekNum) {
  return interpolateBikeMax(weekNum);
}

/**
 * Returns run caps for the given week.
 *
 * @param {number} weekNum
 * @returns {{ weeklyCapMi: number, longRunCapMi: number, longRunCapMin: number }}
 */
function getRunCaps(weekNum) {
  if (weekNum <= 8) {
    return { weeklyCapMi: 18, longRunCapMi: 12, longRunCapMin: 120 };
  }
  return { weeklyCapMi: 25, longRunCapMi: 16, longRunCapMin: 150 };
}

/**
 * Returns true if a brick session should be included this week.
 *
 * Schedule:
 * - weeks 1-12:  no bricks
 * - weeks 13-24: every 2 weeks (odd weeks in that range: 13,15,17,19,21,23)
 * - weeks 25-38: every week
 * - weeks 39+:   no bricks (tapering off)
 *
 * @param {number} weekNum
 * @returns {boolean}
 */
function shouldIncludeBrick(weekNum) {
  if (weekNum <= 12) return false;
  if (weekNum >= 39) return false;
  if (weekNum <= 24) return weekNum % 2 === 1; // odd weeks = 13, 15, 17 …
  return true; // weeks 25-38
}

/**
 * Returns true if this week should include Lake Placid-specific bike work
 * (low-cadence torque sets, hill climbing). Introduced from week 12 onward.
 *
 * @param {number} weekNum
 * @returns {boolean}
 */
function shouldIncludeLPSpecificBikeWork(weekNum) {
  return weekNum >= 12;
}

/**
 * Returns the LP-specific bike session type for the given week.
 * Weeks 12-15: cadence and terrain work.
 * Weeks 16+: hill climbing focus.
 *
 * @param {number} weekNum
 * @returns {'cadence_and_terrain'|'hill_climbing'}
 */
function getLPBikeType(weekNum) {
  if (weekNum < 16) return 'cadence_and_terrain'
  return 'hill_climbing'
}

/**
 * Returns the swim focus descriptor for the given week.
 *
 * @param {number} weekNum
 * @returns {'technique'|'aerobic_build'|'endurance'|'race_ready'}
 */
function getSwimFocus(weekNum) {
  if (weekNum <= 8)  return 'technique';
  if (weekNum <= 20) return 'aerobic_build';
  if (weekNum <= 32) return 'endurance';
  return 'race_ready';
}

/**
 * Returns the target swim session duration range (in minutes) for the given week.
 * Progresses from short foundation sessions to longer race-prep ones.
 *
 * @param {number} weekNum
 * @returns {{ min: number, max: number }}
 */
function getSwimSessionDuration(weekNum) {
  if (weekNum <= 8)  return { min: 30, max: 45 };
  if (weekNum <= 16) return { min: 40, max: 55 };
  if (weekNum <= 24) return { min: 50, max: 65 };
  if (weekNum <= 32) return { min: 55, max: 75 };
  return { min: 60, max: 90 };
}

/**
 * Returns min/max session targets per discipline for the week's phase.
 *
 * @param {string} phase
 * @returns {{ swim: {min,max}, bike: {min,max}, run: {min,max}, strength: {min,max} }}
 */
function getWeeklySessionTargets(phase) {
  // These numbers are consistent across phases; individual scheduler may tighten.
  return {
    swim:     { min: 2, max: 3 },
    bike:     { min: 2, max: 4 },
    run:      { min: 2, max: 3 },
    strength: { min: 1, max: 2 },
  };
}

/**
 * Returns the volume multiplier for step-back weeks.
 * Reduce to approximately 70% of the week's normal volume.
 *
 * @returns {number}
 */
function getStepBackMultiplier() {
  return 0.7;
}

module.exports = {
  getMaxLongBikeDuration,
  getRunCaps,
  shouldIncludeBrick,
  shouldIncludeLPSpecificBikeWork,
  getLPBikeType,
  getSwimFocus,
  getSwimSessionDuration,
  getWeeklySessionTargets,
  getStepBackMultiplier,
};
