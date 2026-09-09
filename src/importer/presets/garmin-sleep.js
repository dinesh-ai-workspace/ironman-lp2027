'use strict'

// Supports two Garmin sleep export formats:
// 1. Tabular (7-day): "Sleep Score 7 Days,Score,Resting Heart Rate,..."
// 2. Key-value (1-day): "Date,2026-09-08\nSleep Duration,5h 43m\n..."

function parseSleepDuration(str) {
  if (!str || str === '--') return null
  const h = str.match(/(\d+)h/)
  const m = str.match(/(\d+)\s*min/)  // handles "5min", "5 min", "43m"
  const mShort = str.match(/(\d+)m(?!in)/)
  const hours = h ? parseInt(h[1]) : 0
  const mins = m ? parseInt(m[1]) : (mShort ? parseInt(mShort[1]) : 0)
  if (hours === 0 && mins === 0) return null
  return Math.round((hours + mins / 60) * 10) / 10
}

function scoreToQuality(score) {
  const n = parseInt(score)
  if (isNaN(n)) return null
  if (n >= 80) return 5
  if (n >= 65) return 4
  if (n >= 50) return 3
  if (n >= 35) return 2
  return 1
}

function qualityLabelToInt(label) {
  if (!label) return null
  const l = label.toLowerCase()
  if (l === 'excellent') return 5
  if (l === 'good') return 4
  if (l === 'fair') return 3
  if (l === 'poor') return 2
  if (l === 'restless') return 1
  return null
}

// Detect format by checking first line
function detectFormat(content) {
  const firstLine = content.split(/\r?\n/)[0].replace(/^﻿/, '').trim()
  if (firstLine.startsWith('Sleep Score 7 Days,') || firstLine.includes(',Score,')) {
    return 'tabular'
  }
  return 'keyvalue'
}

// Parse the tabular 7-day format
function parseTabular(content) {
  const lines = content.split(/\r?\n/).map(l => l.replace(/^﻿/, ''))
  if (lines.length < 2) return []

  function parseLine(line) {
    const fields = []
    let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { inQ = !inQ }
      else if (ch === ',' && !inQ) { fields.push(cur.trim()); cur = '' }
      else { cur += ch }
    }
    fields.push(cur.trim())
    return fields
  }

  const headers = parseLine(lines[0])
  const entries = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const vals = parseLine(line)
    const row = {}
    headers.forEach((h, idx) => { row[h] = vals[idx] || '' })

    // Date is in the first column (header: "Sleep Score 7 Days" or similar)
    const dateVal = row[headers[0]]
    if (!dateVal || !/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) continue

    const sleepHours = parseSleepDuration(row['Duration'])
    const score = row['Score']
    const quality = scoreToQuality(score) || qualityLabelToInt(row['Quality'])
    const rhr = row['Resting Heart Rate'] && row['Resting Heart Rate'] !== '--'
      ? parseInt(row['Resting Heart Rate']) : null

    const notesParts = []
    if (score && score !== '--') notesParts.push(`Sleep Score: ${score}`)
    if (row['Quality']) notesParts.push(`Quality: ${row['Quality']}`)
    if (row['HRV Status'] && row['HRV Status'] !== '--') notesParts.push(`HRV: ${row['HRV Status']}`)
    if (rhr) notesParts.push(`RHR: ${rhr}`)
    if (row['Body Battery'] && row['Body Battery'] !== '--') notesParts.push(`Body Battery: ${row['Body Battery']}`)

    entries.push({
      date: dateVal,
      sleep_hours: sleepHours,
      sleep_quality_1_5: quality,
      fatigue_1_5: null,
      soreness_1_5: null,
      pain_flag: 0,
      pain_notes: '',
      motivation_1_5: null,
      notes: notesParts.join(' | '),
    })
  }

  return entries
}

// Parse the single-day key-value format
function parseKeyValue(content) {
  const lines = content.split(/\r?\n/)
  const data = {}
  for (const line of lines) {
    const commaIdx = line.indexOf(',')
    if (commaIdx === -1) continue
    const key = line.slice(0, commaIdx).replace(/^﻿/, '').trim()
    const value = line.slice(commaIdx + 1).trim()
    if (key && value) data[key] = value
  }

  const date = data['Date']
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return []

  const sleepHours = parseSleepDuration(data['Sleep Duration'])
  const sleepScore = data['Sleep Score'] ? parseInt(data['Sleep Score']) : null
  const quality = sleepScore != null && !isNaN(sleepScore) ? scoreToQuality(sleepScore) : null

  const notesParts = []
  if (sleepScore) notesParts.push(`Sleep Score: ${sleepScore} (${data['Quality'] || ''})`)
  if (data['Deep Sleep Duration']) notesParts.push(`Deep: ${data['Deep Sleep Duration']}`)
  if (data['REM Duration']) notesParts.push(`REM: ${data['REM Duration']}`)
  if (data['Avg Overnight HRV']) notesParts.push(`HRV: ${data['Avg Overnight HRV']}`)

  return [{
    date,
    sleep_hours: sleepHours,
    sleep_quality_1_5: quality,
    fatigue_1_5: null,
    soreness_1_5: null,
    pain_flag: 0,
    pain_notes: '',
    motivation_1_5: null,
    notes: notesParts.join(' | '),
  }]
}

function parseGarminSleepFile(content) {
  const format = detectFormat(content)
  return format === 'tabular' ? parseTabular(content) : parseKeyValue(content)
}

module.exports = { parseGarminSleepFile }
