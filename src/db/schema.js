'use strict';

/**
 * Apply all CREATE TABLE IF NOT EXISTS statements to the given db connection.
 * @param {import('better-sqlite3').Database} db
 */
function applySchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      race_date TEXT NOT NULL,
      plan_start_date TEXT NOT NULL,
      athlete_birth_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      version INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS plan_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL REFERENCES plans(id),
      phase TEXT NOT NULL,
      phase_name TEXT NOT NULL,
      week_start INTEGER NOT NULL,
      week_end INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      target_weekly_hours_min REAL NOT NULL,
      target_weekly_hours_max REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workout_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discipline TEXT NOT NULL,
      type TEXT NOT NULL,
      phase TEXT NOT NULL,
      purpose TEXT NOT NULL,
      default_duration_min INTEGER NOT NULL,
      default_duration_max INTEGER NOT NULL,
      intensity_zone INTEGER NOT NULL,
      progression_rules TEXT NOT NULL DEFAULT '{}',
      instructions TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS planned_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL REFERENCES plans(id),
      block_id INTEGER NOT NULL REFERENCES plan_blocks(id),
      workout_template_id INTEGER REFERENCES workout_templates(id),
      date TEXT NOT NULL,
      discipline TEXT NOT NULL,
      type TEXT NOT NULL,
      target_duration INTEGER NOT NULL,
      target_distance REAL,
      target_intensity_zone INTEGER NOT NULL,
      is_brick INTEGER NOT NULL DEFAULT 0,
      purpose TEXT NOT NULL,
      importance TEXT NOT NULL CHECK(importance IN ('key','supporting','optional')),
      notes TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS readiness_gates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      week_num INTEGER NOT NULL,
      phase TEXT NOT NULL,
      discipline TEXT NOT NULL,
      metric TEXT NOT NULL,
      target_value TEXT NOT NULL,
      actual_value TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','green','amber','red')),
      notes TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS daily_wellness (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      sleep_hours REAL,
      sleep_quality_1_5 INTEGER,
      fatigue_1_5 INTEGER,
      soreness_1_5 INTEGER,
      pain_flag INTEGER NOT NULL DEFAULT 0,
      pain_notes TEXT NOT NULL DEFAULT '',
      motivation_1_5 INTEGER,
      notes TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS session_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      planned_session_id INTEGER NOT NULL REFERENCES planned_sessions(id),
      reason TEXT NOT NULL,
      original_duration INTEGER NOT NULL,
      recommended_duration INTEGER NOT NULL,
      original_intensity INTEGER NOT NULL,
      recommended_intensity INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','dismissed')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS nutrition_targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      calories INTEGER,
      protein_g INTEGER,
      carbs_g INTEGER,
      fat_g INTEGER,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS nutrition_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      meal TEXT NOT NULL DEFAULT 'other',
      food_name TEXT NOT NULL DEFAULT '',
      calories INTEGER,
      protein_g REAL,
      carbs_g REAL,
      fat_g REAL,
      fiber_g REAL,
      sugar_g REAL,
      sodium_mg REAL,
      notes TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'manual',
      import_batch_id TEXT
    );

    CREATE TABLE IF NOT EXISTS race_nutrition_plan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      carbs_per_hour_g INTEGER NOT NULL DEFAULT 60,
      fluids_ml_per_hour INTEGER NOT NULL DEFAULT 500,
      sodium_mg_per_hour INTEGER NOT NULL DEFAULT 500,
      gel_every_min INTEGER NOT NULL DEFAULT 45,
      notes TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS logged_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      planned_session_id INTEGER REFERENCES planned_sessions(id),
      discipline TEXT NOT NULL,
      date TEXT NOT NULL,
      start_datetime TEXT,
      end_datetime TEXT,
      duration INTEGER,
      distance REAL,
      avg_hr INTEGER,
      hr_zone_json TEXT,
      rpe INTEGER,
      notes TEXT NOT NULL DEFAULT '',
      is_brick INTEGER NOT NULL DEFAULT 0,
      brick_pair_id INTEGER,
      avg_power INTEGER,
      normalized_power INTEGER,
      max_power INTEGER,
      avg_cadence INTEGER,
      environment TEXT,
      wetsuit_used INTEGER,
      pool_length_m INTEGER,
      source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','csv_garmin','csv_strava','csv_other')),
      import_batch_id TEXT
    );
  `);
}

module.exports = { applySchema };
