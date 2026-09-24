'use client'
// Treinos da musculação livre (área do aluno).
// Biblioteca montada no admin (/admin/musculacao-livre/treinos). O aluno segue o treino,
// marca o que fez e grava a carga. Tudo passa pelas RPCs treino_livre_* — elas barram
// quem não teve entrada no Just CT nos últimos 7 dias (tela inteira, histórico incluso).
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'
import { dashboardDoRole } from '@/lib/auth-redirect'
import SiteHeader from '@/components/SiteHeader'

const ACCENT = '#ff2d9b'
const VERDE  = '#2ddd8b'

interface ExTreino {
  exercicio_id: string
  nome: string
  maquina: string | null
  categoria_id: string | null
  categoria: string | null
  series: number
  reps: string
  descanso: number
  observacao: string | null
  ultima_carga: number | null
}
interface TreinoLivre { id: string; nome: string; descricao: string | null; exercicios: ExTreino[] }
interface Registro { feito: boolean; carga: string }
interface Sessao {
  id: string
  treino_nome: string
  iniciado_em: string
  concluido_em: string | null
  registros: { exercicio: string; feito: boolean; carga_kg: number | null }[]
}

// Marca d'água da Just por cima da tela (não bloqueia print, mas assina o conteúdo)
const MARCA = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='140'><text x='10' y='90' transform='rotate(-25 110 70)' font-family='Arial Black, Arial, sans-serif' font-size='26' font-weight='900' fill='white'>JUST CT</text></svg>`
)}")`

function fmtData(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })
}
function fmtKg(v: number | null | undefined) {
  if (v == null) return ''
  return `${String(v).replace('.', ',')} kg`
}

