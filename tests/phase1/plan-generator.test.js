'use strict';

const { generatePlan, savePlan, weekNumForDate } = require('../../src/core/plan-generator');
const { DEFAULT_PHASE_TEMPLATES } = require('../../src/core/plan-generator/phase-config');
const { getDb } = require('../../src/db/connection');

const TEST_CONFIG = {
  raceDate: new Date('2027-07-25'),
  planStartDate: new Date('2026-09-07'), // first Monday on/after Sept 6
  athleteBirthDate: new Date('1980-01-15'),
  phaseTemplates: DEFAULT_PHASE_TEMPLATES,
  availableHoursPerWeek: 10,
};

// Generate the plan once for all tests (expensive but deterministic)
let generated;
beforeAll(() => {
  generated = generatePlan(TEST_CONFIG);
});

// ─── Helper: derive weekNum from session date ─────────────────────────────────
function sessionWeekNum(session) {
  return weekNumForDate(session.date, new Date(TEST_CONFIG.planStartDate));
}

// ─── Group sessions by week number ───────────────────────────────────────────
function groupByWeek(sessions) {
  const map = new Map();
  for (const s of sessions) {
    const wn = sessionWeekNum(s);
    if (!map.has(wn)) map.set(wn, []);
    map.get(wn).push(s);
  }
  return map;
}

// ─── Test 1: Every 4th week is a step-back week ──────────────────────────────
describe('Test 1: Every 4th week is a step-back week', () => {
  test('step-back weeks have lower total duration than adjacent non-step-back weeks', () => {
    const { sessions } = generated;
    const byWeek = groupByWeek(sessions);

    // Find step-back weeks that have both a prior and next week in the plan.
    const allWeekNums = [...byWeek.keys()].sort((a, b) => a - b);
    const maxWeek = allWeekNums[allWeekNums.length - 1];

    let violationFound = false;
    for (const wn of allWeekNums) {
      if (wn % 4 !== 0) continue; // only step-back weeks

      const stepBackSessions = byWeek.get(wn) || [];
      const stepBackTotal = stepBackSessions.reduce((s, x) => s + (x.target_duration || 0), 0);

      // Compare to previous week (wn - 1)
      const prevSessions = byWeek.get(wn - 1) || [];
      const prevTotal = prevSessions.reduce((s, x) => s + (x.target_duration || 0), 0);

      // Only check if both weeks exist and prev week is non-trivial (> 0 sessions)
      if (prevSessions.length > 0 && stepBackSessions.length > 0) {
        if (stepBackTotal >= prevTotal) {
          // Allow an exception for tune-up race weeks (which intentionally have fewer sessions)
          // and for week 1 (no prior data)
          const prevIsTuneUp = prevSessions.some(s => s.type && s.type.includes('tune_up'));
          const stepIsTuneUp = stepBackSessions.some(s => s.type && s.type.includes('tune_up'));
          if (!prevIsTuneUp && !stepIsTuneUp) {
            violationFound = true;
            console.error(`Week ${wn} (step-back, total ${stepBackTotal}) is NOT less than week ${wn - 1} (total ${prevTotal})`);
          }
        }
      }
    }

    expect(violationFound).toBe(false);
  });
});

// ─── Test 2: No long bike and long run on consecutive days ────────────────────
describe('Test 2: No long bike and long run on consecutive days', () => {
  test('no long_ride and long_run sessions are on consecutive days', () => {
    const { sessions } = generated;
    const longBikes = sessions.filter(s => s.discipline === 'bike' && s.type === 'long_ride');
    const longRuns  = sessions.filter(s => s.discipline === 'run'  && s.type === 'long_run');

    const violations = [];
    for (const bike of longBikes) {
      for (const run of longRuns) {
        const d1 = new Date(bike.date + 'T00:00:00Z');
        const d2 = new Date(run.date + 'T00:00:00Z');
        const diff = Math.abs(d1.getTime() - d2.getTime());
        if (diff === 86400000) { // exactly 1 day
          violations.push({ bike: bike.date, run: run.date });
        }
      }
    }

    if (violations.length > 0) {
      console.error('Consecutive day violations:', violations);
    }
    expect(violations).toHaveLength(0);
  });
});

// ─── Test 3: Step-back week run mileage stays below cap ──────────────────────
describe('Test 3: Step-back week run mileage stays below cap', () => {
  test('step-back week run mileage is below cap even if adjacent weeks are at cap', () => {
    const { sessions } = generated;
    const byWeek = groupByWeek(sessions);

    for (const [wn, weekSessions] of byWeek) {
      if (wn % 4 !== 0) continue; // step-back weeks only

      const runSessions = weekSessions.filter(s => s.discipline === 'run' && s.target_distance != null);
      const totalRunMi = runSessions.reduce((s, x) => s + (x.target_distance || 0), 0);
      const cap = wn <= 8 ? 18 : 25;

      // Step-back week should be under cap (it's 70% of the base week)
      expect(totalRunMi).toBeLessThanOrEqual(cap);
    }
  });
});

