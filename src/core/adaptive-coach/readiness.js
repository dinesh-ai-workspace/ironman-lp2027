'use strict';

/**
 * Pure functions for readiness gate evaluation.
 * No I/O, no side effects.
 */

/**
 * Evaluate the status of a single readiness gate.
 *
 * Because gate metrics are qualitative text fields (set by the athlete),
 * the function applies a simple rule:
 *   - actual_value is null → 'pending'
 *   - actual_value is explicitly set to 'red' or 'amber' or 'green' → use it directly
 *   - Otherwise: a non-empty actual_value means the athlete has addressed the gate;
 *     default to 'green' (coach can override manually).
 *
 * @param {{ metric: string, target_value: string, actual_value: string|null, status: string }} gate
 * @returns {'green'|'amber'|'red'|'pending'}
 */
function evaluateGateStatus(gate) {
  if (gate.actual_value == null || gate.actual_value === '') return 'pending';

  const v = gate.actual_value.trim().toLowerCase();
  if (v === 'red')   return 'red';
  if (v === 'amber') return 'amber';
  if (v === 'green') return 'green';

  // Non-null, non-empty, non-keyword value → athlete has responded → green
  return 'green';
}

/**
 * Given readiness gate statuses for a discipline, return a progression recommendation.
 *
 * Rules:
 *   Any 'red'   → step_back
 *   Any 'amber', no 'red' → hold (flat week)
 *   All 'green'  → proceed
 *
 * @param {Array<'green'|'amber'|'red'>} gateStatuses
 * @returns {{ recommendation: 'proceed'|'hold'|'step_back', reason: string }}
 */
function getProgressionRecommendation(gateStatuses) {
  if (gateStatuses.some(s => s === 'red')) {
    return {
      recommendation: 'step_back',
      reason: 'One or more readiness gates are RED. Step back to consolidate fitness before progressing.',
    };
  }
  if (gateStatuses.some(s => s === 'amber')) {
    return {
      recommendation: 'hold',
      reason: 'One or more readiness gates are AMBER. Hold at current load — flat week with no progression.',
    };
  }
  return {
    recommendation: 'proceed',
    reason: 'All readiness gates are GREEN. Proceed with planned progression.',
  };
}

module.exports = { evaluateGateStatus, getProgressionRecommendation };
