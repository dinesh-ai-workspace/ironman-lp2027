'use strict';

/**
 * Default phase templates — stored as plain objects so they can be overridden
 * or persisted to a DB table. Never hardcoded constants.
 *
 * Total non-Foundation weeks = 12 (aerobic_base) + 10 (build) + 6 (peak) + 4 (taper) = 32.
 * Foundation absorbs any extra weeks (totalWeeks - 32). Minimum total = 32 weeks.
 * Peak phase is a SPECIFICITY peak — total weekly hours stay flat (11–14hr),
 * discipline mix shifts toward bike on weeks 34 & 37 (reallocated, not added).
 */
const DEFAULT_PHASE_TEMPLATES = [
  { phase: 'foundation',   phaseName: 'Foundation',               weekCount: 12, hoursMin: 6.5,  hoursMax: 8.5  },
  { phase: 'aerobic_base', phaseName: 'Aerobic Base',             weekCount: 12, hoursMin: 8.5,  hoursMax: 11   },
  { phase: 'build',        phaseName: 'Build / Hill Specificity', weekCount: 10, hoursMin: 10.5, hoursMax: 13.5 },
  { phase: 'peak',         phaseName: 'Peak (Specificity)',        weekCount: 6,  hoursMin: 9,    hoursMax: 11   },
  { phase: 'taper',        phaseName: 'Taper',                    weekCount: 4,  hoursMin: 3.5,  hoursMax: 8    },
];

/**
 * Convert a Date to an ISO date string (YYYY-MM-DD).
 */
function toISO(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Add days to a Date (returns a new Date).
 */
function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/**
 * Compute phase blocks from plan start date to race date.
 *
 * Rules:
 * - The last 4 weeks are always Taper.
 * - The 5 weeks before Taper are always Peak.
 * - The 10 weeks before Peak are always Build.
 * - The 12 weeks before Build are always Aerobic Base.
 * - Foundation absorbs any extra weeks (totalWeeks - 31).
 * - If totalWeeks < 31, throw.
 *
 * @param {Date} planStartDate  Must be a Monday.
 * @param {Date} raceDate       Race day.
 * @param {Array} phaseTemplates  Array of phase template objects.
 * @returns {Array} blocks with { phase, phaseName, weekStart, weekEnd, startDate, endDate, hoursMin, hoursMax }
 */
function computePhaseBlocks(planStartDate, raceDate, phaseTemplates) {
  // Normalise to UTC midnight to avoid DST/local-timezone issues.
  // Use getUTC* methods so that ISO date strings ('YYYY-MM-DD' = UTC midnight)
  // are not shifted by local timezone offset.
  const start = new Date(Date.UTC(
    planStartDate.getUTCFullYear(), planStartDate.getUTCMonth(), planStartDate.getUTCDate()
  ));
  const race = new Date(Date.UTC(
    raceDate.getUTCFullYear(), raceDate.getUTCMonth(), raceDate.getUTCDate()
  ));

  // Total days from plan start to race day.
  const totalDays = Math.round((race.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  // Total weeks needed: race day is in week floor(totalDays/7)+1.
  // We include race week in the block count so the taper covers it.
  const totalWeeks = Math.floor(totalDays / 7) + 1;

  if (totalWeeks < 32) {
    throw new Error(
      `Plan only spans ${totalWeeks} weeks. Minimum required is 32 weeks (taper:5 + peak:5 + build:10 + aerobic_base:12).`
    );
  }

  // Look up templates by phase name for easy reference.
  const byPhase = {};
  for (const t of phaseTemplates) {
    byPhase[t.phase] = t;
  }

  // Fixed (race-proximate) phase week counts.
  const taperWeeks   = byPhase['taper'].weekCount;        // 4
  const peakWeeks    = byPhase['peak'].weekCount;          // 5
  const buildWeeks   = byPhase['build'].weekCount;         // 10
  const aerobicWeeks = byPhase['aerobic_base'].weekCount;  // 12
  const fixedWeeks   = taperWeeks + peakWeeks + buildWeeks + aerobicWeeks; // 31

  const foundationWeeks = totalWeeks - fixedWeeks; // absorbs surplus

  // Build ordered phases with their resolved week counts.
  const phases = [
    { ...byPhase['foundation'],   weekCount: foundationWeeks },
    { ...byPhase['aerobic_base'], weekCount: aerobicWeeks },
    { ...byPhase['build'],        weekCount: buildWeeks },
    { ...byPhase['peak'],         weekCount: peakWeeks },
    { ...byPhase['taper'],        weekCount: taperWeeks },
  ];

  const blocks = [];
  let weekCursor = 1; // 1-indexed

  for (const p of phases) {
    const weekStart = weekCursor;
    const weekEnd   = weekCursor + p.weekCount - 1;
    const blockStartDate = addDays(start, (weekStart - 1) * 7);
    const blockEndDate   = addDays(start, weekEnd * 7 - 1); // inclusive last day (Sunday)

    blocks.push({
      phase:     p.phase,
      phaseName: p.phaseName,
      weekStart,
      weekEnd,
      startDate: toISO(blockStartDate),
      endDate:   toISO(blockEndDate),
      hoursMin:  p.hoursMin,
      hoursMax:  p.hoursMax,
    });

    weekCursor += p.weekCount;
  }

  return blocks;
}

module.exports = { DEFAULT_PHASE_TEMPLATES, computePhaseBlocks };
