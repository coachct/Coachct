'use client'

// --- Rastreio de campanha (lado do navegador) --------------------------------
// Mede o funil da campanha por canal: visita → ver_pacotes → checkout → compra.
//
// O que grava: um id de sessão anônimo (gerado aqui, guardado no localStorage),
// o canal de origem (utm da URL), o referrer e se é celular ou desktop.
// O que NÃO grava: IP, user-agent completo, nada que identifique quem não está
// logado. Quando a pessoa compra, aí sim a venda amarra o evento à pessoa.
//
// A origem é capturada UMA VEZ, na primeira página com utm, e fica guardada:
// quem entra pelo e-mail, navega e só compra depois continua contando como
// e-mail. Sem isso, a venda apareceria como "acesso direto".

const CHAVE_SESSAO = 'jc_sessao'
const CHAVE_ORIGEM = 'jc_origem'
const DIAS_ORIGEM  = 30

export type Origem = {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
  referrer?: string
  em?: number
}

export type EventoCampanha = 'visita' | 'clique_banner' | 'ver_pacotes' | 'checkout' | 'compra'

function seguro<T>(fn: () => T, padrao: T): T {
  try { return fn() } catch { return padrao }
}

/** Id anônimo da sessão. Criado na primeira visita e reaproveitado depois. */
export function sessaoId(): string {
  if (typeof window === 'undefined') return ''
  return seguro(() => {
    let id = localStorage.getItem(CHAVE_SESSAO)
    if (!id) {
      id = (crypto?.randomUUID?.() as string) ||
           `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
      localStorage.setItem(CHAVE_SESSAO, id)
    }
    return id
  }, '')
}

/**
 * Lê os utm da URL. Se vierem, viram a origem guardada (a mais recente manda).
 * Sem utm na URL, mantém a origem que já estava salva.
 */
export function capturarOrigem(): Origem {
  if (typeof window === 'undefined') return {}
  return seguro(() => {
    const q = new URLSearchParams(window.location.search)
    const daUrl: Origem = {
      utm_source:   q.get('utm_source')   || undefined,
      utm_medium:   q.get('utm_medium')   || undefined,
      utm_campaign: q.get('utm_campaign') || undefined,
      utm_content:  q.get('utm_content')  || undefined,
    }

    if (daUrl.utm_source || daUrl.utm_medium || daUrl.utm_campaign) {
      const ref = document.referrer || undefined
      const nova: Origem = { ...daUrl, referrer: ref, em: Date.now() }
      localStorage.setItem(CHAVE_ORIGEM, JSON.stringify(nova))
      return nova
    }

    const salva = localStorage.getItem(CHAVE_ORIGEM)
    if (salva) {
      const o = JSON.parse(salva) as Origem
      const venceu = o.em && (Date.now() - o.em) > DIAS_ORIGEM * 86400000
      if (!venceu) return o
    }

    // Primeira visita sem utm: o referrer é a única pista de onde veio.
    return { referrer: document.referrer || undefined }
  }, {})
}

/** Origem guardada, sem reler a URL. Usado no checkout. */
export function origemSalva(): Origem {
  if (typeof window === 'undefined') return {}
  return seguro(() => {
    const salva = localStorage.getItem(CHAVE_ORIGEM)
    return salva ? (JSON.parse(salva) as Origem) : {}
  }, {})
}

function dispositivo(): string {
  if (typeof window === 'undefined') return ''
  return window.innerWidth < 768 ? 'mobile' : 'desktop'
}

// O mesmo evento na mesma página só entra uma vez por carregamento. Isso mata
// a duplicata do StrictMode em dev (que monta o componente duas vezes) e o
// clique repetido no mesmo botão. A contagem do relatório é por sessão, então
// duplicata não mudaria o número — mas também não precisa virar linha no banco.
const jaEnviados = new Set<string>()

/**
 * Registra um evento do funil. Fire-and-forget: se falhar, a tela segue
 * normalmente — rastreio nunca pode atrapalhar uma compra.
 */
export function rastrear(
  evento: EventoCampanha,
  extras: { campanha?: string; produto_id?: string; cliente_id?: string } = {}
) {
  if (typeof window === 'undefined') return
  const chave = `${evento}:${window.location.pathname}:${extras.produto_id || ''}`
  if (jaEnviados.has(chave)) return
  jaEnviados.add(chave)
  try {
    const origem = capturarOrigem()
    const corpo = JSON.stringify({
      sessao_id: sessaoId(),
      evento,
      pagina: window.location.pathname,
      dispositivo: dispositivo(),
      ...origem,
      ...extras,
    })
    // keepalive: o evento sobrevive à navegação que acontece logo depois do clique
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: corpo,
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* rastreio é sempre silencioso */
  }
}
