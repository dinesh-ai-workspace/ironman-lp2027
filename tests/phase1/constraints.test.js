'use strict';

const {
  isConsecutiveDays,
  wouldViolateLongSessionAdjacentRule,
  wouldExceedRunWeeklyCap,
  wouldExceedLongRunCeiling,
  wouldExceedBikeCap,
  isStepBackWeek,
  isTaperWeek,
} = require('../../src/core/plan-generator/constraints');

// ─── isConsecutiveDays ────────────────────────────────────────────────────────
describe('isConsecutiveDays', () => {
  test('returns true for adjacent days (Aug 1 → Aug 2)', () => {
    expect(isConsecutiveDays('2026-08-01', '2026-08-02')).toBe(true);
  });

  test('returns true for adjacent days in reverse order (Aug 2 → Aug 1)', () => {
    expect(isConsecutiveDays('2026-08-02', '2026-08-01')).toBe(true);
  });

  test('returns true for month boundary (Jan 31 → Feb 1)', () => {
    expect(isConsecutiveDays('2027-01-31', '2027-02-01')).toBe(true);
  });

  test('returns false for same day', () => {
    expect(isConsecutiveDays('2026-08-01', '2026-08-01')).toBe(false);
  });

  test('returns false for 2 days apart', () => {
    expect(isConsecutiveDays('2026-08-01', '2026-08-03')).toBe(false);
  });

  test('returns false for 7 days apart', () => {
    expect(isConsecutiveDays('2026-08-01', '2026-08-08')).toBe(false);
  });
});

// ─── wouldViolateLongSessionAdjacentRule ──────────────────────────────────────
describe('wouldViolateLongSessionAdjacentRule', () => {
  const longBikeSat = { date: '2026-09-12', discipline: 'bike', type: 'long_ride' };
  const longRunSun  = { date: '2026-09-13', discipline: 'run',  type: 'long_run' };
  const longRunMon  = { date: '2026-09-14', discipline: 'run',  type: 'long_run' };
  const longRunThu  = { date: '2026-09-10', discipline: 'run',  type: 'long_run' };
  const easyRunSun  = { date: '2026-09-13', discipline: 'run',  type: 'easy' };
  const longSwimSat = { date: '2026-09-12', discipline: 'swim', type: 'endurance' };

  test('long bike Saturday + long run Sunday = VIOLATION', () => {
    expect(wouldViolateLongSessionAdjacentRule([longBikeSat], longRunSun)).toBe(true);
  });

  test('long run Sunday + long bike Saturday = VIOLATION (reverse check)', () => {
    expect(wouldViolateLongSessionAdjacentRule([longRunSun], longBikeSat)).toBe(true);
  });

  test('long bike Saturday + long run Monday = OK (2 days apart)', () => {
    expect(wouldViolateLongSessionAdjacentRule([longBikeSat], longRunMon)).toBe(false);
  });

  test('long bike Saturday + long run Thursday = OK (not adjacent)', () => {
    expect(wouldViolateLongSessionAdjacentRule([longBikeSat], longRunThu)).toBe(false);
  });

  test('long bike Saturday + easy run Sunday = NOT a violation (not long_run type)', () => {
    expect(wouldViolateLongSessionAdjacentRule([longBikeSat], easyRunSun)).toBe(false);
  });

  test('long swim Saturday + long run Sunday = NOT a violation (swim/run adjacency is fine)', () => {
    expect(wouldViolateLongSessionAdjacentRule([longSwimSat], longRunSun)).toBe(false);
  });

  test('no existing sessions, adding long run = no violation', () => {
    expect(wouldViolateLongSessionAdjacentRule([], longRunSun)).toBe(false);
  });

  test('non-long session type does not violate (easy bike adjacent to long run)', () => {
    const easyBike = { date: '2026-09-12', discipline: 'bike', type: 'easy' };
    expect(wouldViolateLongSessionAdjacentRule([easyBike], longRunSun)).toBe(false);
  });
});

// ─── wouldExceedRunWeeklyCap ──────────────────────────────────────────────────
describe('wouldExceedRunWeeklyCap', () => {
  // Week 4 cap = 18mi
  // 15mi + 2mi = 17 <= 18 → false
  test('week 4: 15mi + 2mi = false (17 does not exceed 18)', () => {
    expect(wouldExceedRunWeeklyCap(4, 15, 2)).toBe(false);
  });

  // 17mi + 2mi = 19 > 18 → true
  test('week 4: 17mi + 2mi = true (19 exceeds 18)', () => {
    expect(wouldExceedRunWeeklyCap(4, 17, 2)).toBe(true);
  });

  // 17mi + 3mi = 20 > 18 → true
  test('week 4: 17mi + 3mi = true (20 > 18)', () => {
    expect(wouldExceedRunWeeklyCap(4, 17, 3)).toBe(true);
  });

  test('week 4: 18mi + 0mi = false (exactly at cap)', () => {
    expect(wouldExceedRunWeeklyCap(4, 18, 0)).toBe(false);
  });

  test('week 4: 18mi + 0.1mi = true (just over)', () => {
    expect(wouldExceedRunWeeklyCap(4, 18, 0.1)).toBe(true);
  });

  // Week 8 still cap = 18mi (<=8)
  test('week 8: 17mi + 0.9mi = false (17.9 <= 18)', () => {
    expect(wouldExceedRunWeeklyCap(8, 17, 0.9)).toBe(false);
  });

  // Week 9 cap = 25mi
  test('week 9: 24mi + 1mi = false (25 <= 25)', () => {
    expect(wouldExceedRunWeeklyCap(9, 24, 1)).toBe(false);
  });

  // Week 10 cap = 25mi
  test('week 10: 24mi + 2mi = true (26 > 25)', () => {
    expect(wouldExceedRunWeeklyCap(10, 24, 2)).toBe(true);
  });

  test('week 10: 24mi + 1mi boundary = false (25 = 25)', () => {
    expect(wouldExceedRunWeeklyCap(10, 24, 1)).toBe(false);
  });

  test('week 30: 20mi + 6mi = true (26 > 25)', () => {
    expect(wouldExceedRunWeeklyCap(30, 20, 6)).toBe(true);
  });
});

