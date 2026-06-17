// src/lib/whatsapp/acoes.ts
//
// Ações de ESCRITA do agente de WhatsApp (mexem no banco). Cada função espelha
// EXATAMENTE a regra que as telas do app já aplicam, para o comportamento ser
// idêntico ao site/recepção.
//
// Toda ação valida no servidor que o registro pertence ao cliente identificado
// (o modelo nunca decide isso sozinho) e registra o ato em lgpd_logs.

import type { SupabaseClient } from '@supabase/supabase-js'
import { registrarAcessoLgpd, agoraEmSaoPaulo, consultarSaldo } from './consultas'

export interface ResultadoAcao {
  ok: boolean
  mensagem: string
}

// Unidade Just CT (personal) — mesma constante usada no app.
export const JUST_CT_UNIDADE_ID = 'c28bf4bb-56f8-44ff-818a-c7836e58bcef'

// Horários de fim de semana / feriado no CT (mesma lista do app).
const HORARIOS_FDS = ['08:00', '09:00', '10:00', '11:00', '12:00']

const LINK_CARTAO = 'https://www.justclubct.com.br/cadastrar-cartao'

/**
 * Clientes Wellhub/TotalPass precisam de um cartão VÁLIDO cadastrado para
 * reservar (garantia da multa de no-show) — mesma regra do app (precisaCartao).
 * Confere se há cartão salvo e, quando possível, valida no Pagar.me (ativo/não
 * vencido). Retorna ok:false (com mensagem pro cliente) quando falta/expira.
 * Para créditos que não são de parceiro, retorna ok:true (não exige cartão).
 */
export async function verificarCartaoParceiro(
  supabase: SupabaseClient,
  clienteId: string,
  tipoCredito: string,
): Promise<ResultadoAcao> {
  const tc = String(tipoCredito ?? '')
  if (!tc.startsWith('wellhub_') && !tc.startsWith('totalpass_')) return { ok: true, mensagem: '' }

  const { data: cli } = await supabase
    .from('clientes').select('pagarme_customer_id, pagarme_card_id').eq('id', clienteId).maybeSingle()
  if (!cli?.pagarme_card_id || !cli?.pagarme_customer_id) {
    return { ok: false, mensagem: `Para reservar com Wellhub/TotalPass você precisa de um cartão cadastrado — é a garantia da multa caso falte. Cadastre rapidinho aqui (é seguro): ${LINK_CARTAO}` }
  }

  // Validação real no Pagar.me (não bloqueia se a consulta falhar — já tem cartão salvo).
  const apiKey = process.env.PAGARME_API_KEY ?? process.env.PAGARME_SECRET_KEY
  if (apiKey) {
    try {
      const auth = Buffer.from(`${apiKey}:`).toString('base64')
      const resp = await fetch(
        `https://api.pagar.me/core/v5/customers/${cli.pagarme_customer_id}/cards/${cli.pagarme_card_id}`,
        { headers: { Authorization: `Basic ${auth}` } },
      )
      if (resp.ok) {
        const card: any = await resp.json()
        const ativo = card?.status === 'active'
        let expirado = false
        if (card?.exp_month && card?.exp_year) {
          const now = new Date()
          const ano = Number(card.exp_year) < 100 ? 2000 + Number(card.exp_year) : Number(card.exp_year)
          const mes = Number(card.exp_month)
          expirado = ano < now.getFullYear() || (ano === now.getFullYear() && mes < now.getMonth() + 1)
        }
        if (!ativo || expirado) {
          return { ok: false, mensagem: `Seu cartão cadastrado está inválido ou vencido 😕. Atualize aqui pra eu poder reservar (é seguro): ${LINK_CARTAO}` }
        }
      }
    } catch { /* erro de rede não bloqueia: já existe cartão salvo */ }
  }
  return { ok: true, mensagem: '' }
}

export interface HorarioDisponivel {
  hora: string // HH:MM
  livres: number
  tem_fila: boolean
}

/**
 * Horários do dia no Just CT, com vagas livres — espelha loadHorarios do app:
 * capacidade vem de coach_horarios (dia útil) ou escala_fds (fim de semana/feriado),
 * menos agendamentos ocupados e vagas bloqueadas. Pula horários já passados se for hoje.
 */
