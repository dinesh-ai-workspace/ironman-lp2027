'use strict';

/**
 * Plan generator — entry point.
 *
 * This module is intentionally pure: generatePlan() has no side effects and
 * no DB calls. The DB layer is responsible for persisting the result and for
 * incrementing plan versions. The generator always returns version:1 in the
 * plan object; savePlan() handles versioning.
 */

const { DEFAULT_PHASE_TEMPLATES, computePhaseBlocks } = require('./phase-config');
const { isStepBackWeek } = require('./constraints');
const { scheduleWeek } = require('./scheduler');
const { WORKOUT_TEMPLATES } = require('../workout-templates');

/**
 * Advance a date to the next Monday (or keep it if already Monday).
 * Monday = UTC day 1.
 * Uses UTC methods throughout to avoid DST / local-timezone issues with ISO date strings.
 */
function nextMonday(date) {
  // Normalise to UTC midnight.  If date was created from 'YYYY-MM-DD' string it is
  // already UTC midnight, so use getUTC* to avoid local-timezone shift.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = d.getUTCDay(); // 0=Sun, 1=Mon…
  const offset = dow === 1 ? 0 : dow === 0 ? 1 : 8 - dow;
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
}

/**
 * Add days to a UTC Date, return new Date.
 */
function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/**
 * Convert a Date to ISO date string.
 */
