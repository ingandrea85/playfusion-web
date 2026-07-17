import type { FinalDraw, FinalsType } from './types'

const slot = (pos: number, girone: string) => `${pos}ª ${girone}`

function roundName(n: number): string {
  return n === 2 ? 'Finale' : n === 4 ? 'Semifinali' : n === 8 ? 'Quarti' : n === 16 ? 'Ottavi' : 'Turno'
}
export function roundShort(round: string): string {
  return round === 'Finale' ? 'F' : round === 'Semifinali' ? 'SF' : round === 'Quarti' ? 'QF' : round === 'Ottavi' ? 'OF' : 'T'
}

function singleElim(slots: string[], bracketLabel: string): FinalDraw[] {
  const draws: FinalDraw[] = []
  let current = [...slots]
  while (current.length >= 2) {
    const rn = roundName(current.length)
    const rs = roundShort(rn)
    const winners: string[] = []
    let order = 1
    for (let i = 0; i + 1 < current.length; i += 2) {
      draws.push({ bracketLabel, round: rn, order, home: current[i], away: current[i + 1] })
      winners.push(`Vincente ${rs}${order}`)
      order++
    }
    if (current.length % 2 === 1) winners.push(current[current.length - 1])
    current = winners
  }
  return draws
}

export function buildFinals(gironi: string[], qualifiersPerGroup: number, finalsType: FinalsType): FinalDraw[] {
  const Q = Math.max(0, qualifiersPerGroup)
  if (!gironi.length || Q < 1) return []
  if (finalsType === 'SINGLE_GROUP_CROSSOVER') {
    const g = gironi[0]
    if (Q >= 4) return singleElim([slot(1, g), slot(4, g), slot(2, g), slot(3, g)], 'Tabellone')
    if (Q >= 2) return [{ bracketLabel: 'Tabellone', round: 'Finale', order: 1, home: slot(1, g), away: slot(2, g) }]
    return []
  }
  if (finalsType === 'SPLIT_GROUP_FINALS') {
    const out: FinalDraw[] = []
    for (let p = 1; p <= Q; p++) {
      const label = p === 1 ? 'Tabellone Oro' : p === 2 ? 'Tabellone Argento' : `Tabellone ${p}`
      out.push(...singleElim(gironi.map(g => slot(p, g)), label))
    }
    return out
  }
  // PLACEMENT
  const out: FinalDraw[] = []
  const g0 = gironi[0]
  const g1 = gironi[1] ?? gironi[0]
  for (let p = 1; p <= Q; p++) {
    out.push({ bracketLabel: 'Piazzamento', round: `Finale ${2 * p - 1}º/${2 * p}º`, order: p, home: slot(p, g0), away: slot(p, g1) })
  }
  return out
}
