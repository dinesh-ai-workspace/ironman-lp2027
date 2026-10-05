'use strict'

function halfUp(n) {
  return Math.floor(n + 0.5)
}

// B2: derive bike zones from 20-min FTP test
function deriveBikeZones(power20, hr20) {
  const ftp      = halfUp(power20 * 0.95)
  const bikeLthr = halfUp(hr20  * 0.95)

  // Power zones (% FTP): Z1<56, Z2 56-75, Z3 76-90, Z4 91-105, Z5>105
  const powerZones = {
    z1max:  halfUp(0.55 * ftp),
    z2:    [halfUp(0.56 * ftp), halfUp(0.75 * ftp)],
    z3:    [halfUp(0.76 * ftp), halfUp(0.90 * ftp)],
    z4:    [halfUp(0.91 * ftp), halfUp(1.05 * ftp)],
    z5min:  halfUp(1.06 * ftp),
  }

  // Bike HR zones (% bike LTHR): Z1<81, Z2 81-89, Z3 90-93, Z4 94-99, Z5≥100
  const bikeHrZones = {
    z1max:  halfUp(0.80 * bikeLthr),
    z2:    [halfUp(0.81 * bikeLthr), halfUp(0.89 * bikeLthr)],
    z3:    [halfUp(0.90 * bikeLthr), halfUp(0.93 * bikeLthr)],
    z4:    [halfUp(0.94 * bikeLthr), halfUp(0.99 * bikeLthr)],
    z5min:  halfUp(1.00 * bikeLthr),
  }

  return { ftp, bikeLthr, powerZones, bikeHrZones, bikeCeiling: bikeHrZones.z2[1] }
}

// B2: derive run zones from 30-min TT last-20-min avg HR
function deriveRunZones(lastHr20) {
  const runLthr = lastHr20  // no × 0.95

  // Run HR zones (% run LTHR): Z1<85, Z2 85-89, Z3 90-94, Z4 95-99, Z5≥100
  const runHrZones = {
    z1max:  halfUp(0.84 * runLthr),
    z2:    [halfUp(0.85 * runLthr), halfUp(0.89 * runLthr)],
    z3:    [halfUp(0.90 * runLthr), halfUp(0.94 * runLthr)],
    z4:    [halfUp(0.95 * runLthr), halfUp(0.99 * runLthr)],
    z5min:  halfUp(1.00 * runLthr),
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
