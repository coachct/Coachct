import { NextRequest, NextResponse } from 'next/server'
import { exigirAdmin, supabaseAdmin } from '@/lib/api-admin'
import { hojeSP } from '@/lib/tempo'
import { cobrarMultaCT, cobrarMultaClub, type ResultadoCobranca } from '@/lib/cobranca-multa'

// Cobrança automática das multas de no-show do DIA (Coach CT + Just Club).
//
// Roda às 22h de SP (01:00 UTC). Por que 22h e não 21h: a última aula do CT
// começa 20h, a falta automática só marca 1h depois (~21h–21h15) e um check-in
// pelo app até 1h30 do início (21h30) ainda desfaz a falta.
//
// Faz exatamente o que o "Cobrar selecionados" da tela Cobrança No-Show faz:
// mesmas faltas (Wellhub/TotalPass, Club sem via_app), mesma cobrança
// (src/lib/cobranca-multa.ts). Sem cartão / já cobrada / sem CPF ou telefone
// → pula e fica na tela. Recusa → pendência + bloqueio (igual ao manual).
//
// Kill switch: só cobra de verdade com NOSHOW_AUTO_ATIVO=true na Vercel.
// Sem isso roda em SIMULAÇÃO: faz todas as checagens e grava em noshow_auto_log
// quem seria cobrado, sem tocar no Pagar.me.
//
// Chamadas aceitas:
//   - cron da Vercel: GET com Authorization: Bearer CRON_SECRET
//   - admin logado:   GET/POST com Bearer <token>; ?simular=1 força simulação, ?data=YYYY-MM-DD

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CRON_SECRET = process.env.CRON_SECRET
const VALOR_MULTA_CT = 99.00
const VALOR_MULTA_CLUB = 49.90

type Linha = {
  origem: 'ct' | 'club'
  ref_id: string
  cliente_id: string | null
  cliente_nome: string | null
}

function classificar(res: ResultadoCobranca, simulando: boolean) {
  if (res.status === 200) return { resultado: simulando ? 'simulado' : 'cobrado', motivo: res.body?.aviso || null }
  if (res.body?.cobranca_pendente_criada) return { resultado: 'recusado', motivo: res.body?.error || null }
  if (res.status >= 500) return { resultado: 'erro', motivo: res.body?.error || `Erro ${res.status}` }
  return { resultado: 'pulado', motivo: res.body?.error || `Erro ${res.status}` }
}

async function handler(req: NextRequest) {
  const supabase = supabaseAdmin()

  const auth = req.headers.get('authorization') || ''
  const ehCron = !!CRON_SECRET && auth === `Bearer ${CRON_SECRET}`
  if (!ehCron) {
    const { erro } = await exigirAdmin(req, supabase)
    if (erro) return erro
  }

  const url = new URL(req.url)
  const dataParam = url.searchParams.get('data')
  const dia = !ehCron && dataParam && /^\d{4}-\d{2}-\d{2}$/.test(dataParam) ? dataParam : hojeSP()
  const simulando = process.env.NOSHOW_AUTO_ATIVO !== 'true' || url.searchParams.get('simular') === '1'
  const modo = simulando ? 'simulacao' : 'cobranca'

  // ── Faltas do dia: mesmos filtros da tela admin/cobranca-noshow ──
  const { data: ags, error: errAgs } = await supabase
    .from('agendamentos')
    .select('id, cliente_id, clientes(nome)')
    .eq('status', 'falta').eq('data', dia)
    .or('tipo_credito.ilike.wellhub*,tipo_credito.ilike.totalpass*')
  if (errAgs) return NextResponse.json({ error: errAgs.message }, { status: 500 })

  const { data: res, error: errRes } = await supabase
    .from('club_reservas')
    .select('id, cliente_id, clientes(nome), club_ocorrencias!inner(data, club_aulas!inner(ativo, unidades!inner(tipo, ativo)))')
    .eq('status', 'falta').eq('via_app', false)
    .or('tipo_credito.ilike.wellhub*,tipo_credito.ilike.totalpass*')
    .eq('club_ocorrencias.data', dia)
    .eq('club_ocorrencias.club_aulas.ativo', true)
    .eq('club_ocorrencias.club_aulas.unidades.tipo', 'club')
    .eq('club_ocorrencias.club_aulas.unidades.ativo', true)
  if (errRes) return NextResponse.json({ error: errRes.message }, { status: 500 })

  const alvos: Linha[] = [
    ...(ags || []).map((a: any) => ({ origem: 'ct' as const, ref_id: a.id, cliente_id: a.cliente_id, cliente_nome: a.clientes?.nome || null })),
    ...(res || []).map((r: any) => ({ origem: 'club' as const, ref_id: r.id, cliente_id: r.cliente_id, cliente_nome: r.clientes?.nome || null })),
  ]

  const resumo = { data: dia, modo, total: alvos.length, cobrado: 0, simulado: 0, recusado: 0, pulado: 0, erro: 0, valor: 0 }
  const detalhes: any[] = []

  // Uma por vez, igual ao lote da tela (nada de paralelo contra o Pagar.me).
  for (const a of alvos) {
    const valor = a.origem === 'ct' ? VALOR_MULTA_CT : VALOR_MULTA_CLUB
    let out: ResultadoCobranca
    try {
      out = a.origem === 'ct'
        ? await cobrarMultaCT(supabase, a.ref_id, valor, { operadoPor: null, simular: simulando })
        : await cobrarMultaClub(supabase, a.ref_id, valor, { operadoPor: null, simular: simulando })
    } catch (e: any) {
      out = { status: 500, body: { error: e?.message || 'Erro interno' } }
    }
    const { resultado, motivo } = classificar(out, simulando)
    ;(resumo as any)[resultado]++
    if (resultado === 'cobrado' || resultado === 'simulado') resumo.valor += valor

    const linha = {
      data_ref: dia, modo, origem: a.origem, ref_id: a.ref_id,
      cliente_id: a.cliente_id, cliente_nome: a.cliente_nome,
      valor, resultado, motivo, order_id: out.body?.order_id || null,
    }
    detalhes.push(linha)
    await supabase.from('noshow_auto_log').insert(linha)
  }

  resumo.valor = Math.round(resumo.valor * 100) / 100
  return NextResponse.json({ ...resumo, detalhes })
}

export const GET = handler
export const POST = handler