export async function horariosDisponiveisCt(
  supabase: SupabaseClient,
  dataStr: string,
  unidadeId: string = JUST_CT_UNIDADE_ID,
): Promise<HorarioDisponivel[]> {
  const { dataStr: hojeStr, horaStr: horaAtual } = agoraEmSaoPaulo()
  const isDiaDe = dataStr === hojeStr
  const diaSem = new Date(dataStr + 'T12:00:00').getDay()

  // Feriado? Fim de semana? -> usa escala_fds.
  const { data: feriado } = await supabase
    .from('feriados').select('descricao')
    .eq('unidade_id', unidadeId).eq('data', dataStr).eq('ativo', true).maybeSingle()
  const usaEscalaFds = !!feriado || diaSem === 0 || diaSem === 6

  // Capacidade por hora.
  const porHora: Record<string, number> = {}
  if (usaEscalaFds) {
    const { data: escala } = await supabase
      .from('escala_fds').select('coach_id').eq('unidade_id', unidadeId).eq('data', dataStr)
    const qtd = (escala ?? []).length
    if (qtd > 0) {
      for (const hora of HORARIOS_FDS) {
        if (isDiaDe && hora <= horaAtual) continue
        porHora[hora] = qtd
      }
    }
  } else {
    const { data: hors } = await supabase
      .from('coach_horarios').select('hora')
      .eq('dia_semana', diaSem).eq('ativo', true).eq('unidade_id', unidadeId)
    for (const h of hors ?? []) {
      const hora = String(h.hora ?? '').slice(0, 5)
      if (!hora) continue
      if (isDiaDe && hora <= horaAtual) continue
      porHora[hora] = (porHora[hora] || 0) + 1
    }
  }

  // Ocupação, bloqueios e fila do dia.
  const [agsRes, filaRes, bloqRes] = await Promise.all([
    supabase.from('agendamentos').select('horario').eq('data', dataStr).eq('unidade_id', unidadeId).neq('status', 'cancelado'),
    supabase.from('fila_espera').select('horario').eq('data', dataStr).eq('status', 'aguardando').eq('unidade_id', unidadeId),
    supabase.from('vagas_bloqueadas').select('horario, quantidade').eq('data', dataStr).eq('ativo', true).eq('unidade_id', unidadeId),
  ])

  const ocupados: Record<string, number> = {}
  for (const a of (agsRes.data ?? [])) {
    const h = String(a.horario ?? '').slice(0, 5); ocupados[h] = (ocupados[h] || 0) + 1
  }
  const bloqMap: Record<string, number> = {}
  for (const b of (bloqRes.data ?? [])) {
    const h = String(b.horario ?? '').slice(0, 5); bloqMap[h] = (bloqMap[h] || 0) + (b.quantidade || 1)
  }
  const comFila = new Set((filaRes.data ?? []).map((f: any) => String(f.horario ?? '').slice(0, 5)))

  return Object.entries(porHora)
    .map(([hora, total]) => ({
      hora,
      livres: Math.max(0, total - (ocupados[hora] || 0) - (bloqMap[hora] || 0)),
      tem_fila: comFila.has(hora),
    }))
    .sort((a, b) => a.hora.localeCompare(b.hora))
}

// ---------------------------------------------------------------------------
// JustClub (aulas coletivas)
// ---------------------------------------------------------------------------

/** Resolve uma unidade de JustClub pelo nome aproximado (ex.: "vila", "pinheiros"). */
async function resolverUnidadeClub(
  supabase: SupabaseClient,
  termo: string,
): Promise<{ id: string; nome: string } | null> {
  const { data } = await supabase.from('unidades').select('id, nome').eq('tipo', 'club').eq('ativo', true)
  const lista = (data ?? []) as { id: string; nome: string }[]
  const t = termo.trim().toLowerCase()
  if (!t) return lista.length === 1 ? lista[0] : null
  return lista.find((u) => u.nome.toLowerCase().includes(t)) ?? null
}

/**
 * Aulas do JustClub disponíveis num dia/unidade — espelha o carregamento do app:
 * ocorrências ativas + capacidade (club_aulas.capacidade) menos reservas
 * (reservado/presente). Esconde horários já passados se for hoje.
 */
export async function aulasClubDisponiveis(
  supabase: SupabaseClient,
  termoUnidade: string,
  dataStr: string,
): Promise<any> {
  const u = await resolverUnidadeClub(supabase, termoUnidade)
  if (!u) {
    return { erro: 'Não identifiquei a unidade do JustClub.', opcoes: ['JustClub Vila Olímpia', 'JustClub Pinheiros'] }
  }

  const { data: aulasIds } = await supabase.from('club_aulas').select('id').eq('unidade_id', u.id).eq('ativo', true)
  const ids = (aulasIds ?? []).map((a: any) => a.id)
  if (!ids.length) return { unidade: u.nome, aulas: [] }

  const { data: ocs } = await supabase
    .from('club_ocorrencias')
    .select('id, data, club_aulas(tipo, horario, capacidade, so_mulheres)')
    .in('aula_id', ids).eq('data', dataStr).eq('status', 'ativa')
  const ocList = (ocs ?? []) as any[]

  const ocIds = ocList.map((o) => o.id)
  const cont: Record<string, number> = {}
  if (ocIds.length) {
    const { data: reservas } = await supabase
      .from('club_reservas').select('ocorrencia_id')
      .in('ocorrencia_id', ocIds).in('status', ['reservado', 'presente'])
    for (const r of (reservas ?? [])) cont[(r as any).ocorrencia_id] = (cont[(r as any).ocorrencia_id] || 0) + 1
  }

  const { dataStr: hojeStr, horaStr } = agoraEmSaoPaulo()
  const isHoje = dataStr === hojeStr

  const aulas = ocList
    .map((o) => {
      const cap = o.club_aulas?.capacidade ?? 0
      const reservadas = cont[o.id] || 0
      return {
        ocorrencia_id: o.id,
        tipo: o.club_aulas?.tipo ?? null,
        horario: String(o.club_aulas?.horario ?? '').slice(0, 5),
        capacidade: cap,
        livres: Math.max(0, cap - reservadas),
        so_mulheres: !!o.club_aulas?.so_mulheres,
      }
    })
    .filter((o) => !(isHoje && o.horario <= horaStr))
    .sort((a, b) => a.horario.localeCompare(b.horario))

  return { unidade: u.nome, aulas }
}

