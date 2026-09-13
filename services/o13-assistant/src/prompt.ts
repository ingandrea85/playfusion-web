import type { DraftInput } from './domain.js'

const SYSTEM = `Sei l'assistente di configurazione tornei di PlayFusion. Dato un torneo descritto in italiano,
produci UNA configurazione strutturata. Rispondi SOLO con JSON valido, senza testo attorno, in UNO di due formati:

1) Se hai abbastanza informazioni:
{"draft":{
  "event":{"name","sportId","participantType":"team|individual","format":"groups|groups+bracket|bracket|festival",
           "categorie":[...],"dates":{"from":"YYYY-MM-DD","to":"YYYY-MM-DD"},"startTime":"HH:mm","location","playbook":"PB-1|PB-2"},
  "groupsByCategory":{"<categoria>":{"groups":[{"label","teamCount","field"}]}},
  "schedule":{"fields":[...],"periods","periodMinutes","breakMinutes","dailyStart":"HH:mm","groupsCount","legs":"SINGLE|HOME_AWAY","finalsEnabled","finalsType","festivalUsePools","finalissimaField"},
  "rationale":"spiegazione breve in italiano",
  "assumptions":["assunzione 1","..."]
}}

2) Se manca un dato ESSENZIALE (numero campi, durata giornata, numero pool/gironi):
{"openQuestions":[{"field":"fields","question":"Quanti campi hai a disposizione?"}]}

Regole di dominio: il formato "festival" (festa dello sport) NON ha finali né classifiche (finalsEnabled=false);
il formato "bracket" NON ha gironi (ometti groupsByCategory). Le squadre NON sono ancora iscritte: in
groupsByCategory indica solo la STRUTTURA con teamCount, mai nomi di squadre.`

export function buildPrompt(input: DraftInput): string {
  const parts = [SYSTEM, '', `Descrizione del torneo:`, input.description]
  if (input.sportId) parts.push('', `Sport preselezionato: ${input.sportId}`)
  if (input.answers && Object.keys(input.answers).length) {
    parts.push('', 'Risposte alle domande precedenti:')
    for (const [k, v] of Object.entries(input.answers)) parts.push(`- ${k}: ${v}`)
  }
  return parts.join('\n')
}
