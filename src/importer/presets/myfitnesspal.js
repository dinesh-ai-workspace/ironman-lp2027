'use strict'

// MyFitnessPal Nutrition-Summary CSV export
// Columns confirmed from real export: Date,Meal,Calories,Fat (g),Saturated Fat,
// Polyunsaturated Fat,Monounsaturated Fat,Trans Fat,Cholesterol,Sodium (mg),
// Potassium,Carbohydrates (g),Fiber,Sugar,Protein (g),...,Note

module.exports = {
  name: 'myfitnesspal',
  label: 'MyFitnessPal',
  columnMap: {
    date: 'Date',
    meal: 'Meal',
    calories: 'Calories',
    fat_g: 'Fat (g)',
    carbs_g: 'Carbohydrates (g)',
    fiber_g: 'Fiber',
    sugar_g: 'Sugar',
    protein_g: 'Protein (g)',
    sodium_mg: 'Sodium (mg)',
    notes: 'Note',
  },
  // Skip MFP summary/total rows
  skipMealValues: ['Daily Totals', 'Weekly Totals', 'Totals'],
}
