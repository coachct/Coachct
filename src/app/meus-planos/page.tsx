'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'
import { dashboardDoRole } from '@/lib/auth-redirect'
import SiteHeader from '@/components/SiteHeader'
import { TEXTO_TERMO_WELLHUB_TOTALPASS, VERSAO_TERMO_WELLHUB_TOTALPASS } from '@/lib/contratos/termo-wellhub-totalpass'

const ACCENT = '#ff2d9b'

function dentroDaJanelaProximoMes(): boolean {
  const hoje = new Date()
  const ultimoDiaMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate()
  const diasAteFimMes = ultimoDiaMes - hoje.getDate()
  return diasAteFimMes <= 7
}

export default function MeusPlanosPage() {
  const { user, perfil, loading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [cliente, setCliente] = useState<any>(null)
  const [planosDisponiveis, setPlanosDisponiveis] = useState<any[]>([])
  const [clientePlanos, setClientePlanos] = useState<any[]>([])
  const [loadingData, setLoadingData] = useState(true)

  const [modalPlano, setModalPlano] = useState<any>(null)
  const [nomeAceite, setNomeAceite] = useState('')
  const [aceiteCheck, setAceiteCheck] = useState(false)
  const [scrollLido, setScrollLido] = useState(false)
  const [ativando, setAtivando] = useState(false)
  const [erroAtivacao, setErroAtivacao] = useState('')

  const agora = new Date()
  const mesAtual = agora.getMonth() + 1
  const anoAtual = agora.getFullYear()
  const mesProximo = mesAtual === 12 ? 1 : mesAtual + 1
  const anoProximo = mesAtual === 12 ? anoAtual + 1 : anoAtual

  useEffect(() => {
    if (loading) return
    if (!user) { router.push('/'); return }
    if (perfil && perfil.role && perfil.role !== 'cliente') {
      router.push(dashboardDoRole(perfil.role))
    }
  }, [user, perfil, loading])

  useEffect(() => {
    if (perfil) loadDados()
  }, [perfil])

  async function loadDados() {
    const { data: cli } = await supabase.from('clientes').select('*').eq('user_id', perfil!.id).maybeSingle()
    setCliente(cli)
    if (cli) {
      const [{ data: planos }, { data: cliPlanos }] = await Promise.all([
        supabase.from('planos_disponiveis').select('*, unidades(nome, slug)').eq('ativo', true).neq('tipo', 'avulso').order('nome'),
        supabase.from('cliente_planos').select('*, planos_disponiveis(id, nome, tipo, unidade_id, creditos_mes, unidades(nome))').eq('cliente_id', cli.id).eq('ativo', true),
      ])
      setPlanosDisponiveis(planos || [])
      setClientePlanos(cliPlanos || [])
    }
    setLoadingData(false)
  }

  function planoJaAtivo(planoId: string) {
    return clientePlanos.some(cp => cp.planos_disponiveis?.id === planoId)
  }

  function abrirModalPlano(plano: any) {
    setModalPlano(plano)
    setNomeAceite('')
    setAceiteCheck(false)
    setScrollLido(false)
    setErroAtivacao('')
  }

  function handleScroll(e: React.UIEvent<HTMLPreElement>) {
    const el = e.currentTarget
    const lido = el.scrollHeight - el.scrollTop - el.clientHeight < 50
    if (lido && !scrollLido) setScrollLido(true)
  }

  async function ativarPlano() {
    if (!scrollLido) { setErroAtivacao('Role até o final do termo antes de aceitar.'); return }
    if (!aceiteCheck) { setErroAtivacao('Você precisa aceitar os termos para continuar.'); return }
    if (!nomeAceite.trim()) { setErroAtivacao('Digite seu nome completo para confirmar o aceite.'); return }

    const nomeCliente = (cliente?.nome || '').trim().toLowerCase()
    const nomeInput = nomeAceite.trim().toLowerCase()
    if (nomeInput !== nomeCliente) {
      setErroAtivacao('O nome digitado não confere com o cadastro. Digite exatamente como foi cadastrado.')
      return
    }
    if (!modalPlano || !cliente) return

    setAtivando(true)
    setErroAtivacao('')

    try {
      // 1. Cria ou reativa o plano
      const { data: existente } = await supabase.from('cliente_planos').select('id').eq('cliente_id', cliente.id).eq('plano_id', modalPlano.id).maybeSingle()

      let cliPlanoId: string | null = null

      if (existente) {
        const { error } = await supabase.from('cliente_planos').update({
          ativo: true,
          contrato_aceito_em: new Date().toISOString(),
          inicio: new Date().toISOString().split('T')[0],
          aceite_pendente: false,
          token_aceite: null,
          token_expira_em: null,
        }).eq('id', existente.id)
        if (error) throw error
        cliPlanoId = existente.id
      } else {
        const { data: novoPlano, error } = await supabase.from('cliente_planos').insert({
          cliente_id: cliente.id,
          plano_id: modalPlano.id,
          ativo: true,
          contrato_aceito_em: new Date().toISOString(),
          inicio: new Date().toISOString().split('T')[0],
          aceite_pendente: false,
        }).select('id').single()
        if (error) throw error
        cliPlanoId = novoPlano?.id || null
      }

      // 2. Registra o aceite na tabela termos_aceites
      const tipoPlano = modalPlano.tipo === 'totalpass' ? 'totalpass' : 'wellhub'

      const { error: errAceite } = await supabase.from('termos_aceites').insert({
        cliente_id: cliente.id,
        cliente_plano_id: cliPlanoId,
        tipo_plano: tipoPlano,
        nome_digitado: nomeAceite.trim(),
        cpf_confirmado: cliente.cpf,
        user_agent: navigator.userAgent,
        modo_aceite: 'online',
        versao_contrato: VERSAO_TERMO_WELLHUB_TOTALPASS,
        texto_contrato: TEXTO_TERMO_WELLHUB_TOTALPASS,
      })

      if (errAceite) throw errAceite

      // 3. Gera créditos do mês atual
      await supabase.rpc('gerar_creditos_cliente_ativacao', { p_cliente_id: cliente.id, p_mes: mesAtual, p_ano: anoAtual })

      // 4. Gera créditos do próximo mês se estiver na janela de 7 dias
      if (dentroDaJanelaProximoMes()) {
        await supabase.rpc('gerar_creditos_cliente_ativacao', { p_cliente_id: cliente.id, p_mes: mesProximo, p_ano: anoProximo })
      }

      setModalPlano(null)
      await loadDados()
    } catch (e: any) {
      console.error(e)
      setErroAtivacao('Erro ao ativar plano. Tente novamente ou entre em contato com a recepção.')
    } finally {
      setAtivando(false)
    }
  }

  if (loading || loadingData) return (
    <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: `4px solid ${ACCENT}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  const planosWellhub = planosDisponiveis.filter(p => p.tipo === 'wellhub')
  const planosTotalPass = planosDisponiveis.filter(p => p.tipo === 'totalpass')

  const nomeBate = nomeAceite.trim().toLowerCase() === (cliente?.nome || '').trim().toLowerCase()
  const podeAtivar = scrollLido && aceiteCheck && nomeAceite.trim() && nomeBate

  return (
    <div style={{ minHeight: '100vh', background: '#080808', fontFamily: "'DM Sans', sans-serif", color: '#f0f0f0' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .plano-card:hover { border-color: ${ACCENT} !important; }
      `}</style>

      <SiteHeader />

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '6rem 1.5rem 2rem' }}>
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: '#fff', letterSpacing: 1 }}>MEUS PLANOS</div>
          <div style={{ fontSize: 14, color: '#aaa', marginTop: 4 }}>Gerencie seus planos ativos e ative novos</div>
        </div>

        {clientePlanos.length > 0 && (
          <div style={{ marginBottom: '2.5rem' }}>
            <div style={{ fontSize: 11, color: '#aaff88', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' as const, marginBottom: '1rem' }}>✅ Planos ativos</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {clientePlanos.map(cp => {
                const plano = cp.planos_disponiveis
                if (!plano) return null
                const corAgregador = plano.tipo === 'wellhub' ? '#9b59b6' : '#2980b9'
                const icone = plano.tipo === 'wellhub' ? '💜' : '🔵'
                return (
                  <div key={cp.id} style={{ background: '#0a0a0a', border: `1.5px solid ${corAgregador}`, borderRadius: 12, padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ fontSize: 22 }}>{icone}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{plano.nome}</div>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{plano.unidades?.nome} · {plano.creditos_mes} sessões por mês</div>
                      {cp.contrato_aceito_em && <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>Ativo desde {new Date(cp.contrato_aceito_em).toLocaleDateString('pt-BR')}</div>}
                    </div>
                    <div style={{ background: corAgregador + '22', border: `1px solid ${corAgregador}`, borderRadius: 8, padding: '0.3rem 0.85rem', fontSize: 12, color: corAgregador === '#9b59b6' ? '#c77dff' : '#5dade2', fontWeight: 600, flexShrink: 0 }}>✓ Ativo</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div style={{ marginBottom: '2rem' }}>
          <div style={{ fontSize: 11, color: '#aaa', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' as const, marginBottom: '1rem' }}>
            {clientePlanos.length > 0 ? 'Ativar outros planos' : 'Planos disponíveis'}
          </div>
          <div style={{ background: '#0d0010', border: `1px solid ${ACCENT}33`, borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '1.5rem', fontSize: 13, color: '#bbb', lineHeight: 1.7 }}>
            Tem o app <strong style={{ color: '#fff' }}>Wellhub</strong> ou <strong style={{ color: '#fff' }}>TotalPass</strong>? Ative seu plano aqui e libere suas sessões Coach CT incluídas. Você pode ter planos em mais de uma unidade.
          </div>

          {planosWellhub.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 18 }}>💜</span>
                <span style={{ fontSize: 14, color: '#c77dff', fontWeight: 700 }}>Wellhub</span>
                <span style={{ fontSize: 11, color: '#555' }}>· até 8 sessões/mês</span>
              </div>
              {planosWellhub.map(plano => {
                const ativo = planoJaAtivo(plano.id)
                if (ativo) return null
                return (
                  <div key={plano.id} className="plano-card" style={{ background: '#111', border: '1.5px solid #2a2a2a', borderRadius: 12, padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: 8, transition: 'border-color .2s' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{plano.nome}</div>
                      <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>{plano.unidades?.nome} · {plano.creditos_mes} sessões/mês</div>
                    </div>
                    <button onClick={() => abrirModalPlano(plano)} style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: 8, padding: '0.45rem 1.1rem', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}>Ativar</button>
                  </div>
                )
              })}
              {planosWellhub.every(p => planoJaAtivo(p.id)) && (
                <div style={{ background: '#0a0a0a', border: '1px dashed #333', borderRadius: 12, padding: '0.85rem 1rem', fontSize: 12, color: '#555', textAlign: 'center' }}>Você já ativou todos os planos Wellhub disponíveis</div>
              )}
            </div>
          )}

          {planosTotalPass.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 18 }}>🔵</span>
                <span style={{ fontSize: 14, color: '#5dade2', fontWeight: 700 }}>TotalPass</span>
                <span style={{ fontSize: 11, color: '#555' }}>· até 10 sessões/mês</span>
              </div>
              {planosTotalPass.map(plano => {
                const ativo = planoJaAtivo(plano.id)
                if (ativo) return null
                return (
                  <div key={plano.id} className="plano-card" style={{ background: '#111', border: '1.5px solid #2a2a2a', borderRadius: 12, padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: 8, transition: 'border-color .2s' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{plano.nome}</div>
                      <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>{plano.unidades?.nome} · {plano.creditos_mes} sessões/mês</div>
                    </div>
                    <button onClick={() => abrirModalPlano(plano)} style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: 8, padding: '0.45rem 1.1rem', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}>Ativar</button>
                  </div>
                )
              })}
              {planosTotalPass.every(p => planoJaAtivo(p.id)) && (
                <div style={{ background: '#0a0a0a', border: '1px dashed #333', borderRadius: 12, padding: '0.85rem 1rem', fontSize: 12, color: '#555', textAlign: 'center' }}>Você já ativou todos os planos TotalPass disponíveis</div>
              )}
            </div>
          )}

          {planosDisponiveis.length === 0 && (
            <div style={{ background: '#111', border: '1px solid #333', borderRadius: 12, padding: '1.5rem', textAlign: 'center', color: '#555', fontSize: 13 }}>Nenhum plano disponível no momento.</div>
          )}
        </div>
      </div>

      {modalPlano && (
        <div style={{ position: 'fixed', inset: 0, background: '#000000dd', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: 20, width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '1.5rem 1.5rem 1rem', borderBottom: '1px solid #222' }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#fff', letterSpacing: 1 }}>ATIVAR PLANO</div>
              <div style={{ fontSize: 14, color: ACCENT, fontWeight: 600, marginTop: 4 }}>{modalPlano.nome}</div>
              <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>{modalPlano.unidades?.nome} · {modalPlano.creditos_mes} sessões por mês</div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem' }}>
              <div style={{ fontSize: 11, color: ACCENT, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 8 }}>📄 Termo de Adesão — Wellhub / TotalPass</div>
              <pre onScroll={handleScroll} style={{ fontSize: 12, color: '#888', lineHeight: 1.8, whiteSpace: 'pre-wrap', fontFamily: "'DM Sans', sans-serif", maxHeight: 280, overflow: 'auto', border: '1px solid #222', borderRadius: 8, padding: '1rem', background: '#0a0a0a' }}>{TEXTO_TERMO_WELLHUB_TOTALPASS}</pre>

              {!scrollLido && (
                <div style={{ marginTop: 8, padding: '0.5rem', background: `${ACCENT}10`, border: `1px solid ${ACCENT}30`, borderRadius: 6, fontSize: 11, color: ACCENT, textAlign: 'center' as const }}>
                  ↓ role até o final do termo para liberar o aceite
                </div>
              )}
            </div>

            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #222' }}>
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Digite seu nome completo para confirmar o aceite:</div>
                <input type="text" value={nomeAceite} onChange={e => setNomeAceite(e.target.value)} placeholder={cliente?.nome || 'Nome Sobrenome'}
                  disabled={!scrollLido}
                  style={{ width: '100%', background: '#0a0a0a', border: `1px solid ${nomeBate && nomeAceite.length > 3 ? ACCENT + '66' : '#333'}`, borderRadius: 8, padding: '0.65rem 1rem', color: '#fff', fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: 'none', opacity: scrollLido ? 1 : 0.5 }} />
              </div>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: scrollLido ? 'pointer' : 'not-allowed', marginBottom: '1rem', opacity: scrollLido ? 1 : 0.5 }}>
                <input type="checkbox" checked={aceiteCheck} onChange={e => setAceiteCheck(e.target.checked)} disabled={!scrollLido} style={{ marginTop: 3, accentColor: ACCENT, width: 16, height: 16, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: '#aaa', lineHeight: 1.5 }}>Li e aceito integralmente o Termo de Adesão Just CT — Wellhub / TotalPass, incluindo as regras de agendamento, cancelamento, multa por no-show e conduta nas dependências da academia.</span>
              </label>

              {erroAtivacao && <div style={{ background: '#ff2d9b15', border: '1px solid #ff2d9b44', borderRadius: 8, padding: '0.6rem 1rem', fontSize: 13, color: ACCENT, marginBottom: '1rem' }}>{erroAtivacao}</div>}

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setModalPlano(null)} style={{ flex: 1, background: 'transparent', border: '1px solid #333', borderRadius: 10, padding: '0.75rem', color: '#888', fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>Cancelar</button>
                <button onClick={ativarPlano} disabled={ativando || !podeAtivar}
                  style={{ flex: 2, background: podeAtivar && !ativando ? ACCENT : '#333', color: '#fff', border: 'none', borderRadius: 10, padding: '0.75rem', fontWeight: 600, fontSize: 14, cursor: (podeAtivar && !ativando) ? 'pointer' : 'not-allowed', fontFamily: "'DM Sans', sans-serif", opacity: ativando ? 0.7 : 1, transition: 'background .2s' }}>
                  {ativando ? 'Ativando...' : 'Aceitar e ativar ✓'}
                </button>
              </div>

              <div style={{ fontSize: 10, color: '#555', marginTop: 8, textAlign: 'center' as const, lineHeight: 1.5 }}>
                Seu aceite será registrado com data, hora e dispositivo de origem.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
