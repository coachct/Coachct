// src/lib/whatsapp/consultas.ts
//
// Ferramentas de consulta do agente de WhatsApp da Just CT.
//
// São as "tools" que o Claude usa para responder ao cliente: identificar pelo
// telefone, ver saldo de créditos, próximos agendamentos/reservas, histórico,
// posição na fila e registrar o acesso para a LGPD.
//
// TODAS as funções recebem um SupabaseClient já criado (injetado) — assim ficam
// testáveis isoladamente e o webhook cria o client (service role) uma vez só.
// A fonte de verdade do schema é o banco ao vivo (o supabase/schema.sql está
// desatualizado); os nomes de tabela/coluna aqui foram conferidos nas queries
// reais do app (recepcao/clientes, agendar, aulas).

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Client service-role (mesmo padrão de src/lib/wellhub/validar-checkin.ts)
// ---------------------------------------------------------------------------

/** Cria um client Supabase com service role — bypassa RLS. Uso server-side. */
export function createServiceSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  // O projeto tem inconsistência no nome: produção usa SUPABASE_SERVICE_ROLE_KEY,
  // mas o .env.local local usa SUPABASE_SERVICE_ROLE. Aceitamos os dois.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE
  if (!url || !key) {
    throw new Error('[whatsapp] env do Supabase ausente (URL / SERVICE_ROLE)')
  }
  return createClient(url, key, {
    auth: { persistSession: false },
    // Evita que o Next.js sirva leituras em cache: o agente precisa SEMPRE de
    // dados frescos (saldo, agendamentos) — senão pode informar estado antigo.
    global: {
      fetch: (input: any, init?: any) => fetch(input, { ...init, cache: 'no-store' }),
    },
  })
}

// ---------------------------------------------------------------------------
// Telefone
// ---------------------------------------------------------------------------
//
// No banco, clientes.telefone é guardado só com dígitos, DDD + número, SEM o
// +55 (ex.: "11987654321"). O WhatsApp entrega com código do país
// (ex.: "5511987654321"). Aqui normalizamos e ainda toleramos a variação do
// "9º dígito" (celulares antigos cadastrados sem o 9).

/** Remove máscara e o código do país (55) — devolve só DDD + número. */
export function normalizarTelefone(raw: string | null | undefined): string {
  let d = String(raw ?? '').replace(/\D/g, '')
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2) // tira +55
  return d
}

/** Gera as variações plausíveis (com e sem o 9º dígito) para o lookup. */
export function variantesTelefone(tel: string): string[] {
  const v = new Set<string>([tel])
  const ddd = tel.slice(0, 2)
  const resto = tel.slice(2)
  if (tel.length === 11 && resto.startsWith('9')) v.add(ddd + resto.slice(1)) // 11 -> 10
  if (tel.length === 10) v.add(ddd + '9' + resto)                              // 10 -> 11
  return [...v]
}

// ---------------------------------------------------------------------------
// Identificação do cliente
// ---------------------------------------------------------------------------

export interface ClienteIdentificado {
  id: string
  nome: string
  email: string | null
  telefone: string | null
  bloqueado: boolean
  motivo_bloqueio: string | null
  whatsapp_opt_out: boolean
  lgpd_consentimento_em: string | null
}

export type ResultadoIdentificacao =
  | { status: 'ok'; cliente: ClienteIdentificado }
  | { status: 'invalido'; cliente: null }       // telefone não tem 10-11 dígitos
  | { status: 'nao_encontrado'; cliente: null } // número não está cadastrado
  | { status: 'ambiguo'; cliente: null; candidatos: ClienteIdentificado[] } // 2+ clientes c/ mesmo número
  | { status: 'erro'; cliente: null; erro: string }

/**
 * Identifica o cliente pelo telefone do WhatsApp.
 * Se mais de um cliente bater (número repetido no cadastro), retorna 'ambiguo'
 * em vez de chutar — quem trata isso decide pedir CPF.
 */
