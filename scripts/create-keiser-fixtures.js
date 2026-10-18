'use strict'

// Creates test/fixtures/garmin_ftp.fit (AT1: no laps) and
// test/fixtures/garmin_ftp_lap.fit (AT2: 1200-s lap at 230W over 250W window)
// Also creates test/fixtures/keiser_at2.tcx for AT2.

const fs = require('fs')
const path = require('path')
const { FitEncoder, FitBaseType } = require('fit-file-parser')

const FIXTURE_DIR = path.join(__dirname, '../test/fixtures')

// ─── Garmin FIT builder helpers ───────────────────────────────────────────────

function buildFit(startDate, durationS, hrSegments, laps) {
  // hrSegments: [{startS, endS, hr}]  — HR values by time range
  // laps: [{startOffsetS, durationS, avgPower}]  — optional Garmin laps
  const enc = new FitEncoder()
  const startTs = FitEncoder.toFitTimestamp(startDate)

  // file_id
  enc.writeMessage(0, [
    { number: 0, size: 1, baseType: FitBaseType.Enum, value: 4 },    // type = activity
    { number: 1, size: 2, baseType: FitBaseType.Uint16, value: 1 },  // manufacturer = Garmin
  ])

  // session (msg 18)
  enc.writeMessage(18, [
    { number: 2, size: 4, baseType: FitBaseType.Uint32, value: startTs },
    { number: 5, size: 1, baseType: FitBaseType.Enum,   value: 2 },         // sport = cycling
    { number: 6, size: 1, baseType: FitBaseType.Enum,   value: 6 },         // sub_sport = indoor_cycling
    { number: 7, size: 4, baseType: FitBaseType.Uint32, value: durationS * 1000 }, // total_elapsed_time (ms)
  ])

  // laps (msg 19)
  for (const lap of (laps || [])) {
    const lapTs = FitEncoder.toFitTimestamp(new Date(startDate.getTime() + lap.startOffsetS * 1000))
    enc.writeMessage(19, [
      { number: 2,  size: 4, baseType: FitBaseType.Uint32, value: lapTs },
      { number: 7,  size: 4, baseType: FitBaseType.Uint32, value: lap.durationS * 1000 },
      { number: 19, size: 2, baseType: FitBaseType.Uint16, value: lap.avgPower },
    ])
  }

  // records (msg 20): one per second
  for (let s = 0; s < durationS; s++) {
    const ts = startTs + s
    const seg = hrSegments.find(seg => s >= seg.startS && s < seg.endS)
    const hr = seg ? seg.hr : 100
    enc.writeMessage(20, [
      { number: 253, size: 4, baseType: FitBaseType.Uint32, value: ts },
      { number: 3,   size: 1, baseType: FitBaseType.Uint8,  value: hr },
    ])
  }

  return enc.close()
}

// ─── AT1 fixture: garmin_ftp.fit (no laps) ───────────────────────────────────
// Matches keiser_ftp.tcx: 14:00–14:55 UTC (3300 s)
// HR: 0–1500 s = 130, 1500–2700 s = 165, 2700–3300 s = 120
{
  const startDate = new Date('2026-10-18T14:00:00.000Z')
  const arr = buildFit(startDate, 3300, [
    { startS: 0,    endS: 1500, hr: 130 },
    { startS: 1500, endS: 2700, hr: 165 },
    { startS: 2700, endS: 3300, hr: 120 },
  ], [])
  const outPath = path.join(FIXTURE_DIR, 'garmin_ftp.fit')
  fs.writeFileSync(outPath, Buffer.from(arr))
  console.log('Created', outPath, arr.byteLength, 'bytes')
}

// ─── AT2 fixture: keiser_at2.tcx ─────────────────────────────────────────────
// 0–1200 s @ 250W / HR 150, 1200–2400 s @ 230W / HR 160, 2400–3300 s @ 150W / HR 140
{
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"
  xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
  <Activities>
    <Activity Sport="Biking">
      <Id>2026-10-18T15:00:00.000Z</Id>
      <Lap StartTime="2026-10-18T15:00:00.000Z">
        <TotalTimeSeconds>3300</TotalTimeSeconds>
        <Tracks>
          <Track>
            <Trackpoint>
              <Time>2026-10-18T15:00:00.000Z</Time>
              <Cadence>95</Cadence>
              <HeartRateBpm><Value>150</Value></HeartRateBpm>
              <Extensions><ns3:TPX><ns3:Watts>250</ns3:Watts></ns3:TPX></Extensions>
            </Trackpoint>
            <Trackpoint>
              <Time>2026-10-18T15:20:00.000Z</Time>
              <Cadence>95</Cadence>
              <HeartRateBpm><Value>150</Value></HeartRateBpm>
              <Extensions><ns3:TPX><ns3:Watts>250</ns3:Watts></ns3:TPX></Extensions>
            </Trackpoint>
            <Trackpoint>
              <Time>2026-10-18T15:20:01.000Z</Time>
              <Cadence>100</Cadence>
              <HeartRateBpm><Value>160</Value></HeartRateBpm>
              <Extensions><ns3:TPX><ns3:Watts>230</ns3:Watts></ns3:TPX></Extensions>
            </Trackpoint>
            <Trackpoint>
              <Time>2026-10-18T15:40:00.000Z</Time>
              <Cadence>100</Cadence>
              <HeartRateBpm><Value>160</Value></HeartRateBpm>
              <Extensions><ns3:TPX><ns3:Watts>230</ns3:Watts></ns3:TPX></Extensions>
            </Trackpoint>
            <Trackpoint>
              <Time>2026-10-18T15:40:01.000Z</Time>
              <Cadence>80</Cadence>
              <HeartRateBpm><Value>140</Value></HeartRateBpm>
              <Extensions><ns3:TPX><ns3:Watts>150</ns3:Watts></ns3:TPX></Extensions>
            </Trackpoint>
            <Trackpoint>
              <Time>2026-10-18T15:55:00.000Z</Time>
              <Cadence>80</Cadence>
              <HeartRateBpm><Value>140</Value></HeartRateBpm>
              <Extensions><ns3:TPX><ns3:Watts>150</ns3:Watts></ns3:TPX></Extensions>
            </Trackpoint>
          </Track>
        </Tracks>
      </Lap>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`
  const outPath = path.join(FIXTURE_DIR, 'keiser_at2.tcx')
  fs.writeFileSync(outPath, xml)
  console.log('Created', outPath)
}

// ─── AT2 fixture: garmin_ftp_lap.fit (one 1200-s lap at offset 1200 s) ───────
// The Garmin lap covers 15:20–15:40 UTC (the 230W segment from keiser_at2.tcx)
// avg_power in lap = 230W
// Garmin has HR data but the 250W rolling window (15:00–15:20) would beat 230W
// — but the lap takes priority in findBest20Window
{
  const startDate = new Date('2026-10-18T15:00:00.000Z')
  const arr = buildFit(startDate, 3300, [
    { startS: 0,    endS: 1200, hr: 150 },
    { startS: 1200, endS: 2400, hr: 160 },
    { startS: 2400, endS: 3300, hr: 140 },
  ], [
    { startOffsetS: 1200, durationS: 1200, avgPower: 230 },
  ])
  const outPath = path.join(FIXTURE_DIR, 'garmin_ftp_lap.fit')
  fs.writeFileSync(outPath, Buffer.from(arr))
  console.log('Created', outPath, arr.byteLength, 'bytes')
}

console.log('Fixtures created successfully.')
