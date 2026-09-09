'use strict';

const { isSleepPoor, evaluateSleepTier, getSessionRecommendation } = require('../../src/core/adaptive-coach/sleep-tiers');
const { evaluateGateStatus, getProgressionRecommendation } = require('../../src/core/adaptive-coach/readiness');
const { evaluateWeek } = require('../../src/core/adaptive-coach');

// Helper to build a good wellness entry (OK sleep)
function goodNight(overrides = {}) {
  return { sleep_hours: 7.5, sleep_quality_1_5: 4, pain_flag: false, ...overrides };
}

// Helper to build a poor wellness entry
function poorNight(overrides = {}) {
  return { sleep_hours: 5, sleep_quality_1_5: 2, pain_flag: false, ...overrides };
}

// ─── Test 1: CAUTION tier ─────────────────────────────────────────────────────
describe('CAUTION tier — one poor night', () => {
  const wellnessHistory = Array(6).fill(null).map(() => goodNight());
  const todayWellness = poorNight({ sleep_hours: 5.5, sleep_quality_1_5: 2 });

  test('evaluateSleepTier returns CAUTION', () => {
    expect(evaluateSleepTier(wellnessHistory, todayWellness)).toBe('CAUTION');
  });

  test('high-intensity session (zone 5) gets reduce_intensity to zone 2', () => {
    const session = { target_duration: 60, target_intensity_zone: 5, importance: 'key', type: 'intervals' };
    const rec = getSessionRecommendation('CAUTION', session);
    expect(rec.action).toBe('reduce_intensity');
    expect(rec.recommended_intensity).toBe(2);
    expect(rec.recommended_duration).toBe(60); // duration unchanged
  });

  test('high-intensity zone 4 also triggers reduce_intensity', () => {
    const session = { target_duration: 45, target_intensity_zone: 4, importance: 'supporting', type: 'tempo' };
    const rec = getSessionRecommendation('CAUTION', session);
    expect(rec.action).toBe('reduce_intensity');
    expect(rec.recommended_intensity).toBe(2);
  });

  test('low-intensity session (zone 2) proceeds as planned', () => {
    const session = { target_duration: 60, target_intensity_zone: 2, importance: 'supporting', type: 'easy' };
    const rec = getSessionRecommendation('CAUTION', session);
    expect(rec.action).toBe('proceed');
    expect(rec.recommended_intensity).toBe(2);
    expect(rec.recommended_duration).toBe(60);
  });

  test('zone 1 session proceeds', () => {
    const session = { target_duration: 30, target_intensity_zone: 1, importance: 'optional', type: 'recovery' };
    const rec = getSessionRecommendation('CAUTION', session);
    expect(rec.action).toBe('proceed');
  });
});

// ─── Test 2: REDUCE tier — 2 consecutive poor nights ─────────────────────────
describe('REDUCE tier — 2 consecutive poor nights', () => {
  const wellnessHistory = [
    ...Array(5).fill(null).map(() => goodNight()),
    poorNight(), // yesterday was poor
  ];
  const todayWellness = poorNight(); // today also poor

  test('evaluateSleepTier returns REDUCE', () => {
    expect(evaluateSleepTier(wellnessHistory, todayWellness)).toBe('REDUCE');
  });

  test('key session → reduce_volume (recommended_duration < original)', () => {
    const session = { target_duration: 90, target_intensity_zone: 3, importance: 'key', type: 'long_ride' };
    const rec = getSessionRecommendation('REDUCE', session);
    expect(rec.action).toBe('reduce_volume');
    expect(rec.recommended_duration).toBeLessThan(session.target_duration);
  });

  test('supporting session → reduce_volume', () => {
    const session = { target_duration: 60, target_intensity_zone: 2, importance: 'supporting', type: 'easy' };
    const rec = getSessionRecommendation('REDUCE', session);
    expect(rec.action).toBe('reduce_volume');
    expect(rec.recommended_duration).toBeLessThan(session.target_duration);
  });

  test('optional session → skip (recommended_duration = 0)', () => {
    const session = { target_duration: 40, target_intensity_zone: 1, importance: 'optional', type: 'recovery' };
    const rec = getSessionRecommendation('REDUCE', session);
    expect(rec.action).toBe('skip');
    expect(rec.recommended_duration).toBe(0);
  });
});

// ─── Test 3: AMBER tier — 4+ poor nights in 7-day window ─────────────────────
describe('AMBER tier — persistent sleep debt', () => {
  // 5 of last 7 are poor (4 in history + today, and 2 good nights)
  const wellnessHistory = [
    goodNight(),
    poorNight(),
    poorNight(),
    poorNight(),
    poorNight(), // 4 poor in history
    goodNight(),
  ];
  const todayWellness = poorNight(); // 5th poor night in window, no pain

  test('evaluateSleepTier returns AMBER', () => {
    expect(evaluateSleepTier(wellnessHistory, todayWellness)).toBe('AMBER');
  });

  test('key session proceeds at 80% volume and intensity', () => {
    const session = { target_duration: 100, target_intensity_zone: 3, importance: 'key', type: 'long_ride' };
    const rec = getSessionRecommendation('AMBER', session);
    expect(rec.action).toBe('hold');
    expect(rec.recommended_duration).toBe(80); // 100 * 0.8
    expect(rec.recommended_intensity).toBeLessThan(session.target_intensity_zone);
  });

  test('optional session is skipped', () => {
    const session = { target_duration: 30, target_intensity_zone: 1, importance: 'optional', type: 'recovery' };
    const rec = getSessionRecommendation('AMBER', session);
    expect(rec.action).toBe('skip');
    expect(rec.recommended_duration).toBe(0);
  });
});