// ─── wouldExceedLongRunCeiling ────────────────────────────────────────────────
describe('wouldExceedLongRunCeiling', () => {
  test('16mi / 150min = boundary — false (at ceiling, not over)', () => {
    expect(wouldExceedLongRunCeiling(150, 16)).toBe(false);
  });

  test('16.1mi = true (over distance ceiling)', () => {
    expect(wouldExceedLongRunCeiling(140, 16.1)).toBe(true);
  });

  test('151min = true (over time ceiling)', () => {
    expect(wouldExceedLongRunCeiling(151, 14)).toBe(true);
  });

  test('150min exactly = false (at ceiling)', () => {
    expect(wouldExceedLongRunCeiling(150, 14)).toBe(false);
  });

  test('14mi / 120min = false (well within both ceilings)', () => {
    expect(wouldExceedLongRunCeiling(120, 14)).toBe(false);
  });

  test('16mi / 151min — 151min alone triggers true', () => {
    expect(wouldExceedLongRunCeiling(151, 16)).toBe(true);
  });
});

// ─── wouldExceedBikeCap ───────────────────────────────────────────────────────
describe('wouldExceedBikeCap', () => {
  // Week 36 ramp max = 330min
  test('week 36: 330min = boundary — false', () => {
    expect(wouldExceedBikeCap(330, 36, [])).toBe(false);
  });

  test('week 36: 331min = true (over 330 ceiling)', () => {
    expect(wouldExceedBikeCap(331, 36, [])).toBe(true);
  });

  // Week 38 ramp max = 360min; simulation ride rules apply (>= 330)
  test('week 38: 360min = false (first simulation ride allowed)', () => {
    expect(wouldExceedBikeCap(360, 38, [])).toBe(false);
  });

  test('week 38: 361min = true (over 360 ceiling)', () => {
    expect(wouldExceedBikeCap(361, 38, [])).toBe(true);
  });

  test('week 39: second simulation ride (>= 330min already exists) = true', () => {
    const existing = [{ weekNum: 38, durationMin: 360, type: 'race_simulation' }];
    expect(wouldExceedBikeCap(360, 39, existing)).toBe(true);
  });

  test('week 39: first simulation ride = false', () => {
    expect(wouldExceedBikeCap(330, 39, [])).toBe(false);
  });

  test('week 40+: simulation ride (>= 330min) = true (outside window)', () => {
    expect(wouldExceedBikeCap(330, 40, [])).toBe(true);
  });

  test('week 37: simulation ride (>= 330min) = true (before week 38)', () => {
    expect(wouldExceedBikeCap(330, 37, [])).toBe(true);
  });

  // Week 24 ramp max = 240min
  test('week 24: 240min = false (at ceiling)', () => {
    expect(wouldExceedBikeCap(240, 24, [])).toBe(false);
  });

  test('week 24: 241min = true (over ceiling)', () => {
    expect(wouldExceedBikeCap(241, 24, [])).toBe(true);
  });

  // Early week interpolation
  test('week 4: max is 90min; 90min = false', () => {
    expect(wouldExceedBikeCap(90, 4, [])).toBe(false);
  });

  test('week 4: 91min = true', () => {
    expect(wouldExceedBikeCap(91, 4, [])).toBe(true);
  });
});

// ─── isStepBackWeek ───────────────────────────────────────────────────────────
describe('isStepBackWeek', () => {
  const stepBackWeeks = [4, 8, 12, 16, 20, 24, 28, 32, 36, 40];
  const normalWeeks   = [1, 2, 3, 5, 6, 7, 9, 10, 11, 13];

  for (const w of stepBackWeeks) {
    test(`week ${w} is a step-back week`, () => {
      expect(isStepBackWeek(w)).toBe(true);
    });
  }

  for (const w of normalWeeks) {
    test(`week ${w} is NOT a step-back week`, () => {
      expect(isStepBackWeek(w)).toBe(false);
    });
  }
});

// ─── isTaperWeek ─────────────────────────────────────────────────────────────
describe('isTaperWeek', () => {
  const blocks = [
    { phase: 'foundation',   weekStart: 1,  weekEnd: 12 },
    { phase: 'aerobic_base', weekStart: 13, weekEnd: 24 },
    { phase: 'build',        weekStart: 25, weekEnd: 34 },
    { phase: 'peak',         weekStart: 35, weekEnd: 39 },
    { phase: 'taper',        weekStart: 40, weekEnd: 43 },
  ];

  test('week 40 is in taper', () => {
    expect(isTaperWeek(40, blocks)).toBe(true);
  });

  test('week 43 is in taper (last week)', () => {
    expect(isTaperWeek(43, blocks)).toBe(true);
  });

  test('week 39 is NOT in taper (peak)', () => {
    expect(isTaperWeek(39, blocks)).toBe(false);
  });

  test('week 1 is NOT in taper', () => {
    expect(isTaperWeek(1, blocks)).toBe(false);
  });

  test('returns false when no taper block exists', () => {
    expect(isTaperWeek(5, [])).toBe(false);
  });
});
