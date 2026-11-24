// Pictogramas simples (boneco de traço) para os exercícios do aquecimento na TV.
// O exercício é reconhecido pelo nome; o que não for reconhecido usa o boneco genérico.

type Tipo = 'agachamento' | 'salto' | 'flexao' | 'avanco' | 'burpee' | 'polichinelo' | 'corrida' | 'prancha' | 'generico'

export function tipoExercicio(nome: string): Tipo {
  const n = nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (/burpee/.test(n)) return 'burpee'
  if (/polichinelo|jumping jack/.test(n)) return 'polichinelo'
  if (/flex(ao|oes)|push ?up/.test(n)) return 'flexao'
  if (/prancha|plank/.test(n)) return 'prancha'
  if (/avanco|afundo|passada|lunge/.test(n)) return 'avanco'
  if (/salto|pulo|jump/.test(n)) return 'salto'
  if (/agach|squat/.test(n)) return 'agachamento'
  if (/corr|trote|skipping|run/.test(n)) return 'corrida'
  return 'generico'
}

export function Pictograma({ nome, className }: { nome: string; className?: string }) {
  const t = tipoExercicio(nome)
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      {t === 'agachamento' && (<g {...p}><circle cx="30" cy="12" r="5" /><path d="M30 18 L26 34 L40 36 L40 52 M28 24 L46 24 M26 34 L30 50" /><path d="M14 56 H50" /></g>)}
      {t === 'salto' && (<g {...p}><circle cx="32" cy="9" r="5" /><path d="M32 15 V34 M32 21 L22 9 M32 21 L42 9 M32 34 L26 46 M32 34 L38 46" /><path d="M22 54 H28 M36 54 H42" /></g>)}
      {t === 'flexao' && (<g {...p}><circle cx="11" cy="28" r="5" /><path d="M16 31 L54 39 M21 32 V47 M54 39 L56 47" /><path d="M6 50 H60" /></g>)}
      {t === 'prancha' && (<g {...p}><circle cx="11" cy="32" r="5" /><path d="M16 35 L54 41 M18 36 L18 47 L28 47 M54 41 L56 47" /><path d="M6 50 H60" /></g>)}
      {t === 'avanco' && (<g {...p}><circle cx="30" cy="9" r="5" /><path d="M30 15 V33 M30 21 L30 31 M30 33 L42 40 L42 53 M30 33 L20 45 L10 52" /><path d="M6 56 H50" /></g>)}
      {t === 'burpee' && (<g {...p}><circle cx="46" cy="10" r="5" /><path d="M46 16 V30 M46 21 L40 12 M46 21 L52 12 M46 30 L42 40 M46 30 L50 40" /><circle cx="10" cy="40" r="4" /><path d="M14 42 L34 47 M18 43 V52 M34 47 L35 53" /><path d="M4 56 H60" /></g>)}
      {t === 'polichinelo' && (<g {...p}><circle cx="32" cy="9" r="5" /><path d="M32 15 V34 M32 21 L18 10 M32 21 L46 10 M32 34 L20 52 M32 34 L44 52" /></g>)}
      {t === 'corrida' && (<g {...p}><circle cx="38" cy="9" r="5" /><path d="M37 15 L31 33 M35 21 L45 27 M35 21 L24 25 M31 33 L41 42 L37 53 M31 33 L22 42 L13 40" /></g>)}
      {t === 'generico' && (<g {...p}><circle cx="32" cy="9" r="5" /><path d="M32 15 V35 M32 22 L18 28 M32 22 L46 28 M32 35 L24 53 M32 35 L40 53" /></g>)}
    </svg>
  )
}

/**
 * Quebra o texto do aquecimento em exercícios: "Agachamento alternado 12, agachamento com salto 6, flexão 3"
 * → [{nome:'Agachamento alternado', qtd:'12'}, …]. Aceita vírgula, ponto e vírgula, "·", "+" e quebra de linha.
 * A quantidade é o número (ou tempo, ex.: 30s, 1min) no começo ou no fim do item.
 */
export function itensAquecimento(desc: string): { nome: string; qtd: string }[] {
  const partes = desc.split(/[,;·+\n]+/).map(s => s.trim()).filter(Boolean)
  const qtdRe = /(\d+\s*(?:x|s|seg|min|m|reps?|''|'|”|’)?)/i
  return partes.map(p => {
    const fim = new RegExp(`^(.*?)[\\s:–-]*${qtdRe.source}$`, 'i').exec(p)
    if (fim && fim[1].trim()) return { nome: fim[1].trim(), qtd: fim[2].replace(/\s+/g, '') }
    const ini = new RegExp(`^${qtdRe.source}\\s+(.*)$`, 'i').exec(p)
    if (ini && ini[2].trim()) return { nome: ini[2].trim(), qtd: ini[1].replace(/\s+/g, '') }
    return { nome: p, qtd: '' }
  })
}