// ─── Test 4: SEVERE tier — persistent debt + pain flag ───────────────────────
describe('SEVERE tier — persistent debt + pain', () => {
  const wellnessHistory = [
    goodNight(),
    poorNight(),
    poorNight(),
    poorNight(),
    poorNight(),
    poorNight(),
  ];
  const todayWellness = poorNight({ pain_flag: true }); // 6th poor night + pain

  test('evaluateSleepTier returns SEVERE', () => {
    expect(evaluateSleepTier(wellnessHistory, todayWellness)).toBe('SEVERE');
  });

  test('key session → recover (Z1 effort, replace with rest)', () => {
    const session = { target_duration: 120, target_intensity_zone: 3, importance: 'key', type: 'long_run' };
    const rec = getSessionRecommendation('SEVERE', session);
    expect(rec.action).toBe('recover');
    expect(rec.recommended_intensity).toBe(1);
  });

  test('optional session → recover (Z1)', () => {
    const session = { target_duration: 30, target_intensity_zone: 2, importance: 'optional', type: 'easy' };
    const rec = getSessionRecommendation('SEVERE', session);
    expect(rec.action).toBe('recover');
    expect(rec.recommended_intensity).toBe(1);
  });
});

// ─── Test 5: RED readiness gate blocks progression ────────────────────────────
describe('RED readiness gate → step_back', () => {
  test('any RED gate triggers step_back', () => {
    const result = getProgressionRecommendation(['red', 'green']);
    expect(result.recommendation).toBe('step_back');
  });

  test('two RED gates also trigger step_back', () => {
    const result = getProgressionRecommendation(['red', 'red']);
    expect(result.recommendation).toBe('step_back');
  });
});

// ─── Test 6: AMBER readiness gate holds progression ──────────────────────────
describe('AMBER readiness gate → hold', () => {
  test('amber + green → hold', () => {
    const result = getProgressionRecommendation(['amber', 'green']);
    expect(result.recommendation).toBe('hold');
  });

  test('amber only → hold', () => {
    const result = getProgressionRecommendation(['amber']);
    expect(result.recommendation).toBe('hold');
  });
});

// ─── Test 7: GREEN readiness gate permits progression ─────────────────────────
describe('GREEN readiness gate → proceed', () => {
  test('all green → proceed', () => {
    const result = getProgressionRecommendation(['green', 'green']);
    expect(result.recommendation).toBe('proceed');
  });

  test('single green → proceed', () => {
    const result = getProgressionRecommendation(['green']);
    expect(result.recommendation).toBe('proceed');
  });
});

// ─── Test 8: Missed sessions never generate make-up volume ───────────────────
describe('Missed sessions never generate make-up volume', () => {
  const plannedSessions = [
    {
      id: 1,
      date: '2026-09-08',
      discipline: 'swim',
      type: 'technique',
      target_duration: 45,
      target_intensity_zone: 1,
      importance: 'supporting',
    },
    {
      id: 2,
      date: '2026-09-09',
      discipline: 'bike',
      type: 'endurance_z2',
      target_duration: 90,
      target_intensity_zone: 2,
      importance: 'key',
    },
  ];

  const result = evaluateWeek({
    weekNum: 1,
    plannedSessions,
    loggedSessions: [],    // nothing logged — both missed
    wellnessHistory: Array(6).fill(null).map(() => goodNight()),
    todayWellness: goodNight(),
    readinessGates: [],
  });

  test('both sessions appear in missedSessions', () => {
    expect(result.missedSessions).toHaveLength(2);
  });

  test('sessionAdjustments has no entries with recommended_duration > original_duration', () => {
    for (const adj of result.sessionAdjustments) {
      expect(adj.recommended_duration).not.toBeGreaterThan(adj.original_duration);
    }
  });

  test('no session in output has type "makeup"', () => {
    const allTypes = [
      ...result.missedSessions.map(s => s.type),
      ...result.sessionAdjustments.map(s => s.type || ''),
    ];
    expect(allTypes).not.toContain('makeup');
  });

  test('no session has a compensation note', () => {
    const allNotes = result.missedSessions.map(s => s.notes || '');
    for (const note of allNotes) {
      expect(note.toLowerCase()).not.toContain('compensation');
      expect(note.toLowerCase()).not.toContain('make.?up');
    }
  });

  test('completedSessions is 0', () => {
    expect(result.summary.completedSessions).toBe(0);
  });
});

// ─── Additional: evaluateGateStatus ──────────────────────────────────────────
describe('evaluateGateStatus', () => {
  test('null actual_value → pending', () => {
    expect(evaluateGateStatus({ actual_value: null, status: 'pending' })).toBe('pending');
  });

  test('empty string → pending', () => {
    expect(evaluateGateStatus({ actual_value: '', status: 'pending' })).toBe('pending');
  });

  test('"red" → red', () => {
    expect(evaluateGateStatus({ actual_value: 'red' })).toBe('red');
  });

  test('"amber" → amber', () => {
    expect(evaluateGateStatus({ actual_value: 'amber' })).toBe('amber');
  });

  test('"green" → green', () => {
    expect(evaluateGateStatus({ actual_value: 'green' })).toBe('green');
  });

  test('non-null, non-keyword value → green (athlete has responded)', () => {
    expect(evaluateGateStatus({ actual_value: 'Completed 2hr ride comfortably' })).toBe('green');
  });
});
