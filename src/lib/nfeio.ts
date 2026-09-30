// Cliente mínimo da API da NFE.io (NFS-e v1) — emissão manual das vendas de balcão.
//
// Só servidor: usa NFEIO_API_KEY (Chave de NOTA FISCAL — a de Dados dá 401).
// Regime tributário, alíquota e certificado ficam configurados na conta NFE.io;
// aqui só mandamos tomador, código de serviço, descrição e valor — igual ao que a
// integração Pagar.me -> NFE.io já faz com as vendas do site.
//
// Variáveis (Vercel):
//   NFEIO_API_KEY       obrigatória
//   NFEIO_ATIVO         '1' libera emitir/cancelar. Sem ela a tela lista e consulta,
//                       mas não manda nada — trava até o ok do Ricardo na 1ª nota real.
//   NFEIO_COMPANY_ID    opcional; sem ela a empresa é achada pelo CNPJ na conta.
//   NFEIO_AMBIENTE      'producao' (padrão) | 'teste' — só rotula a linha no banco.
//   NFEIO_WEBHOOK_SECRET opcional; com ela o webhook exige X-Hub-Signature válida.

import crypto from 'crypto'

const BASE = 'https://api.nfe.io/v1'

// Mesmos dados da nota que a integração Pagar.me emite (NFS-e 21333, 30/09/2026)
export const NFEIO_CNPJ = '26625454000141'
// (código de serviço: ver nfeioModeloServico — vem da última nota emitida na conta)
export const NFEIO_DESCRICAO = 'Nota fiscal de serviço referente a treinos na Just Club CT'