export async function identificarClientePorTelefone(
  supabase: SupabaseClient,
  telefoneRaw: string,
): Promise<ResultadoIdentificacao> {
  const tel = normalizarTelefone(telefoneRaw)
  if (tel.length < 10 || tel.length > 11) return { status: 'invalido', cliente: null }

  const { data, error } = await supabase
    .from('clientes')
    .select('id, nome, email, telefone, bloqueado, motivo_bloqueio, whatsapp_opt_out, lgpd_consentimento_em')
    .in('telefone', variantesTelefone(tel))

  if (error) return { status: 'erro', cliente: null, erro: error.message }
  if (!data || data.length === 0) return { status: 'nao_encontrado', cliente: null }
  if (data.length > 1) return { status: 'ambiguo', cliente: null, candidatos: data as ClienteIdentificado[] }
  return { status: 'ok', cliente: data[0] as ClienteIdentificado }
}

/** Busca um cliente pelo id (mesmos campos da identificação). */
export async function buscarClientePorId(
  supabase: SupabaseClient,
  id: string,
): Promise<ClienteIdentificado | null> {
  const { data, error } = await supabase
    .from('clientes')
    .select('id, nome, email, telefone, bloqueado, motivo_bloqueio, whatsapp_opt_out, lgpd_consentimento_em')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  return data as ClienteIdentificado
}

/**
 * Busca um cliente pelo CPF (no banco o CPF é guardado só com dígitos).
 * Retorna null se não achar ou se houver mais de um (não chuta).
 */
export async function buscarClientePorCpf(
  supabase: SupabaseClient,
  cpfRaw: string,
): Promise<ClienteIdentificado | null> {
  const cpf = String(cpfRaw ?? '').replace(/\D/g, '')
  if (cpf.length !== 11) return null
  const { data, error } = await supabase
    .from('clientes')
    .select('id, nome, email, telefone, bloqueado, motivo_bloqueio, whatsapp_opt_out, lgpd_consentimento_em')
    .eq('cpf', cpf)
  if (error || !data || data.length !== 1) return null
  return data[0] as ClienteIdentificado
}

/**
 * Busca um cliente pelo e-mail (cadastro). Muita gente tem e-mail no cadastro
 * mas não tem CPF (ou não lembra) — esse é o caminho alternativo de identificação.
 * Retorna null se não achar ou se houver mais de um (não chuta).
 */
