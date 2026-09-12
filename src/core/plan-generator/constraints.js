'use strict';

/**
 * Pure constraint validator functions — no I/O.
 */

/**
 * Ramp table: max long-ride duration (minutes) by week number.
 * Used by getMaxLongBikeDuration (progression.js) and wouldExceedBikeCap.
 * Week 39 = simulation ride (345 min). Week 40 = step-back recovery. Week 41 = unwind (120 min).
 */
const BIKE_RAMP_TABLE = {
  1:  23,
  4:  90,
  8:  120,
  12: 150,
  16: 180,
  20: 210,
  24: 240,
  32: 285,
  34: 300,
  36: 315,
  39: 345,
  41: 120,
};

/**
 * Ramp table: max long-run duration (minutes) by week number.
 * Caps at 150 min from week 24 onward.
 */
const RUN_RAMP_TABLE = {
  1:  60,
  4:  73,
  8:  90,
  12: 105,
  16: 120,
  20: 135,
  24: 150,
  39: 150,
};

/**
 * Generic linear interpolation over an integer-keyed ramp table.
 */
function interpolateTable(table, weekNum) {
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  if (weekNum <= keys[0]) return table[keys[0]];
  if (weekNum >= keys[keys.length - 1]) return table[keys[keys.length - 1]];
  let lower = keys[0];
  let upper = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) {
    if (keys[i] <= weekNum && weekNum <= keys[i + 1]) {
      lower = keys[i];
      upper = keys[i + 1];
      break;
    }
  }
  const t = (weekNum - lower) / (upper - lower);
  return Math.round(table[lower] + t * (table[upper] - table[lower]));
}

/**
 * Linearly interpolate the maximum long-bike duration for a given week.
 */
function interpolateBikeMax(weekNum) {
  return interpolateTable(BIKE_RAMP_TABLE, weekNum);
}

/**
 * Linearly interpolate the maximum long-run duration for a given week.
 */
function interpolateRunMax(weekNum) {
  return interpolateTable(RUN_RAMP_TABLE, weekNum);
}

/**
 * Returns true if the two date strings (YYYY-MM-DD) differ by exactly 1 day.
 * @param {string} dateStr1
 * @param {string} dateStr2
 * @returns {boolean}
 */
function isConsecutiveDays(dateStr1, dateStr2) {
  const d1 = new Date(dateStr1 + 'T00:00:00Z');
  const d2 = new Date(dateStr2 + 'T00:00:00Z');
  const diff = Math.abs(d2.getTime() - d1.getTime());
  return diff === 24 * 60 * 60 * 1000;
}

/**
 * Returns true if adding newSession would violate the rule:
 * "Long bike and long run must never be on consecutive days."
 *
 * Only bike↔run adjacency is checked; swim↔run etc. are fine.
 *
 * @param {Array<{date:string, discipline:string, type:string}>} sessions
 * @param {{date:string, discipline:string, type:string}} newSession
 * @returns {boolean}
 */
function wouldViolateLongSessionAdjacentRule(sessions, newSession) {
  const isLongBike = (s) => s.discipline === 'bike' && s.type === 'long_ride';
  const isLongRun  = (s) => s.discipline === 'run'  && s.type === 'long_run';

  const newIsLongBike = isLongBike(newSession);
  const newIsLongRun  = isLongRun(newSession);

  if (!newIsLongBike && !newIsLongRun) return false;

  for (const s of sessions) {
    if (newIsLongBike && isLongRun(s) && isConsecutiveDays(newSession.date, s.date)) {
      return true;
    }
    if (newIsLongRun && isLongBike(s) && isConsecutiveDays(newSession.date, s.date)) {
      return true;
    }
  }

  return false;
}

/**
 * Returns true if adding additionalMiles would push this week's run total over the cap.
 *
 * Caps: weeks 1-8 → 18 mi/week; weeks 9+ → 25 mi/week.
 *
 * @param {number} weekNum  1-indexed
 * @param {number} currentWeeklyRunMiles
 * @param {number} additionalMiles
 * @returns {boolean}
 */
function wouldExceedRunWeeklyCap(weekNum, currentWeeklyRunMiles, additionalMiles) {
  const cap = weekNum <= 8 ? 18 : 25;
  return (currentWeeklyRunMiles + additionalMiles) > cap;
}

/**
 * Returns true if this long run exceeds the ceiling.
 * Ceiling: 16 mi OR 150 minutes, whichever comes first (strictly greater than).
 *
 * @param {number} durationMin  Session duration in minutes.
 * @param {number} distanceMi   Session distance in miles.
 * @returns {boolean}
 */
function wouldExceedLongRunCeiling(durationMin, distanceMi) {
  return distanceMi > 16 || durationMin > 150;
}

/**
 * Returns true if this bike session would exceed the allowable cap.
 *
 * Rules:
 * - Max bike duration at any week is determined by interpolating BIKE_RAMP_TABLE.
 *   Sessions strictly greater than maxAllowed violate the ramp ceiling.
 * - One 5.5-6hr (330-360 min) ride is allowed at weeks 38-39 ONLY, and never repeated.
 *   This is checked separately from the ramp ceiling:
 *   - At week 38 or 39, a session of 330-360min is allowed only if no such session exists yet.
 *   - At week 38 or 39, a second session of >= 330min is a violation.
 *   - Outside weeks 38-39, a session of >= 330min that would also exceed the ramp ceiling
 *     is caught by the ramp check above. But at week 36 (ramp = 330), exactly 330min is
 *     allowed by the ramp (not a simulation ride, just a long ride at its ceiling).
 *
 * @param {number} durationMin
 * @param {number} weekNum
 * @param {Array<{weekNum:number, durationMin:number, type:string}>} allBikeSessions
 * @returns {boolean}
 */
function wouldExceedBikeCap(durationMin, weekNum, allBikeSessions) {
  const maxAllowed = interpolateBikeMax(weekNum);

  // Strictly exceeds the ramp ceiling — always a violation regardless of week.
  if (durationMin > maxAllowed) return true;

  // Simulation-ride restriction: only one 330+ min ride is allowed, and only at week 39.
  // Weeks 37-38 interpolate toward 345 but are capped at 325 by the scheduler.
  if (weekNum >= 37 && durationMin >= 330) {
    if (weekNum !== 39) return true;
    const existingSimRide = allBikeSessions.some(s => s.durationMin >= 330);
    if (existingSimRide) return true;
  }

  return false;
}

/**
 * Returns true if the given week number is a step-back week.
 * Step-back = every 4th week (weekNum % 4 === 0).
 *
 * @param {number} weekNum
 * @returns {boolean}
 */
function isStepBackWeek(weekNum) {
  return weekNum % 4 === 0;
}

/**
 * Returns true if the given week falls within a taper phase block.
 *
 * @param {number} weekNum
 * @param {Array<{phase:string, weekStart:number, weekEnd:number}>} phaseBlocks
 * @returns {boolean}
 */
function isTaperWeek(weekNum, phaseBlocks) {
  const taperBlock = phaseBlocks.find(b => b.phase === 'taper');
  if (!taperBlock) return false;
  return weekNum >= taperBlock.weekStart && weekNum <= taperBlock.weekEnd;
}

module.exports = {
  isConsecutiveDays,
  wouldViolateLongSessionAdjacentRule,
  wouldExceedRunWeeklyCap,
  wouldExceedLongRunCeiling,
  wouldExceedBikeCap,
  isStepBackWeek,
  isTaperWeek,
  BIKE_RAMP_TABLE,
  RUN_RAMP_TABLE,
  interpolateBikeMax,
  interpolateRunMax,
};