export function nfeioAtivo(): boolean {
  // tolera espaço/aspas colados no painel da Vercel
  const v = (process.env.NFEIO_ATIVO || '').trim().replace(/^["']|["']$/g, '').toLowerCase()
  return v === '1' || v === 'true' || v === 'sim'
}

export function nfeioAmbiente(): 'teste' | 'producao' {
  return process.env.NFEIO_AMBIENTE === 'teste' ? 'teste' : 'producao'
}

export class NfeioErro extends Error {
  status: number
  constructor(status: number, mensagem: string) {
    super(mensagem)
    this.status = status
  }
}

const espera = (ms: number) => new Promise(r => setTimeout(r, ms))

// Chamada com retentativa em 429 (rate limit) e 5xx. Sequencial por quem chama.
async function chamar(metodo: string, caminho: string, corpo?: any): Promise<Response> {
  const chave = process.env.NFEIO_API_KEY
  if (!chave) throw new NfeioErro(500, 'NFEIO_API_KEY não configurada na Vercel')

  let ultima: Response | null = null
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const resp = await fetch(`${BASE}${caminho}`, {
      method: metodo,
      headers: {
        Authorization: chave,
        Accept: 'application/json',
        ...(corpo ? { 'Content-Type': 'application/json' } : {}),
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
      cache: 'no-store',
    })
    if (resp.status !== 429 && resp.status < 500) return resp
    ultima = resp
    const retry = Number(resp.headers.get('retry-after'))
    await espera(retry > 0 ? Math.min(retry, 10) * 1000 : 1500 * (tentativa + 1))
  }
  return ultima!
}

async function lerErro(resp: Response): Promise<string> {
  const texto = await resp.text().catch(() => '')
  try {
    const j = JSON.parse(texto)
    const msg = j?.message || j?.errors?.map((e: any) => e?.message || e).join('; ') || j?.error
    if (msg) return `HTTP ${resp.status}: ${msg}`
  } catch {}
  return `HTTP ${resp.status}${texto ? ': ' + texto.slice(0, 300) : ''}`
}

// Empresa na NFE.io: NFEIO_COMPANY_ID ou a do CNPJ da Just na conta. Cache por instância.
let companyCache: string | null = null
export async function nfeioCompanyId(): Promise<string> {
  if (process.env.NFEIO_COMPANY_ID) return process.env.NFEIO_COMPANY_ID
  if (companyCache) return companyCache

  for (let pagina = 1; pagina <= 10; pagina++) {
    const resp = await chamar('GET', `/companies?pageIndex=${pagina}&pageCount=50`)
    if (!resp.ok) throw new NfeioErro(resp.status, await lerErro(resp))
    const j = await resp.json()
    const lista: any[] = j?.companies || []
    const achou = lista.find(c => String(c?.federalTaxNumber || '').replace(/\D/g, '').padStart(14, '0') === NFEIO_CNPJ)
    if (achou?.id) { companyCache = achou.id; return achou.id }
    if (lista.length < 50) break
  }
  throw new NfeioErro(404, `Empresa CNPJ ${NFEIO_CNPJ} não encontrada na conta NFE.io`)
}

// Códigos de serviço no formato que a NFE.io usa. O "05657" impresso no PDF da
// prefeitura NÃO é aceito na API ("city service code not found"), então copia os
// códigos da nota mais recente já EMITIDA na conta (as do Pagar.me) — fica igual
// por construção. NFEIO_CODIGO_SERVICO na Vercel sobrepõe, se um dia precisar.
type ModeloServico = { cityServiceCode: string; federalServiceCode?: string; cnaeCode?: string }
let modeloCache: ModeloServico | null = null
export async function nfeioModeloServico(companyId: string): Promise<ModeloServico> {
  if (process.env.NFEIO_CODIGO_SERVICO) return { cityServiceCode: process.env.NFEIO_CODIGO_SERVICO }
  if (modeloCache) return modeloCache

  const resp = await chamar('GET', `/companies/${companyId}/serviceinvoices?pageIndex=1&pageCount=50`)
  if (!resp.ok) throw new NfeioErro(resp.status, await lerErro(resp))
  const j = await resp.json()
  const lista: any[] = j?.serviceInvoices || j?.serviceinvoices || j?.data || []
  const base = lista.find(n => n?.flowStatus === 'Issued' && n?.cityServiceCode)
  if (!base) throw new NfeioErro(404, 'Nenhuma nota emitida na conta para copiar o código de serviço')

  modeloCache = {
    cityServiceCode: String(base.cityServiceCode),
    ...(base.federalServiceCode ? { federalServiceCode: String(base.federalServiceCode) } : {}),
    ...(base.cnaeCode ? { cnaeCode: String(base.cnaeCode) } : {}),
  }
  return modeloCache
}

export type TomadorNfeio = { nome: string; cpf: string; email: string }

// Emite. A NFE.io responde 202 (assíncrono) com o id no Location, ou 201 com a nota.
export async function nfeioEmitir(
  companyId: string,
  tomador: TomadorNfeio,
  valor: number,
  externalId: string
): Promise<{ invoiceId: string; dados: any | null }> {
  const modelo = await nfeioModeloServico(companyId)
  const corpo = {
    ...modelo,
    description: NFEIO_DESCRICAO,
    servicesAmount: Number(valor.toFixed(2)),
    externalId,
    borrower: {
      type: 'NaturalPerson',
      name: tomador.nome,
      federalTaxNumber: Number(tomador.cpf.replace(/\D/g, '')),
      email: tomador.email,
    },
  }
  const resp = await chamar('POST', `/companies/${companyId}/serviceinvoices`, corpo)
  if (!resp.ok) throw new NfeioErro(resp.status, await lerErro(resp))

  let dados: any = null
  try { dados = await resp.json() } catch {}
  const doLocation = (resp.headers.get('location') || '').match(/serviceinvoices\/([a-z0-9-]+)/i)?.[1]
  const invoiceId = dados?.id || doLocation
  if (!invoiceId) throw new NfeioErro(resp.status, `Resposta ${resp.status} sem id da nota`)
  return { invoiceId, dados }
}

export async function nfeioConsultar(companyId: string, invoiceId: string): Promise<any> {
  const resp = await chamar('GET', `/companies/${companyId}/serviceinvoices/${invoiceId}`)
  if (!resp.ok) throw new NfeioErro(resp.status, await lerErro(resp))
  return resp.json()
}

export async function nfeioCancelar(companyId: string, invoiceId: string): Promise<void> {
  const resp = await chamar('DELETE', `/companies/${companyId}/serviceinvoices/${invoiceId}`)
  if (!resp.ok) throw new NfeioErro(resp.status, await lerErro(resp))
}

export async function nfeioPdf(companyId: string, invoiceId: string): Promise<ArrayBuffer> {
  const chave = process.env.NFEIO_API_KEY
  if (!chave) throw new NfeioErro(500, 'NFEIO_API_KEY não configurada na Vercel')
  const resp = await fetch(`${BASE}/companies/${companyId}/serviceinvoices/${invoiceId}/pdf`, {
    headers: { Authorization: chave, Accept: 'application/pdf' },
    cache: 'no-store',
  })
  if (!resp.ok) throw new NfeioErro(resp.status, await lerErro(resp))
  return resp.arrayBuffer()
}

// flowStatus da NFE.io -> status da nossa tabela. null = não muda.
export function statusDoFlow(flow: string | null | undefined, atual: string): string | null {
  switch (flow) {
    case 'Issued':           return 'emitida'
    case 'IssueFailed':      return 'erro'
    case 'Cancelled':        return 'cancelada'
    case 'WaitingSendCancel': return 'cancelando'
    case 'CancelFailed':     return 'emitida' // cancelamento falhou: a nota continua válida
    default:                 return atual === 'cancelando' ? 'cancelando' : (atual === 'erro' ? null : 'enviando')
  }
}

// Validação do webhook: HMAC-SHA1(secret, corpo cru) em hex, header X-Hub-Signature "sha1=<hex>".
export function nfeioAssinaturaValida(corpoCru: string, cabecalho: string | null, segredo: string): boolean {
  const hex = (cabecalho || '').replace(/^sha1=/i, '').trim().toLowerCase()
  if (!/^[a-f0-9]{40}$/.test(hex)) return false
  const esperado = crypto.createHmac('sha1', segredo).update(corpoCru, 'utf8').digest('hex')
  return crypto.timingSafeEqual(Buffer.from(hex, 'hex'), Buffer.from(esperado, 'hex'))
}

export function cpfValido(valor: string): boolean {
  const c = (valor || '').replace(/\D/g, '')
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false
  let soma = 0
  for (let i = 0; i < 9; i++) soma += parseInt(c[i]) * (10 - i)
  let d1 = (soma * 10) % 11; if (d1 === 10) d1 = 0
  if (d1 !== parseInt(c[9])) return false
  soma = 0
  for (let i = 0; i < 10; i++) soma += parseInt(c[i]) * (11 - i)
  let d2 = (soma * 10) % 11; if (d2 === 10) d2 = 0
  return d2 === parseInt(c[10])
}
