'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Plan
  generateAndSavePlan: (config) => ipcRenderer.invoke('plan:generate', config),
  getPlan: () => ipcRenderer.invoke('plan:get'),
  getPlannedSessions: (filters) => ipcRenderer.invoke('sessions:planned:list', filters),

  // Logging
  logSession: (session) => ipcRenderer.invoke('sessions:log', session),
  getLoggedSessions: (filters) => ipcRenderer.invoke('sessions:logged:list', filters),
  updateLoggedSession: (id, data) => ipcRenderer.invoke('sessions:logged:update', id, data),

  // Wellness
  saveWellness: (entry) => ipcRenderer.invoke('wellness:save', entry),
  getWellness: (date) => ipcRenderer.invoke('wellness:get', date),
  getWellnessHistory: (days) => ipcRenderer.invoke('wellness:history', days),

  // Import
  importCSV: (filePath, preset, mappingOverrides) => ipcRenderer.invoke('import:csv', filePath, preset, mappingOverrides),
  previewCSV: (filePath, preset) => ipcRenderer.invoke('import:preview', filePath, preset),
  importSleep: (filePath) => ipcRenderer.invoke('import:sleep', filePath),

  // Dashboard
  getWeeklyVolume: (weeks) => ipcRenderer.invoke('stats:weekly-volume', weeks),
  getUpcomingSessions: (days) => ipcRenderer.invoke('stats:upcoming', days),
  getReadinessGates: () => ipcRenderer.invoke('stats:readiness'),
  updateReadinessGate: (id, data) => ipcRenderer.invoke('stats:readiness:update', id, data),
  getProgressStats: () => ipcRenderer.invoke('stats:progress'),
  getReadinessScore: () => ipcRenderer.invoke('stats:readiness-score'),

  // Nutrition
  logNutrition: (entry) => ipcRenderer.invoke('nutrition:log', entry),
  deleteNutrition: (id) => ipcRenderer.invoke('nutrition:delete', id),
  getNutritionDay: (date) => ipcRenderer.invoke('nutrition:get-day', date),
  getNutritionHistory: (days) => ipcRenderer.invoke('nutrition:history', days),
  getNutritionTargets: () => ipcRenderer.invoke('nutrition:targets:get'),
  saveNutritionTargets: (t) => ipcRenderer.invoke('nutrition:targets:save', t),
  getRacePlan: () => ipcRenderer.invoke('nutrition:race-plan:get'),
  saveRacePlan: (p) => ipcRenderer.invoke('nutrition:race-plan:save', p),
  importMFP: (filePath) => ipcRenderer.invoke('nutrition:import-mfp', filePath),

  // File dialog
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),

  // External links
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // Fat-loss / Stop-loss
  logWeight: (date, weight) => ipcRenderer.invoke('stoploss:log-weight', { date, weight }),
  stopLossCheckinGet: (weekStartDate) => ipcRenderer.invoke('stoploss:checkin:get', weekStartDate),
  stopLossCheckinSave: (entry) => ipcRenderer.invoke('stoploss:checkin:save', entry),
  stopLossWeeklyCheck: (weekStartDate) => ipcRenderer.invoke('stoploss:weekly-check', weekStartDate),
  stopLossHistory: (weeks) => ipcRenderer.invoke('stoploss:history', weeks),
})