export async function buscarClientePorEmail(
  supabase: SupabaseClient,
  emailRaw: string,
): Promise<ClienteIdentificado | null> {
  const email = String(emailRaw ?? '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null
  const { data, error } = await supabase
    .from('clientes')
    .select('id, nome, email, telefone, bloqueado, motivo_bloqueio, whatsapp_opt_out, lgpd_consentimento_em')
    .ilike('email', email)
  if (error || !data || data.length !== 1) return null
  return data[0] as ClienteIdentificado
}

// ---------------------------------------------------------------------------
// Saldo de créditos
// ---------------------------------------------------------------------------

/**
 * Saldo de créditos do cliente, via RPC saldo_creditos_cliente — a mesma fonte
 * de verdade que o app usa (combina cliente_creditos do mês + creditos_avulsos
 * com validade futura, incluindo o rollover do Coach CT Pro).
 * p_unidade_id = null traz todas as unidades.
 */
export async function consultarSaldo(
  supabase: SupabaseClient,
  clienteId: string,
  opts: { unidadeId?: string | null; mes?: number; ano?: number; agora?: Date } = {},
): Promise<any> {
  const agora = opts.agora ?? new Date()
  const { data, error } = await supabase.rpc('saldo_creditos_cliente', {
    p_cliente_id: clienteId,
    p_mes: opts.mes ?? agora.getMonth() + 1,
    p_ano: opts.ano ?? agora.getFullYear(),
    p_unidade_id: opts.unidadeId ?? null,
  })
  if (error) throw new Error(`saldo_creditos_cliente: ${error.message}`)
  return data ?? {}
}

/**
 * Horas (decimais) entre AGORA e uma aula/treino, no fuso de São Paulo.
 * SP é UTC-3 o ano todo (sem horário de verão desde 2019), então ancoramos o
 * horário da aula em -03:00 e comparamos com o epoch real. Determinístico —
 * é a fonte de verdade da janela de cancelamento (o modelo NÃO deve calcular).
 */
export function horasAteSP(data: string, horario: string): number {
  const hhmm = String(horario ?? '').slice(0, 5)
  if (!data || !/^\d{2}:\d{2}$/.test(hhmm)) return NaN
  const alvo = new Date(`${data}T${hhmm}:00-03:00`)
  return (alvo.getTime() - Date.now()) / (1000 * 60 * 60)
}

/** Rótulo PRONTO da janela de cancelamento a partir das horas restantes. */
export function regraCancelamento(horas: number): string {
  if (!isFinite(horas)) return 'indefinido'
  if (horas <= 3) return 'fora do prazo (faltam menos de 3h): NÃO dá mais para cancelar — só resta comparecer ou faltar'
  if (horas <= 12) return 'entre 3h e 12h: só dá para cancelar SE houver fila de espera na aula; o sistema verifica na hora'
  return 'mais de 12h: cancelamento livre, o crédito volta'
}

// ---------------------------------------------------------------------------
// Agendamentos (Just CT) e reservas (JustClub)
// ---------------------------------------------------------------------------

/**
 * "Agora" no fuso de São Paulo, independente do fuso do servidor (Vercel = UTC).
 * Retorna data (YYYY-MM-DD) e hora (HH:MM) locais de SP.
 */
export function agoraEmSaoPaulo(): { dataStr: string; horaStr: string } {
  const now = new Date()
  const dataStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
  const horaStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(now)
  return { dataStr, horaStr }
}

/** Próximas sessões de personal (agendado/confirmado, de hoje em diante). */
export async function proximosAgendamentos(
  supabase: SupabaseClient,
  clienteId: string,
  opts: { hoje?: string } = {},
): Promise<any[]> {
  const hoje = opts.hoje ?? agoraEmSaoPaulo().dataStr
  const { data, error } = await supabase
    .from('agendamentos')
    .select('id, data, horario, status, tipo_credito, unidades(nome)')
    .eq('cliente_id', clienteId)
    .in('status', ['agendado', 'confirmado'])
    .gte('data', hoje)
    .order('data', { ascending: true })
    .order('horario', { ascending: true })
  if (error) throw new Error(`agendamentos: ${error.message}`)
  return (data ?? []).map((a: any) => {
    const horas = horasAteSP(a.data, a.horario)
    return { ...a, horas_ate: Math.round(horas * 10) / 10, cancelamento: regraCancelamento(horas) }
  })
}

/**
 * Próximas reservas de aula coletiva (status 'reservado', data futura).
 * A data fica na ocorrência (join), então filtramos/ordenamos em memória.
 */
export async function proximasReservasClub(
  supabase: SupabaseClient,
  clienteId: string,
  opts: { hoje?: string } = {},
): Promise<any[]> {
  const hoje = opts.hoje ?? agoraEmSaoPaulo().dataStr
  const { data, error } = await supabase
    .from('club_reservas')
    .select('id, status, posicao, tipo_credito, club_ocorrencias(data, club_aulas(tipo, horario, unidade_id))')
    .eq('cliente_id', clienteId)
    .eq('status', 'reservado')
  if (error) throw new Error(`club_reservas: ${error.message}`)
  return (data ?? [])
    .filter((r: any) => r.club_ocorrencias?.data && r.club_ocorrencias.data >= hoje)
    .sort((a: any, b: any) => {
      const da = a.club_ocorrencias.data, db = b.club_ocorrencias.data
      if (da !== db) return da < db ? -1 : 1
      const ha = a.club_ocorrencias?.club_aulas?.horario ?? ''
      const hb = b.club_ocorrencias?.club_aulas?.horario ?? ''
      return ha < hb ? -1 : ha > hb ? 1 : 0
    })
    .map((r: any) => {
      const horas = horasAteSP(r.club_ocorrencias?.data, r.club_ocorrencias?.club_aulas?.horario)
      return { ...r, horas_ate: Math.round(horas * 10) / 10, cancelamento: regraCancelamento(horas) }
    })
}

/**
 * Histórico recente de treinos, mais recentes primeiro. REÚNE:
 *  - PERSONAL (Coach CT): agendamentos com status realizado/falta;
 *  - AULAS do CLUB (JustClub): club_reservas com status presente/falta/reservado.
 * Assim o agente enxerga uma aula que o cliente diz ter feito ou PERDIDO —
 * INCLUSIVE as do Club, que NÃO aparecem em proximas_reservas_club (que só traz
 * 'reservado' FUTURO). O campo `status` distingue presente/realizado de falta.
 */
export async function historicoTreinos(
  supabase: SupabaseClient,
  clienteId: string,
  limite = 8,
): Promise<any[]> {
  const [ags, rvs] = await Promise.all([
    supabase
      .from('agendamentos')
      .select('id, data, horario, status, tipo_credito')
      .eq('cliente_id', clienteId)
      .in('status', ['realizado', 'falta'])
      .order('data', { ascending: false })
      .limit(limite),
    supabase
      .from('club_reservas')
      .select('id, status, tipo_credito, club_ocorrencias(data, club_aulas(tipo, horario))')
      .eq('cliente_id', clienteId)
      .in('status', ['presente', 'falta', 'reservado'])
      .limit(30),
  ])

  const personal = (ags.data ?? []).map((a: any) => ({
    id: a.id,
    treino: 'Coach CT (personal)',
    data: a.data,
    horario: String(a.horario ?? '').slice(0, 5),
    status: a.status,
    tipo_credito: a.tipo_credito,
  }))
  const club = (rvs.data ?? [])
    .filter((r: any) => r.club_ocorrencias?.data)
    .map((r: any) => ({
      id: r.id,
      treino: `JustClub (${r.club_ocorrencias?.club_aulas?.tipo ?? 'aula'})`,
      data: r.club_ocorrencias?.data,
      horario: String(r.club_ocorrencias?.club_aulas?.horario ?? '').slice(0, 5),
      status: r.status,
      tipo_credito: r.tipo_credito,
    }))

  return [...personal, ...club]
    .sort((a, b) => `${b.data} ${b.horario}`.localeCompare(`${a.data} ${a.horario}`))
    .slice(0, limite)
}

// ---------------------------------------------------------------------------
// Fila de espera
// ---------------------------------------------------------------------------

/**
 * Filas em que o cliente está aguardando, com a posição (FIFO por criado_em).
 * A posição é contada dentro do mesmo escopo: ocorrência (Club) ou
 * data+horario+unidade (CT).
 */
export async function posicaoNaFila(
  supabase: SupabaseClient,
  clienteId: string,
): Promise<any[]> {
  const { data: minhas, error } = await supabase
    .from('fila_espera')
    .select('id, data, horario, unidade_id, ocorrencia_id, tipo_credito, criado_em, status')
    .eq('cliente_id', clienteId)
    .eq('status', 'aguardando')
  if (error) throw new Error(`fila_espera: ${error.message}`)
  if (!minhas || minhas.length === 0) return []

  const resultado: any[] = []
  for (const f of minhas) {
    let q = supabase
      .from('fila_espera')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'aguardando')
      .lt('criado_em', f.criado_em)
    if (f.ocorrencia_id) {
      q = q.eq('ocorrencia_id', f.ocorrencia_id)
    } else {
      q = q.eq('data', f.data).eq('horario', f.horario).eq('unidade_id', f.unidade_id)
    }
    const { count } = await q
    resultado.push({ ...f, posicao: (count ?? 0) + 1 })
  }
  return resultado
}

// ---------------------------------------------------------------------------
// LGPD — auditoria de acesso
// ---------------------------------------------------------------------------

/**
 * Registra um acesso a dados sensíveis em lgpd_logs.
 * Nunca lança: falha de auditoria não pode derrubar o atendimento (só loga).
 */
export async function registrarAcessoLgpd(
  supabase: SupabaseClient,
  entrada: {
    clienteId?: string | null
    telefone?: string | null
    acao: string
    detalhe?: Record<string, any> | null
    canal?: string
  },
): Promise<void> {
  const { error } = await supabase.from('lgpd_logs').insert({
    cliente_id: entrada.clienteId ?? null,
    telefone: entrada.telefone ?? null,
    canal: entrada.canal ?? 'whatsapp',
    acao: entrada.acao,
    detalhe: entrada.detalhe ?? null,
  })
  if (error) console.error('[whatsapp/lgpd] falha ao gravar log:', error.message)
}
