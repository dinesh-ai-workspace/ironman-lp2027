'use strict'

module.exports = {
  name: 'garmin',
  label: 'Garmin Connect',
  columnMap: {
    date: 'Date',
    discipline: 'Activity Type',
    duration: 'Time',
    distance: 'Distance',
    avg_hr: 'Avg HR',
    max_hr: 'Max HR',
    avg_cadence_swim: 'Avg Swim Cadence',
    avg_cadence_run:  'Avg Run Cadence',
    avg_cadence_bike: 'Avg Bike Cadence',
    avg_power: 'Avg Power',
    normalized_power: 'Normalized Power',   // stripped of ® — matched after header normalisation
    max_power: 'Max Power',
    pool_length_m: 'Pool Length',
    notes: 'Title',
    elevation_gain: 'Total Ascent',
  },
  disciplineMap: {
    'Pool Swim':            'swim',
    'Open Water Swimming':  'swim',
    'Swimming':             'swim',
    'Running':              'run',
    'Trail Running':        'run',
    'Treadmill Running':    'run',
    'Cycling':              'bike',
    'Road Cycling':         'bike',
    'Indoor Cycling':       'bike',
    'Virtual Ride':         'bike',
    'Strength Training':    'strength',
    'Golf':                 'other',
    'Other':                'other',
    'Walking':              'other',
    'Hiking':               'other',
  },
  durationUnit: 'seconds',   // plain-integer fallback (HH:MM:SS handled by regex first)
  distanceUnit: 'mi',
}