export default function TreinosLivresPage() {
  const { user, perfil, loading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [estado, setEstado] = useState<'carregando' | 'bloqueado' | 'liberado'>('carregando')
  const [aba, setAba] = useState<'biblioteca' | 'historico'>('biblioteca')
  const [treinos, setTreinos] = useState<TreinoLivre[]>([])
  const [grupo, setGrupo] = useState('todos')
  const [aberto, setAberto] = useState<TreinoLivre | null>(null)
  const [sessaoId, setSessaoId] = useState<string | null>(null)
  const [registros, setRegistros] = useState<Record<string, Registro>>({})
  const [historico, setHistorico] = useState<Sessao[] | null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (loading) return
    if (!user) { router.push('/'); return }
    if (perfil?.role && perfil.role !== 'cliente') router.push(dashboardDoRole(perfil.role))
  }, [user, perfil, loading])

  useEffect(() => { if (perfil?.role === 'cliente') carregar() }, [perfil])

  function tratarErro(error: any) {
    if (String(error?.message || '').includes('SEM_ACESSO') || String(error?.message || '').includes('SEM_CADASTRO')) {
      setEstado('bloqueado')
      setAberto(null)
      return
    }
    setMsg('Não foi possível salvar. Tente de novo.')
    setTimeout(() => setMsg(''), 3000)
  }

  async function carregar() {
    const { data: acesso } = await supabase.rpc('treino_livre_acesso')
    if (!acesso?.liberado) { setEstado('bloqueado'); return }
    const { data, error } = await supabase.rpc('treino_livre_biblioteca')
    if (error) { tratarErro(error); return }
    setTreinos((data as TreinoLivre[]) || [])
    setEstado('liberado')
  }

  async function carregarHistorico() {
    const { data, error } = await supabase.rpc('treino_livre_historico')
    if (error) { tratarErro(error); return }
    setHistorico((data as Sessao[]) || [])
  }

  async function abrirTreino(t: TreinoLivre) {
    const { data, error } = await supabase.rpc('treino_livre_iniciar', { p_treino_id: t.id })
    if (error) { tratarErro(error); return }
    const regs: Record<string, Registro> = {}
    for (const r of (data?.registros || [])) {
      regs[r.exercicio_id] = { feito: !!r.feito, carga: r.carga_kg == null ? '' : String(r.carga_kg).replace('.', ',') }
    }
    setSessaoId(data.sessao_id)
    setRegistros(regs)
    setAberto(t)
    window.scrollTo({ top: 0 })
  }

  async function salvar(exId: string, reg: Registro) {
    if (!sessaoId) return
    const carga = reg.carga.trim() === '' ? null : Number(reg.carga.replace(',', '.'))
    if (carga !== null && (isNaN(carga) || carga < 0)) return
    const { error } = await supabase.rpc('treino_livre_registrar', {
      p_sessao_id: sessaoId, p_exercicio_id: exId, p_feito: reg.feito, p_carga_kg: carga,
    })
    if (error) tratarErro(error)
  }

  function toggleFeito(exId: string) {
    const atual = registros[exId] || { feito: false, carga: '' }
    const novo = { ...atual, feito: !atual.feito }
    setRegistros(prev => ({ ...prev, [exId]: novo }))
    salvar(exId, novo)
  }

  async function finalizar() {
    if (!sessaoId) return
    const { error } = await supabase.rpc('treino_livre_concluir', { p_sessao_id: sessaoId })
    if (error) { tratarErro(error); return }
    setAberto(null)
    setSessaoId(null)
    setHistorico(null)
    carregar()
    setMsg('Treino finalizado!')
    setTimeout(() => setMsg(''), 2500)
  }

  // Grupos musculares que aparecem na biblioteca (derivados dos exercícios)
  const grupos = useMemo(() => {
    const m = new Map<string, string>()
    treinos.forEach(t => t.exercicios.forEach(e => { if (e.categoria_id && e.categoria) m.set(e.categoria_id, e.categoria) }))
    return Array.from(m, ([id, nome]) => ({ id, nome }))
  }, [treinos])

  const treinosFiltrados = grupo === 'todos'
    ? treinos
    : treinos.filter(t => t.exercicios.some(e => e.categoria_id === grupo))

  const feitos = aberto ? aberto.exercicios.filter(e => registros[e.exercicio_id]?.feito).length : 0

  const chip = (ativo: boolean): React.CSSProperties => ({
    background: ativo ? ACCENT : 'transparent', color: ativo ? '#fff' : '#aaa',
    border: `1px solid ${ativo ? ACCENT : '#333'}`, borderRadius: 999, padding: '0.35rem 0.9rem',
    fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap',
  })

  return (
    <div style={{ minHeight: '100vh', background: '#080808', color: '#fff', fontFamily: "'DM Sans', sans-serif" }}>
      <SiteHeader />

      {estado === 'liberado' && (
        <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 150, pointerEvents: 'none', backgroundImage: MARCA, opacity: 0.06 }} />
      )}

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '6rem 1.25rem 4rem' }}>
        <button onClick={() => aberto ? setAberto(null) : router.push('/minha-conta')}
          style={{ background: 'none', border: 'none', color: '#777', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: '1rem', fontFamily: "'DM Sans', sans-serif" }}>
          ← {aberto ? 'Voltar aos treinos' : 'Minha conta'}
        </button>

        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 30, letterSpacing: 1, marginBottom: '1.25rem' }}>
          {aberto ? aberto.nome : 'Treinos · Musculação livre'}
        </div>

        {msg && (
          <div style={{ background: '#0d1f16', border: `1px solid ${VERDE}55`, color: VERDE, borderRadius: 10, padding: '0.7rem 1rem', fontSize: 13, marginBottom: '1rem' }}>{msg}</div>
        )}

        {estado === 'carregando' && <div style={{ color: '#555', fontSize: 14 }}>Carregando...</div>}

        {estado === 'bloqueado' && (
          <div style={{ background: '#111', border: '1px solid #222', borderRadius: 14, padding: '1.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>🔒</div>
            <div style={{ fontSize: 14, color: '#ccc', lineHeight: 1.6 }}>
              Não encontramos um check-in seu nos últimos 7 dias. Se você treinou, confirme na recepção o e-mail do seu app.
            </div>
          </div>
        )}

        {/* ── TREINO ABERTO ── */}
        {estado === 'liberado' && aberto && (
          <div>
            {aberto.descricao && <div style={{ fontSize: 13, color: '#888', marginTop: -8, marginBottom: '1rem' }}>{aberto.descricao}</div>}
            <div style={{ fontSize: 12, color: '#666', marginBottom: '0.85rem' }}>{feitos} de {aberto.exercicios.length} feitos</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {aberto.exercicios.map((e, i) => {
                const reg = registros[e.exercicio_id] || { feito: false, carga: '' }
                return (
                  <div key={e.exercicio_id} style={{ background: '#111', border: `1px solid ${reg.feito ? VERDE + '55' : '#1e1e1e'}`, borderRadius: 14, padding: '1rem' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <button onClick={() => toggleFeito(e.exercicio_id)} aria-label="Marcar como feito"
                        style={{ width: 30, height: 30, flexShrink: 0, borderRadius: '50%', cursor: 'pointer', fontSize: 14, fontWeight: 700,
                          background: reg.feito ? VERDE : 'transparent', color: reg.feito ? '#000' : '#666', border: `1.5px solid ${reg.feito ? VERDE : '#444'}` }}>
                        {reg.feito ? '✓' : i + 1}
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: reg.feito ? '#888' : '#fff' }}>{e.nome}</div>
                        <div style={{ fontSize: 12.5, color: '#aaa', marginTop: 3 }}>
                          {e.series}× {e.reps} reps · descanso {e.descanso}s
                        </div>
                        <div style={{ fontSize: 11.5, color: '#666', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          {e.categoria && <span>{e.categoria}</span>}
                          {e.maquina && <span>Máquina {e.maquina}</span>}
                        </div>
                        {e.observacao && <div style={{ fontSize: 12, color: '#888', fontStyle: 'italic', marginTop: 6 }}>📌 {e.observacao}</div>}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                          <input inputMode="decimal" placeholder="Carga" value={reg.carga}
                            onChange={ev => setRegistros(prev => ({ ...prev, [e.exercicio_id]: { ...reg, carga: ev.target.value } }))}
                            onBlur={() => salvar(e.exercicio_id, reg)}
                            style={{ width: 90, background: '#0a0a0a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '0.5rem 0.7rem', color: '#fff', fontSize: 16, fontFamily: "'DM Sans', sans-serif" }} />
                          <span style={{ fontSize: 12, color: '#666' }}>kg</span>
                          {e.ultima_carga != null && (
                            <span style={{ fontSize: 12, color: '#777', marginLeft: 6 }}>Última: {fmtKg(e.ultima_carga)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <button onClick={finalizar}
              style={{ width: '100%', marginTop: '1.25rem', background: ACCENT, color: '#fff', border: 'none', borderRadius: 12, padding: '0.9rem', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
              Finalizar treino
            </button>
          </div>
        )}

        {/* ── LISTA ── */}
        {estado === 'liberado' && !aberto && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: '1.25rem' }}>
              <button style={chip(aba === 'biblioteca')} onClick={() => setAba('biblioteca')}>Biblioteca</button>
              <button style={chip(aba === 'historico')} onClick={() => { setAba('historico'); if (!historico) carregarHistorico() }}>Meu histórico</button>
            </div>

            {aba === 'biblioteca' && (
              <>
                {grupos.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: '1rem' }}>
                    <button style={chip(grupo === 'todos')} onClick={() => setGrupo('todos')}>Todos</button>
                    {grupos.map(g => <button key={g.id} style={chip(grupo === g.id)} onClick={() => setGrupo(g.id)}>{g.nome}</button>)}
                  </div>
                )}
                {treinosFiltrados.length === 0 ? (
                  <div style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: 14, padding: '2rem', textAlign: 'center', fontSize: 14, color: '#555' }}>
                    Nenhum treino disponível.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {treinosFiltrados.map(t => {
                      const nomesGrupos = Array.from(new Set(t.exercicios.map(e => e.categoria).filter(Boolean)))
                      return (
                        <button key={t.id} onClick={() => abrirTreino(t)}
                          style={{ textAlign: 'left', background: '#111', border: '1px solid #1e1e1e', borderRadius: 14, padding: '1rem 1.1rem', cursor: 'pointer', color: '#fff', fontFamily: "'DM Sans', sans-serif" }}>
                          <div style={{ fontSize: 15, fontWeight: 600 }}>{t.nome}</div>
                          {t.descricao && <div style={{ fontSize: 12.5, color: '#888', marginTop: 3 }}>{t.descricao}</div>}
                          <div style={{ fontSize: 11.5, color: '#666', marginTop: 6 }}>
                            {t.exercicios.length} exercício{t.exercicios.length !== 1 ? 's' : ''}{nomesGrupos.length > 0 && ` · ${nomesGrupos.join(', ')}`}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </>
            )}

            {aba === 'historico' && (
              historico === null ? <div style={{ color: '#555', fontSize: 14 }}>Carregando...</div>
              : historico.length === 0 ? (
                <div style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: 14, padding: '2rem', textAlign: 'center', fontSize: 14, color: '#555' }}>
                  Nenhum treino registrado ainda.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {historico.map(s => (
                    <div key={s.id} style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: 14, padding: '1rem 1.1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>{s.treino_nome}</div>
                        <div style={{ fontSize: 12, color: '#777', flexShrink: 0 }}>{fmtData(s.iniciado_em)}</div>
                      </div>
                      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {s.registros.map((r, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
                            <span style={{ color: r.feito ? '#ccc' : '#666' }}>{r.feito ? '✓ ' : '· '}{r.exercicio}</span>
                            <span style={{ color: '#aaa', flexShrink: 0 }}>{fmtKg(r.carga_kg)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  )
}
