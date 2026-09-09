'use strict';

/**
 * In-memory workout template library.
 * Each template corresponds to a row in the workout_templates table.
 * The `id` field is assigned after DB insertion; in-memory references use the index.
 */
const WORKOUT_TEMPLATES = [
  // ─── SWIM ──────────────────────────────────────────────────────────────────
  {
    discipline: 'swim',
    type: 'technique',
    phase: 'foundation',
    purpose: 'technique',
    default_duration_min: 30,
    default_duration_max: 45,
    intensity_zone: 1,
    progression_rules: JSON.stringify({ focus: 'drills', repDistance: '25-50m', recovery: 'full' }),
    instructions: 'Drill set — body position, floppy-legs tight-core, ankle mobility. 25-50m reps, full recovery.',
  },
  {
    discipline: 'swim',
    type: 'aerobic_intervals',
    phase: 'aerobic_base',
    purpose: 'aerobic_build',
    default_duration_min: 40,
    default_duration_max: 55,
    intensity_zone: 2,
    progression_rules: JSON.stringify({ progression: 'increase_continuous_distance' }),
    instructions: 'Aerobic swim intervals — short reps building continuous distance.',
  },
  {
    discipline: 'swim',
    type: 'endurance',
    phase: 'build',
    purpose: 'endurance',
    default_duration_min: 55,
    default_duration_max: 75,
    intensity_zone: 2,
    progression_rules: JSON.stringify({ focus: 'sustained_z2', sighting: 'OW_practice' }),
    instructions: 'Continuous aerobic swim — sustained Z2 effort, sighting practice when OW.',
  },
  {
    discipline: 'swim',
    type: 'endurance',
    phase: 'peak',
    purpose: 'endurance',
    default_duration_min: 60,
    default_duration_max: 90,
    intensity_zone: 2,
    progression_rules: JSON.stringify({ focus: 'sustained_z2', sighting: 'OW_practice' }),
    instructions: 'Continuous aerobic swim — sustained Z2 effort, sighting practice when OW.',
  },
  {
    discipline: 'swim',
    type: 'trajectory_check',
    phase: 'all',
    purpose: 'assessment',
    default_duration_min: 40,
    default_duration_max: 60,
    intensity_zone: 2,
    progression_rules: JSON.stringify({ frequency: 'every_3_4_weeks' }),
    instructions: 'Swim trajectory check-in — evaluate mechanics, breathing under effort, distance-without-panic.',
  },

  // ─── BIKE ──────────────────────────────────────────────────────────────────
  {
    discipline: 'bike',
    type: 'technique_indoor',
    phase: 'foundation',
    purpose: 'technique',
    default_duration_min: 60,
    default_duration_max: 90,
    intensity_zone: 2,
    progression_rules: JSON.stringify({ cadence: '85-95rpm', effort: '80%_z2' }),
    instructions: 'Indoor trainer — position, cadence 85-95rpm, power base. 80% Z2.',
  },
  {
    discipline: 'bike',
    type: 'outdoor_handling',
    phase: 'foundation',
    purpose: 'technique',
    default_duration_min: 60,
    default_duration_max: 90,
    intensity_zone: 1,
    progression_rules: JSON.stringify({ focus: 'handling_cornering_shifting' }),
    instructions: 'Outdoor ride — handling, cornering, shifting. Relaxed Z1-Z2 effort.',
  },
  {
    discipline: 'bike',
    type: 'endurance_z2',
    phase: 'all',
    purpose: 'aerobic_base',
    default_duration_min: 90,
    default_duration_max: 180,
    intensity_zone: 2,
    progression_rules: JSON.stringify({ focus: 'steady_z2' }),
    instructions: 'Endurance ride — steady Z2. Aerobic base for LP climbs.',
  },
  {
    discipline: 'bike',
    type: 'long_ride',
    phase: 'all',
    purpose: 'endurance',
    default_duration_min: 120,
    default_duration_max: 360,
    intensity_zone: 2,
    progression_rules: JSON.stringify({ fueling: '60-70g_carbs_per_hr', progression: 'ramp_table' }),
    instructions: 'Long ride — duration per weekly ramp. Practice race-day fueling (60-70g carbs/hr).',
  },
  {
    discipline: 'bike',
    type: 'hill_climbing',
    phase: 'build',
    purpose: 'strength_endurance',
    default_duration_min: 90,
    default_duration_max: 180,
    intensity_zone: 3,
    progression_rules: JSON.stringify({ cadence: 'low_cadence_torque', terrain: 'LP_simulation' }),
    instructions: 'Hill-specific ride — low-cadence torque sets, LP course terrain simulation.',
  },
  {
    discipline: 'bike',
    type: 'race_simulation',
    phase: 'peak',
    purpose: 'race_prep',
    default_duration_min: 330,
    default_duration_max: 360,
    intensity_zone: 3,
    progression_rules: JSON.stringify({ weeks: '38-39_only', fueling: 'full_race_protocol' }),
    instructions: 'Lake Placid terrain simulation — 5.5-6hr, race pacing, full fueling protocol.',
  },

  // ─── RUN ───────────────────────────────────────────────────────────────────
  {
    discipline: 'run',
    type: 'easy',
    phase: 'all',
    purpose: 'aerobic_base',
    default_duration_min: 30,
    default_duration_max: 60,
    intensity_zone: 2,
    progression_rules: JSON.stringify({ hr: 'z2_only' }),
    instructions: 'Easy run — Z2 HR only. Aerobic base maintenance.',
  },
  {
    discipline: 'run',
    type: 'long_run',
    phase: 'all',
    purpose: 'endurance',
    default_duration_min: 60,
    default_duration_max: 150,
    intensity_zone: 2,
    progression_rules: JSON.stringify({ cap_mi: 16, cap_min: 150, focus: 'durability' }),
    instructions: 'Long run — progressive duration within weekly cap. Z2, durability focus.',
  },
  {
    discipline: 'run',
    type: 'brick_run',
    phase: 'all',
    purpose: 'brick_transition',
    default_duration_min: 20,
    default_duration_max: 45,
    intensity_zone: 2,
    progression_rules: JSON.stringify({ min_week: 13, after: 'bike' }),
    instructions: 'Brick run off bike — 20-45min Z2, practice T2 legs.',
  },
  {
    discipline: 'run',
    type: 'recovery',
    phase: 'all',
    purpose: 'recovery',
    default_duration_min: 20,
    default_duration_max: 40,
    intensity_zone: 1,
    progression_rules: JSON.stringify({ effort: 'very_easy_z1' }),
    instructions: 'Recovery run — very easy Z1, optional if legs are fresh.',
  },

  // ─── STRENGTH ──────────────────────────────────────────────────────────────
  {
    discipline: 'strength',
    type: 'foundation_strength',
    phase: 'foundation',
    purpose: 'stability',
    default_duration_min: 45,
    default_duration_max: 60,
    intensity_zone: 2,
    progression_rules: JSON.stringify({ focus: 'hip_stability_glutes_core', not_hypertrophy: true }),
    instructions: 'Functional strength — hip stability, glutes, core. Not for hypertrophy.',
  },
  {
    discipline: 'strength',
    type: 'in_season_maintenance',
    phase: 'all',
    purpose: 'maintenance',
    default_duration_min: 30,
    default_duration_max: 45,
    intensity_zone: 2,
    progression_rules: JSON.stringify({ volume: 'reduced', quality: 'movement_quality_focus' }),
    instructions: 'Maintenance strength — reduced volume, movement quality focus.',
  },
];

