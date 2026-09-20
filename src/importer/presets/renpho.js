'use strict'

/**
 * Renpho smart scale CSV export preset.
 * Export format: "RENPHO Health-<name>.csv"
 * Date format:   M/D/YY  (e.g. "9/18/26")
 * All column names have a leading space except 'Date' and 'BMI' etc.
 */
module.exports = {
  name: 'renpho',
  label: 'Renpho Scale',

  // Map internal field → raw CSV column name (trimmed during parse)
  columnMap: {
    date:                 'Date',
    time:                 'Time',
    weight_lb:            'Weight(lb)',
    bmi:                  'BMI',
    body_fat_pct:         'Body Fat(%)',
    skeletal_muscle_pct:  'Skeletal Muscle(%)',
    fat_free_mass_lb:     'Fat-Free Mass(lb)',
    subcutaneous_fat_pct: 'Subcutaneous Fat(%)',
    visceral_fat:         'Visceral Fat',
    body_water_pct:       'Body Water(%)',
    muscle_mass_lb:       'Muscle Mass(lb)',
    bone_mass_lb:         'Bone Mass(lb)',
    protein_pct:          'Protein (%)',
    bmr_kcal:             'BMR(kcal)',
    metabolic_age:        'Metabolic Age',
  },

  // Date is M/D/YY — handled by the Renpho pipeline
  dateFormat: 'M/D/YY',
}
