// POST /api/totem/identificar  { unidade, cpf }
// Identifica o cliente por CPF e busca a reserva de HOJE na unidade Club do totem.
// Fail-safe: nunca lança pro cliente; erros viram resposta tratável.
import { NextRequest, NextResponse } from 'next/server'
import {
  totemService, resolverUnidadeClub, totemTokenOk,
  ehParceiro, origemLabel, nomeAulaClub,
} from '@/lib/totem/service'
import { nomeCoachPublico } from '@/lib/mascaraCoachPublico'
import { hojeSP, aulaEncerrada } from '@/lib/tempo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    if (!totemTokenOk(req)) return NextResponse.json({ erro: 'nao_autorizado' }, { status: 401 })

    const body = await req.json().catch(() => ({} as any))
    const cpf = String(body?.cpf || '').replace(/\D/g, '')

    const sb = totemService()
    const unidade = await resolverUnidadeClub(sb, String(body?.unidade || ''))
    if (!unidade) return NextResponse.json({ erro: 'unidade_invalida' }, { status: 400 })

    if (cpf.length !== 11) return NextResponse.json({ resultado: 'cpf_invalido' })

    const { data: cliente } = await sb
      .from('clientes')
      .select('id, nome, bloqueado')
      .eq('cpf', cpf)
      .maybeSingle()

    if (!cliente) return NextResponse.json({ resultado: 'nao_encontrado' })
    if (cliente.bloqueado) return NextResponse.json({ resultado: 'bloqueado', nome: cliente.nome })

    const hoje = hojeSP()

    // Reservas ativas do cliente (poucas por CPF) + embed da ocorrência/aula. Filtra em JS.
    const { data: reservas } = await sb
      .from('club_reservas')
      .select(`
        id, status, tipo_credito, posicao, via_app,
        ocorrencia:club_ocorrencias (
          id, coach_id, data, status,
          aula:club_aulas (
            tipo, horario, duracao_min, coach_id, unidade_id,
            grupo:grupos_musculares ( nome )
          )
        )
      `)
      .eq('cliente_id', cliente.id)
      .in('status', ['reservado', 'presente'])

    const candidatas = (reservas || [])
      .map((r: any) => {
        const o = r.ocorrencia
        const a = o?.aula
        if (!o || !a) return null
        if (o.data !== hoje || o.status !== 'ativa') return null
        if (a.unidade_id !== unidade.id) return null
        // aula que já terminou (início + duração) não serve pra check-in agora
        if (aulaEncerrada(hoje, a.horario, a.duracao_min || 60)) return null
        return {
          reservaId: r.id as string,
          status: r.status as string,
          tipoCredito: r.tipo_credito as string,
          posicao: (r.posicao || null) as string | null,
          aulaTipo: a.tipo as string,
          horario: String(a.horario || '').slice(0, 5),
          coachId: (o.coach_id || a.coach_id || null) as string | null,
          grupo: a.grupo?.nome || null,
        }
      })
      .filter(Boolean) as any[]

    if (candidatas.length === 0) {
      return NextResponse.json({ resultado: 'sem_reserva', nome: cliente.nome })
    }

    // a mais próxima de agora = menor horário entre as ainda válidas
    candidatas.sort((a, b) => a.horario.localeCompare(b.horario))
    const c = candidatas[0]

    // nome do coach (com máscara pública) — 1 leitura leve
    let coachNome = ''
    if (c.coachId) {
      const { data: coach } = await sb.from('coaches').select('id, nome').eq('id', c.coachId).maybeSingle()
      coachNome = nomeCoachPublico(coach?.id, coach?.nome)
    }

    const parceiro = ehParceiro(c.tipoCredito)
    // Fluxo: já presente (parceiro confirmado / recepção) | direto Just (confirmar) | parceiro pendente
    const flow =
      c.status === 'presente' ? 'confirmado'
      : parceiro ? 'aguardar_parceiro'
      : 'confirmar'

    return NextResponse.json({
      resultado: 'reserva',
      nome: cliente.nome,
      reserva: {
        id: c.reservaId,
        aulaTipo: c.aulaTipo,
        aulaNome: nomeAulaClub(c.aulaTipo, c.grupo),
        horario: c.horario,
        coach: coachNome,
        posicao: c.aulaTipo === 'running_funcional' ? c.posicao : null,
        origem: origemLabel(c.tipoCredito),
        isPartner: parceiro,
        flow,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ erro: 'falha', detalhe: String(e?.message || e) }, { status: 500 })
  }
}