/**
 * Posições livres de uma aula de Running Funcional: "R" = esteira, "F" = funcional.
 * Livre = posição ativa, não bloqueada e não reservada/presente naquela ocorrência.
 * Labels no formato R01..R13 / F01..F13 (mesmo padrão do app).
 */
export async function posicoesLivresClub(
  supabase: SupabaseClient,
  ocorrenciaId: string,
): Promise<{ unidadeId: string | null; esteira: string[]; funcional: string[] } | { erro: string }> {
  const { data: oc } = await supabase
    .from('club_ocorrencias')
    .select('id, status, club_aulas(tipo, unidade_id)')
    .eq('id', ocorrenciaId).maybeSingle()
  const aula: any = (oc as any)?.club_aulas
  if (!oc || !aula) return { erro: 'aula não encontrada' }
  if (aula.tipo !== 'running_funcional') return { unidadeId: aula.unidade_id, esteira: [], funcional: [] }

  const [posRes, tomRes] = await Promise.all([
    supabase.from('club_posicoes').select('tipo, numero, bloqueado').eq('unidade_id', aula.unidade_id).eq('ativo', true),
    supabase.from('club_reservas').select('posicao').eq('ocorrencia_id', ocorrenciaId).in('status', ['reservado', 'presente']),
  ])
  const tomadas = new Set((tomRes.data ?? []).map((t: any) => t.posicao).filter(Boolean))
  const livres = (posRes.data ?? [])
    .filter((p: any) => !p.bloqueado)
    .map((p: any) => ({ tipo: p.tipo, label: `${p.tipo}${String(p.numero).padStart(2, '0')}` }))
    .filter((p: any) => !tomadas.has(p.label))

  return {
    unidadeId: aula.unidade_id,
    esteira: livres.filter((p: any) => p.tipo === 'R').map((p: any) => p.label).sort(),
    funcional: livres.filter((p: any) => p.tipo === 'F').map((p: any) => p.label).sort(),
  }
}

/**
 * Reserva uma aula coletiva do JustClub (lift, lift_for_girls ou running_funcional).
 * Running funcional NÃO é suportado aqui (exige escolher posição no mapa — fica no app).
 * Espelha confirmarReserva do app e ADICIONA checagem de capacidade e só-mulheres no
 * servidor (a tela confia na UI). O banco barra reserva dupla via trigger.
 */
export async function reservarClub(
  supabase: SupabaseClient,
  clienteId: string,
  params: { ocorrenciaId: string; tipoCredito: string; posicao?: string },
): Promise<ResultadoAcao> {
  const ocorrenciaId = String(params.ocorrenciaId ?? '').trim()
  const tipoCredito = String(params.tipoCredito ?? '').trim()
  if (!ocorrenciaId || !tipoCredito) {
    return { ok: false, mensagem: 'Faltou a aula ou o plano para reservar.' }
  }
  let posicaoFinal: string | null = null

  // Cliente bloqueado / sexo (para aula só-mulheres).
  const { data: cli } = await supabase.from('clientes').select('bloqueado, sexo').eq('id', clienteId).maybeSingle()
  if (cli?.bloqueado) {
    return { ok: false, mensagem: 'Sua conta está com uma pendência e a reserva está temporariamente bloqueada. Me conta que eu te ajudo a resolver por aqui.' }
  }

  // Wellhub/TotalPass exigem cartão válido cadastrado.
  const cartao = await verificarCartaoParceiro(supabase, clienteId, tipoCredito)
  if (!cartao.ok) return cartao

  // Ocorrência + aula.
  const { data: oc } = await supabase
    .from('club_ocorrencias')
    .select('id, data, status, club_aulas(tipo, so_mulheres, capacidade, unidade_id, horario)')
    .eq('id', ocorrenciaId).maybeSingle()
  const aula: any = (oc as any)?.club_aulas
  if (!oc || (oc as any).status !== 'ativa' || !aula) {
    return { ok: false, mensagem: 'Essa aula não está disponível para reserva.' }
  }
  const dataStr = (oc as any).data as string
  const horario = String(aula.horario ?? '').slice(0, 5)
  const dataBr = `${dataStr.slice(8, 10)}/${dataStr.slice(5, 7)}`

  // Running Funcional: precisa de uma posição livre (esteira R / funcional F).
  if (aula.tipo === 'running_funcional') {
    const pos = String(params.posicao ?? '').trim().toUpperCase()
    if (!pos) {
      return { ok: false, mensagem: 'Pra Running Funcional você escolhe a posição (esteira ou funcional). Quer que eu te mostre as livres?' }
    }
    const livres = await posicoesLivresClub(supabase, ocorrenciaId)
    const todas = 'erro' in livres ? [] : [...livres.esteira, ...livres.funcional]
    if (!todas.includes(pos)) {
      return { ok: false, mensagem: `A posição ${pos} não está mais livre. Quer ver as posições disponíveis?` }
    }
    posicaoFinal = pos
  }

  // Aula exclusiva para mulheres.
  if (aula.so_mulheres && cli?.sexo !== 'F') {
    return { ok: false, mensagem: 'Essa aula é exclusiva para mulheres (Lift for Girls).' }
  }

  // Capacidade (checagem server-side que a tela não faz).
  const { count } = await supabase
    .from('club_reservas').select('*', { count: 'exact', head: true })
    .eq('ocorrencia_id', ocorrenciaId).in('status', ['reservado', 'presente'])
  if ((count ?? 0) >= (aula.capacidade ?? 0)) {
    return { ok: false, mensagem: `Essa aula (${horario}, ${dataBr}) está lotada. Quer entrar na fila de espera?` }
  }

  // Saldo no plano (unidade da aula).
  const d = new Date(dataStr + 'T12:00:00')
  const saldo = await consultarSaldo(supabase, clienteId, {
    unidadeId: aula.unidade_id, mes: d.getMonth() + 1, ano: d.getFullYear(),
  })
  if ((saldo?.[tipoCredito]?.disponivel ?? 0) <= 0) {
    return { ok: false, mensagem: 'Você não tem saldo nesse plano para reservar essa aula.' }
  }

  // Reserva (com posição quando for Running Funcional).
  const { error } = await supabase.from('club_reservas').insert({
    ocorrencia_id: ocorrenciaId,
    cliente_id: clienteId,
    tipo_credito: tipoCredito,
    status: 'reservado',
    ...(posicaoFinal ? { posicao: posicaoFinal } : {}),
  })
  if (error) {
    if (error.message?.includes('já tem uma reserva')) {
      return { ok: false, mensagem: 'Você já tem uma reserva nessa unidade nesse dia com esse plano (cada plano permite uma reserva por dia por unidade).' }
    }
    return { ok: false, mensagem: 'Tive um erro ao reservar. Pode tentar de novo?' }
  }

  await registrarAcessoLgpd(supabase, {
    clienteId, acao: 'reservar_club', detalhe: { ocorrencia_id: ocorrenciaId, tipo_credito: tipoCredito },
  })
  const nome = aula.tipo === 'lift_for_girls' ? 'Lift for Girls' : aula.tipo === 'running_funcional' ? 'Running Funcional' : 'Lift'
  const posTxt = posicaoFinal ? ` (posição ${posicaoFinal})` : ''
  return { ok: true, mensagem: `Aula reservada! ${nome} dia ${dataBr} às ${horario}${posTxt}. Te esperamos! 💪` }
}

