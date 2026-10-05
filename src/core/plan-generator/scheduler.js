'use strict';

const {
  wouldViolateLongSessionAdjacentRule,
  wouldExceedRunWeeklyCap,
  wouldExceedLongRunCeiling,
  wouldExceedBikeCap,
  isTaperWeek,
  SPECIFICITY_BIKE_WEEKS,
  BIKE_RECOVERY_WEEKS,
} = require('./constraints');

const {
  getMaxLongBikeDuration,
  getMaxLongRunDuration,
  getRunCaps,
  shouldIncludeLPSpecificBikeWork,
  getLPBikeType,
  getSwimFocus,
  getSwimSessionDuration,
  getStepBackMultiplier,
} = require('./progression');

/** Days of the week index: 0 = Monday, 6 = Sunday */
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

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

function roundTo5(n) {
  return Math.max(5, Math.round(n / 5) * 5);
}

function stepBackDuration(duration, isStepBack, weekNum) {
  if (!isStepBack) return duration;
  return roundTo5(duration * getStepBackMultiplier(weekNum));
}

function estimateRunDistance(durationMin) {
  return Math.round((durationMin / 12) * 10) / 10;
}

function estimateSwimDistance(durationMin, weekNum) {
  const pace = weekNum <= 8 ? 1.5 : weekNum <= 20 ? 1.8 : weekNum <= 32 ? 2.0 : 2.2;
  return Math.round((durationMin / 60) * pace * 10) / 10;
}

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

// Returns UTC day-of-week: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
function getDOW(dateStr) {
  return new Date(dateStr + 'T00:00:00Z').getUTCDay();
}

/**
 * Enforce the 14-hour weekly cap.  Trim order: (a) remove strength, (b) cut
 * Wed bike to 90 min, (c) cut Thu medium run to 50 min [A weeks only],
 * (d) cut Tue easy run to 20 min.  KEY sessions and swims are never touched.
 * For Wk 38 the dress-rehearsal sessions (race_simulation type) are excluded
 * from the cap calculation.  If still over after (a)–(d), a violation is
 * returned instead of silently passing.
 */
const CAP_MIN = 840; // 14 h × 60

function enforceWeeklyCap(weekNum, sessions, abType) {
  function isDR(s) { return s.type === 'race_simulation'; }
  function countable(slist) {
    const list = weekNum === 38 ? slist.filter(s => !isDR(s)) : slist;
    return list.reduce((acc, s) => acc + s.target_duration, 0);
  }

  if (countable(sessions) <= CAP_MIN) return { sessions, violations: [] };

  let work = [...sessions];

  // (a) remove strength
  work = work.filter(s => s.discipline !== 'strength');
  if (countable(work) <= CAP_MIN) return { sessions: work, violations: [] };

  // (b) cut Wed bike (non-KEY) to 90 min
  work = work.map(s =>
    s.discipline === 'bike' && s.importance !== 'key' && getDOW(s.date) === 3
      ? { ...s, target_duration: Math.min(s.target_duration, 90) }
      : s
  );
  if (countable(work) <= CAP_MIN) return { sessions: work, violations: [] };

  // (c) cut Thu medium run (non-KEY) to 50 min — A weeks only
  if (abType === 'A') {
    work = work.map(s =>
      s.discipline === 'run' && s.importance !== 'key' && getDOW(s.date) === 4
        ? { ...s, target_duration: Math.min(s.target_duration, 50) }
        : s
    );
    if (countable(work) <= CAP_MIN) return { sessions: work, violations: [] };
  }

  // (d) cut Tue easy run (non-KEY) to 20 min
  work = work.map(s =>
    s.discipline === 'run' && s.importance !== 'key' && getDOW(s.date) === 2
      ? { ...s, target_duration: Math.min(s.target_duration, 20) }
      : s
  );
  if (countable(work) <= CAP_MIN) return { sessions: work, violations: [] };

  const over = countable(work);
  return {
    sessions: work,
    violations: [`Week ${weekNum}: ${(over / 60).toFixed(1)}h exceeds 14.0h cap after all permitted trims (a)–(d)`],
  };
}

