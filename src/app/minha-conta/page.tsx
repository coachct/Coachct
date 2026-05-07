'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'

const ACCENT = '#ff2d9b'

export default function MinhaContaPage() {
  const { perfil, loading } = useAuth()
  const router = useRouter()
  const supabase = createClient()
  const [cliente, setCliente] = useState<any>(null)
  const [creditos, setCreditos] = useState<any[]>([])
  const [agendamentos, setAgendamentos] = useState<any[]>([])
  const [loadingData, setLoadingData] = useState(true)

  useEffect(() => {
    if (!loading && !perfil) router.push('/login')
    if (!loading && perfil && !['cliente'].includes(perfil.role as string)) {
      router.push('/equipe')
    }
  }, [perfil, loading])

  useEffect(() => {
    if (perfil) loadDados()
  }, [perfil])

  async function loadDados() {
    const { data: cli } = await supabase
      .from('clientes').select('*').eq('user_id', perfil!.id).maybeSingle()
    setCliente(cli)

    if (cli) {
      const agora = new Date()
      const mes = agora.getMonth() + 1
      const ano = agora.getFullYear()

      const { data: creds } = await supabase
        .from('cliente_creditos').select('*')
        .eq('cliente_id', cli.id)
        .or(`mes.eq.${mes},mes.eq.${mes === 12 ? 1 : mes + 1}`)

      const { data: ags } = await supabase
        .from('agendamentos').select('*')
        .eq('cliente_id', cli.id)
        .gte('data', agora.toISOString().split('T')[0])
        .order('data').limit(10)

      setCreditos(creds || [])
      setAgendamentos(ags || [])
    }
    setLoadingData(false)
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

  const agora = new Date()
  const mes = agora.getMonth() + 1
  const ano = agora.getFullYear()
  const creditoMes = creditos.filter(c => c.mes === mes && c.ano === ano)
  const totalCreditos = creditoMes.reduce((acc, c) => acc + (c.total - c.usado), 0)

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

        {/* Cards de créditos */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ background: '#111', border: `1px solid ${ACCENT}33`, borderRadius: 16, padding: '1.25rem' }}>
            <div style={{ fontSize: 11, color: ACCENT, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Sessões Coach CT</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, color: '#fff', lineHeight: 1 }}>
              {totalCreditos}
            </div>
            <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>créditos disponíveis este mês</div>
          </div>
          <div style={{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: '1.25rem' }}>
            <div style={{ fontSize: 11, color: '#555', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Próximos treinos</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, color: '#fff', lineHeight: 1 }}>
              {agendamentos.filter(a => a.status !== 'cancelado').length}
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
          <div style={{ fontSize: 11, color: '#555', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: '1rem' }}>Meus agendamentos</div>
          {agendamentos.length === 0 ? (
            <div style={{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: '2rem', textAlign: 'center', color: '#444', fontSize: 14 }}>
              Nenhum agendamento. Que tal reservar uma sessão?
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {agendamentos.map(ag => {
                const statusColor: Record<string, string> = {
                  agendado: '#00e5ff',
                  confirmado: '#aaff00',
                  realizado: '#555',
                  cancelado: '#ff4444',
                  falta: '#ff8c00',
                }
                return (
                  <div key={ag.id} style={{ background: '#111', border: '1px solid #222', borderRadius: 12, padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ textAlign: 'center', flexShrink: 0 }}>
                      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: '#fff', lineHeight: 1 }}>
                        {new Date(ag.data + 'T12:00:00').getDate()}
                      </div>
                      <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase' }}>
                        {new Date(ag.data + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' })}
                      </div>
                    </div>
                    <div style={{ width: 1, height: 36, background: '#222', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>
                        Coach CT — {ag.horario?.slice(0, 5)}
                      </div>
                      <div style={{ fontSize: 12, color: '#555' }}>{ag.tipo_credito}</div>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: statusColor[ag.status] || '#555', textTransform: 'uppercase', flexShrink: 0 }}>
                      {ag.status}
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
            <div style={{ fontSize: 11, color: '#555', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: '1rem' }}>Minha conta</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'Nome', value: cliente.nome },
                { label: 'Email', value: cliente.email },
                { label: 'Telefone', value: cliente.telefone },
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
    </div>
  )
}