/**
 * Cancela uma reserva de aula coletiva do JustClub. Mesma regra de janela do
 * personal (minha-conta), com a multa do Club (R$49,90): +12h livre; 3h–12h só
 * com fila na ocorrência; −3h não cancela. Cancelar = status 'cancelado'.
 */
export async function cancelarReservaClub(
  supabase: SupabaseClient,
  clienteId: string,
  reservaId: string,
  opts: { agora?: Date } = {},
): Promise<ResultadoAcao> {
  const agora = opts.agora ?? new Date()

  const { data: rv, error } = await supabase
    .from('club_reservas')
    .select('id, cliente_id, status, ocorrencia_id, club_ocorrencias(data, club_aulas(horario, tipo))')
    .eq('id', reservaId).maybeSingle()

  if (error) return { ok: false, mensagem: 'Não consegui acessar essa reserva agora.' }
  if (!rv || (rv as any).cliente_id !== clienteId) {
    return { ok: false, mensagem: 'Não encontrei essa reserva na sua conta.' }
  }
  if ((rv as any).status !== 'reservado') {
    return { ok: false, mensagem: 'Essa reserva não está ativa — pode já ter sido cancelada ou usada.' }
  }

  const oc: any = (rv as any).club_ocorrencias
  const data = oc?.data as string
  const horario = String(oc?.club_aulas?.horario ?? '').slice(0, 5)
  if (!data || !horario) return { ok: false, mensagem: 'Não consegui ver a data/hora dessa aula.' }
  const dataBr = `${data.slice(8, 10)}/${data.slice(5, 7)}`

  const dataHora = new Date(`${data}T${horario}:00`)
  const diffHoras = (dataHora.getTime() - agora.getTime()) / (1000 * 60 * 60)

  if (diffHoras <= 3) {
    return { ok: false, mensagem: `Faltam menos de 3h para a aula (${horario}, ${dataBr}) — não dá mais para cancelar. Faltar gera multa de R$49,90.` }
  }
  if (diffHoras <= 12) {
    const { data: f } = await supabase
      .from('fila_espera').select('id')
      .eq('ocorrencia_id', (rv as any).ocorrencia_id).eq('status', 'aguardando').limit(1)
    if (!(f ?? []).length) {
      return { ok: false, mensagem: `Entre 3h e 12h só dá para cancelar se houver fila de espera para essa aula — e não há ninguém agora. Faltar gera multa de R$49,90.` }
    }
  }

  const { error: e2 } = await supabase
    .from('club_reservas').update({ status: 'cancelado', cancelado_em: agora.toISOString() }).eq('id', reservaId)
  if (e2) return { ok: false, mensagem: 'Tive um erro ao cancelar. Pode tentar de novo?' }

  await registrarAcessoLgpd(supabase, { clienteId, acao: 'cancelar_reserva_club', detalhe: { reserva_id: reservaId } })
  return { ok: true, mensagem: `Pronto, cancelei sua aula de ${dataBr} às ${horario}. Seu crédito volta para o saldo.` }
}

