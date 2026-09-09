'use strict';

/**
 * Adaptive coach entry point.
 *
 * CRITICAL RULE: Missed sessions NEVER generate make-up volume.
 * A missed session appears in `missedSessions` but does NOT produce any
 * additional load recommendation on upcoming sessions.
 */

const { evaluateSleepTier, getSessionRecommendation } = require('./sleep-tiers');
const { evaluateGateStatus, getProgressionRecommendation } = require('./readiness');

/**
 * Evaluate the current week and return coaching recommendations.
 *
 * @param {Object} weekData
 * @param {number} weekData.weekNum
 * @param {Array}  weekData.plannedSessions      Planned sessions for this week.
 * @param {Array}  weekData.loggedSessions       What was actually logged.
 * @param {Array}  weekData.wellnessHistory      Last 14 days of daily_wellness rows (most recent last).
 * @param {Object} weekData.todayWellness        Today's wellness entry.
 * @param {Array}  weekData.readinessGates       Gates due this week.
 * @returns {Object}
 */
function evaluateWeek(weekData) {
  const {
    weekNum,
    plannedSessions = [],
    loggedSessions  = [],
    wellnessHistory = [],
    todayWellness   = null,
    readinessGates  = [],
  } = weekData;

  // ─── Sleep tier ────────────────────────────────────────────────────────────
  const sleepTier = evaluateSleepTier(wellnessHistory, todayWellness || {});

  // ─── Readiness gates ───────────────────────────────────────────────────────
  const readinessPerDiscipline = {};
  for (const gate of readinessGates) {
    const status = evaluateGateStatus(gate);
    if (!readinessPerDiscipline[gate.discipline]) {
      readinessPerDiscipline[gate.discipline] = [];
    }
    readinessPerDiscipline[gate.discipline].push(status);
  }

  // Compute progression recommendation across all disciplines that have gates.
  const allGateStatuses = Object.values(readinessPerDiscipline).flat();
  const progressionRecommendation = allGateStatuses.length > 0
    ? getProgressionRecommendation(allGateStatuses)
    : { recommendation: 'proceed', reason: 'No readiness gates this week.' };

  // ─── Identify missed sessions ──────────────────────────────────────────────
  // A session is missed if no logged session shares the same date + discipline.
  const loggedSet = new Set(loggedSessions.map(l => `${l.date}::${l.discipline}`));

  const missedSessions = plannedSessions.filter(p => {
    const key = `${p.date}::${p.discipline}`;
    return !loggedSet.has(key);
  });

  // CRITICAL: missed sessions never generate make-up volume.
  // They are reported only — no adjustments created for them.

  // ─── Session adjustments (sleep-based) ────────────────────────────────────
  const sessionAdjustments = [];

  for (const session of plannedSessions) {
    // Only adjust sessions that were not missed.
    const wasMissed = missedSessions.includes(session);
    if (wasMissed) continue;

    const rec = getSessionRecommendation(sleepTier, {
      target_duration: session.target_duration,
      target_intensity_zone: session.target_intensity_zone,
      importance: session.importance,
      type: session.type,
    });

    // Only generate an adjustment if the recommendation differs from the plan.
    if (
      rec.action !== 'proceed' ||
      rec.recommended_duration  !== session.target_duration ||
      rec.recommended_intensity !== session.target_intensity_zone
    ) {
      sessionAdjustments.push({
        planned_session_id: session.id || null,
        reason: rec.reason,
        original_duration: session.target_duration,
        recommended_duration: rec.recommended_duration,
        original_intensity: session.target_intensity_zone,
        recommended_intensity: rec.recommended_intensity,
        status: 'pending',
      });
    }
  }

  // ─── Summary statistics ────────────────────────────────────────────────────
  const plannedHours = plannedSessions.reduce((sum, s) => sum + (s.target_duration || 0), 0) / 60;
  const completedHours = loggedSessions.reduce((sum, s) => sum + (s.duration || 0), 0) / 60;
  const rpeSamples = loggedSessions.filter(s => s.rpe != null).map(s => s.rpe);
  const avgRpe = rpeSamples.length > 0
    ? rpeSamples.reduce((a, b) => a + b, 0) / rpeSamples.length
    : null;
  const injuryFlagged = todayWellness ? Boolean(todayWellness.pain_flag) : false;

  const summary = {
    plannedHours: Math.round(plannedHours * 10) / 10,
    completedHours: Math.round(completedHours * 10) / 10,
    plannedSessions: plannedSessions.length,
    completedSessions: loggedSessions.length,
    missedSessionList: missedSessions.map(s => ({ date: s.date, discipline: s.discipline, type: s.type })),
    avgRpe,
    injuryFlagged,
    readinessPerDiscipline,
  };

  return {
    sleepTier,
    progressionRecommendation,
    sessionAdjustments,
    missedSessions,
    summary,
  };
}

module.exports = { evaluateWeek };