/**
 * Returns 'A' | 'B' | 'cutback' | 'dress_rehearsal' | null for the A/B block (Wks 29-38).
 * Cutback weeks = every-4th (32, 36). Week 38 = dress rehearsal.
 * Odd non-cutback = A. Even non-cutback = B.
 */
function getABWeekType(weekNum) {
  if (weekNum < 29 || weekNum > 38) return null;
  if (weekNum === 38) return 'dress_rehearsal';
  if (weekNum % 4 === 0) return 'cutback'; // 32, 36
  return weekNum % 2 === 1 ? 'A' : 'B';   // odd=A, even=B
}

/**
 * Long-run duration target for A/B weeks.
 * A-weeks: Sunday long run. B-weeks: Thursday long run.
 * Wk 34: coach override 150→135 min (cap compliance).
 */
const AB_LONG_RUN = {
  29: 120, // A
  30: 120, // B
  31: 130, // A
  33: 145, // A
  34: 135, // B — coach override (was 150, trimmed for 14h cap)
  35: 160, // A
  37: 165, // A — peak
};

/**
 * Brick-run duration for B-weeks (after Sat long ride).
 * Wk 34: coach override 40→30 min (cap compliance).
 */
const B_BRICK_RUN = { 30: 30, 34: 30 };

/**
 * Saturday brick-run duration for Wks 21,23,25,27.
 */
