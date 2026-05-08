'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'

const ACCENT = '#ff2d9b'
const CYAN = '#00e5ff'
const AMARELO = '#ffaa00'

const LIMITE_PLANO: Record<string, number> = { wellhub: 8, totalpass: 10 }
const planoLabel: Record<string, string> = {
  wellhub: 'Wellhub Diamond',
  totalpass: 'TotalPass TP6',
  avulso: 'Avulso Coach CT',
}

export default function MinhaContaPage() {
  const { perfil, loading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [cliente, setCliente] = useState<any>(null)
  const [agendamentos, setAgendamentos] = useState<any[]>([])
  const [creditos, setCreditos] = useState<Record<string, { usado: number; limite: number }>>({})
  const [loadingData, setLoadingData] = useState(true)

  const [modalCancelar, setModalCancelar] = useState<any>(null)
  const [cancelando, setCancelando] = useState(false)
  const [erroCancelar, setErroCancelar] = useState('')

  useEffect(() => {
    if (!loading && !perfil) router.push('/login')
    if (!loading && perfil && !['cliente'].includes(perfil.role as string)) router.push('/equipe')
  }, [perfil, loading])

  useEffect(() => {
    if (perfil) loadDados()
  }, [perfil])

  async function loadDados() {
    const { data: cli } = await supabase.from('clientes').select('*').eq('user_id', perfil!.id).maybeSingle()
    setCliente(cli)

    if (cli) {
      const hoje = new Date().toISOString().split('T')[0]
      const { data: ags } = await supabase
        .from('agendamentos').select('*')
        .eq('cliente_id', cli.id)
        .gte('data', hoje)
        .order('data').order('horario')
        .limit(20)

      setAgendamentos(ags || [])
      await carregarCreditos(cli)
    }
    setLoadingData(false)
  }

  async function carregarCreditos(c: any) {
    const agora = new Date()
    const mes = agora.getMonth() + 1
    const ano = agora.getFullYear()
    const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`
    const fim = `${ano}-${String(mes).padStart(2, '0')}-31`

    const { data: ags } = await supabase
      .from('agendamentos')
      .select('tipo_credito')
      .eq('cliente_id', c.id)
      .gte('data', inicio)
      .lte('data', fim)
      .in('status', ['agendado', 'confirmado', 'realizado'])

    const usado: Record<string, number> = {}
    for (const a of (ags || [])) {
      usado[a.tipo_credito] = (usado[a.tipo_credito] || 0) + 1
    }

    const resultado: Record<string, { usado: number; limite: number }> = {}
    const planos = c.planos || ['wellhub']
    for (const p of planos) {
      if (LIMITE_PLANO[p]) resultado[p] = { usado: usado[p] || 0, limite: LIMITE_PLANO[p] }
    }
    if ((c.creditos_avulso || 0) > 0) {
      resultado['avulso'] = { usado: usado['avulso'] || 0, limite: c.creditos_avulso }
    }
    setCreditos(resultado)
  }

  // Calcula situação do cancelamento
  function situacaoCancelamento(ag: any): { pode: boolean; motivo: string; aviso: string } {
    const agora = new Date()
    const dataHoraAula = new Date(`${ag.data}T${ag.horario}`)
    const diffMs = dataHoraAula.getTime() - agora.getTime()
    const diffHoras = diffMs / (1000 * 60 * 60)

    if (diffHoras <= 3) {
      return {
        pode: false,
        motivo: 'Menos de 3h antes da aula',
        aviso: 'Não é possível cancelar com menos de 3h de antecedência.',
      }
    }

    if (diffHoras <= 12) {
      // Entre 3h e 12h: só pode se houver fila
      return {
        pode: true, // verificamos a fila na hora
        motivo: 'Entre 3h e 12h — verificar fila',
        aviso: 'Entre 12h e 3h antes: cancelamento só permitido se houver cliente na fila de espera.',
      }
    }

    return {
      pode: true,
      motivo: 'Cancelamento livre',
      aviso: 'Cancelamento gratuito até 12h antes. Seu crédito será devolvido.',
    }
  }

  async function abrirModalCancelar(ag: any) {
    const sit = situacaoCancelamento(ag)
    const agora = new Date()
    const dataHoraAula = new Date(`${ag.data}T${ag.horario}`)
    const diffHoras = (dataHoraAula.getTime() - agora.getTime()) / (1000 * 60 * 60)

    // Entre 3h e 12h: verifica se há fila
    if (diffHoras > 3 && diffHoras <= 12) {
      const { data: fila } = await supabase
        .from('fila_espera')
        .select('id')
        .eq('data', ag.data)
        .eq('status', 'aguardando')
        .limit(1)

      if (!fila || fila.length === 0) {
        setModalCancelar({
          ...ag,
          pode: false,
          aviso: 'Faltam menos de 12h e não há ninguém na fila de espera. Cancelamento não permitido.',
        })
        setErroCancelar('')
        return
      }
    }

    setModalCancelar({ ...ag, pode: sit.pode, aviso: sit.aviso })
    setErroCancelar('')
  }

  async function confirmarCancelamento() {
    if (!modalCancelar || !modalCancelar.pode) return
    setCancelando(true)
    setErroCancelar('')

    const { error } = await supabase.from('agendamentos').update({
      status: 'cancelado',
      cancelado_em: new Date().toISOString(),
      motivo_cancelamento: 'Cancelado pelo cliente',
    }).eq('id', modalCancelar.id)

    if (error) {
      setErroCancelar('Erro ao cancelar. Tente novamente.')
      setCancelando(false)
      return
    }

    setModalCancelar(null)
    setCancelando(false)
    await loadDados()
  }

  async function sair() {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading || loadingData) return (
    <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: `4px solid ${ACCENT}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  const totalSessoes = Object.values(creditos).reduce((acc, info) => acc + (info.limite - info.usado), 0)
  const agendamentosAtivos = agendamentos.filter(a => !['cancelado'].includes(a.status))

  return (
    <div style={{ minHeight: '100vh', background: '#080808', fontFamily: "'DM Sans', sans-serif", color: '#f0f0f0' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
      `}</style>

      {/* Nav */}
      <div style={{ background: '#08080895', backdropFilter: 'blur(16px)', borderBottom: '1px solid #1a1a1a', padding: '0 2rem', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
        <div onClick={() => router.push('/')} style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: '#fff', letterSpacing: 2, cursor: 'pointer' }}>
          JUST<span style={{ color: ACCENT }}>CT</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: 13, color: '#555' }}>Olá, {perfil?.nome?.split(' ')[0]}</span>
          <button onClick={sair} style={{ background: 'transparent', border: '1px solid #333', borderRadius: 8, padding: '0.4rem 1rem', color: '#888', fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
            Sair
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '2rem 1.5rem' }}>

        {/* Boas vindas */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: '#fff', letterSpacing: 1 }}>
            Olá, {perfil?.nome?.split(' ')[0]}! 👋
          </div>
          <div style={{ fontSize: 14, color: '#555', marginTop: 4 }}>Bem-vindo à sua área do aluno</div>
        </div>

        {/* Cards de créditos por plano */}
        <div style={{ display: 'grid', gridTemplateColumns: Object.keys(creditos).length > 1 ? '1fr 1fr' : '1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
          {Object.entries(creditos).map(([plano, info]) => {
            const restante = info.limite - info.usado
            return (
              <div key={plano} style={{ background: '#111', border: `1px solid ${restante === 0 ? '#222' : ACCENT + '33'}`, borderRadius: 16, padding: '1.25rem' }}>
                <div style={{ fontSize: 11, color: restante === 0 ? '#444' : ACCENT, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 8 }}>
                  {planoLabel[plano] || plano}
                </div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, color: restante === 0 ? '#333' : '#fff', lineHeight: 1 }}>
                  {restante}
                </div>
                <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>de {info.limite} sessões este mês</div>
                {restante === 0 && (
                  <div style={{ fontSize: 11, color: '#ff4444', marginTop: 6 }}>Créditos esgotados</div>
                )}
              </div>
            )
          })}
          <div style={{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: '1.25rem' }}>
            <div style={{ fontSize: 11, color: '#555', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 8 }}>Próximos treinos</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, color: '#fff', lineHeight: 1 }}>
              {agendamentosAtivos.length}
            </div>
            <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>agendamentos ativos</div>
          </div>
        </div>

        {/* Botão agendar */}
        <button onClick={() => router.push('/agendar')}
          style={{ width: '100%', background: ACCENT, color: '#fff', border: 'none', borderRadius: 12, padding: '1rem', fontWeight: 600, fontSize: 16, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", marginBottom: '2rem' }}>
          + Agendar Coach CT
        </button>

        {/* Agendamentos */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ fontSize: 11, color: '#555', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' as const, marginBottom: '1rem' }}>Meus agendamentos</div>
          {agendamentos.length === 0 ? (
            <div style={{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: '2rem', textAlign: 'center', color: '#444', fontSize: 14 }}>
              Nenhum agendamento. Que tal reservar uma sessão?
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {agendamentos.map(ag => {
                const sit = situacaoCancelamento(ag)
                const statusColor: Record<string, string> = {
                  agendado: CYAN,
                  confirmado: '#aaff00',
                  realizado: '#555',
                  cancelado: '#ff4444',
                  falta: '#ff8c00',
                }
                const podeTentarCancelar = ['agendado', 'confirmado'].includes(ag.status)

                return (
                  <div key={ag.id} style={{ background: '#111', border: '1px solid #222', borderRadius: 12, padding: '1rem 1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ textAlign: 'center', flexShrink: 0 }}>
                        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: '#fff', lineHeight: 1 }}>
                          {new Date(ag.data + 'T12:00:00').getDate()}
                        </div>
                        <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase' as const }}>
                          {new Date(ag.data + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' })}
                        </div>
                      </div>
                      <div style={{ width: 1, height: 36, background: '#222', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>
                          Coach CT — {ag.horario?.slice(0, 5)}
                        </div>
                        <div style={{ fontSize: 12, color: '#555' }}>{planoLabel[ag.tipo_credito] || ag.tipo_credito}</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: statusColor[ag.status] || '#555', textTransform: 'uppercase' as const }}>
                          {ag.status}
                        </div>
                        {podeTentarCancelar && (
                          <button
                            onClick={() => abrirModalCancelar(ag)}
                            style={{ background: 'transparent', border: '1px solid #333', borderRadius: 6, padding: '0.2rem 0.6rem', fontSize: 11, color: '#555', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                            Cancelar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Dados da conta */}
        {cliente && (
          <div style={{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: '1.25rem' }}>
            <div style={{ fontSize: 11, color: '#555', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' as const, marginBottom: '1rem' }}>Minha conta</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'Nome', value: cliente.nome },
                { label: 'Email', value: cliente.email },
                { label: 'Telefone', value: cliente.telefone },
                { label: 'Notificações', value: cliente.notificacao_preferida === 'whatsapp' ? '💬 WhatsApp' : cliente.notificacao_preferida === 'email' ? '📧 Email' : '🔕 Desativadas' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #1a1a1a' }}>
                  <span style={{ fontSize: 13, color: '#555' }}>{item.label}</span>
                  <span style={{ fontSize: 13, color: '#fff' }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal cancelamento */}
      {modalCancelar && (
        <div style={{ position: 'fixed', inset: 0, background: '#000000cc', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: 20, width: '100%', maxWidth: 420, padding: '1.5rem' }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#fff', marginBottom: 4 }}>
              CANCELAR AGENDAMENTO
            </div>
            <div style={{ fontSize: 13, color: '#555', marginBottom: '1.5rem', textTransform: 'capitalize' as const }}>
              {new Date(modalCancelar.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })} · {modalCancelar.horario?.slice(0, 5)}
            </div>

            <div style={{
              background: modalCancelar.pode ? '#0a1a0a' : '#1a0a0a',
              border: `1px solid ${modalCancelar.pode ? '#aaff0033' : '#ff444433'}`,
              borderRadius: 10, padding: '1rem', marginBottom: '1.5rem',
              fontSize: 13, color: modalCancelar.pode ? '#aaa' : '#ff8888', lineHeight: 1.6,
            }}>
              {modalCancelar.pode ? '✅ ' : '❌ '}{modalCancelar.aviso}
            </div>

            {erroCancelar && (
              <div style={{ background: '#ff2d9b15', border: '1px solid #ff2d9b44', borderRadius: 8, padding: '0.6rem 1rem', fontSize: 13, color: ACCENT, marginBottom: '1rem' }}>
                {erroCancelar}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setModalCancelar(null)}
                style={{ flex: 1, background: 'transparent', border: '1px solid #333', borderRadius: 10, padding: '0.85rem', color: '#888', fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                Voltar
              </button>
              {modalCancelar.pode && (
                <button onClick={confirmarCancelamento} disabled={cancelando}
                  style={{ flex: 2, background: '#ff4444', color: '#fff', border: 'none', borderRadius: 10, padding: '0.85rem', fontWeight: 600, fontSize: 15, cursor: cancelando ? 'default' : 'pointer', fontFamily: "'DM Sans', sans-serif", opacity: cancelando ? 0.7 : 1 }}>
                  {cancelando ? 'Cancelando...' : 'Confirmar cancelamento'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