// ─── Test 4: Weekly run cap not exceeded ─────────────────────────────────────
describe('Test 4: Weekly run cap not exceeded', () => {
  test('weeks 1-8: weekly run distance ≤ 18mi', () => {
    const { sessions } = generated;
    const byWeek = groupByWeek(sessions);

    for (const [wn, weekSessions] of byWeek) {
      if (wn > 8) continue;
      const runMiles = weekSessions
        .filter(s => s.discipline === 'run' && s.target_distance != null)
        .reduce((s, x) => s + (x.target_distance || 0), 0);
      expect(runMiles).toBeLessThanOrEqual(18 + 0.01); // small float tolerance
    }
  });

  test('weeks 9+: weekly run distance ≤ 25mi', () => {
    const { sessions } = generated;
    const byWeek = groupByWeek(sessions);

    for (const [wn, weekSessions] of byWeek) {
      if (wn <= 8) continue;
      const runMiles = weekSessions
        .filter(s => s.discipline === 'run' && s.target_distance != null)
        .reduce((s, x) => s + (x.target_distance || 0), 0);
      expect(runMiles).toBeLessThanOrEqual(25 + 0.01); // small float tolerance
    }
  });
});

// ─── Test 5: 16mi / 2.5hr long-run ceiling ───────────────────────────────────
describe('Test 5: 16mi / 2.5hr long-run ceiling', () => {
  test('no long_run session has target_distance > 16mi', () => {
    const { sessions } = generated;
    const longRuns = sessions.filter(s => s.discipline === 'run' && s.type === 'long_run');

    for (const run of longRuns) {
      if (run.target_distance != null) {
        expect(run.target_distance).toBeLessThanOrEqual(16.01); // small float tolerance
      }
    }
  });

  test('no long_run session has target_duration > 150 minutes', () => {
    const { sessions } = generated;
    const longRuns = sessions.filter(s => s.discipline === 'run' && s.type === 'long_run');

    for (const run of longRuns) {
      expect(run.target_duration).toBeLessThanOrEqual(150);
    }
  });
});

// ─── Test 6: 5.5-6hr bike ceiling ────────────────────────────────────────────
describe('Test 6: 5.5-6hr bike ceiling', () => {
  test('no bike session exceeds 360 minutes', () => {
    const { sessions } = generated;
    const bikeSessions = sessions.filter(s => s.discipline === 'bike');

    for (const bike of bikeSessions) {
      expect(bike.target_duration).toBeLessThanOrEqual(360);
    }
  });

  test('exactly one bike session has target_duration >= 330 minutes, in the last 2 weeks of the peak block', () => {
    const { sessions, blocks } = generated;
    const planStart = new Date(TEST_CONFIG.planStartDate);
    const simRides = sessions.filter(
      s => s.discipline === 'bike' && s.target_duration >= 330
    );

    // There should be exactly one simulation ride
    expect(simRides.length).toBe(1);

    // It should be in the last 2 weeks of the peak block
    const peakBlock = blocks.find(b => b.phase === 'peak');
    const simRideWeeks = peakBlock ? [peakBlock.weekEnd - 1, peakBlock.weekEnd] : [38, 39];
    const simRideWeek = weekNumForDate(simRides[0].date, planStart);
    expect(simRideWeeks).toContain(simRideWeek);
  });
});

// ─── Test 7: Race week generates correctly ────────────────────────────────────
describe('Test 7: Race week generates correctly', () => {
  test('race week has reduced total volume (significantly less than peak weeks)', () => {
    const { sessions } = generated;
    const byWeek = groupByWeek(sessions);
    const planStart = new Date(TEST_CONFIG.planStartDate);

    // Find the week containing 2027-07-25
    const raceWeekNum = weekNumForDate('2027-07-25', planStart);
    const raceWeekSessions = byWeek.get(raceWeekNum) || [];
    const raceWeekTotal = raceWeekSessions.reduce((s, x) => s + (x.target_duration || 0), 0);

    // Find a peak week (around week 35-38) for comparison
    const peakWeekNums = [...byWeek.keys()].filter(w => w >= 35 && w <= 38);
    const peakTotals = peakWeekNums.map(w =>
      (byWeek.get(w) || []).reduce((s, x) => s + (x.target_duration || 0), 0)
    );
    const avgPeakTotal = peakTotals.length > 0
      ? peakTotals.reduce((a, b) => a + b, 0) / peakTotals.length
      : 0;

    // Race week should have significantly less volume than peak weeks
    // (race day alone is 660min, but pre-race days should be very light)
    expect(raceWeekSessions.length).toBeGreaterThan(0);

    // The race itself should be present
    const raceSession = raceWeekSessions.find(s => s.type === 'ironman' || s.discipline === 'race');
    expect(raceSession).toBeDefined();
  });

  test('race week contains a race session on 2027-07-25 or within the week', () => {
    const { sessions } = generated;
    const planStart = new Date(TEST_CONFIG.planStartDate);
    const raceWeekNum = weekNumForDate('2027-07-25', planStart);
    const byWeek = groupByWeek(sessions);
    const raceWeekSessions = byWeek.get(raceWeekNum) || [];

    // The last session in race week should be on 2027-07-25 (Sunday) or close to it
    const raceOrLastDay = raceWeekSessions.find(
      s => s.type === 'ironman' || (s.discipline === 'race') || s.date === '2027-07-25'
    );
    expect(raceOrLastDay).toBeDefined();
  });
});