function toISO(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Given a session date (string) and plan start date (Date), return the 1-indexed week number.
 * Uses getUTC* methods to avoid local-timezone shift on ISO date strings.
 */
function weekNumForDate(dateStr, planStartDate) {
  const start = new Date(Date.UTC(
    planStartDate.getUTCFullYear(), planStartDate.getUTCMonth(), planStartDate.getUTCDate()
  ));
  const d = new Date(dateStr + 'T00:00:00Z');
  const diffDays = Math.floor((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7) + 1;
}

/**
 * Find which block a given weekNum belongs to.
 */
function blockForWeek(weekNum, blocks) {
  return blocks.find(b => weekNum >= b.weekStart && weekNum <= b.weekEnd);
}

/**
 * Build readiness gates for fixed checkpoint weeks.
 * 11 rows — one per checkpoint week (5, 8, 12, 16, 20, 24, 26, 28, 34, 36, 38).
 * All start as pending with null actual_value.
 *
 * Returns array of gate objects (not yet persisted — no id).
 */
function buildReadinessGates(blocks, planStartDate) {
  const checkpoints = [
    {
      weekNum: 5,
      gates: [
        { discipline: 'multi', metric: 'baselines_w5',
          target_value: 'GREEN: FTP (20-min Keiser M3 ×0.95), 400m swim TT, 30-min run TT all recorded; zones set before Wk 6 | YELLOW: 1–2 of 3 done | RED: None done → reschedule within 7 days',
          notes: '' },
      ],
    },
    {
      weekNum: 8,
      gates: [
        { discipline: 'multi', metric: 'trajectory_review_w8',
          target_value: 'GREEN: Swim pace/100m ≤ Wk 5; all KEY sessions Wks 5–7 ≥85%; no joint pain >3 days | YELLOW: One criterion missed | RED: Two or more missed → hold Wk 9 volume at Wk 7 level',
          notes: '' },
      ],
    },
    {
      weekNum: 12,
      gates: [
        { discipline: 'swim', metric: 'continuous_1000m',
          target_value: 'GREEN: 1,000m non-stop, any pace | YELLOW: 800–999m | RED: <800m → add a 4th weekly swim until passed',
          notes: '' },
      ],
    },
    {
      weekNum: 16,
      gates: [
        { discipline: 'bike', metric: 'ftp_retest_w16',
          target_value: 'GREEN: FTP ≥ Wk 5 FTP | YELLOW: Within 3% below | RED: >3% below → hold volume 1 week',
          notes: '' },
      ],
    },
    {
      weekNum: 20,
      gates: [
        { discipline: 'swim', metric: 'continuous_1500m',
          target_value: 'GREEN: 1,500m non-stop, any pace | YELLOW: 1,300–1,499m | RED: <1,300m → add a 4th weekly swim until passed',
          notes: '' },
      ],
    },
    {
      weekNum: 24,
      gates: [
        { discipline: 'run', metric: 'run_tt_retest_w24',
          target_value: 'GREEN: 30-min TT distance ≥ Wk 5 | YELLOW: Within 3% below | RED: >3% below → hold volume 1 week',
          notes: '' },
      ],
    },
    {
      weekNum: 26,
      gates: [
        { discipline: 'multi', metric: 'half_readiness_w26',
          target_value: 'GREEN: 2,000m continuous swim + 3.5-h ride + 100-min run, same week, different days | YELLOW: 2 of 3 | RED: 0–1 of 3 → race Wk 28 as bike/run only',
          notes: '' },
      ],
    },
    {
      weekNum: 28,
      gates: [
        { discipline: 'race', metric: 'him_tune_up_race',
          target_value: 'GREEN: Finished within cutoffs, even pacing, no GI issues | YELLOW: Finished with pacing or GI issues | RED: DNF/DNS → review fueling and pacing before Wk 29',
          notes: '' },
      ],
    },
    {
      weekNum: 34,
      gates: [
        { discipline: 'swim', metric: 'ow_continuous_3000m',
          target_value: 'GREEN: 3,000m continuous, wetsuit, sighting (pool OK if water <60°F; record which) | YELLOW: 2,500–2,999m | RED: <2,500m → extra OW/continuous sessions until passed',
          notes: '' },
      ],
    },
    {
      weekNum: 36,
      gates: [
        { discipline: 'multi', metric: 'im_readiness_w36',
          target_value: 'GREEN: Within Wks 34–36, injury-free: 3,800m continuous swim + 5-h ride with 30-min brick + 150-min run | YELLOW: 2 of 3 | RED: 0–1 of 3 → conservative race plan',
          notes: '' },
      ],
    },
    {
      weekNum: 38,
      gates: [
        { discipline: 'race', metric: 'dress_rehearsal',
          target_value: 'GREEN: Swim 100 min → bike 300 min → run 90 min with race nutrition, no GI issues | YELLOW: One segment shortened | RED: DNF or major GI issue → fix fueling before taper',
          notes: '' },
      ],
    },
  ];

  const gates = [];

  for (const cp of checkpoints) {
    const block = blockForWeek(cp.weekNum, blocks);
    const blockStart = new Date(blocks[0].startDate + 'T00:00:00Z');
    const weekStartDate = addDays(
      new Date(Date.UTC(
        blockStart.getUTCFullYear(),
        blockStart.getUTCMonth(),
        blockStart.getUTCDate()
      )),
      (cp.weekNum - 1) * 7
    );

    for (const g of cp.gates) {
      gates.push({
        date: toISO(weekStartDate),
        week_num: cp.weekNum,
        phase: block ? block.phase : 'unknown',
        discipline: g.discipline,
        metric: g.metric,
        target_value: g.target_value,
        actual_value: null,
        status: 'pending',
        notes: g.notes,
      });
    }
  }

  return gates;
}

/**
 * Generate the full Ironman training plan.
 *
 * NOTE: This function is pure — no side effects, no DB calls.
 * The DB layer (savePlan) handles versioning and persistence.
 * The generator always returns version:1 in the plan object.
 *
 * @param {Object} config
 * @param {Date}   config.raceDate
 * @param {Date}   config.planStartDate        First Monday on or after generation date
 * @param {Date}   config.athleteBirthDate
 * @param {Array}  config.phaseTemplates        DEFAULT_PHASE_TEMPLATES or custom
 * @param {number} config.availableHoursPerWeek Informational only
 * @returns {{ plan, blocks, sessions, readinessGates }}
 */
function generatePlan(config) {
  const {
    raceDate,
    planStartDate: rawStart,
    athleteBirthDate,
    phaseTemplates = DEFAULT_PHASE_TEMPLATES,
  } = config;

  // Ensure plan starts on a Monday.
  const planStartDate = nextMonday(rawStart);

  // Compute phase blocks.
  const blocks = computePhaseBlocks(planStartDate, raceDate, phaseTemplates);

  // Build plan metadata object (version always 1; DB layer increments on save).
  const plan = {
    name: `IRONMAN Lake Placid 2027 — ${toISO(planStartDate)} to ${toISO(raceDate)}`,
    race_date: toISO(raceDate),
    plan_start_date: toISO(planStartDate),
    athlete_birth_date: toISO(athleteBirthDate),
    created_at: new Date().toISOString(),
    status: config.status || 'active',
    version: 1,
  };

  // Determine total weeks.  Use getUTC* to avoid local-timezone shift.
  const planStartUTC = new Date(Date.UTC(
    planStartDate.getUTCFullYear(), planStartDate.getUTCMonth(), planStartDate.getUTCDate()
  ));
  const raceDateUTC = new Date(Date.UTC(
    raceDate.getUTCFullYear(), raceDate.getUTCMonth(), raceDate.getUTCDate()
  ));
  const totalDays = Math.round((raceDateUTC.getTime() - planStartUTC.getTime()) / (1000 * 60 * 60 * 24));
  // Race is in week floor(totalDays/7)+1.  We schedule that many weeks.
  const totalWeeks = Math.floor(totalDays / 7) + 1;

  // Schedule sessions week by week.
  const allSessions = [];
  const allViolations = [];

  // Tune-up race weeks: week 18 (Sprint/Olympic), week 28 (HIM).
  const TUNE_UP_SPRINT = 18;
  const TUNE_UP_HIM    = 28;

  for (let weekNum = 1; weekNum <= totalWeeks; weekNum++) {
    const weekStartDate = addDays(planStartUTC, (weekNum - 1) * 7);

    const block = blockForWeek(weekNum, blocks);
    const phase = block ? block.phase : 'taper';

    const hasTuneUpRace = weekNum === TUNE_UP_SPRINT || weekNum === TUNE_UP_HIM;
    const tuneUpRaceType = weekNum === TUNE_UP_SPRINT ? 'sprint_olympic'
                         : weekNum === TUNE_UP_HIM    ? 'half_ironman'
                         : null;

    const { sessions: weekSessions, violations: weekViolations } = scheduleWeek({
      weekNum,
      weekStartDate,
      phase,
      phaseBlocks: blocks,
      isStepBack: isStepBackWeek(weekNum),
      hasTuneUpRace,
      tuneUpRaceType,
      templates: WORKOUT_TEMPLATES,
      allScheduledSessions: allSessions.map(s => ({ ...s, _weekNum: weekNumForDate(s.date, planStartDate) })),
    });

    allViolations.push(...weekViolations);

    // Tag sessions with _weekNum for internal use (stripped before return).
    for (const s of weekSessions) {
      allSessions.push({ ...s, _weekNum: weekNum });
    }
  }

  // Strip internal _weekNum tag from sessions.
  const sessions = allSessions.map(({ _weekNum, ...s }) => s);

  // Build readiness gates.
  const readinessGates = buildReadinessGates(blocks, planStartDate);

  return { plan, blocks, sessions, readinessGates, violations: allViolations };
}

/**
 * Save a generated plan to the DB.
 *
 * Versioning: if a plan already exists for the same race_date + plan_start_date,
 * the new row gets version = max(existing.version) + 1. Otherwise version = 1.
 *
 * This function does NOT modify the in-memory generated object.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {{ plan, blocks, sessions, readinessGates }} generated  Output of generatePlan()
 * @returns {{ planId: number, version: number }}
 */
function savePlan(db, generated) {
  const { plan, blocks, sessions, readinessGates } = generated;

  // Determine version for this save.
  const existing = db.prepare(
    'SELECT MAX(version) AS maxVer FROM plans WHERE race_date = ? AND plan_start_date = ?'
  ).get(plan.race_date, plan.plan_start_date);

  const version = (existing && existing.maxVer != null) ? existing.maxVer + 1 : 1;

  const insertPlan = db.prepare(`
    INSERT INTO plans (name, race_date, plan_start_date, athlete_birth_date, created_at, status, version)
    VALUES (@name, @race_date, @plan_start_date, @athlete_birth_date, @created_at, @status, @version)
  `);

  const insertBlock = db.prepare(`
    INSERT INTO plan_blocks (plan_id, phase, phase_name, week_start, week_end, start_date, end_date,
      target_weekly_hours_min, target_weekly_hours_max)
    VALUES (@plan_id, @phase, @phase_name, @week_start, @week_end, @start_date, @end_date,
      @target_weekly_hours_min, @target_weekly_hours_max)
  `);

  const insertSession = db.prepare(`
    INSERT INTO planned_sessions
      (plan_id, block_id, workout_template_id, date, discipline, type,
       target_duration, target_distance, target_intensity_zone, is_brick, purpose, importance, notes)
    VALUES
      (@plan_id, @block_id, @workout_template_id, @date, @discipline, @type,
       @target_duration, @target_distance, @target_intensity_zone, @is_brick, @purpose, @importance, @notes)
  `);

  const insertGate = db.prepare(`
    INSERT INTO readiness_gates
      (plan_id, date, week_num, phase, discipline, metric, target_value, actual_value, status, notes)
    VALUES
      (@plan_id, @date, @week_num, @phase, @discipline, @metric, @target_value, @actual_value, @status, @notes)
  `);

  let planId;

  db.transaction(() => {
    const result = insertPlan.run({ ...plan, version });
    planId = result.lastInsertRowid;

    // Insert blocks and build a map weekNum → blockId.
    const blockIdMap = new Map();
    for (const b of blocks) {
      const blockResult = insertBlock.run({
        plan_id: planId,
        phase: b.phase,
        phase_name: b.phaseName,
        week_start: b.weekStart,
        week_end: b.weekEnd,
        start_date: b.startDate,
        end_date: b.endDate,
        target_weekly_hours_min: b.hoursMin,
        target_weekly_hours_max: b.hoursMax,
      });
      for (let w = b.weekStart; w <= b.weekEnd; w++) {
        blockIdMap.set(w, blockResult.lastInsertRowid);
      }
    }

    // Derive weekNum from session date.
    const planStart = new Date(plan.plan_start_date + 'T00:00:00Z');

    for (const s of sessions) {
      const wn = weekNumForDate(s.date, planStart);
      const blockId = blockIdMap.get(wn) || blockIdMap.get(blocks[blocks.length - 1].weekEnd);

      insertSession.run({
        plan_id: planId,
        block_id: blockId,
        workout_template_id: s.workout_template_id || null,
        date: s.date,
        discipline: s.discipline,
        type: s.type,
        target_duration: s.target_duration,
        target_distance: s.target_distance || null,
        target_intensity_zone: s.target_intensity_zone,
        is_brick: s.is_brick ? 1 : 0,
        purpose: s.purpose,
        importance: s.importance,
        notes: s.notes || '',
      });
    }

    for (const g of readinessGates) {
      const wn = g.week_num;
      insertGate.run({
        plan_id: planId,
        date: g.date,
        week_num: wn,
        phase: g.phase,
        discipline: g.discipline,
        metric: g.metric,
        target_value: g.target_value,
        actual_value: g.actual_value || null,
        status: g.status,
        notes: g.notes || '',
      });
    }
  })();

  return { planId, version };
}

module.exports = { generatePlan, savePlan, weekNumForDate };
