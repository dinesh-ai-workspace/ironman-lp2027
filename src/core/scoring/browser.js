// ESM entry for Vite renderer — keeps scoring/index.js as CJS for Node (exporter)
export const IMP_W = { key: 10, supporting: 4, optional: 1 }

export function sessionCredit(pct, discipline) {
  if ((discipline === 'bike' || discipline === 'run') && pct > 1.25) return 0.8
  if (pct >= 0.85) return 1.0
  if (pct >= 0.70) return 0.60
  if (pct >= 0.50) return 0.25
  return 0
}