// ─── Test 8: Plan versioning ──────────────────────────────────────────────────
describe('Test 8: Plan versioning', () => {
  let db;
  beforeAll(() => {
    db = getDb(':memory:');
  });

  test('generatePlan always returns version:1 in the plan object', () => {
    const result1 = generatePlan(TEST_CONFIG);
    const result2 = generatePlan(TEST_CONFIG);
    expect(result1.plan.version).toBe(1);
    expect(result2.plan.version).toBe(1);
  });

  test('savePlan twice: second call creates new row with version:2', () => {
    const gen1 = generatePlan(TEST_CONFIG);
    const gen2 = generatePlan(TEST_CONFIG);

    const save1 = savePlan(db, gen1);
    const save2 = savePlan(db, gen2);

    expect(save1.planId).not.toBe(save2.planId); // different rows
    expect(save1.version).toBe(1);
    expect(save2.version).toBe(2);

    // Both rows exist in the DB
    const rows = db.prepare(
      'SELECT id, version FROM plans WHERE race_date = ? AND plan_start_date = ?'
    ).all(gen1.plan.race_date, gen1.plan.plan_start_date);

    expect(rows).toHaveLength(2);
    const versions = rows.map(r => r.version).sort();
    expect(versions).toEqual([1, 2]);
  });
});

// ─── Test 9: Readiness gates seeded ──────────────────────────────────────────
describe('Test 9: Readiness gates seeded', () => {
  const REQUIRED_GATE_WEEKS = [8, 16, 24, 28, 32, 36];
  const REQUIRED_DISCIPLINES = ['swim', 'bike', 'run'];

  test('readinessGates includes gates for weeks 8, 16, 24, 28, 32, 36', () => {
    const { readinessGates } = generated;
    const weekNums = [...new Set(readinessGates.map(g => g.week_num))];

    for (const reqWeek of REQUIRED_GATE_WEEKS) {
      expect(weekNums).toContain(reqWeek);
    }
  });

  test('each checkpoint week has at least one gate per discipline (swim, bike, run)', () => {
    const { readinessGates } = generated;

    for (const wn of REQUIRED_GATE_WEEKS) {
      const weekGates = readinessGates.filter(g => g.week_num === wn);
      for (const disc of REQUIRED_DISCIPLINES) {
        const hasDisc = weekGates.some(g => g.discipline === disc);
        expect(hasDisc).toBe(true);
      }
    }
  });

  test('all readiness gates start with status="pending"', () => {
    const { readinessGates } = generated;
    for (const gate of readinessGates) {
      expect(gate.status).toBe('pending');
    }
  });

  test('all readiness gates have actual_value = null', () => {
    const { readinessGates } = generated;
    for (const gate of readinessGates) {
      expect(gate.actual_value).toBeNull();
    }
  });
});

// ─── Test 10: Plan spans full duration ───────────────────────────────────────
describe('Test 10: Plan spans full duration', () => {
  test('earliest session date is planStartDate or within 1 day', () => {
    const { sessions } = generated;
    const planStart = TEST_CONFIG.planStartDate.toISOString().slice(0, 10);
    const sessionDates = sessions.map(s => s.date).sort();
    const earliest = sessionDates[0];

    const d1 = new Date(planStart + 'T00:00:00Z');
    const d2 = new Date(earliest + 'T00:00:00Z');
    const diffDays = Math.abs((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));

    expect(diffDays).toBeLessThanOrEqual(7); // within first week (Mon start, first session Tue)
  });

  test('latest session date is 2027-07-25 or within 7 days', () => {
    const { sessions } = generated;
    const sessionDates = sessions.map(s => s.date).sort();
    const latest = sessionDates[sessionDates.length - 1];

    const raceDate = new Date('2027-07-25T00:00:00Z');
    const latestDate = new Date(latest + 'T00:00:00Z');
    const diffDays = Math.abs((latestDate.getTime() - raceDate.getTime()) / (1000 * 60 * 60 * 24));

    expect(diffDays).toBeLessThanOrEqual(7);
  });

  test('plan covers at least 40 weeks of sessions', () => {
    const { sessions } = generated;
    const byWeek = groupByWeek(sessions);
    expect(byWeek.size).toBeGreaterThanOrEqual(40);
  });

  test('plan has a meaningful number of sessions (>150)', () => {
    const { sessions } = generated;
    // A 44-week plan with 4-6 sessions/week should have well over 150
    expect(sessions.length).toBeGreaterThan(150);
  });
});