/**
 * Coloca o cliente na fila de espera de uma aula LOTADA do JustClub.
 * Espelha confirmarFila do app (insere fila_espera com ocorrencia_id).
 */
export async function entrarFilaClub(
  supabase: SupabaseClient,
  clienteId: string,
  params: { ocorrenciaId: string; tipoCredito: string },
): Promise<ResultadoAcao> {
  const ocorrenciaId = String(params.ocorrenciaId ?? '').trim()
  const tipoCredito = String(params.tipoCredito ?? '').trim()
  if (!ocorrenciaId || !tipoCredito) {
    return { ok: false, mensagem: 'Faltou a aula ou o plano para entrar na fila.' }
  }

  const { data: cli } = await supabase.from('clientes').select('bloqueado, sexo').eq('id', clienteId).maybeSingle()
  if (cli?.bloqueado) {
    return { ok: false, mensagem: 'Sua conta está com uma pendência e está temporariamente bloqueada. Me conta que eu te ajudo a resolver por aqui.' }
  }

  const cartao = await verificarCartaoParceiro(supabase, clienteId, tipoCredito)
  if (!cartao.ok) return cartao

  const { data: oc } = await supabase
    .from('club_ocorrencias')
    .select('id, data, status, club_aulas(tipo, so_mulheres, capacidade, unidade_id, horario)')
    .eq('id', ocorrenciaId).maybeSingle()
  const aula: any = (oc as any)?.club_aulas
  if (!oc || (oc as any).status !== 'ativa' || !aula) {
    return { ok: false, mensagem: 'Essa aula não está disponível.' }
  }
  const dataStr = (oc as any).data as string
  const horarioFull = String(aula.horario ?? '')
  const horario = horarioFull.slice(0, 5)
  const dataBr = `${dataStr.slice(8, 10)}/${dataStr.slice(5, 7)}`

  if (aula.so_mulheres && cli?.sexo !== 'F') {
    return { ok: false, mensagem: 'Essa aula é exclusiva para mulheres (Lift for Girls).' }
  }

  // A fila só faz sentido se estiver lotada.
  const { count } = await supabase
    .from('club_reservas').select('*', { count: 'exact', head: true })
    .eq('ocorrencia_id', ocorrenciaId).in('status', ['reservado', 'presente'])
  if ((count ?? 0) < (aula.capacidade ?? 0)) {
    return { ok: false, mensagem: `Essa aula (${horario}, ${dataBr}) ainda tem vaga — dá pra reservar direto, sem fila.` }
  }

  // Já está na fila?
  const { data: jaFila } = await supabase
    .from('fila_espera').select('id')
    .eq('ocorrencia_id', ocorrenciaId).eq('cliente_id', clienteId).eq('status', 'aguardando')
  if ((jaFila ?? []).length > 0) {
    return { ok: false, mensagem: 'Você já está na fila dessa aula.' }
  }

  // Precisa ter saldo no plano (para usar a vaga se abrir).
  const d = new Date(dataStr + 'T12:00:00')
  const saldo = await consultarSaldo(supabase, clienteId, {
    unidadeId: aula.unidade_id, mes: d.getMonth() + 1, ano: d.getFullYear(),
  })
  if ((saldo?.[tipoCredito]?.disponivel ?? 0) <= 0) {
    return { ok: false, mensagem: 'Você precisa ter saldo nesse plano para entrar na fila.' }
  }

  const { error } = await supabase.from('fila_espera').insert({
    ocorrencia_id: ocorrenciaId, cliente_id: clienteId, tipo_credito: tipoCredito,
    status: 'aguardando', data: dataStr, horario: horarioFull, unidade_id: aula.unidade_id,
  })
  if (error) return { ok: false, mensagem: 'Tive um erro ao entrar na fila. Pode tentar de novo?' }

  // Posição na fila (após inserir).
  const { count: pos } = await supabase
    .from('fila_espera').select('*', { count: 'exact', head: true })
    .eq('ocorrencia_id', ocorrenciaId).eq('status', 'aguardando')

  await registrarAcessoLgpd(supabase, {
    clienteId, acao: 'entrar_fila_club', detalhe: { ocorrencia_id: ocorrenciaId, tipo_credito: tipoCredito },
  })
  return { ok: true, mensagem: `Pronto! Você entrou na fila da aula de ${dataBr} às ${horario}, na posição ${pos ?? 1}. Se abrir vaga, a gente te avisa.` }
}

