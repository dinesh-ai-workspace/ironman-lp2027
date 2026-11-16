'use strict'

function halfUp(n) {
  return Math.floor(n + 0.5)
}

// B2: derive bike zones from 20-min FTP test
// Zone bands are contiguous: each lower bound = previous upper + 1 (CN-19 #2)
function deriveBikeZones(power20, hr20) {
  const ftp      = halfUp(power20 * 0.95)
  const bikeLthr = halfUp(hr20  * 0.95)

  // Power zones (% FTP): Z1 < Z2 lower, Z2 56-75, Z3 76-90, Z4 91-105, Z5 ≥ Z4 upper+1
  const pZ2l = halfUp(0.56 * ftp)
  const pZ2u = halfUp(0.75 * ftp)
  const pZ3u = halfUp(0.90 * ftp)
  const pZ4u = halfUp(1.05 * ftp)
  const powerZones = {
    z1max:  pZ2l - 1,
    z2:    [pZ2l, pZ2u],
    z3:    [pZ2u + 1, pZ3u],
    z4:    [pZ3u + 1, pZ4u],
    z5min:  pZ4u + 1,
  }

  // Bike HR zones (% bike LTHR): Z1 < Z2 lower, Z2 81-89, Z3 90-93, Z4 94-99, Z5 ≥ Z4 upper+1
  const hZ2l = halfUp(0.81 * bikeLthr)
  const hZ2u = halfUp(0.89 * bikeLthr)
  const hZ3u = halfUp(0.93 * bikeLthr)
  const hZ4u = halfUp(0.99 * bikeLthr)
  const bikeHrZones = {
    z1max:  hZ2l - 1,
    z2:    [hZ2l, hZ2u],
    z3:    [hZ2u + 1, hZ3u],
    z4:    [hZ3u + 1, hZ4u],
    z5min:  hZ4u + 1,
  }

  return { ftp, bikeLthr, powerZones, bikeHrZones, bikeCeiling: bikeHrZones.z2[1] }
}

// B2: derive run zones from 30-min TT last-20-min avg HR
// Zone bands are contiguous: each lower bound = previous upper + 1 (CN-19 #2)
function deriveRunZones(lastHr20) {
  const runLthr = lastHr20  // no × 0.95

  // Run HR zones (% run LTHR): Z1 < Z2 lower, Z2 85-89, Z3 90-94, Z4 95-99, Z5 ≥ Z4 upper+1
  const rZ2l = halfUp(0.85 * runLthr)
  const rZ2u = halfUp(0.89 * runLthr)
  const rZ3u = halfUp(0.94 * runLthr)
  const rZ4u = halfUp(0.99 * runLthr)
  const runHrZones = {
    z1max:  rZ2l - 1,
    z2:    [rZ2l, rZ2u],
    z3:    [rZ2u + 1, rZ3u],
    z4:    [rZ3u + 1, rZ4u],
    z5min:  rZ4u + 1,
  }

  return { runLthr, runHrZones, runCeiling: runHrZones.z2[1] }
}

// B2: derive swim pace from 400m TT time (in minutes, decimal)
function deriveSwimPace(time400mMin) {
  const pace100mMin = time400mMin / 4
  const mins = Math.floor(pace100mMin)
  const secs = Math.round((pace100mMin - mins) * 60)
  return {
    pace100m: pace100mMin,
    paceFormatted: `${mins}:${String(secs).padStart(2, '0')}`,
  }
}

module.exports = { halfUp, deriveBikeZones, deriveRunZones, deriveSwimPace }
