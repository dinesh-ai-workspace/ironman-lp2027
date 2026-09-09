'use strict';

const {
  wouldViolateLongSessionAdjacentRule,
  wouldExceedRunWeeklyCap,
  wouldExceedLongRunCeiling,
  wouldExceedBikeCap,
  isTaperWeek,
} = require('./constraints');

const {
  getMaxLongBikeDuration,
  getRunCaps,
  shouldIncludeBrick,
  shouldIncludeLPSpecificBikeWork,
  getSwimFocus,
  getSwimSessionDuration,
  getStepBackMultiplier,
} = require('./progression');

/** Days of the week index: 0 = Monday, 6 = Sunday */
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * Return a YYYY-MM-DD string for weekStartDate (Monday) + offsetDays.
 * Uses UTC arithmetic to avoid DST/local-timezone drift.
 */
function dayDate(weekStartDate, offsetDays) {
  const d = new Date(Date.UTC(
    weekStartDate.getUTCFullYear(),
    weekStartDate.getUTCMonth(),
    weekStartDate.getUTCDate(),
    0, 0, 0, 0
  ));
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Round to nearest multiple of 5, minimum 5.
 */
function roundTo5(n) {
  return Math.max(5, Math.round(n / 5) * 5);
}

/**
 * Apply step-back multiplier to duration, round to nearest 5.
 */
function stepBackDuration(duration, isStepBack) {
  if (!isStepBack) return duration;
  return roundTo5(duration * getStepBackMultiplier());
}

/**
 * Estimate run distance from duration at easy pace (12 min/mile Z2).
 */
function estimateRunDistance(durationMin) {
  return Math.round((durationMin / 12) * 10) / 10;
}

/**
 * Estimate swim distance from duration and phase (km).
 * Foundation: 1.5 km/hr base pace, gradually increasing.
 */
function estimateSwimDistance(durationMin, weekNum) {
  const pace = weekNum <= 8 ? 1.5 : weekNum <= 20 ? 1.8 : weekNum <= 32 ? 2.0 : 2.2;
  return Math.round((durationMin / 60) * pace * 10) / 10;
}

/**
 * Build a session object with all required fields.
 */
function makeSession(date, discipline, type, durationMin, distanceOrNull, zone, isBrick, purpose, importance, notes) {
  return {
    date,
    discipline,
    type,
    target_duration: durationMin,
    target_distance: distanceOrNull,
    target_intensity_zone: zone,
    is_brick: isBrick,
    purpose,
    importance,
    workout_template_id: null,
    notes,
  };
}

/**
 * Schedule a single week of training.
 *
 * @param {Object} config
 * @param {number}  config.weekNum          1-indexed
 * @param {Date}    config.weekStartDate     Always a Monday
 * @param {string}  config.phase            e.g. 'foundation'
 * @param {Array}   config.phaseBlocks      from computePhaseBlocks
 * @param {boolean} config.isStepBack       true if step-back week
 * @param {boolean} config.hasTuneUpRace
 * @param {string|null} config.tuneUpRaceType  'sprint_olympic'|'half_ironman'|null
 * @param {Array}   config.templates        full template library
 * @param {Array}   config.allScheduledSessions  all sessions generated so far
 * @returns {Array} session objects for this week
 */
function scheduleWeek(config) {
  const {
    weekNum,
    weekStartDate,
    phase,
    phaseBlocks,
    isStepBack,
    hasTuneUpRace,
    tuneUpRaceType,
    allScheduledSessions,
  } = config;

  const isTaper = isTaperWeek(weekNum, phaseBlocks);
  const includeBrick = shouldIncludeBrick(weekNum);
  const includeLPBike = shouldIncludeLPSpecificBikeWork(weekNum);
  const swimFocus = getSwimFocus(weekNum);
  const swimDuration = getSwimSessionDuration(weekNum);
  const runCaps = getRunCaps(weekNum);
  const maxBike = getMaxLongBikeDuration(weekNum);
  const sbMult = isStepBack ? getStepBackMultiplier() : 1;

  const sessions = [];
  let weeklyRunMiles = 0;

  // ── Tune-up race week ────────────────────────────────────────────────────
  if (hasTuneUpRace && tuneUpRaceType === 'half_ironman') {
    // HIM race: lighter week, just a short swim Monday, easy jog Wednesday, race Saturday.
    const swimDur = roundTo5(40 * sbMult);
    const swimDist = estimateSwimDistance(swimDur, weekNum);
    sessions.push(makeSession(dayDate(weekStartDate, 1), 'swim', 'technique', swimDur,
      swimDist, 1, false, 'recovery', 'optional',
      'Tune-up HIM race week — short pre-race shake-out swim. estimated_distance:true'));
    sessions.push(makeSession(dayDate(weekStartDate, 2), 'run', 'easy', 20,
      estimateRunDistance(20), 1, false, 'recovery', 'optional',
      'Tune-up HIM race week — easy shake-out run. estimated_distance:true'));
    // Race itself on Saturday
    sessions.push(makeSession(dayDate(weekStartDate, 5), 'race', 'half_ironman_tune_up', 240,
      null, 3, false, 'race', 'key', 'Tune-up Half-Ironman race — race effort'));
    return sessions;
  }

  if (hasTuneUpRace && tuneUpRaceType === 'sprint_olympic') {
    const swimDur = roundTo5(30 * sbMult);
    const swimDist = estimateSwimDistance(swimDur, weekNum);
    sessions.push(makeSession(dayDate(weekStartDate, 1), 'swim', 'technique', swimDur,
      swimDist, 1, false, 'recovery', 'optional',
      'Tune-up race week — pre-race swim. estimated_distance:true'));
    sessions.push(makeSession(dayDate(weekStartDate, 4), 'run', 'easy', 20,
      estimateRunDistance(20), 1, false, 'recovery', 'optional',
      'Tune-up race week — shake-out run. estimated_distance:true'));
    sessions.push(makeSession(dayDate(weekStartDate, 6), 'race', 'sprint_olympic_tune_up', 90,
      null, 3, false, 'race', 'key', 'Tune-up Sprint/Olympic race — race effort'));
    return sessions;
  }

  // ── Taper week logic ─────────────────────────────────────────────────────
  if (isTaper) {
    const taperBlock = phaseBlocks.find(b => b.phase === 'taper');
    const weeksInTaper = taperBlock.weekEnd - taperBlock.weekStart + 1;
    const taperWeekIndex = weekNum - taperBlock.weekStart; // 0-indexed within taper

    // Last taper week = race week
    if (taperWeekIndex === weeksInTaper - 1) {
      // Race week: only pre-race shake-outs + race day (Sunday = index 6)
      const swimDur = 20;
      sessions.push(makeSession(dayDate(weekStartDate, 1), 'swim', 'technique', swimDur,
        estimateSwimDistance(swimDur, weekNum), 1, false, 'race_prep', 'optional',
        'Race week — short shake-out swim. estimated_distance:true'));
      sessions.push(makeSession(dayDate(weekStartDate, 3), 'bike', 'technique_indoor', 20,
        null, 1, false, 'race_prep', 'optional',
        'Race week — short bike spin, race-day preview'));
      sessions.push(makeSession(dayDate(weekStartDate, 4), 'run', 'easy', 20,
        estimateRunDistance(20), 1, false, 'race_prep', 'optional',
        'Race week — short shake-out run. estimated_distance:true'));
      // Race day: Sunday
      sessions.push(makeSession(dayDate(weekStartDate, 6), 'race', 'ironman', 660,
        null, 4, false, 'race', 'key', 'IRONMAN Lake Placid 2027 — race day'));
      return sessions;
    }

    // Non-race taper weeks: reduced volume across all disciplines
    const taperFactor = 1 - (taperWeekIndex + 1) * 0.15; // 85%, 70%, 55% …

    const swDur = roundTo5(Math.min(swimDuration.max, swimDuration.min + 10) * taperFactor);
    const swDist = estimateSwimDistance(swDur, weekNum);
    sessions.push(makeSession(dayDate(weekStartDate, 1), 'swim', 'technique', swDur,
      swDist, 2, false, 'race_prep', 'supporting',
      'Taper swim — maintain feel, reduce volume. estimated_distance:true'));

    const bikeDur = roundTo5(Math.min(maxBike * taperFactor, 180));
    sessions.push(makeSession(dayDate(weekStartDate, 3), 'bike', 'endurance_z2', bikeDur,
      null, 2, false, 'aerobic_base', 'supporting',
      'Taper bike — reduced volume, race-pace efforts'));

    const swDur2 = roundTo5(swDur * 0.85);
    sessions.push(makeSession(dayDate(weekStartDate, 4), 'swim', 'endurance', swDur2,
      estimateSwimDistance(swDur2, weekNum), 2, false, 'race_prep', 'optional',
      'Taper swim — second session. estimated_distance:true'));

    const runDur = roundTo5(Math.min(60 * taperFactor, 45));
    const runDist = estimateRunDistance(runDur);
    const capOk = !wouldExceedRunWeeklyCap(weekNum, weeklyRunMiles, runDist);
    if (capOk) {
      weeklyRunMiles += runDist;
      sessions.push(makeSession(dayDate(weekStartDate, 5), 'run', 'easy', runDur,
        runDist, 2, false, 'aerobic_base', 'supporting',
        'Taper run — easy Z2, stay sharp. estimated_distance:true'));
    }

    return sessions;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NORMAL WEEK SCHEDULING
  // Typical layout:
  //   Mon=REST, Tue=swim, Wed=bike+optional_strength, Thu=run,
  //   Fri=swim+optional_strength, Sat=long_bike, Sun=long_run (or brick_run)
  // ─────────────────────────────────────────────────────────────────────────

  // Tuesday: Swim (technique early, then aerobic intervals)
  const swDurTue = roundTo5(
    (swimFocus === 'technique'
      ? swimDuration.min
      : (swimDuration.min + swimDuration.max) / 2) * sbMult
  );
  sessions.push(makeSession(
    dayDate(weekStartDate, 1), // Tuesday
    'swim',
    swimFocus === 'technique' ? 'technique' : 'aerobic_intervals',
    swDurTue,
    estimateSwimDistance(swDurTue, weekNum),
    swimFocus === 'technique' ? 1 : 2,
    false,
    swimFocus,
    'supporting',
    `Swim focus: ${swimFocus}. estimated_distance:true`
  ));

  // Wednesday: Bike (endurance or hill climbing)
  const bikeType = includeLPBike ? 'hill_climbing' : (phase === 'foundation' ? 'technique_indoor' : 'endurance_z2');
  const bikeBaseDur = phase === 'foundation' ? 75 : (weekNum <= 16 ? 90 : weekNum <= 24 ? 105 : 120);
  const bikeDurWed = roundTo5(Math.min(bikeBaseDur * sbMult, getMaxLongBikeDuration(weekNum)));
  sessions.push(makeSession(
    dayDate(weekStartDate, 2), // Wednesday
    'bike',
    bikeType,
    bikeDurWed,
    null,
    includeLPBike ? 3 : 2,
    false,
    includeLPBike ? 'strength_endurance' : 'aerobic_base',
    'supporting',
    weekNum >= 18 && weekNum <= 20 ? 'Tune-up race window this week — see race notes' : ''
  ));

  // Wednesday: Optional strength (same day)
  if (!isStepBack) {
    const strType = phase === 'foundation' ? 'foundation_strength' : 'in_season_maintenance';
    sessions.push(makeSession(
      dayDate(weekStartDate, 2),
      'strength',
      strType,
      phase === 'foundation' ? 50 : 35,
      null,
      2,
      false,
      phase === 'foundation' ? 'stability' : 'maintenance',
      'optional',
      'Same day as bike — do after aerobic session'
    ));
  }

  // Thursday: Run (easy)
  const runDurThu = roundTo5((phase === 'foundation' ? 35 : weekNum <= 20 ? 40 : 45) * sbMult);
  const runDistThu = estimateRunDistance(runDurThu);
  if (!wouldExceedRunWeeklyCap(weekNum, weeklyRunMiles, runDistThu)) {
    weeklyRunMiles += runDistThu;
    sessions.push(makeSession(
      dayDate(weekStartDate, 3), // Thursday
      'run',
      'easy',
      runDurThu,
      runDistThu,
      2,
      false,
      'aerobic_base',
      'supporting',
      'Easy Z2 run. estimated_distance:true'
    ));
  }

  // Friday: Swim (aerobic or endurance)
  const swDurFri = roundTo5(
    ((swimDuration.min + swimDuration.max) / 2) * sbMult
  );
  sessions.push(makeSession(
    dayDate(weekStartDate, 4), // Friday
    'swim',
    swimFocus === 'technique' ? 'technique' : (swimFocus === 'race_ready' ? 'endurance' : 'aerobic_intervals'),
    swDurFri,
    estimateSwimDistance(swDurFri, weekNum),
    2,
    false,
    swimFocus,
    'supporting',
    `Second swim — ${swimFocus}. estimated_distance:true`
  ));

  // Friday: Optional strength (same day)
  if (!isStepBack) {
    const strType = phase === 'foundation' ? 'foundation_strength' : 'in_season_maintenance';
    sessions.push(makeSession(
      dayDate(weekStartDate, 4),
      'strength',
      strType,
      phase === 'foundation' ? 50 : 35,
      null,
      2,
      false,
      phase === 'foundation' ? 'stability' : 'maintenance',
      'optional',
      'Same day as swim — keep volume in check'
    ));
  }

  // Saturday: Long Bike
  // Determine max allowed duration from ramp table (capped at 360min regardless).
  const longBikeMax = Math.min(360, getMaxLongBikeDuration(weekNum));

  // Determine simulation ride window: last 2 non-taper weeks of the peak block.
  // These are the weeks where a 5.5-6hr ride is planned (once only).
  const peakBlock = phaseBlocks.find(b => b.phase === 'peak');
  const simRideWeeks = peakBlock
    ? [peakBlock.weekEnd - 1, peakBlock.weekEnd]
    : [38, 39];

  const allBikeSessions = allScheduledSessions
    .filter(s => s.discipline === 'bike')
    .map(s => ({ weekNum: s._weekNum, durationMin: s.target_duration, type: s.type }));

  // Check if a simulation ride has already been placed (durationMin >= 330).
  const simRideAlreadyPlaced = allBikeSessions.some(s => s.durationMin >= 330);

  // Is this week the simulation ride week?
  const isSimRideWeek = simRideWeeks.includes(weekNum) && !simRideAlreadyPlaced && !isStepBack;

  // Determine target long bike duration.
  let longBikeDur;
  if (isSimRideWeek) {
    longBikeDur = 330; // 5.5hr minimum simulation ride
  } else {
    // Scale within ramp ceiling; gradually climb from 60% of max to max over the plan.
    const longBikeBase = Math.min(
      longBikeMax,
      Math.max(90, Math.round(longBikeMax * Math.min(1, 0.6 + weekNum * 0.012)))
    );
    longBikeDur = roundTo5(longBikeBase * sbMult);
    // Never exceed 320min unless in sim-ride window (keep rides sub-sim-ride).
    if (!simRideWeeks.includes(weekNum) || simRideAlreadyPlaced) {
      longBikeDur = Math.min(longBikeDur, 320);
    }
  }
  longBikeDur = roundTo5(longBikeDur * (isSimRideWeek ? 1 : 1)); // already scaled above

  // Determine bike session type
  let satBikeType = isSimRideWeek ? 'race_simulation' : 'long_ride';
  let satBikePurpose = isSimRideWeek ? 'race_prep' : 'endurance';
  let satBikeImportance = 'key';
  let satBikeNotes = isSimRideWeek
    ? 'LP terrain simulation ride — 5.5-6hr, race pacing, full fueling protocol'
    : 'Long ride — fueling practice (60-70g carbs/hr)';

  // Tune-up race window notes
  const himBlock = phaseBlocks.find(b => b.phase === 'build') || {};
  const himWindowStart = himBlock.weekStart ? himBlock.weekStart + 2 : 30;
  const himWindowEnd   = himBlock.weekStart ? himBlock.weekStart + 6 : 34;
  if (weekNum >= himWindowStart && weekNum <= himWindowEnd) {
    satBikeNotes += ' | Half-Ironman tune-up race window';
  } else if (weekNum >= 16 && weekNum <= 20) {
    satBikeNotes += ' | Sprint/Olympic tune-up race window (weeks 16-20)';
  }

  const satBikeDateStr = dayDate(weekStartDate, 5); // Saturday

  sessions.push(makeSession(
    satBikeDateStr,
    'bike',
    satBikeType,
    longBikeDur,
    null,
    2,
    false,
    satBikePurpose,
    satBikeImportance,
    satBikeNotes
  ));

  // Sunday: Long Run or Brick Run
  // The spec says "long bike and long run never on consecutive days."
  // Sat long bike + Sun long run = consecutive days = NOT allowed by strict reading.
  // Therefore: if we place the long ride on Saturday, place the long run on Thursday instead
  // (but we already placed an easy run Thursday).
  // Classic approach: keep long bike Saturday, move long run to FRIDAY or keep Sunday
  // but with the understanding the spec means literally Sat→Sun is consecutive and violates.
  //
  // Resolution: Place long run on a day that is NOT consecutive with Saturday.
  // Option: Long run on Thursday (swap Thu easy run for long run).
  // This keeps them 2 days apart (Sat→Thu = not consecutive).
  //
  // We'll use: long ride Saturday, long run Thursday (replace easy run on Thu).
  // Remove the easy Thursday run we added above and replace with long run.

  // Remove the Thursday easy run if we added it
  const thuIdx = sessions.findIndex(s => s.date === dayDate(weekStartDate, 3) && s.discipline === 'run');
  if (thuIdx !== -1) {
    sessions.splice(thuIdx, 1);
    weeklyRunMiles -= runDistThu;
  }

  // Long run on Thursday
  const { longRunCapMi, longRunCapMin } = runCaps;
  let longRunBase = weekNum <= 8 ? 60 : weekNum <= 16 ? 75 : weekNum <= 24 ? 90 : weekNum <= 32 ? 105 : 120;
  let longRunDur = roundTo5(Math.min(longRunBase, longRunCapMin) * sbMult);
  let longRunDist = estimateRunDistance(longRunDur);

  // Enforce ceiling
  if (wouldExceedLongRunCeiling(longRunDur, longRunDist)) {
    longRunDur = Math.min(longRunDur, longRunCapMin);
    longRunDist = Math.min(longRunDist, longRunCapMi);
  }

  // Enforce weekly cap
  if (wouldExceedRunWeeklyCap(weekNum, weeklyRunMiles, longRunDist)) {
    const remaining = (weekNum <= 8 ? 18 : 25) - weeklyRunMiles;
    longRunDist = Math.max(0, remaining - 0.1);
    longRunDur = roundTo5(longRunDist * 12);
  }

  if (longRunDur > 0) {
    weeklyRunMiles += longRunDist;
    const longRunSession = makeSession(
      dayDate(weekStartDate, 3), // Thursday
      'run',
      'long_run',
      longRunDur,
      longRunDist,
      2,
      false,
      'endurance',
      'key',
      'Long run — Z2 durability focus. estimated_distance:true'
    );
    sessions.push(longRunSession);
  }

  // Sunday: Brick run (if applicable) or easy run
  if (includeBrick && !isStepBack) {
    const brickBikeDur = roundTo5(Math.min(getMaxLongBikeDuration(weekNum) * 0.75, 180));
    // The brick bike is placed on Sunday, then the brick run immediately after (same day).
    sessions.push(makeSession(
      dayDate(weekStartDate, 6), // Sunday
      'bike',
      'endurance_z2',
      brickBikeDur,
      null,
      2,
      true,
      'brick_transition',
      'key',
      'Brick bike — transition practice'
    ));
    const brickRunDur = roundTo5(25 + weekNum * 0.3);
    const brickRunDist = estimateRunDistance(brickRunDur);
    if (!wouldExceedRunWeeklyCap(weekNum, weeklyRunMiles, brickRunDist)) {
      weeklyRunMiles += brickRunDist;
      sessions.push(makeSession(
        dayDate(weekStartDate, 6),
        'run',
        'brick_run',
        brickRunDur,
        brickRunDist,
        2,
        true,
        'brick_transition',
        'key',
        'Brick run off bike — T2 practice, Z2 effort. estimated_distance:true'
      ));
    }
  } else {
    // Sunday easy recovery run
    const recRunDur = roundTo5((phase === 'foundation' ? 30 : 35) * sbMult);
    const recRunDist = estimateRunDistance(recRunDur);
    if (!wouldExceedRunWeeklyCap(weekNum, weeklyRunMiles, recRunDist) && !isStepBack) {
      weeklyRunMiles += recRunDist;
      sessions.push(makeSession(
        dayDate(weekStartDate, 6), // Sunday
        'run',
        'recovery',
        recRunDur,
        recRunDist,
        1,
        false,
        'recovery',
        'optional',
        'Easy recovery run, Sunday. estimated_distance:true'
      ));
    }
  }

  // Verify long bike and long run are not on consecutive days.
  // Long bike = Saturday (index 5). Long run = Thursday (index 3). That's 2 days apart — OK.
  // But let's verify with the constraint function using already-scheduled sessions + new sessions.
  // If any violation would occur, drop the long run (since it's the secondary session).
  const allSoFar = [...allScheduledSessions, ...sessions];
  const longBikeSession = sessions.find(s => s.discipline === 'bike' && s.type === 'long_ride' || (s.discipline === 'bike' && s.type === 'race_simulation'));
  const longRunSession2 = sessions.find(s => s.discipline === 'run' && s.type === 'long_run');
  if (longBikeSession && longRunSession2) {
    if (wouldViolateLongSessionAdjacentRule(
      allSoFar.filter(s => s !== longRunSession2),
      longRunSession2
    )) {
      // Move long run 1 day earlier (Wednesday)
      const origIdx = sessions.indexOf(longRunSession2);
      sessions[origIdx] = { ...longRunSession2, date: dayDate(weekStartDate, 2) };
    }
  }

  return sessions;
}

module.exports = { scheduleWeek };