/** YYYY-MM-DD somando dias a uma data ISO. */
function somaDias(dataIso: string, dias: number): string {
  const d = new Date(dataIso + 'T12:00:00')
  d.setDate(d.getDate() + dias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Agenda um treino de personal (Just CT). Espelha confirmarAgendamento do app
 * (bloqueio, não-duplicado no dia, saldo) e ADICIONA a checagem de vaga no
 * servidor — a tela confia na UI, o agente precisa revalidar para não superlotar.
 * Agenda sem escolha de coach (coach_id nulo); a recepção aloca depois.
 */
export async function agendarCt(
  supabase: SupabaseClient,
  clienteId: string,
  params: { data: string; hora: string; tipoCredito: string },
): Promise<ResultadoAcao> {
  const data = String(params.data ?? '').trim()
  const hora = String(params.hora ?? '').slice(0, 5)
  const tipoCredito = String(params.tipoCredito ?? '').trim()
  if (!data || !hora || !tipoCredito) {
    return { ok: false, mensagem: 'Faltou a data, o horário ou o plano para agendar.' }
  }
  const dataBr = `${data.slice(8, 10)}/${data.slice(5, 7)}`

  // 1. Cliente bloqueado?
  const { data: cli } = await supabase.from('clientes').select('bloqueado').eq('id', clienteId).maybeSingle()
  if (cli?.bloqueado) {
    return { ok: false, mensagem: 'Sua conta está com uma pendência e o agendamento está temporariamente bloqueado. Me conta que eu te ajudo a resolver por aqui.' }
  }

  // 1b. Wellhub/TotalPass exigem cartão válido cadastrado.
  const cartao = await verificarCartaoParceiro(supabase, clienteId, tipoCredito)
  if (!cartao.ok) return cartao

  // 2. Janela: não pode no passado nem além de 14 dias.
  const { dataStr: hojeStr } = agoraEmSaoPaulo()
  if (data < hojeStr) return { ok: false, mensagem: 'Essa data já passou.' }
  if (data > somaDias(hojeStr, 14)) return { ok: false, mensagem: 'Só é possível agendar nos próximos 14 dias.' }

  // 3. Tem vaga nesse horário?
  const horarios = await horariosDisponiveisCt(supabase, data)
  const slot = horarios.find((h) => h.hora === hora)
  if (!slot || slot.livres <= 0) {
    const fila = slot?.tem_fila ? ' Já há fila para esse horário.' : ''
    return { ok: false, mensagem: `Não há vaga às ${hora} no dia ${dataBr}.${fila}` }
  }

  // 4. Já agendou esse mesmo plano nesse dia?
  const { data: jaAg } = await supabase
    .from('agendamentos').select('status')
    .eq('cliente_id', clienteId).eq('data', data).eq('tipo_credito', tipoCredito).eq('unidade_id', JUST_CT_UNIDADE_ID)
  if ((jaAg ?? []).some((a: any) => ['agendado', 'confirmado', 'realizado'].includes(a.status))) {
    return { ok: false, mensagem: 'Você já tem um treino com esse plano nesse dia.' }
  }

  // 5. Tem saldo nesse crédito (mês da data)?
  const d = new Date(data + 'T12:00:00')
  const saldo = await consultarSaldo(supabase, clienteId, {
    unidadeId: JUST_CT_UNIDADE_ID, mes: d.getMonth() + 1, ano: d.getFullYear(),
  })
  const disponivel = saldo?.[tipoCredito]?.disponivel ?? 0
  if (disponivel <= 0) {
    return { ok: false, mensagem: 'Você não tem saldo nesse plano para agendar esse treino.' }
  }

  // 6. Cria o agendamento (idêntico ao app, sem coach escolhido).
  const { error } = await supabase.from('agendamentos').insert({
    cliente_id: clienteId,
    data,
    horario: hora + ':00',
    status: 'agendado',
    tipo_credito: tipoCredito,
    unidade_id: JUST_CT_UNIDADE_ID,
  })
  if (error) return { ok: false, mensagem: 'Tive um erro ao agendar. Pode tentar de novo em instantes?' }

  await registrarAcessoLgpd(supabase, {
    clienteId, acao: 'agendar_ct', detalhe: { data, hora, tipo_credito: tipoCredito },
  })

  return { ok: true, mensagem: `Treino agendado para ${dataBr} às ${hora} no Just CT! Te esperamos. 💪` }
}

/**
 * Coloca o cliente na fila de espera de um horário de personal (Just CT).
 * Só faz sentido quando o horário está LOTADO (livres = 0). Espelha confirmarFila
 * do app (insere status 'aguardando').
 */
export async function entrarFilaCt(
  supabase: SupabaseClient,
  clienteId: string,
  params: { data: string; hora: string; tipoCredito: string },
): Promise<ResultadoAcao> {
  const data = String(params.data ?? '').trim()
  const hora = String(params.hora ?? '').slice(0, 5)
  const tipoCredito = String(params.tipoCredito ?? '').trim()
  if (!data || !hora || !tipoCredito) {
    return { ok: false, mensagem: 'Faltou a data, o horário ou o plano para entrar na fila.' }
  }
  const dataBr = `${data.slice(8, 10)}/${data.slice(5, 7)}`

  const { data: cli } = await supabase.from('clientes').select('bloqueado').eq('id', clienteId).maybeSingle()
  if (cli?.bloqueado) {
    return { ok: false, mensagem: 'Sua conta está com uma pendência e está temporariamente bloqueada. Me conta que eu te ajudo a resolver por aqui.' }
  }

  const cartao = await verificarCartaoParceiro(supabase, clienteId, tipoCredito)
  if (!cartao.ok) return cartao

  const { dataStr: hojeStr } = agoraEmSaoPaulo()
  if (data < hojeStr) return { ok: false, mensagem: 'Essa data já passou.' }
  if (data > somaDias(hojeStr, 14)) return { ok: false, mensagem: 'Só dá para entrar na fila dos próximos 14 dias.' }

  // O horário precisa existir e estar lotado (senão é só agendar).
  const horarios = await horariosDisponiveisCt(supabase, data)
  const slot = horarios.find((h) => h.hora === hora)
  if (!slot) return { ok: false, mensagem: `Não há o horário das ${hora} nesse dia.` }
  if (slot.livres > 0) {
    return { ok: false, mensagem: `Às ${hora} do dia ${dataBr} ainda tem vaga — dá pra agendar direto, sem fila.` }
  }

  // Já está na fila desse horário?
  const { data: jaFila } = await supabase
    .from('fila_espera').select('id')
    .eq('cliente_id', clienteId).eq('data', data).eq('horario', hora + ':00')
    .eq('unidade_id', JUST_CT_UNIDADE_ID).eq('status', 'aguardando')
  if ((jaFila ?? []).length > 0) {
    return { ok: false, mensagem: 'Você já está na fila desse horário.' }
  }

  // Precisa ter saldo no plano (para usar a vaga se ela abrir).
  const d = new Date(data + 'T12:00:00')
  const saldo = await consultarSaldo(supabase, clienteId, {
    unidadeId: JUST_CT_UNIDADE_ID, mes: d.getMonth() + 1, ano: d.getFullYear(),
  })
  if ((saldo?.[tipoCredito]?.disponivel ?? 0) <= 0) {
    return { ok: false, mensagem: 'Você precisa ter saldo nesse plano para entrar na fila.' }
  }

  const { error } = await supabase.from('fila_espera').insert({
    cliente_id: clienteId, data, horario: hora + ':00', tipo_credito: tipoCredito,
    status: 'aguardando', unidade_id: JUST_CT_UNIDADE_ID,
  })
  if (error) return { ok: false, mensagem: 'Tive um erro ao entrar na fila. Pode tentar de novo?' }

  await registrarAcessoLgpd(supabase, {
    clienteId, acao: 'entrar_fila_ct', detalhe: { data, hora, tipo_credito: tipoCredito },
  })
  return { ok: true, mensagem: `Pronto! Você entrou na fila de ${dataBr} às ${hora}. Se abrir vaga, a gente te avisa.` }
}

/**
 * Tira o cliente de uma fila de espera (CT ou Club) pelo id da fila.
 * Espelha sairDaFila do app (delete). Valida que a fila é do cliente.
 */
export async function sairFila(
  supabase: SupabaseClient,
  clienteId: string,
  filaId: string,
): Promise<ResultadoAcao> {
  const { data: f, error } = await supabase
    .from('fila_espera').select('id, cliente_id, status').eq('id', filaId).maybeSingle()
  if (error) return { ok: false, mensagem: 'Não consegui acessar essa fila agora.' }
  if (!f || f.cliente_id !== clienteId) return { ok: false, mensagem: 'Não encontrei você nessa fila.' }
  if (f.status !== 'aguardando') return { ok: false, mensagem: 'Essa fila não está mais ativa.' }

  const { error: e2 } = await supabase.from('fila_espera').delete().eq('id', filaId)
  if (e2) return { ok: false, mensagem: 'Tive um erro ao sair da fila. Pode tentar de novo?' }

  await registrarAcessoLgpd(supabase, { clienteId, acao: 'sair_fila', detalhe: { fila_id: filaId } })
  return { ok: true, mensagem: 'Pronto, te tirei da fila de espera.' }
}

/**
 * Cancela um agendamento de personal (Just CT), com a MESMA regra de janela do
 * app (minha-conta): +12h livre; 3h–12h só com fila no horário; −3h não cancela.
 * Cancelar = marcar status 'cancelado' (o crédito volta porque o saldo é
 * recalculado a partir dos agendamentos não cancelados).
 */
export async function cancelarAgendamentoCt(
  supabase: SupabaseClient,
  clienteId: string,
  agendamentoId: string,
  opts: { agora?: Date } = {},
): Promise<ResultadoAcao> {
  const agora = opts.agora ?? new Date()

  // 1. Busca e valida posse + estado.
  const { data: ag, error } = await supabase
    .from('agendamentos')
    .select('id, cliente_id, data, horario, status, unidade_id')
    .eq('id', agendamentoId)
    .maybeSingle()

  if (error) return { ok: false, mensagem: 'Não consegui acessar esse agendamento agora.' }
  if (!ag || ag.cliente_id !== clienteId) {
    return { ok: false, mensagem: 'Não encontrei esse agendamento na sua conta.' }
  }
  if (!['agendado', 'confirmado'].includes(ag.status)) {
    return { ok: false, mensagem: 'Esse agendamento não está ativo — pode já ter sido cancelado ou realizado.' }
  }

  // 2. Janela de cancelamento (idêntica ao app).
  const dataHora = new Date(`${ag.data}T${ag.horario}`)
  const diffHoras = (dataHora.getTime() - agora.getTime()) / (1000 * 60 * 60)

  if (diffHoras <= 3) {
    return {
      ok: false,
      mensagem: 'Faltam menos de 3h para o treino — não dá mais para cancelar. Se não comparecer, conta como falta (multa R$99,00).',
    }
  }
  if (diffHoras <= 12) {
    const { data: f } = await supabase
      .from('fila_espera')
      .select('id')
      .eq('data', ag.data)
      .eq('unidade_id', ag.unidade_id)
      .eq('status', 'aguardando')
      .limit(1)
    const temFila = (f ?? []).length > 0
    if (!temFila) {
      return {
        ok: false,
        mensagem: 'Entre 3h e 12h o cancelamento só é liberado se houver alguém na fila de espera deste horário — e não há ninguém agora. Se não comparecer, conta como falta (multa R$99,00).',
      }
    }
  }

  // 3. Cancela (idêntico ao app).
  const { error: e2 } = await supabase
    .from('agendamentos')
    .update({
      status: 'cancelado',
      cancelado_em: agora.toISOString(),
      motivo_cancelamento: 'Cancelado pelo cliente (WhatsApp)',
    })
    .eq('id', agendamentoId)

  if (e2) return { ok: false, mensagem: 'Tive um erro ao cancelar. Pode tentar de novo em instantes?' }

  await registrarAcessoLgpd(supabase, {
    clienteId,
    acao: 'cancelar_agendamento_ct',
    detalhe: { agendamento_id: agendamentoId },
  })

  return { ok: true, mensagem: 'Pronto, cancelei o treino. Seu crédito volta para o saldo.' }
}

// ---------------------------------------------------------------------------
// Recuperação de acesso / senha (login do site é e-mail + senha)
// ---------------------------------------------------------------------------

/** Senha provisória de 8 caracteres (sem caracteres ambíguos). */
function gerarSenhaProvisoria(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let senha = ''
  const arr = new Uint8Array(8)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr)
    for (let i = 0; i < 8; i++) senha += chars[arr[i] % chars.length]
  } else {
    for (let i = 0; i < 8; i++) senha += chars[Math.floor(Math.random() * chars.length)]
  }
  return senha
}