const SAT_BRICK_WKS = { 21: 20, 23: 25, 25: 25, 27: 30 };

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
  const sbMult  = isStepBack ? getStepBackMultiplier(weekNum) : 1;
  const swimFocus     = getSwimFocus(weekNum);
  const swimDuration  = getSwimSessionDuration(weekNum);
  const runCaps       = getRunCaps(weekNum);
  const maxBike       = getMaxLongBikeDuration(weekNum);
  const includeLPBike = shouldIncludeLPSpecificBikeWork(weekNum);

  const sessions = [];
  let weeklyRunMiles = 0;

  // ── HIM tune-up race week ──────────────────────────────────────────────────
  if (hasTuneUpRace && tuneUpRaceType === 'half_ironman') {
    const swimDur = roundTo5(40 * sbMult);
    sessions.push(makeSession(dayDate(weekStartDate, 1), 'swim', 'technique', swimDur,
      estimateSwimDistance(swimDur, weekNum), 1, false, 'recovery', 'optional',
      'HIM race week — pre-race shake-out swim. estimated_distance:true'));
    sessions.push(makeSession(dayDate(weekStartDate, 2), 'run', 'easy', 20,
      estimateRunDistance(20), 1, false, 'recovery', 'optional',
      'HIM race week — easy shake-out run. estimated_distance:true'));
    // HIM target duration 450 min (≈7:30 finish)
    sessions.push(makeSession(dayDate(weekStartDate, 5), 'race', 'half_ironman_tune_up', 450,
      null, 3, false, 'race', 'key', 'Tune-up Half-Ironman race — race effort. Collect all splits.'));
    return { sessions, violations: [] };
  }

  if (hasTuneUpRace && tuneUpRaceType === 'sprint_olympic') {
    const swimDur = roundTo5(30 * sbMult);
    sessions.push(makeSession(dayDate(weekStartDate, 1), 'swim', 'technique', swimDur,
      estimateSwimDistance(swimDur, weekNum), 1, false, 'recovery', 'optional',
      'Race week — pre-race swim. estimated_distance:true'));
    sessions.push(makeSession(dayDate(weekStartDate, 4), 'run', 'easy', 20,
      estimateRunDistance(20), 1, false, 'recovery', 'optional',
      'Race week — shake-out run. estimated_distance:true'));
    sessions.push(makeSession(dayDate(weekStartDate, 6), 'race', 'sprint_olympic_tune_up', 90,
      null, 3, false, 'race', 'key', 'Tune-up Sprint/Olympic race — race effort'));
    return { sessions, violations: [] };
  }

  // ── Taper week logic ───────────────────────────────────────────────────────
  if (isTaper) {
    const taperBlock = phaseBlocks.find(b => b.phase === 'taper');
    const weeksInTaper    = taperBlock.weekEnd - taperBlock.weekStart + 1;
    const taperWeekIndex  = weekNum - taperBlock.weekStart;

    if (taperWeekIndex === weeksInTaper - 1) {
      // Race week
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
      // IM target duration 930 min (≈15:30 finish)
      sessions.push(makeSession(dayDate(weekStartDate, 6), 'race', 'ironman', 930,
        null, 4, false, 'race', 'key', 'IRONMAN Lake Placid 2027 — race day'));
      return { sessions, violations: [] };
    }

    const taperBikeDurations = [120, 90, 60];
    const taperRunDurations  = [120, 90, 60];
    const taperSwimFactors   = [0.75, 0.60, 0.45];

    const swimBase = Math.min(swimDuration.max, swimDuration.min + 10);
    const swFactor = taperSwimFactors[taperWeekIndex] != null ? taperSwimFactors[taperWeekIndex] : 0.45;
    const swDur    = roundTo5(swimBase * swFactor);
    sessions.push(makeSession(dayDate(weekStartDate, 1), 'swim', 'technique', swDur,
      estimateSwimDistance(swDur, weekNum), 2, false, 'race_prep', 'supporting',
      'Taper swim — maintain feel, reduce volume. estimated_distance:true'));

    const bikeDur = taperBikeDurations[taperWeekIndex] != null ? taperBikeDurations[taperWeekIndex] : 60;
    sessions.push(makeSession(dayDate(weekStartDate, 3), 'bike', 'endurance_z2', bikeDur,
      null, 2, false, 'aerobic_base', 'supporting',
      'Taper bike — reduced volume, race-pace efforts'));

    const swDur2 = roundTo5(swDur * 0.85);
    sessions.push(makeSession(dayDate(weekStartDate, 4), 'swim', 'endurance', swDur2,
      estimateSwimDistance(swDur2, weekNum), 2, false, 'race_prep', 'optional',
      'Taper swim — second session. estimated_distance:true'));

    const runDur  = taperRunDurations[taperWeekIndex] != null ? taperRunDurations[taperWeekIndex] : 45;
    const runDist = estimateRunDistance(runDur);
    if (!wouldExceedRunWeeklyCap(weekNum, weeklyRunMiles, runDist)) {
      weeklyRunMiles += runDist;
      sessions.push(makeSession(dayDate(weekStartDate, 5), 'run', 'long_run', runDur,
        runDist, 2, false, 'endurance', 'key',
        'Taper long run — Z2 durability, maintain feel. estimated_distance:true'));
    }

    return { sessions, violations: [] };
  }

  // ── Week 5 special: FTP test + TT week ────────────────────────────────────
  if (weekNum === 5) {
    // Tue: swim (normal)
    const swDurTue5 = roundTo5(swimDuration.min * sbMult);
    sessions.push(makeSession(dayDate(weekStartDate, 1), 'swim', 'technique', swDurTue5,
      estimateSwimDistance(swDurTue5, weekNum), 1, false, swimFocus, 'supporting',
      'Week 5 test week — routine swim. estimated_distance:true'));

    // Wed: FTP bike test 60min (KEY, replaces bike+strength)
    sessions.push(makeSession(dayDate(weekStartDate, 2), 'bike', 'ftp_test', 60,
      null, 4, false, 'testing', 'key',
      'FTP test — 20-min all-out (×0.95 = FTP). Record watts in Benchmarks. Warm up 20 min, cool down 20 min.'));

    // Thu: swim TT 40min (supporting) + run TT 60min (KEY)
    sessions.push(makeSession(dayDate(weekStartDate, 3), 'swim', 'time_trial', 40,
      estimateSwimDistance(40, weekNum), 2, false, 'testing', 'supporting',
      '400m swim TT — record pace per 100m. Warm up, then continuous 400m effort, cool down.'));
    sessions.push(makeSession(dayDate(weekStartDate, 3), 'run', 'time_trial', 60,
      estimateRunDistance(60), 3, false, 'testing', 'key',
      '30-min run TT — warm up 15 min, all-out 30 min, cool down 15 min. Record distance for Z2 pace calc.'));

    // Fri: swim (technique, 40min, supporting) — restored
    sessions.push(makeSession(dayDate(weekStartDate, 4), 'swim', 'technique', 40,
      estimateSwimDistance(40, weekNum), 1, false, swimFocus, 'supporting',
      'Week 5 test week — Fri technique swim. estimated_distance:true'));

    // Sat: Z2 long ride (normal progression, not a test)
    const satBikeDur5 = roundTo5(maxBike * sbMult);
    sessions.push(makeSession(dayDate(weekStartDate, 5), 'bike', 'endurance_z2', satBikeDur5,
      null, 2, false, 'aerobic_base', 'key',
      'Test week — easy Z2 ride, no intensity. Let legs recover from Wed FTP test.'));

    return enforceWeeklyCap(5, sessions, null);
  }

  // ── A/B block: Weeks 29-38 ─────────────────────────────────────────────────
  const abType = getABWeekType(weekNum);

  if (abType !== null) {
    return scheduleABWeek(weekNum, weekStartDate, abType, phase, swimFocus, swimDuration, sbMult, maxBike);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NORMAL WEEK SCHEDULING (Wks 1-28, excluding tune-up races, taper, wk5)
  // ─────────────────────────────────────────────────────────────────────────

  // Tuesday: Swim
  const swDurTue = roundTo5(
    (swimFocus === 'technique'
      ? swimDuration.min
      : (swimDuration.min + swimDuration.max) / 2) * sbMult
  );
  sessions.push(makeSession(
    dayDate(weekStartDate, 1),
    'swim',
    swimFocus === 'technique' ? 'technique' : 'aerobic_intervals',
    swDurTue,
    estimateSwimDistance(swDurTue, weekNum),
    swimFocus === 'technique' ? 1 : 2,
    false, swimFocus, 'supporting',
    `Swim focus: ${swimFocus}. estimated_distance:true`
  ));

  // Tuesday: Easy run (Wk 15+ only, 30min Z2, supporting)
  if (weekNum >= 15) {
    const tueMedRunDur = roundTo5(30 * sbMult);
    const tueMedRunDist = estimateRunDistance(tueMedRunDur);
    if (!wouldExceedRunWeeklyCap(weekNum, weeklyRunMiles, tueMedRunDist)) {
      weeklyRunMiles += tueMedRunDist;
      sessions.push(makeSession(
        dayDate(weekStartDate, 1),
        'run', 'easy', tueMedRunDur, tueMedRunDist,
        2, false, 'aerobic_base', 'supporting',
        'Easy Z2 run after swim — keep effort conversational. estimated_distance:true'
      ));
    }
  }

  // Wednesday: Bike
  const bikeType   = includeLPBike ? getLPBikeType(weekNum) : (phase === 'foundation' ? 'technique_indoor' : 'endurance_z2');
  const bikeBaseDur = phase === 'foundation' ? 75 : (weekNum <= 16 ? 90 : weekNum <= 24 ? 105 : 120);
  const bikeDurWed  = roundTo5(Math.min(bikeBaseDur * sbMult, getMaxLongBikeDuration(weekNum)));
  sessions.push(makeSession(
    dayDate(weekStartDate, 2),
    'bike', bikeType, bikeDurWed, null,
    includeLPBike ? 3 : 2,
    false, includeLPBike ? 'strength_endurance' : 'aerobic_base', 'supporting',
    weekNum >= 18 && weekNum <= 20 ? 'Tune-up race window this week — see race notes' : ''
  ));

  // Wednesday: Strength (optional in every week)
  if (!isStepBack) {
    const strType = phase === 'foundation' ? 'foundation_strength' : 'in_season_maintenance';
    sessions.push(makeSession(
      dayDate(weekStartDate, 2),
      'strength', strType,
      phase === 'foundation' ? 50 : 35,
      null, 2, false,
      phase === 'foundation' ? 'stability' : 'maintenance',
      'optional',
      'Same day as bike — do after aerobic session'
    ));
  }

  // Thursday: Long run (replaces easy run from current scheduler)
  const { longRunCapMi, longRunCapMin } = runCaps;
  let longRunDur  = roundTo5(Math.min(getMaxLongRunDuration(weekNum), longRunCapMin) * sbMult);
  let longRunDist = estimateRunDistance(longRunDur);
  if (wouldExceedLongRunCeiling(longRunDur, longRunDist)) {
    longRunDur  = Math.min(longRunDur, longRunCapMin);
    longRunDist = Math.min(longRunDist, longRunCapMi);
  }
  if (wouldExceedRunWeeklyCap(weekNum, weeklyRunMiles, longRunDist)) {
    const remaining = (weekNum <= 8 ? 18 : 25) - weeklyRunMiles;
    longRunDist = Math.max(0, remaining - 0.1);
    longRunDur  = roundTo5(longRunDist * 12);
  }
  if (longRunDur > 0) {
    weeklyRunMiles += longRunDist;
    sessions.push(makeSession(
      dayDate(weekStartDate, 3),
      'run', 'long_run', longRunDur, longRunDist,
      2, false, 'endurance', 'key',
      'Long run — Z2 durability focus. estimated_distance:true'
    ));
  }

  // Thursday: 3rd swim (Wk 5+)
  if (weekNum >= 5) {
    const thuSwimDur = isStepBack ? 20 : roundTo5(phase === 'foundation' ? 25 : weekNum <= 20 ? 30 : 35);
    const thuSwimType = swimFocus === 'technique' ? 'technique' : 'aerobic_intervals';
    sessions.push(makeSession(
      dayDate(weekStartDate, 3),
      'swim', thuSwimType, thuSwimDur,
      estimateSwimDistance(thuSwimDur, weekNum),
      swimFocus === 'technique' ? 1 : 2,
      false, swimFocus, 'supporting',
      'Third swim — shorter, technique or aerobic focus. estimated_distance:true'
    ));
  }

  // Friday: Swim
  const friSwimType = weekNum >= 33 ? 'open_water' : (swimFocus === 'technique' ? 'technique' : (swimFocus === 'race_ready' ? 'endurance' : 'aerobic_intervals'));
  const swDurFri = roundTo5(((swimDuration.min + swimDuration.max) / 2) * sbMult);
  sessions.push(makeSession(
    dayDate(weekStartDate, 4),
    'swim', friSwimType, swDurFri,
    estimateSwimDistance(swDurFri, weekNum),
    2, false, swimFocus, 'supporting',
    weekNum >= 33
      ? 'Open-water swim — OW technique, sighting drills. Pool continuous swim if water <60°F. estimated_distance:true'
      : `Second swim — ${swimFocus}. estimated_distance:true`
  ));

  // Friday: Strength (optional in every week)
  if (!isStepBack) {
    const strType       = phase === 'foundation' ? 'foundation_strength' : 'in_season_maintenance';
    const strDur        = phase === 'foundation' ? 50 : 35;
    sessions.push(makeSession(
      dayDate(weekStartDate, 4),
      'strength', strType, strDur,
      null, 2, false,
      phase === 'foundation' ? 'stability' : 'maintenance',
      'optional',
      'Strength session — keep volume in check'
    ));
  }

  // Saturday: Long Bike
  const isSpecificityWeek  = SPECIFICITY_BIKE_WEEKS.includes(weekNum);
  const isBikeRecoveryWeek = BIKE_RECOVERY_WEEKS.includes(weekNum);
  let longBikeDur = roundTo5(maxBike * sbMult);
  longBikeDur = Math.min(longBikeDur, 320);

  let satBikeType      = 'long_ride';
  let satBikePurpose   = isSpecificityWeek ? 'race_prep' : 'endurance';
  let satBikeNotes;
  if (isSpecificityWeek && weekNum === 37) {
    satBikeNotes = 'Specificity week — final big exposure, race-day fueling rehearsal. Fueling 70g carbs/hr.';
  } else if (isSpecificityWeek) {
    satBikeNotes = 'Specificity week — LP terrain simulation, full fueling protocol (60–80g carbs/hr).';
  } else if (isBikeRecoveryWeek) {
    satBikeNotes = 'Recovery week — keep effort easy.';
  } else {
    satBikeNotes = 'Long ride — fueling practice (60–70g carbs/hr)';
  }

  sessions.push(makeSession(
    dayDate(weekStartDate, 5),
    'bike', satBikeType, longBikeDur, null,
    2, false, satBikePurpose, 'key', satBikeNotes
  ));

  // Saturday: Brick run — Wks 21, 23, 25, 27
  const satBrickDur = SAT_BRICK_WKS[weekNum];
  if (satBrickDur != null && !isStepBack) {
    const brickDist = estimateRunDistance(satBrickDur);
    if (!wouldExceedRunWeeklyCap(weekNum, weeklyRunMiles, brickDist)) {
      weeklyRunMiles += brickDist;
      sessions.push(makeSession(
        dayDate(weekStartDate, 5),
        'run', 'brick_run', satBrickDur, brickDist,
        2, true, 'brick_transition', 'key',
        'Brick run off long ride — T2 practice, Z2 effort. estimated_distance:true'
      ));
    }
  }

  // Sunday: Easy recovery run (no brick on Sunday in new layout)
  if (!isStepBack) {
    const recRunDur  = roundTo5((phase === 'foundation' ? 30 : 35) * sbMult);
    const recRunDist = estimateRunDistance(recRunDur);
    if (!wouldExceedRunWeeklyCap(weekNum, weeklyRunMiles, recRunDist)) {
      weeklyRunMiles += recRunDist;
      sessions.push(makeSession(
        dayDate(weekStartDate, 6),
        'run', 'recovery', recRunDur, recRunDist,
        1, false, 'recovery', 'optional',
        'Easy recovery run, Sunday. estimated_distance:true'
      ));
    }
  }

  return enforceWeeklyCap(weekNum, sessions, null);
}

