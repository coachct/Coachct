'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

const ACCENT   = '#ff2d9b'
const CYAN     = '#00e5ff'
const VERDE    = '#2ddd8b'
const AMARELO  = '#ffaa00'
const VERMELHO = '#ff4444'

const DIAS_SEMANA_LABEL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

function dataLocalStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function tipoLabel(t: string) {
  if (t === 'lift')              return 'Lift'
  if (t === 'lift_for_girls')    return 'Lift for Girls'
  if (t === 'running_funcional') return 'Running + Funcional'
  return t
}
function tipoColor(t: string) {
  if (t === 'lift')              return CYAN
  if (t === 'lift_for_girls')    return ACCENT
  return VERDE
}

export default function AdminEscalaClubPage() {
  const { perfil, loading } = useAuth()
  const router   = useRouter()
  const supabase = createClient()

  const [unidades,       setUnidades]       = useState<any[]>([])
  const [unidadeSel,     setUnidadeSel]     = useState<any>(null)
  const [coaches,        setCoaches]        = useState<any[]>([])
  const [ocorrenciasMap, setOcorrenciasMap] = useState<Record<string, any[]>>({}) // data -> ocorrências
  const [loadingDados,   setLoadingDados]   = useState(false)
  const [loadingUnidades,setLoadingUnidades]= useState(true)

  const [modalAula, setModalAula] = useState<any>(null)
  const [salvando,  setSalvando]  = useState(false)

  useEffect(() => {
    if (!loading && perfil && perfil.role !== 'admin' && perfil.role !== 'coordenadora') router.push('/')
  }, [perfil, loading])

  useEffect(() => { if (perfil) carregarUnidadesECoaches() }, [perfil])
  useEffect(() => { if (unidadeSel) carregarOcorrencias() }, [unidadeSel?.id])

  // Próximos 6 fins de semana (12 datas)
  const proximosFDS = (() => {
    const datas: { data: string; nome: string }[] = []
    const hoje = new Date()
    hoje.setHours(12, 0, 0, 0)
    let count = 0
    const cursor = new Date(hoje)
    while (count < 12) {
      const diaSem = cursor.getDay()
      if (diaSem === 0 || diaSem === 6) {
        datas.push({ data: dataLocalStr(cursor), nome: DIAS_SEMANA_LABEL[diaSem] })
        count++
      }
      cursor.setDate(cursor.getDate() + 1)
    }
    return datas
  })()

  async function carregarUnidadesECoaches() {
    const [{ data: uns }, { data: cs }] = await Promise.all([
      supabase.from('unidades').select('id, nome, tipo').eq('tipo', 'club').eq('ativo', true).order('nome'),
      supabase.from('coaches').select('id, nome').eq('ativo', true).order('nome'),
    ])
    setUnidades(uns || [])
    setCoaches(cs || [])
    if (uns && uns.length > 0) setUnidadeSel(uns[0])
    setLoadingUnidades(false)
  }

  async function carregarOcorrencias() {
    if (!unidadeSel) return
    setLoadingDados(true)
    const datas = proximosFDS.map(p => p.data)
    if (datas.length === 0) { setOcorrenciasMap({}); setLoadingDados(false); return }

    // Busca aulas (grade fixa) da unidade
    const { data: aulasIds } = await supabase.from('club_aulas').select('id')
      .eq('unidade_id', unidadeSel.id).eq('ativo', true)
    const ids = (aulasIds || []).map((a: any) => a.id)
    if (!ids.length) { setOcorrenciasMap({}); setLoadingDados(false); return }

    // Busca ocorrências do FDS pra essas aulas
    const { data: ocs } = await supabase.from('club_ocorrencias')
      .select('id, data, coach_id, club_aulas(id, tipo, horario, capacidade, coach_id, coaches(id, nome), grupos_musculares(nome))')
      .in('aula_id', ids)
      .in('data', datas)
      .eq('status', 'ativa')
      .order('data')

    // Agrupa por data
    const mapa: Record<string, any[]> = {}
    for (const d of datas) mapa[d] = []
    for (const oc of (ocs || [])) {
      if (!mapa[oc.data]) mapa[oc.data] = []
      mapa[oc.data].push(oc)
    }
    // Ordena cada lista por horário
    for (const d of Object.keys(mapa)) {
      mapa[d].sort((a: any, b: any) =>
        (a.club_aulas?.horario || '').localeCompare(b.club_aulas?.horario || ''))
    }
    setOcorrenciasMap(mapa)
    setLoadingDados(false)
  }

  function coachEfetivo(oc: any): { id: string | null; nome: string; origem: 'escalado' | 'grade' | 'indefinido' } {
    if (oc.coach_id) {
      const c = coaches.find((x: any) => x.id === oc.coach_id)
      return { id: oc.coach_id, nome: c?.nome || 'Coach', origem: 'escalado' }
    }
    const gradeCoach = oc.club_aulas?.coaches
    if (gradeCoach?.id) {
      return { id: gradeCoach.id, nome: gradeCoach.nome || 'Coach', origem: 'grade' }
    }
    return { id: null, nome: 'Coach a definir', origem: 'indefinido' }
  }

  async function salvarCoach(coachId: string | null) {
    if (!modalAula) return
    setSalvando(true)
    const { error } = await supabase.from('club_ocorrencias')
      .update({ coach_id: coachId })
      .eq('id', modalAula.id)
    if (!error) {
      setModalAula(null)
      await carregarOcorrencias()
    }
    setSalvando(false)
  }

  if (loading || loadingUnidades) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh' }}>
      <div style={{ width:32, height:32, border:`4px solid ${ACCENT}`, borderTopColor:'transparent',
        borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ padding:'2rem', fontFamily:"'DM Sans', sans-serif", maxWidth:1100 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');`}</style>

      {/* Header */}
      <div style={{ marginBottom:'1.5rem' }}>
        <div style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:28, color:'#111', letterSpacing:1 }}>
          Escala Club
        </div>
        <div style={{ fontSize:13, color:'#888', marginTop:2 }}>
          Coaches escalados pontualmente para os fins de semana — sobrescreve a grade fixa
        </div>
      </div>

      {/* Banner explicativo */}
      <div style={{ background:`${CYAN}10`, border:`1px solid ${CYAN}40`, borderRadius:12, padding:'0.75rem 1rem', marginBottom:'1.5rem', fontSize:13, color:'#0e7490' }}>
        💡 A escala aqui <strong>sobrescreve</strong> o coach da grade fixa só para o dia específico. Para limpar, clique no coach atual e escolha "Voltar à grade".
      </div>

      {/* Seletor de unidade */}
      {unidades.length > 1 && (
        <div style={{ display:'flex', gap:8, marginBottom:'1.5rem', flexWrap:'wrap' }}>
          {unidades.map((u: any) => (
            <button key={u.id} onClick={() => setUnidadeSel(u)}
              style={{ padding:'0.5rem 1.25rem', borderRadius:10,
                border:`1.5px solid ${unidadeSel?.id===u.id?CYAN:'#e5e7eb'}`,
                background: unidadeSel?.id===u.id?`${CYAN}15`:'#fff',
                color: unidadeSel?.id===u.id?CYAN:'#555',
                fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>
              {u.nome}
            </button>
          ))}
        </div>
      )}

      {!unidadeSel ? (
        <div style={{ background:'#f9fafb', border:'1px dashed #e5e7eb', borderRadius:16, padding:'3rem', textAlign:'center', color:'#aaa' }}>
          Nenhuma unidade Club encontrada.
        </div>
      ) : loadingDados ? (
        <div style={{ textAlign:'center', padding:'3rem', color:'#aaa', fontSize:14 }}>Carregando aulas...</div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
          {proximosFDS.map(({ data, nome }) => {
            const ocs = ocorrenciasMap[data] || []
            const dataObj = new Date(data + 'T12:00:00')
            const diaNum = dataObj.getDate()
            const mesNome = dataObj.toLocaleDateString('pt-BR', { month: 'short' })

            return (
              <div key={data} style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:16, padding:'1.25rem' }}>
                {/* Header do card de data */}
                <div style={{ display:'flex', alignItems:'baseline', gap:10, marginBottom:'1rem', paddingBottom:'0.75rem', borderBottom:'1px solid #f3f4f6' }}>
                  <div style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:32, color:'#111', lineHeight:1 }}>{diaNum}</div>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, color:'#111' }}>{nome}</div>
                    <div style={{ fontSize:11, color:'#aaa', textTransform:'uppercase', letterSpacing:0.5 }}>{mesNome}</div>
                  </div>
                </div>

                {/* Lista de aulas do dia */}
                {ocs.length === 0 ? (
                  <div style={{ fontSize:12, color:'#aaa', fontStyle:'italic', padding:'0.5rem 0' }}>
                    Nenhuma aula cadastrada
                  </div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {ocs.map((oc: any) => {
                      const aula = oc.club_aulas
                      const ef = coachEfetivo(oc)
                      const cor = tipoColor(aula?.tipo)
                      const corOrigem = ef.origem === 'escalado' ? ACCENT : ef.origem === 'grade' ? '#888' : VERMELHO

                      return (
                        <div key={oc.id} onClick={() => setModalAula(oc)}
                          style={{ display:'flex', alignItems:'center', gap:10, padding:'0.6rem 0.75rem',
                            background:'#fafafa', border:'1px solid #f0f0f0', borderRadius:10, cursor:'pointer',
                            transition:'all .15s' }}
                          onMouseEnter={e => (e.currentTarget.style.borderColor = ACCENT)}
                          onMouseLeave={e => (e.currentTarget.style.borderColor = '#f0f0f0')}>

                          <div style={{ fontFamily:"'DM Mono', monospace", fontSize:14, fontWeight:700, color:'#111', minWidth:46 }}>
                            {(aula?.horario||'').slice(0,5)}
                          </div>

                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                              <span style={{ fontSize:10, fontWeight:700, color:cor, background:`${cor}18`,
                                padding:'1px 7px', borderRadius:14 }}>{tipoLabel(aula?.tipo)}</span>
                              <span style={{ fontSize:11, color:'#aaa', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                {aula?.grupos_musculares?.nome || ''}
                              </span>
                            </div>
                            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                              <span style={{ fontSize:12, fontWeight:600, color: ef.origem==='indefinido' ? VERMELHO : '#111' }}>
                                {ef.nome}
                              </span>
                              <span style={{ fontSize:9, fontWeight:700, color:corOrigem, background:`${corOrigem}15`,
                                padding:'1px 6px', borderRadius:8, textTransform:'uppercase', letterSpacing:0.5 }}>
                                {ef.origem === 'escalado' ? 'escalado' : ef.origem === 'grade' ? 'padrão' : 'definir'}
                              </span>
                            </div>
                          </div>

                          <div style={{ fontSize:14, color:'#ccc' }}>›</div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal de escalar coach */}
      {modalAula && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}>
          <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:440, padding:'1.5rem', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ marginBottom:'1rem' }}>
              <div style={{ fontSize:11, color:'#aaa', textTransform:'uppercase', letterSpacing:1 }}>
                {new Date(modalAula.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long' })}
              </div>
              <div style={{ fontSize:18, fontWeight:600, color:'#111', marginTop:2 }}>
                {tipoLabel(modalAula.club_aulas?.tipo)} — {(modalAula.club_aulas?.horario||'').slice(0,5)}
              </div>
              <div style={{ fontSize:12, color:'#888', marginTop:4 }}>
                {modalAula.club_aulas?.grupos_musculares?.nome || ''}
              </div>
            </div>

            <div style={{ fontSize:12, color:'#888', marginBottom:8, textTransform:'uppercase', letterSpacing:1 }}>
              Escolher coach
            </div>

            {/* Opção: voltar à grade */}
            <button
              onClick={() => salvarCoach(null)}
              disabled={salvando}
              style={{ display:'flex', alignItems:'center', gap:10, width:'100%', textAlign:'left' as const,
                padding:'0.75rem 1rem', borderRadius:10, border:'1.5px dashed #ccc', background:'#fff',
                cursor:'pointer', marginBottom:8, fontFamily:"'DM Sans', sans-serif", opacity: salvando ? 0.5 : 1 }}>
              <div style={{ width:28, height:28, borderRadius:'50%', background:'#f3f4f6',
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, color:'#888' }}>
                ↺
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600, color:'#555' }}>Voltar à grade</div>
                <div style={{ fontSize:11, color:'#aaa' }}>Usa o coach padrão da aula recorrente</div>
              </div>
            </button>

            {/* Lista de coaches */}
            <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:'1rem' }}>
              {coaches.map((c: any) => {
                const selecionado = modalAula.coach_id === c.id
                return (
                  <button key={c.id}
                    onClick={() => salvarCoach(c.id)}
                    disabled={salvando}
                    style={{ display:'flex', alignItems:'center', gap:10, width:'100%', textAlign:'left' as const,
                      padding:'0.75rem 1rem', borderRadius:10,
                      border:`1.5px solid ${selecionado ? ACCENT : '#e5e7eb'}`,
                      background: selecionado ? `${ACCENT}10` : '#fff',
                      cursor:'pointer', fontFamily:"'DM Sans', sans-serif", opacity: salvando ? 0.5 : 1 }}>
                    <div style={{ width:28, height:28, borderRadius:'50%', background:`${ACCENT}20`,
                      display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:ACCENT }}>
                      {c.nome?.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:'#111' }}>{c.nome}</div>
                    </div>
                    {selecionado && (
                      <span style={{ fontSize:11, fontWeight:700, color:ACCENT }}>✓ escalado</span>
                    )}
                  </button>
                )
              })}
            </div>

            <button onClick={() => setModalAula(null)} disabled={salvando}
              style={{ width:'100%', background:'#f3f4f6', border:'none', borderRadius:10,
                padding:'0.75rem', fontSize:13, color:'#555', cursor:'pointer',
                fontFamily:"'DM Sans', sans-serif" }}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