/** Acha o usuário de Auth por e-mail varrendo as páginas do listUsers. */
async function acharUsuarioAuthPorEmail(supabase: SupabaseClient, emailLimpo: string): Promise<any | null> {
  const perPage = 1000
  let page = 1
  while (page <= 50) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) return null
    const users: any[] = (data?.users as any[]) || []
    const found = users.find((u: any) => String(u?.email || '').toLowerCase() === emailLimpo)
    if (found) return found
    if (users.length < perPage) return null
    page++
  }
  return null
}

/**
 * Regulariza o acesso do cliente ao site (login = e-mail + senha):
 * - se já tem login, atualiza o e-mail e define uma senha provisória;
 * - se nunca teve (migrado), cria a conta com o e-mail + senha provisória e vincula.
 * Devolve o e-mail de login e a senha provisória para o agente repassar no WhatsApp.
 * O cliente já vem identificado (telefone ou CPF+nome) — isso é a trava de segurança.
 */
export async function recuperarAcessoCliente(
  supabase: SupabaseClient,
  clienteId: string,
  emailRaw: string,
): Promise<ResultadoAcao & { email?: string; senha?: string }> {
  const email = String(emailRaw ?? '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, mensagem: 'Esse e-mail não parece válido. Pode conferir e me mandar de novo?' }
  }

  const { data: cli } = await supabase
    .from('clientes').select('id, nome, cpf, email, user_id').eq('id', clienteId).maybeSingle()
  if (!cli) return { ok: false, mensagem: 'Não localizei seu cadastro para regularizar agora.' }

  const senha = gerarSenhaProvisoria()

  if ((cli as any).user_id) {
    // Já tem login: atualiza e-mail (login) + senha provisória.
    const { error } = await supabase.auth.admin.updateUserById((cli as any).user_id, {
      email, password: senha, email_confirm: true,
    })
    if (error) {
      if (/(already|exist|registered|duplicate)/i.test(error.message)) {
        return { ok: false, mensagem: 'Esse e-mail já está em uso em outra conta. Quer tentar com outro?' }
      }
      return { ok: false, mensagem: 'Não consegui regularizar agora. Pode tentar de novo em instantes?' }
    }
  } else {
    // Sem login (migrado): cria a conta com e-mail + senha provisória.
    const { data: novo, error } = await supabase.auth.admin.createUser({
      email, password: senha, email_confirm: true,
      user_metadata: { nome: (cli as any).nome, cpf: (cli as any).cpf, role: 'cliente' },
    })
    let userId: string | null = novo?.user?.id || null
    if (error || !userId) {
      // E-mail pode já existir no Auth como conta órfã: acha e redefine.
      const existente = await acharUsuarioAuthPorEmail(supabase, email)
      if (!existente) {
        return { ok: false, mensagem: 'Não consegui criar seu acesso agora. Pode tentar de novo em instantes?' }
      }
      userId = existente.id
      const { error: e2 } = await supabase.auth.admin.updateUserById(userId as string, { password: senha, email_confirm: true })
      if (e2) return { ok: false, mensagem: 'Não consegui regularizar agora. Pode tentar de novo em instantes?' }
    }
    await supabase.from('perfis').upsert({ id: userId, nome: (cli as any).nome, role: 'cliente', ativo: true })
    await supabase.from('clientes').update({ user_id: userId }).eq('id', (cli as any).id)
  }

  // Regulariza o e-mail no cadastro do cliente.
  await supabase.from('clientes').update({ email }).eq('id', (cli as any).id)

  await registrarAcessoLgpd(supabase, { clienteId, acao: 'wa_recuperar_acesso', detalhe: { email } })

  return { ok: true, mensagem: '', email, senha }
}
