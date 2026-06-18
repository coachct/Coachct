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

const TIPOS_CLUB = ['lift', 'lift_for_girls', 'running_funcional']

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

  // NOVO: abas FDS / Feriados / Capacidade
  const [aba, setAba] = useState<'fds' | 'feriados' | 'capacidade'>('fds')
  const [feriados,              setFeriados]              = useState<any[]>([])
  const [ocorrenciasFeriadoMap, setOcorrenciasFeriadoMap] = useState<Record<string, any[]>>({}) // feriado_id -> ocorrências
  const [loadingFeriados,       setLoadingFeriados]       = useState(false)

  // NOVO: capacidade (coach_tipos) — matriz coach × tipo. coach_id = coaches.id.
  const [coachesClub, setCoachesClub] = useState<any[]>([])       // todos coaches Club ativos
  const [capMatrix,   setCapMatrix]   = useState<Record<string, Set<string>>>({}) // coachId -> Set<tipo>
  const [loadingCap,  setLoadingCap]  = useState(false)
  const [salvandoCap, setSalvandoCap] = useState<string | null>(null) // `${coachId}-${tipo}`

  useEffect(() => {
    if (!loading && perfil && perfil.role !== 'admin' && perfil.role !== 'coordenadora') router.push('/')
  }, [perfil, loading])

  // Carrega unidades uma vez quando o usuário entra (não refaz em re-renders do perfil)
  useEffect(() => { if (perfil?.id) carregarUnidades() }, [perfil?.id])
  // Quando muda a unidade, recarrega coaches dela e ocorrências
  useEffect(() => {
    if (unidadeSel?.id) {
      carregarCoachesDaUnidade(unidadeSel.id)
      carregarOcorrencias()
      carregarFeriados()
    }
  }, [unidadeSel?.id])
  // Capacidade não depende de unidade (vale pra todo o Club). Recarrega ao abrir a aba.
  useEffect(() => {
    if (aba === 'capacidade' && unidades.length > 0) carregarCapacidade()
  }, [aba, unidades.length])

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

  async function carregarUnidades() {
    const { data: uns } = await supabase.from('unidades')
      .select('id, nome, tipo').eq('tipo', 'club').eq('ativo', true).order('nome')
    setUnidades(uns || [])
    // Só seta unidade inicial se ainda não houver uma selecionada
    // (evita resetar a seleção do usuário em re-renders)
    if (uns && uns.length > 0) {
      setUnidadeSel(prev => prev ?? uns[0])
    }
    setLoadingUnidades(false)
  }

  async function carregarCoachesDaUnidade(unidadeId: string) {
    // Puxa só os coaches habilitados pra esta unidade (via coach_unidades)
    const { data: cu } = await supabase.from('coach_unidades')
      .select('coach_id').eq('unidade_id', unidadeId).eq('ativo', true)
    const ids = (cu || []).map((u: any) => u.coach_id)
    if (ids.length === 0) { setCoaches([]); return }
    const { data: cs } = await supabase.from('coaches')
      .select('id, nome').eq('ativo', true).in('id', ids).order('nome')
    setCoaches(cs || [])
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

  // NOVO: carrega os feriados da unidade + as ocorrências das aulas de cada feriado.
  // As aulas de feriado são club_aulas com feriado_id, criadas em "Cadastrar Aulas".
  // Cada uma já tem 1 ocorrência em club_ocorrencias na data do feriado.
  async function carregarFeriados() {
    if (!unidadeSel) return
    setLoadingFeriados(true)
    const hojeStr = dataLocalStr(new Date())

    const { data: fer } = await supabase.from('feriados')
      .select('id, data, descricao, ativo')
      .eq('unidade_id', unidadeSel.id)
      .gte('data', hojeStr)
      .order('data')
    const feriadosList = fer || []
    setFeriados(feriadosList)

    if (feriadosList.length === 0) { setOcorrenciasFeriadoMap({}); setLoadingFeriados(false); return }

    const ferIds = feriadosList.map((f: any) => f.id)
    const { data: aulasFer } = await supabase.from('club_aulas')
      .select('id, feriado_id')
      .in('feriado_id', ferIds)
    const aulaIds = (aulasFer || []).map((a: any) => a.id)
    if (aulaIds.length === 0) {
      const vazio: Record<string, any[]> = {}
      for (const f of feriadosList) vazio[f.id] = []
      setOcorrenciasFeriadoMap(vazio); setLoadingFeriados(false); return
    }
    const aulaToFeriado: Record<string, string> = {}
    for (const a of (aulasFer || [])) aulaToFeriado[a.id] = a.feriado_id

    const { data: ocs } = await supabase.from('club_ocorrencias')
      .select('id, data, coach_id, aula_id, club_aulas(id, tipo, horario, capacidade, coach_id, coaches(id, nome), grupos_musculares(nome))')
      .in('aula_id', aulaIds)
      .eq('status', 'ativa')
      .order('data')

    const mapa: Record<string, any[]> = {}
    for (const f of feriadosList) mapa[f.id] = []
    for (const oc of (ocs || [])) {
      const fid = aulaToFeriado[oc.aula_id]
      if (fid && mapa[fid]) mapa[fid].push(oc)
    }
    for (const fid of Object.keys(mapa)) {
      mapa[fid].sort((a: any, b: any) =>
        (a.club_aulas?.horario || '').localeCompare(b.club_aulas?.horario || ''))
    }
    setOcorrenciasFeriadoMap(mapa)
    setLoadingFeriados(false)
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
      if (aba === 'feriados') await carregarFeriados()
      else await carregarOcorrencias()
    }
    setSalvando(false)
  }

  // ─── Capacidade (coach_tipos) ───
  // Coach Club = ativo e com ≥1 unidade Club em coach_unidades. Independe da unidade selecionada.
  async function carregarCapacidade() {
    setLoadingCap(true)
    const clubIds = unidades.map((u: any) => u.id) // 'unidades' já vem filtrado pra tipo='club'
    if (clubIds.length === 0) { setCoachesClub([]); setCapMatrix({}); setLoadingCap(false); return }

    const { data: cu } = await supabase.from('coach_unidades')
      .select('coach_id').in('unidade_id', clubIds).eq('ativo', true)
    const ids = Array.from(new Set((cu || []).map((u: any) => u.coach_id)))
    if (ids.length === 0) { setCoachesClub([]); setCapMatrix({}); setLoadingCap(false); return }

    const [{ data: cs }, { data: ts }] = await Promise.all([
      supabase.from('coaches').select('id, nome').eq('ativo', true).in('id', ids).order('nome'),
      supabase.from('coach_tipos').select('coach_id, tipo').in('coach_id', ids).eq('ativo', true),
    ])
    setCoachesClub(cs || [])

    const mapa: Record<string, Set<string>> = {}
    for (const c of (cs || [])) mapa[c.id] = new Set<string>()
    for (const t of (ts || [])) { if (mapa[t.coach_id]) mapa[t.coach_id].add(t.tipo) }
    setCapMatrix(mapa)
    setLoadingCap(false)
  }

  async function toggleCap(coachId: string, tipo: string) {
    const key = `${coachId}-${tipo}`
    setSalvandoCap(key)
    const set = new Set(capMatrix[coachId] || [])
    const removendo = set.has(tipo)
    if (removendo) {
      const { error } = await supabase.from('coach_tipos').delete().eq('coach_id', coachId).eq('tipo', tipo)
      if (error) { setSalvandoCap(null); return }
      set.delete(tipo)
    } else {
      const { error } = await supabase.from('coach_tipos')
        .upsert({ coach_id: coachId, tipo, ativo: true }, { onConflict: 'coach_id,tipo' })
      if (error) { setSalvandoCap(null); return }
      set.add(tipo)
    }
    setCapMatrix(prev => ({ ...prev, [coachId]: new Set(set) }))
    setSalvandoCap(null)
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
          Coaches escalados pontualmente — fins de semana e feriados, sobrescreve a grade fixa
        </div>
      </div>

      {/* Banner explicativo */}
      {aba === 'capacidade' ? (
        <div style={{ background:`${VERDE}10`, border:`1px solid ${VERDE}40`, borderRadius:12, padding:'0.75rem 1rem', marginBottom:'1.5rem', fontSize:13, color:'#0f766e' }}>
          💡 Marque <strong>quais tipos cada coach sabe dar</strong>. Isso define quem aparece como elegível na montagem da escala — vale em qualquer unidade Club.
        </div>
      ) : aba === 'fds' ? (
        <div style={{ background:`${CYAN}10`, border:`1px solid ${CYAN}40`, borderRadius:12, padding:'0.75rem 1rem', marginBottom:'1.5rem', fontSize:13, color:'#0e7490' }}>
          💡 A escala aqui <strong>sobrescreve</strong> o coach da grade fixa só para o dia específico. Para limpar, clique no coach atual e escolha "Voltar à grade".
        </div>
      ) : (
        <div style={{ background:`${ACCENT}10`, border:`1px solid ${ACCENT}40`, borderRadius:12, padding:'0.75rem 1rem', marginBottom:'1.5rem', fontSize:13, color:'#b91c6b' }}>
          💡 Os feriados e suas aulas são criados em <strong>Cadastrar Aulas</strong>. Aqui você só escala o coach de cada aula — clique na aula pra escolher.
        </div>
      )}

      {/* Seletor de unidade */}
      {aba !== 'capacidade' && unidades.length > 1 && (
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

      {/* Abas: FDS / Feriados */}
      <div style={{ display:'flex', gap:8, borderBottom:'1px solid #e5e7eb', marginBottom:'1.5rem' }}>
        {[
          { key:'fds',        label:'Final de Semana' },
          { key:'feriados',   label:'Feriados' },
          { key:'capacidade', label:'Capacidade' },
        ].map(t => (
          <button key={t.key} onClick={() => setAba(t.key as any)}
            style={{ padding:'0.6rem 1rem', fontSize:14, fontWeight:600,
              borderBottom:`2px solid ${aba===t.key ? ACCENT : 'transparent'}`,
              color: aba===t.key ? ACCENT : '#888', background:'transparent',
              cursor:'pointer', marginBottom:-1, fontFamily:"'DM Sans', sans-serif" }}>
            {t.label}
          </button>
        ))}
      </div>

      {aba === 'capacidade' ? (
        loadingCap ? (
          <div style={{ textAlign:'center', padding:'3rem', color:'#aaa', fontSize:14 }}>Carregando capacidade...</div>
        ) : coachesClub.length === 0 ? (
          <div style={{ background:'#f9fafb', border:'1px dashed #e5e7eb', borderRadius:16, padding:'3rem', textAlign:'center', color:'#aaa', fontSize:14 }}>
            Nenhum coach Club ativo.<br/>
            <span style={{ fontSize:12 }}>Habilite uma unidade Club no coach em <strong>Coaches → Unidades</strong>.</span>
          </div>
        ) : (
          <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:16, padding:'1.25rem', overflowX:'auto' }}>
            <table style={{ borderCollapse:'collapse', width:'100%', fontFamily:"'DM Sans', sans-serif" }}>
              <thead>
                <tr>
                  <th style={{ textAlign:'left', padding:'0.5rem 0.75rem', fontSize:11, color:'#aaa', textTransform:'uppercase', letterSpacing:0.5, borderBottom:'1px solid #f0f0f0' }}>Coach</th>
                  {TIPOS_CLUB.map(t => (
                    <th key={t} style={{ padding:'0.5rem', fontSize:11, fontWeight:700, color:tipoColor(t), textTransform:'uppercase', letterSpacing:0.5, borderBottom:'1px solid #f0f0f0', minWidth:120 }}>
                      {tipoLabel(t)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {coachesClub.map((c: any) => (
                  <tr key={c.id} style={{ borderBottom:'1px solid #f7f7f7' }}>
                    <td style={{ padding:'0.6rem 0.75rem', fontSize:13, fontWeight:600, color:'#111', whiteSpace:'nowrap' }}>{c.nome}</td>
                    {TIPOS_CLUB.map(t => {
                      const ativo      = capMatrix[c.id]?.has(t) || false
                      const carregando = salvandoCap === `${c.id}-${t}`
                      const cor        = tipoColor(t)
                      return (
                        <td key={t} style={{ padding:'0.4rem', textAlign:'center' }}>
                          <button onClick={() => toggleCap(c.id, t)} disabled={carregando}
                            style={{ width:30, height:30, borderRadius:8, cursor: carregando ? 'default' : 'pointer',
                              border:`1.5px solid ${ativo ? cor : '#e5e7eb'}`, background: ativo ? `${cor}18` : '#fff',
                              color: ativo ? cor : '#ddd', fontSize:15, fontWeight:700,
                              display:'inline-flex', alignItems:'center', justifyContent:'center',
                              opacity: carregando ? 0.5 : 1, fontFamily:"'DM Sans', sans-serif" }}>
                            {carregando ? '·' : ativo ? '✓' : ''}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : !unidadeSel ? (
        <div style={{ background:'#f9fafb', border:'1px dashed #e5e7eb', borderRadius:16, padding:'3rem', textAlign:'center', color:'#aaa' }}>
          Nenhuma unidade Club encontrada.
        </div>
      ) : aba === 'fds' ? (
        loadingDados ? (
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
        )
      ) : (
        /* ===== ABA FERIADOS ===== */
        loadingFeriados ? (
          <div style={{ textAlign:'center', padding:'3rem', color:'#aaa', fontSize:14 }}>Carregando feriados...</div>
        ) : feriados.length === 0 ? (
          <div style={{ background:'#f9fafb', border:'1px dashed #e5e7eb', borderRadius:16, padding:'3rem', textAlign:'center', color:'#aaa', fontSize:14 }}>
            Nenhum feriado cadastrado para esta unidade.<br/>
            <span style={{ fontSize:12 }}>Crie em <strong>Cadastrar Aulas → Feriados</strong>.</span>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
            {feriados.map((f: any) => {
              const ocs = ocorrenciasFeriadoMap[f.id] || []
              const dataObj = new Date(f.data + 'T12:00:00')
              const diaNum = dataObj.getDate()
              const mesNome = dataObj.toLocaleDateString('pt-BR', { month: 'short' })
              const diaSem = dataObj.toLocaleDateString('pt-BR', { weekday: 'long' })
              return (
                <div key={f.id} style={{ background:'#fff', border:'1px solid #fed7aa', borderRadius:16, padding:'1.25rem' }}>
                  {/* Header do feriado */}
                  <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:'1rem', paddingBottom:'0.75rem', borderBottom:'1px solid #f3f4f6' }}>
                    <div style={{ textAlign:'center', flexShrink:0, width:46 }}>
                      <div style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:32, color:'#f97316', lineHeight:1 }}>{diaNum}</div>
                      <div style={{ fontSize:10, color:'#aaa', textTransform:'uppercase', letterSpacing:0.5 }}>{mesNome}</div>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:600, color:'#111' }}>{f.descricao}</div>
                      <div style={{ fontSize:12, color:'#aaa', textTransform:'capitalize', marginTop:1 }}>{diaSem}</div>
                      <div style={{ fontSize:11, fontWeight:600, marginTop:4, color: f.ativo ? '#ea580c' : '#9ca3af' }}>
                        {f.ativo ? '● Feriado ativo · grade regular cancelada' : '○ Feriado inativo'}
                      </div>
                    </div>
                  </div>

                  {/* Aulas do feriado */}
                  {ocs.length === 0 ? (
                    <div style={{ fontSize:12, color:'#aaa', fontStyle:'italic', padding:'0.5rem 0' }}>
                      Nenhuma aula cadastrada para este feriado. Adicione em Cadastrar Aulas.
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
        )
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