/**
 * Seed all templates into the DB if the table is empty.
 * @param {import('better-sqlite3').Database} db
 */
function seedTemplates(db) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM workout_templates').get();
  if (count.n > 0) return;

  const insert = db.prepare(`
    INSERT INTO workout_templates
      (discipline, type, phase, purpose, default_duration_min, default_duration_max,
       intensity_zone, progression_rules, instructions)
    VALUES
      (@discipline, @type, @phase, @purpose, @default_duration_min, @default_duration_max,
       @intensity_zone, @progression_rules, @instructions)
  `);

  const insertMany = db.transaction((templates) => {
    for (const t of templates) insert.run(t);
  });

  insertMany(WORKOUT_TEMPLATES);
}

/**
 * Return templates matching the given week, phase, and discipline.
 * Matches if template.phase === phase OR template.phase === 'all'.
 *
 * @param {number} weekNum
 * @param {string} phase
 * @param {string} discipline
 * @returns {Array}
 */
function getTemplatesForWeek(weekNum, phase, discipline) {
  return WORKOUT_TEMPLATES.filter(t => {
    if (t.discipline !== discipline) return false;
    if (t.phase !== 'all' && t.phase !== phase) return false;
    return true;
  });
}

module.exports = { WORKOUT_TEMPLATES, seedTemplates, getTemplatesForWeek };