/**
 * Schedule A/B block weeks (29-38).
 */
function scheduleABWeek(weekNum, weekStartDate, abType, phase, swimFocus, swimDuration, sbMult, maxBike) {
  const sessions = [];
  let weeklyRunMiles = 0;

  // Swim durations (same for all AB weeks)
  const swDurTue = roundTo5(((swimDuration.min + swimDuration.max) / 2) * sbMult);
  const swDurThu = roundTo5(((swimDuration.min + swimDuration.max) / 2) * 0.8 * sbMult);
  const swDurFri = roundTo5(((swimDuration.min + swimDuration.max) / 2) * sbMult);
  const swimType = swimFocus === 'race_ready' ? 'endurance' : 'aerobic_intervals';

  // Fri swim: open water from Wk 33
  const friSwimType = weekNum >= 33 ? 'open_water' : swimType;

  // Tuesday: Swim — Wks 33-35 use 100min endurance_continuous for IM readiness
  if (weekNum >= 33 && weekNum <= 35) {
    sessions.push(makeSession(dayDate(weekStartDate, 1), 'swim', 'endurance_continuous', 100,
      estimateSwimDistance(100, weekNum), 2, false, swimFocus, 'supporting',
      'Continuous swim — build toward 3,800m non-stop. Pool continuous swim if water <60°F. estimated_distance:true'));
  } else {
    sessions.push(makeSession(dayDate(weekStartDate, 1), 'swim', swimType, swDurTue,
      estimateSwimDistance(swDurTue, weekNum), 2, false, swimFocus, 'supporting',
      `Swim: ${swimFocus}. estimated_distance:true`));
  }

  // Tuesday: Easy run 30min (supporting)
  const tueMedRunDur = roundTo5(30 * sbMult);
  const tueMedRunDist = estimateRunDistance(tueMedRunDur);
  weeklyRunMiles += tueMedRunDist;
  sessions.push(makeSession(dayDate(weekStartDate, 1), 'run', 'easy', tueMedRunDur, tueMedRunDist,
    2, false, 'aerobic_base', 'supporting',
    'Easy Z2 run after swim. estimated_distance:true'));

  // Wednesday: Bike (LP-specific) + strength (optional)
  const bikeType = getLPBikeType(weekNum);
  const bikeDurWed = roundTo5(Math.min(120 * sbMult, maxBike * 0.55));
  sessions.push(makeSession(dayDate(weekStartDate, 2), 'bike', bikeType, bikeDurWed, null,
    3, false, 'strength_endurance', 'supporting', 'Midweek LP-specific bike'));
  if (abType !== 'cutback') {
    sessions.push(makeSession(dayDate(weekStartDate, 2), 'strength', 'in_season_maintenance', 35,
      null, 2, false, 'maintenance', 'optional', 'Strength — after bike'));
  }

  // Thursday: depends on A/B/cutback
  if (abType === 'dress_rehearsal') {
    // DR week: easy run Thursday
    sessions.push(makeSession(dayDate(weekStartDate, 3), 'run', 'easy', 30,
      estimateRunDistance(30), 1, false, 'recovery', 'optional',
      'Dress rehearsal week — easy shakeout. estimated_distance:true'));
  } else if (abType === 'A') {
    // A: medium run 60-70min (supporting)
    const medRunDur  = roundTo5(65 * sbMult); // midpoint 60-70
    const medRunDist = estimateRunDistance(medRunDur);
    weeklyRunMiles  += medRunDist;
    sessions.push(makeSession(dayDate(weekStartDate, 3), 'run', 'easy', medRunDur, medRunDist,
      2, false, 'aerobic_base', 'supporting',
      'Medium run — Z2 effort, steady pace. estimated_distance:true'));
  } else if (abType === 'B') {
    // B: long run (KEY)
    const lrDur  = roundTo5((AB_LONG_RUN[weekNum] || 120) * sbMult);
    const lrDist = estimateRunDistance(lrDur);
    weeklyRunMiles += lrDist;
    sessions.push(makeSession(dayDate(weekStartDate, 3), 'run', 'long_run', lrDur, lrDist,
      2, false, 'endurance', 'key',
      'Long run — Z2 durability. estimated_distance:true'));
  } else {
    // Cutback: moderate easy run
    const cutRunDur  = roundTo5(50 * sbMult);
    const cutRunDist = estimateRunDistance(cutRunDur);
    weeklyRunMiles  += cutRunDist;
    sessions.push(makeSession(dayDate(weekStartDate, 3), 'run', 'easy', cutRunDur, cutRunDist,
      2, false, 'recovery', 'supporting',
      'Cutback week — easy run, recovery priority. estimated_distance:true'));
  }

  // Thursday: swim (supporting) — always present
  sessions.push(makeSession(dayDate(weekStartDate, 3), 'swim', swimType, swDurThu,
    estimateSwimDistance(swDurThu, weekNum), 2, false, swimFocus, 'supporting',
    'Third swim — aerobic focus. estimated_distance:true'));

  // Friday: Swim (OW from Wk 33) + strength (optional)
  sessions.push(makeSession(dayDate(weekStartDate, 4), 'swim', friSwimType, swDurFri,
    estimateSwimDistance(swDurFri, weekNum), 2, false, swimFocus, 'supporting',
    weekNum >= 33
      ? 'Open-water swim — sighting, race-pace segments. Pool continuous swim if water <60°F. estimated_distance:true'
      : `Swim — ${swimFocus}. estimated_distance:true`));
  if (abType !== 'cutback') {
    sessions.push(makeSession(dayDate(weekStartDate, 4), 'strength', 'in_season_maintenance', 35,
      null, 2, false, 'maintenance', 'optional', 'Strength session'));
  }

  // Saturday: depends on abType
  if (abType === 'dress_rehearsal') {
    // Week 38: swim 100min → bike 300min → run 90min back-to-back
    sessions.push(makeSession(dayDate(weekStartDate, 5), 'swim', 'race_simulation', 100,
      estimateSwimDistance(100, weekNum), 3, false, 'race_prep', 'key',
      'Dress rehearsal — segment 1: swim 100 min at IM race pace. Race gear, race nutrition.'));
    sessions.push(makeSession(dayDate(weekStartDate, 5), 'bike', 'race_simulation', 300,
      null, 3, true, 'race_prep', 'key',
      'Dress rehearsal — segment 2: bike 300 min at IM race power (70–75% FTP). Full fueling.'));
    sessions.push(makeSession(dayDate(weekStartDate, 5), 'run', 'race_simulation', 90,
      estimateRunDistance(90), 3, true, 'race_prep', 'key',
      'Dress rehearsal — segment 3: run 90 min off bike at IM pace. Log every mile split.'));
  } else if (abType === 'B') {
    // B: long ride (KEY) + brick run (KEY) — back-to-back
    const bBikeDur  = roundTo5(maxBike * sbMult);
    const bBrickDur = roundTo5((B_BRICK_RUN[weekNum] || 35) * sbMult);
    sessions.push(makeSession(dayDate(weekStartDate, 5), 'bike', 'long_ride', bBikeDur, null,
      2, false, 'endurance', 'key',
      'Long ride — full fueling protocol (70g carbs/hr)'));
    const brickDist = estimateRunDistance(bBrickDur);
    weeklyRunMiles += brickDist;
    sessions.push(makeSession(dayDate(weekStartDate, 5), 'run', 'brick_run', bBrickDur, brickDist,
      2, true, 'brick_transition', 'key',
      'Brick run off long ride — T2 practice, controlled Z2 effort. estimated_distance:true'));
  } else {
    // A or cutback: standard long ride
    const aBikeDur = roundTo5(maxBike * sbMult);
    sessions.push(makeSession(dayDate(weekStartDate, 5), 'bike', 'long_ride', aBikeDur, null,
      2, false, 'endurance', 'key',
      'Long ride — fueling practice (60–70g carbs/hr)'));
  }

  // Sunday: depends on abType
  if (abType === 'dress_rehearsal') {
    // Rest / easy walk — no session
  } else if (abType === 'A') {
    // A: long run (KEY) — intentional Sat→Sun back-to-back stimulus
    const lrDur  = roundTo5((AB_LONG_RUN[weekNum] || 120) * sbMult);
    const lrDist = estimateRunDistance(lrDur);
    weeklyRunMiles += lrDist;
    sessions.push(makeSession(dayDate(weekStartDate, 6), 'run', 'long_run', lrDur, lrDist,
      2, false, 'endurance', 'key',
      'Long run — fatigue-resistance stimulus after Sat long ride. Z2, no heroics. estimated_distance:true'));
  } else if (abType === 'B') {
    // B: easy 30min (optional)
    const sunDur  = roundTo5(30 * sbMult);
    const sunDist = estimateRunDistance(sunDur);
    weeklyRunMiles += sunDist;
    sessions.push(makeSession(dayDate(weekStartDate, 6), 'run', 'recovery', sunDur, sunDist,
      1, false, 'recovery', 'optional',
      'Recovery shake-out after B week. Easy walk/jog. estimated_distance:true'));
  } else {
    // Cutback: easy run (optional)
    const sunDur  = roundTo5(30 * sbMult);
    const sunDist = estimateRunDistance(sunDur);
    weeklyRunMiles += sunDist;
    sessions.push(makeSession(dayDate(weekStartDate, 6), 'run', 'easy', sunDur, sunDist,
      1, false, 'recovery', 'optional',
      'Cutback Sunday — easy recovery. estimated_distance:true'));
  }

  return enforceWeeklyCap(weekNum, sessions, abType);
}

// Expose AB_LONG_RUN so tests can inspect it
scheduleWeek.getABWeekType = getABWeekType;

module.exports = { scheduleWeek };
