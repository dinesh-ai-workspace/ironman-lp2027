'use strict';

/**
 * Pure constraint validator functions — no I/O.
 */

/**
 * Ramp table: max long-ride duration (minutes) by week number.
 * Used by getMaxLongBikeDuration (progression.js) and wouldExceedBikeCap.
 *
 * Bridged progression — no week-over-week jump exceeds 45 min (0.75hr).
 * Weeks 34 & 37 are specificity weeks: total weekly hours stay flat,
 * discipline mix shifts toward bike (swim/run reallocated, not dropped).
 * Weeks 35 & 38 are manual recovery weeks following each specificity block.
 * Week 40 = step-back (every-4th formula). Week 41 = taper unwind (120 min).
 */
const BIKE_RAMP_TABLE = {
  1:  23,
  4:  90,   // 1.5 hr
  8:  120,  // 2.0 hr
  12: 150,  // 2.5 hr
  16: 180,  // 3.0 hr
  20: 195,  // 3.25 hr (bridged — was 3.5)
  24: 225,  // 3.75 hr (bridged — was 4.0)
  28: 240,  // 4.0 hr
  30: 255,  // 4.25 hr
  32: 270,  // 4.5 hr
  34: 300,  // 5.0 hr — specificity week (Build phase)
  35: 195,  // 3.25 hr — recovery week post-specificity
  36: 255,  // 4.25 hr — LP climbing specificity
  37: 315,  // 5.25 hr — specificity week, final big exposure (Peak phase)
  38: 180,  // 3.0 hr — recovery week post-specificity
  39: 270,  // 4.5 hr — final race-specific stimulus
  41: 120,  // taper unwind
};

/**
 * Weeks where bike volume is deliberately elevated and swim/run are reallocated
 * (not added) to keep total weekly hours flat. The long ride is the primary purpose
 * of the week; do not flag these as errors in any volume-ratio check.
 */
const SPECIFICITY_BIKE_WEEKS = [34, 37];

/**
 * Manual recovery weeks that follow each specificity block.
 * These are NOT step-back weeks by the every-4th formula, but the
 * BIKE_RAMP_TABLE already caps the long ride accordingly.
 */
const BIKE_RECOVERY_WEEKS = [35, 38];

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
 * The ramp ceiling is the sole constraint — max duration at any week is
 * determined by interpolating BIKE_RAMP_TABLE. The previous 330+min
 * simulation-ride guard is removed: the new bridged progression peaks at
 * 315 min (week 37), so no ride reaches 330 min.
 *
 * @param {number} durationMin
 * @param {number} weekNum
 * @returns {boolean}
 */
function wouldExceedBikeCap(durationMin, weekNum) {
  const maxAllowed = interpolateBikeMax(weekNum);
  return durationMin > maxAllowed;
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
  SPECIFICITY_BIKE_WEEKS,
  BIKE_RECOVERY_WEEKS,
  interpolateBikeMax,
  interpolateRunMax,
};
