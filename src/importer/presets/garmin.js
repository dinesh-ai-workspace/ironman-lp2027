'use strict'

module.exports = {
  name: 'garmin',
  label: 'Garmin Connect',
  columnMap: {
    date: 'Date',
    discipline: 'Activity Type',
    duration: 'Time',                        // HH:MM:SS format
    distance: 'Distance',
    avg_hr: 'Avg HR',
    max_hr: 'Max HR',
    avg_cadence: 'Avg Swim Cadence',
    avg_power: 'Avg Power',
    normalized_power: 'Normalized Power® (NP®)',  // "Normalized Power® (NP®)"
    max_power: 'Max Power',
    notes: 'Title',
    elevation_gain: 'Total Ascent',
  },
  disciplineMap: {
    'Pool Swim': 'swim',
    'Open Water Swimming': 'swim',
    'Swimming': 'swim',
    'Running': 'run',
    'Trail Running': 'run',
    'Treadmill Running': 'run',
    'Cycling': 'bike',
    'Road Cycling': 'bike',
    'Indoor Cycling': 'bike',
    'Virtual Ride': 'bike',
    'Strength Training': 'strength',
    'Golf': 'other',
    'Other': 'other',
    'Walking': 'other',
    'Hiking': 'other',
  },
  // Duration in this export is HH:MM:SS — parsed by pipeline
  durationUnit: 'hhmmss',
  // Distance unit depends on account locale — assume miles for US
  distanceUnit: 'mi',
}
