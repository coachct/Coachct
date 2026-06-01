'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'
import { dashboardDoRole } from '@/lib/auth-redirect'
import SiteHeader from '@/components/SiteHeader'
import { TEXTO_TERMO_WELLHUB_TOTALPASS, VERSAO_TERMO_WELLHUB_TOTALPASS } from '@/lib/contratos/termo-wellhub-totalpass'

const ACCENT = '#ff2d9b'
const VERDE = '#2ddd8b'
const AMARELO = '#ffaa00'

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
  const [aceiteCheck, setAceiteCheck] = useState(false)
  const [ativando, setAtivando] = useState(false)
  const [erroAtivacao, setErroAtivacao] = useState('')
  const [planoAtivadoSucesso, setPlanoAtivadoSucesso] = useState<any>(null)

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
    setAceiteCheck(false)
    setErroAtivacao('')
    setPlanoAtivadoSucesso(null)
  }

  async function ativarPlano() {
    if (!aceiteCheck) { setErroAtivacao('Você precisa aceitar os termos para continuar.'); return }
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
        nome_digitado: cliente.nome || '',
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

      // 5. Guarda info do plano ativado para mostrar tela de sucesso
      setPlanoAtivadoSucesso({
        nome: modalPlano.nome,
        creditos_mes: modalPlano.creditos_mes,
        tipo: modalPlano.tipo,
        unidade: modalPlano.unidades?.nome,
      })

      // Recarrega dados em background (não fecha o modal)
      await loadDados()
    } catch (e: any) {
      console.error(e)
      setErroAtivacao('Erro ao ativar plano. Tente novamente ou entre em contato com a recepção.')
    } finally {
      setAtivando(false)
    }
  }

  function fecharModalSucesso() {
    setModalPlano(null)
    setPlanoAtivadoSucesso(null)
  }

  function irParaCartao() {
    fecharModalSucesso()
    router.push('/cadastrar-cartao')
  }

  function irParaAgenda() {
    fecharModalSucesso()
    router.push('/agendar')
  }

  if (loading || loadingData) return (
    <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: `4px solid ${ACCENT}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  const planosWellhub = planosDisponiveis.filter(p => p.tipo === 'wellhub')
  const planosTotalPass = planosDisponiveis.filter(p => p.tipo === 'totalpass')

  const podeAtivar = aceiteCheck

  // Verifica se cliente já tem cartão (vai influenciar o CTA da tela de sucesso)
  const jaTemCartao = !!cliente?.pagarme_card_id

  return (
    <div style={{ minHeight: '100vh', background: '#080808', fontFamily: "'DM Sans', sans-serif", color: '#f0f0f0' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .plano-card:hover { border-color: ${ACCENT} !important; }
        .btn-sucesso-h:hover { opacity: 0.9; transform: translateY(-1px); }
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

      {modalPlano && !planoAtivadoSucesso && (
        <div style={{ position: 'fixed', inset: 0, background: '#000000dd', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: 20, width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '1.5rem 1.5rem 1rem', borderBottom: '1px solid #222' }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#fff', letterSpacing: 1 }}>ATIVAR PLANO</div>
              <div style={{ fontSize: 14, color: ACCENT, fontWeight: 600, marginTop: 4 }}>{modalPlano.nome}</div>
              <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>{modalPlano.unidades?.nome} · {modalPlano.creditos_mes} sessões por mês</div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem' }}>
              <div style={{ fontSize: 11, color: ACCENT, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 8 }}>📄 Termo de Adesão — Wellhub / TotalPass</div>
              <pre style={{ fontSize: 12, color: '#888', lineHeight: 1.8, whiteSpace: 'pre-wrap', fontFamily: "'DM Sans', sans-serif", maxHeight: 280, overflow: 'auto', border: '1px solid #222', borderRadius: 8, padding: '1rem', background: '#0a0a0a' }}>{TEXTO_TERMO_WELLHUB_TOTALPASS}</pre>
            </div>

            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #222' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer', marginBottom: '1rem' }}>
                <input type="checkbox" checked={aceiteCheck} onChange={e => setAceiteCheck(e.target.checked)} style={{ marginTop: 3, accentColor: ACCENT, width: 16, height: 16, flexShrink: 0 }} />
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

      {planoAtivadoSucesso && (
        <div style={{ position: 'fixed', inset: 0, background: '#000000ee', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#0a0f0a', border: `2px solid ${VERDE}55`, borderRadius: 20, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>

            <div style={{ padding: '2rem 1.5rem 1rem', textAlign: 'center' as const, borderBottom: '1px solid #1a2a1a' }}>
              <div style={{ fontSize: 56, marginBottom: '0.5rem', lineHeight: 1 }}>🎉</div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: VERDE, letterSpacing: 1, marginBottom: 6 }}>PLANO ATIVADO COM SUCESSO!</div>
              <div style={{ fontSize: 15, color: '#fff', fontWeight: 600 }}>{planoAtivadoSucesso.nome}</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{planoAtivadoSucesso.unidade}</div>
            </div>

            <div style={{ padding: '1.5rem' }}>

              <div style={{ background: '#0a1a0a', border: `1px solid ${VERDE}33`, borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '1rem', textAlign: 'center' as const }}>
                <div style={{ fontSize: 12, color: VERDE, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 4 }}>Seu direito mensal</div>
                <div style={{ fontSize: 28, color: '#fff', fontWeight: 700, fontFamily: "'Bebas Neue', sans-serif" }}>
                  {planoAtivadoSucesso.creditos_mes} treinos Coach CT
                </div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>por mês — créditos renovam dia 1º</div>
              </div>

              <div style={{ background: '#1a1000', border: `1px solid ${AMARELO}33`, borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '1rem' }}>
                <div style={{ fontSize: 12, color: AMARELO, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 8 }}>⚠️ Fique atento às regras</div>
                <ul style={{ paddingLeft: '1.2rem', fontSize: 13, color: '#ddd', lineHeight: 1.8 }}>
                  <li>Cancele com <strong style={{ color: '#fff' }}>12h de antecedência</strong> pra devolver o crédito</li>
                  <li>Falta sem aviso gera <strong style={{ color: '#fff' }}>bloqueio e multa de R$ 99</strong></li>
                  <li>Agendamentos liberados em janela de <strong style={{ color: '#fff' }}>7 dias</strong></li>
                </ul>
              </div>

              {!jaTemCartao && (
                <div style={{ background: '#1a0014', border: `1.5px solid ${ACCENT}55`, borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 20 }}>💳</span>
                    <div style={{ fontSize: 13, color: ACCENT, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' as const }}>Antes de agendar</div>
                  </div>
                  <div style={{ fontSize: 13, color: '#ddd', lineHeight: 1.7, marginBottom: 8 }}>
                    Pra concluir agendamentos, precisaremos de um <strong style={{ color: '#fff' }}>cartão de crédito salvo no sistema</strong>.
                  </div>
                  <div style={{ background: '#0a0a0a', border: `1px solid ${VERDE}33`, borderRadius: 8, padding: '0.6rem 0.85rem', fontSize: 12, color: VERDE, fontWeight: 600, textAlign: 'center' as const }}>
                    🔒 Fique tranquilo — nada será cobrado agora
                  </div>
                </div>
              )}

              {jaTemCartao && (
                <div style={{ background: '#0a1a0a', border: `1px solid ${VERDE}44`, borderRadius: 12, padding: '0.85rem 1rem', marginBottom: '1.5rem', fontSize: 13, color: VERDE, fontWeight: 600, textAlign: 'center' as const }}>
                  ✓ Você já tem cartão cadastrado — pode agendar agora!
                </div>
              )}

              {!jaTemCartao ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button onClick={irParaCartao} className="btn-sucesso-h"
                    style={{ width: '100%', background: ACCENT, color: '#fff', border: 'none', borderRadius: 12, padding: '1rem', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'all .2s' }}>
                    💳 Cadastrar cartão →
                  </button>
                  <button onClick={irParaAgenda}
                    style={{ width: '100%', background: 'transparent', border: '1px solid #333', borderRadius: 12, padding: '0.85rem', fontWeight: 500, fontSize: 14, color: '#888', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                    Ver grade de horários
                  </button>
                </div>
              ) : (
                <button onClick={irParaAgenda} className="btn-sucesso-h"
                  style={{ width: '100%', background: VERDE, color: '#000', border: 'none', borderRadius: 12, padding: '1rem', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'all .2s' }}>
                  Agendar Treino →
                </button>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  )
}
