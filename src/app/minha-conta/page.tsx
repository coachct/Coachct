'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'

const ACCENT = '#ff2d9b'
const CYAN = '#00e5ff'
const AMARELO = '#ffaa00'

const planoLabel: Record<string, string> = {
  wellhub: 'Wellhub Diamond',
  totalpass: 'TotalPass TP6',
  avulso: 'Avulso Coach CT',
}

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
]

export default function MinhaContaPage() {
  const { perfil, loading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [cliente, setCliente] = useState<any>(null)
  const [agendamentos, setAgendamentos] = useState<any[]>([])
  const [filas, setFilas] = useState<any[]>([])
  const [saldoAtual, setSaldoAtual] = useState<Record<string, any>>({})
  const [saldoProximo, setSaldoProximo] = useState<Record<string, any>>({})
  const [agendamentosProximoMes, setAgendamentosProximoMes] = useState(0)
  const [loadingData, setLoadingData] = useState(true)

  const [modalCancelar, setModalCancelar] = useState<any>(null)
  const [cancelando, setCancelando] = useState(false)
  const [erroCancelar, setErroCancelar] = useState('')

  const [modalSairFila, setModalSairFila] = useState<any>(null)
  const [saindoFila, setSaindoFila] = useState(false)

  const agora = new Date()
  const mesAtual = agora.getMonth() + 1
  const anoAtual = agora.getFullYear()
  const mesProximo = mesAtual === 12 ? 1 : mesAtual + 1
  const anoProximo = mesAtual === 12 ? anoAtual + 1 : anoAtual
  const nomeMesAtual = MESES[mesAtual - 1]
  const nomeMesProximo = MESES[mesProximo - 1]

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
      const inicioProximoMes = `${anoProximo}-${String(mesProximo).padStart(2, '0')}-01`
      const fimProximoMes = `${anoProximo}-${String(mesProximo).padStart(2, '0')}-31`

      const [{ data: ags }, { data: filasData }, { data: agsProx }, { data: saldoA }, { data: saldoP }] = await Promise.all([
        supabase.from('agendamentos').select('*')
          .eq('cliente_id', cli.id)
          .gte('data', hoje)
          .order('data').order('horario')
          .limit(20),
        supabase.from('fila_espera').select('*')
          .eq('cliente_id', cli.id)
          .eq('status', 'aguardando')
          .gte('data', hoje)
          .order('data').order('horario'),
        supabase.from('agendamentos').select('id', { count: 'exact', head: false })
          .eq('cliente_id', cli.id)
          .gte('data', inicioProximoMes)
          .lte('data', fimProximoMes)
          .in('status', ['agendado', 'confirmado']),
        supabase.rpc('saldo_creditos_cliente', {
          p_cliente_id: cli.id, p_mes: mesAtual, p_ano: anoAtual,
        }),
        supabase.rpc('saldo_creditos_cliente', {
          p_cliente_id: cli.id, p_mes: mesProximo, p_ano: anoProximo,
        }),
      ])

      setAgendamentos(ags || [])
      setFilas(filasData || [])
      setAgendamentosProximoMes((agsProx || []).length)
      setSaldoAtual(saldoA || {})
      setSaldoProximo(saldoP || {})
    }
    setLoadingData(false)
  }

  function situacaoCancelamento(ag: any): { pode: boolean; motivo: string; aviso: string } {
    const agora = new Date()
    const dataHoraAula = new Date(`${ag.data}T${ag.horario}`)
    const diffMs = dataHoraAula.getTime() - agora.getTime()
    const diffHoras = diffMs / (1000 * 60 * 60)

    if (diffHoras <= 3) {
      return {
        pode: false,
        motivo: 'Menos de 3h antes da aula',
        aviso: 'Não é possível cancelar com menos de 3h de antecedência. Faltar gera bloqueio de conta e multa.',
      }
    }

    if (diffHoras <= 12) {
      return {
        pode: true,
        motivo: 'Entre 3h e 12h — verificar fila',
        aviso: 'Como há clientes na fila de espera, você pode cancelar normalmente. Seu crédito será devolvido e a vaga repassada para o próximo da fila.',
      }
    }

    return {
      pode: true,
      motivo: 'Cancelamento livre',
      aviso: 'Você está cancelando com mais de 12h de antecedência. Seu crédito será devolvido integralmente.',
    }
  }

  async function abrirModalCancelar(ag: any) {
    const sit = situacaoCancelamento(ag)
    const agora = new Date()
    const dataHoraAula = new Date(`${ag.data}T${ag.horario}`)
    const diffHoras = (dataHoraAula.getTime() - agora.getTime()) / (1000 * 60 * 60)

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
          aviso: 'Faltam menos de 12h para o treino e não há ninguém na fila de espera. Por isso o cancelamento não é permitido. Faltar sem aviso gera bloqueio e multa.',
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

  async function sairDaFila() {
    if (!modalSairFila) return
    setSaindoFila(true)

    const { error } = await supabase.from('fila_espera').delete().eq('id', modalSairFila.id)

    if (!error) {
      setModalSairFila(null)
      await loadDados()
    }
    setSaindoFila(false)
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

  const agendamentosAtivos = agendamentos.filter(a => !['cancelado'].includes(a.status))

  // Identifica situação para mensagens contextuais
  const todoSaldoMesEsgotado = Object.keys(saldoAtual).length > 0 &&
    Object.values(saldoAtual).every((s: any) => s.disponivel === 0)
  const temSaldoNoProximoMes = Object.keys(saldoProximo).length > 0 &&
    Object.values(saldoProximo).some((s: any) => s.disponivel > 0)

  // Lista dos planos com saldo no próximo mês para mensagem amigável
  const planosProximoMes = Object.entries(saldoProximo)
    .filter(([_, s]: [string, any]) => s.disponivel > 0)
    .map(([plano, s]: [string, any]) => `${s.disponivel} ${planoLabel[plano] || plano}`)
    .join(', ')

  return (
    <div style={{ minHeight: '100vh', background: '#080808', fontFamily: "'DM Sans', sans-serif", color: '#f0f0f0' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
      `}</style>

      <div style={{ background: '#08080895', backdropFilter: 'blur(16px)', borderBottom: '1px solid #1a1a1a', padding: '0 2rem', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
        <div onClick={() => router.push('/')} style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: '#fff', letterSpacing: 2, cursor: 'pointer' }}>
          JUST<span style={{ color: ACCENT }}>CT</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: 13, color: '#aaa' }}>Olá, {perfil?.nome?.split(' ')[0]}</span>
          <button onClick={sair} style={{ background: 'transparent', border: '1px solid #444', borderRadius: 8, padding: '0.4rem 1rem', color: '#bbb', fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
            Sair
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '2rem 1.5rem' }}>

        <div style={{ marginBottom: '2rem' }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: '#fff', letterSpacing: 1 }}>
            Olá, {perfil?.nome?.split(' ')[0]}! 👋
          </div>
          <div style={{ fontSize: 14, color: '#aaa', marginTop: 4 }}>Bem-vindo à sua área do aluno</div>
        </div>

        {/* CARDS DE CRÉDITO DO MÊS ATUAL */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          {Object.entries(saldoAtual).filter(([k]) => k !== 'avulso').map(([plano, info]: [string, any]) => {
            const restante = info.disponivel
            return (
              <div key={plano} style={{ background: '#111', border: `1px solid ${restante === 0 ? '#333' : ACCENT + '33'}`, borderRadius: 16, padding: '1.25rem' }}>
                <div style={{ fontSize: 11, color: restante === 0 ? '#888' : ACCENT, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 8 }}>
                  {planoLabel[plano] || plano}
                </div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, color: restante === 0 ? '#666' : '#fff', lineHeight: 1 }}>
                  {restante}
                </div>
                <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>de {info.total} sessões em {nomeMesAtual}</div>
                {restante === 0 && (
                  <div style={{ fontSize: 11, color: '#ff6b6b', marginTop: 6 }}>Esgotado neste mês</div>
                )}
              </div>
            )
          })}
          {/* Crédito Avulso (se houver) */}
          {saldoAtual.avulso && saldoAtual.avulso.disponivel > 0 && (
            <div style={{ background: '#111', border: `1px solid ${CYAN}33`, borderRadius: 16, padding: '1.25rem' }}>
              <div style={{ fontSize: 11, color: CYAN, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 8 }}>
                Avulso Coach CT
              </div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, color: '#fff', lineHeight: 1 }}>
                {saldoAtual.avulso.disponivel}
              </div>
              <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>
                {saldoAtual.avulso.disponivel === 1 ? 'crédito disponível' : 'créditos disponíveis'}
              </div>
            </div>
          )}
          {/* Card de próximos treinos */}
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: 16, padding: '1.25rem' }}>
            <div style={{ fontSize: 11, color: '#aaa', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 8 }}>Próximos treinos</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, color: '#fff', lineHeight: 1 }}>
              {agendamentosAtivos.length}
            </div>
            <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>agendamentos ativos</div>
          </div>
        </div>

        {/* MENSAGEM CONTEXTUAL — mês atual esgotado mas tem saldo no próximo */}
        {todoSaldoMesEsgotado && temSaldoNoProximoMes && (
          <div style={{ background: '#0a1a0a', border: '1px solid #aaff0033', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '1rem' }}>
            <div style={{ fontSize: 13, color: '#aaff88', fontWeight: 600, marginBottom: 4 }}>
              ✅ Você usou todas as sessões de {nomeMesAtual}
            </div>
            <div style={{ fontSize: 13, color: '#bbb', lineHeight: 1.6 }}>
              Você já pode agendar treinos para <strong style={{ color: '#fff' }}>{nomeMesProximo}</strong> a qualquer momento. Seus créditos do próximo mês: <strong style={{ color: '#fff' }}>{planosProximoMes}</strong>.
            </div>
          </div>
        )}

        {/* CARD SECUNDÁRIO — saldo do próximo mês (só se cliente já agendou para o próximo mês) */}
        {agendamentosProximoMes > 0 && Object.keys(saldoProximo).length > 0 && (
          <div style={{ background: '#0a0a14', border: '1px solid #333', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '1rem' }}>
            <div style={{ fontSize: 11, color: '#aaa', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 8 }}>
              📅 Já reservados para {nomeMesProximo}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
              {Object.entries(saldoProximo).filter(([k]) => k !== 'avulso').map(([plano, info]: [string, any]) => (
                <div key={plano} style={{ fontSize: 12, color: '#ddd' }}>
                  <strong style={{ color: '#fff' }}>{info.disponivel}</strong>
                  <span style={{ color: '#888' }}> de {info.total} {planoLabel[plano]} disponíveis</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={() => router.push('/agendar')}
          style={{ width: '100%', background: ACCENT, color: '#fff', border: 'none', borderRadius: 12, padding: '1rem', fontWeight: 600, fontSize: 16, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", marginBottom: '2rem' }}>
          + Agendar Coach CT
        </button>

        <div style={{ marginBottom: '2rem' }}>
          <div style={{ fontSize: 11, color: '#aaa', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' as const, marginBottom: '1rem' }}>Meus agendamentos</div>
          {agendamentos.length === 0 ? (
            <div style={{ background: '#111', border: '1px solid #333', borderRadius: 16, padding: '2rem', textAlign: 'center', color: '#888', fontSize: 14 }}>
              Nenhum agendamento. Que tal reservar uma sessão?
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {agendamentos.map(ag => {
                const statusColor: Record<string, string> = {
                  agendado: CYAN,
                  confirmado: '#aaff00',
                  realizado: '#888',
                  cancelado: '#ff6b6b',
                  falta: '#ff8c00',
                }
                const podeTentarCancelar = ['agendado', 'confirmado'].includes(ag.status)

                return (
                  <div key={ag.id} style={{ background: '#111', border: '1px solid #333', borderRadius: 12, padding: '1rem 1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ textAlign: 'center', flexShrink: 0 }}>
                        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: '#fff', lineHeight: 1 }}>
                          {new Date(ag.data + 'T12:00:00').getDate()}
                        </div>
                        <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase' as const }}>
                          {new Date(ag.data + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' })}
                        </div>
                      </div>
                      <div style={{ width: 1, height: 36, background: '#333', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>
                          Coach CT — {ag.horario?.slice(0, 5)}
                        </div>
                        <div style={{ fontSize: 12, color: '#aaa' }}>{planoLabel[ag.tipo_credito] || ag.tipo_credito}</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: statusColor[ag.status] || '#888', textTransform: 'uppercase' as const }}>
                          {ag.status}
                        </div>
                        {podeTentarCancelar && (
                          <button
                            onClick={() => abrirModalCancelar(ag)}
                            style={{ background: 'transparent', border: '1px solid #444', borderRadius: 6, padding: '0.2rem 0.6rem', fontSize: 11, color: '#bbb', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
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

        {filas.length > 0 && (
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ fontSize: 11, color: AMARELO, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' as const, marginBottom: '1rem' }}>⏳ Aguardando na fila de espera</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filas.map(f => (
                <div key={f.id} style={{ background: '#1a1000', border: `1px solid ${AMARELO}44`, borderRadius: 12, padding: '1rem 1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ textAlign: 'center', flexShrink: 0 }}>
                      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: AMARELO, lineHeight: 1 }}>
                        {new Date(f.data + 'T12:00:00').getDate()}
                      </div>
                      <div style={{ fontSize: 10, color: AMARELO, textTransform: 'uppercase' as const, opacity: 0.85 }}>
                        {new Date(f.data + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' })}
                      </div>
                    </div>
                    <div style={{ width: 1, height: 36, background: '#332200', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>
                        Coach CT — {f.horario?.slice(0, 5)}
                      </div>
                      <div style={{ fontSize: 12, color: '#bbb' }}>{planoLabel[f.tipo_credito] || f.tipo_credito}</div>
                      <div style={{ fontSize: 11, color: AMARELO, marginTop: 4 }}>Você será avisado se uma vaga abrir</div>
                    </div>
                    <button
                      onClick={() => setModalSairFila(f)}
                      style={{ background: 'transparent', border: `1px solid ${AMARELO}77`, borderRadius: 6, padding: '0.3rem 0.75rem', fontSize: 11, color: AMARELO, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}>
                      Sair da fila
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {cliente && (
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: 16, padding: '1.25rem' }}>
            <div style={{ fontSize: 11, color: '#aaa', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' as const, marginBottom: '1rem' }}>Minha conta</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'Nome', value: cliente.nome },
                { label: 'Email', value: cliente.email },
                { label: 'Telefone', value: cliente.telefone },
                { label: 'Notificações', value: cliente.notificacao_preferida === 'whatsapp' ? '💬 WhatsApp' : cliente.notificacao_preferida === 'email' ? '📧 Email' : '🔕 Desativadas' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #222' }}>
                  <span style={{ fontSize: 13, color: '#aaa' }}>{item.label}</span>
                  <span style={{ fontSize: 13, color: '#fff' }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {modalCancelar && (
        <div style={{ position: 'fixed', inset: 0, background: '#000000cc', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: 20, width: '100%', maxWidth: 420, padding: '1.5rem' }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#fff', marginBottom: 4 }}>
              CANCELAR AGENDAMENTO
            </div>
            <div style={{ fontSize: 13, color: '#aaa', marginBottom: '1.5rem', textTransform: 'capitalize' as const }}>
              {new Date(modalCancelar.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })} · {modalCancelar.horario?.slice(0, 5)}
            </div>

            <div style={{
              background: modalCancelar.pode ? '#0a1a0a' : '#1a0a0a',
              border: `1px solid ${modalCancelar.pode ? '#aaff0044' : '#ff444444'}`,
              borderRadius: 10, padding: '1rem', marginBottom: '1.5rem',
              fontSize: 13, color: modalCancelar.pode ? '#cfc' : '#ffaaaa', lineHeight: 1.6,
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
                style={{ flex: 1, background: 'transparent', border: '1px solid #444', borderRadius: 10, padding: '0.85rem', color: '#bbb', fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
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

      {modalSairFila && (
        <div style={{ position: 'fixed', inset: 0, background: '#000000cc', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#111', border: `1px solid ${AMARELO}44`, borderRadius: 20, width: '100%', maxWidth: 420, padding: '1.5rem' }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: AMARELO, marginBottom: 4 }}>
              SAIR DA FILA DE ESPERA
            </div>
            <div style={{ fontSize: 13, color: '#aaa', marginBottom: '1.5rem', textTransform: 'capitalize' as const }}>
              {new Date(modalSairFila.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })} · {modalSairFila.horario?.slice(0, 5)}
            </div>

            <div style={{
              background: '#1a1000',
              border: `1px solid ${AMARELO}44`,
              borderRadius: 10, padding: '1rem', marginBottom: '1.5rem',
              fontSize: 13, color: '#ddd', lineHeight: 1.6,
            }}>
              Você ainda não foi confirmado neste horário. Pode sair da fila a qualquer momento sem multa ou desconto de crédito.
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setModalSairFila(null)}
                style={{ flex: 1, background: 'transparent', border: '1px solid #444', borderRadius: 10, padding: '0.85rem', color: '#bbb', fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                Voltar
              </button>
              <button onClick={sairDaFila} disabled={saindoFila}
                style={{ flex: 2, background: AMARELO, color: '#000', border: 'none', borderRadius: 10, padding: '0.85rem', fontWeight: 700, fontSize: 15, cursor: saindoFila ? 'default' : 'pointer', fontFamily: "'DM Sans', sans-serif", opacity: saindoFila ? 0.7 : 1 }}>
                {saindoFila ? 'Saindo...' : 'Sair da fila'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
