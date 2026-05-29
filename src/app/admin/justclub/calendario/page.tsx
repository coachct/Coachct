'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

const ACCENT  = '#ff2d9b'
const CYAN    = '#00e5ff'
const VERDE   = '#2ddd8b'
const AMARELO = '#ffaa00'
const VERMELHO = '#ff4444'

function dataLocalStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function tipoLabel(t: string) {
  if (t==='lift')              return 'Lift'
  if (t==='lift_for_girls')   return 'Lift for Girls'
  if (t==='running_funcional') return 'Running + Funcional'
  return t
}
function tipoColor(t: string) {
  if (t==='lift')             return CYAN
  if (t==='lift_for_girls')  return ACCENT
  return VERDE
}

// Retorna o primeiro nome do coach a exibir pra essa ocorrência.
// Prioridade: coach escalado na ocorrência > coach da grade fixa > null (= "Coach a definir")
function primeiroNomeCoachOc(oc: any): string | null {
  const escalado = oc?.coach_escalado?.nome
  if (escalado) return String(escalado).split(' ')[0]
  const grade = oc?.club_aulas?.coaches?.nome
  if (grade) return String(grade).split(' ')[0]
  return null
}

export default function AdminCalendarioClubPage() {
  const { perfil, loading } = useAuth()
  const router   = useRouter()
  const supabase = createClient()

  const [unidades,        setUnidades]        = useState<any[]>([])
  const [unidadeSel,      setUnidadeSel]      = useState<any>(null)
  const [ocorrencias,     setOcorrencias]     = useState<any[]>([])
  const [contagens,       setContagens]       = useState<Record<string, any>>({})
  const [loadingOcs,      setLoadingOcs]      = useState(false)
  const [loadingUnidades, setLoadingUnidades] = useState(true)
  const [dataSel,         setDataSel]         = useState(dataLocalStr(new Date()))

  useEffect(() => {
    if (!loading && perfil && perfil.role !== 'admin' && perfil.role !== 'coordenadora') router.push('/')
  }, [perfil, loading])

  useEffect(() => { if (perfil) carregarUnidades() }, [perfil])
  useEffect(() => { if (unidadeSel) carregarOcorrencias() }, [unidadeSel, dataSel])

  async function carregarUnidades() {
    const { data } = await supabase.from('unidades').select('id, nome, tipo')
      .eq('tipo', 'club').eq('ativo', true).order('nome')
    setUnidades(data || [])
    if (data && data.length > 0) setUnidadeSel(data[0])
    setLoadingUnidades(false)
  }

  async function carregarOcorrencias() {
    if (!unidadeSel) return
    setLoadingOcs(true)
    const { data: aulasIds } = await supabase.from('club_aulas').select('id')
      .eq('unidade_id', unidadeSel.id).eq('ativo', true)
    const ids = (aulasIds || []).map((a: any) => a.id)
    if (!ids.length) { setOcorrencias([]); setLoadingOcs(false); return }

    // Inclui coach_id da ocorrência + join "coach_escalado" pra mostrar quem foi escalado pontualmente
    const { data: ocs } = await supabase.from('club_ocorrencias')
      .select('*, coach_escalado:coaches!coach_id(id, nome), club_aulas(tipo, horario, capacidade, duracao_min, coaches(nome), grupos_musculares(nome))')
      .in('aula_id', ids).eq('data', dataSel).eq('status', 'ativa')

    const lista = (ocs || []).sort((a: any, b: any) =>
      (a.club_aulas?.horario||'').localeCompare(b.club_aulas?.horario||''))
    setOcorrencias(lista)

    if (lista.length > 0) {
      const { data: reservas } = await supabase.from('club_reservas')
        .select('ocorrencia_id, status').in('ocorrencia_id', lista.map((o: any) => o.id))
      const cont: Record<string, any> = {}
      for (const oc of lista) {
        const rs = (reservas || []).filter((r: any) => r.ocorrencia_id === oc.id)
        cont[oc.id] = {
          total:    oc.club_aulas?.capacidade || 0,
          reservado: rs.filter((r: any) => r.status === 'reservado').length,
          presente:  rs.filter((r: any) => r.status === 'presente').length,
          falta:     rs.filter((r: any) => r.status === 'falta').length,
        }
      }
      setContagens(cont)
    }
    setLoadingOcs(false)
  }

  const hoje   = dataLocalStr(new Date())
  const amanha = dataLocalStr(new Date(Date.now() + 86400000))
  const ontem  = dataLocalStr(new Date(Date.now() - 86400000))

  function labelData(d: string) {
    if (d === hoje)   return 'Hoje'
    if (d === amanha) return 'Amanhã'
    if (d === ontem)  return 'Ontem'
    return new Date(d+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'numeric',month:'short'})
  }

  if (loading || loadingUnidades) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  return (
    <div style={{ padding:'2rem', fontFamily:"'DM Sans', sans-serif", maxWidth:900 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');`}</style>

      {/* Header */}
      <div style={{ marginBottom:'1.5rem' }}>
        <div style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:28, color:'#111', letterSpacing:1 }}>
          Calendário JustClub
        </div>
        <div style={{ fontSize:13, color:'#888', marginTop:2 }}>Visualização de aulas e reservas</div>
      </div>

      {/* Seletor de unidade */}
      {unidades.length > 1 && (
        <div style={{ display:'flex', gap:8, marginBottom:'1.5rem' }}>
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

      {/* Seletor de data */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:'1.5rem', flexWrap:'wrap' }}>
        {[ontem, hoje, amanha].map(d => (
          <button key={d} onClick={() => setDataSel(d)}
            style={{ padding:'0.4rem 1rem', borderRadius:8,
              border:`1.5px solid ${dataSel===d?ACCENT:'#e5e7eb'}`,
              background: dataSel===d?`${ACCENT}10`:'#fff',
              color: dataSel===d?ACCENT:'#555',
              fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>
            {labelData(d)}
          </button>
        ))}
        <input type="date" value={dataSel} onChange={e => setDataSel(e.target.value)}
          style={{ padding:'0.4rem 0.75rem', borderRadius:8, border:'1.5px solid #e5e7eb',
            fontSize:12, color:'#555', background:'#fff', cursor:'pointer',
            fontFamily:"'DM Sans', sans-serif" }}/>
      </div>

      {/* Lista de aulas */}
      {loadingOcs ? (
        <div style={{ textAlign:'center', padding:'3rem', color:'#aaa' }}>Carregando aulas...</div>
      ) : ocorrencias.length === 0 ? (
        <div style={{ background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:16,
          padding:'3rem', textAlign:'center', color:'#aaa' }}>
          <div style={{ fontSize:32, marginBottom:8 }}>📅</div>
          <div style={{ fontSize:14 }}>Nenhuma aula em {labelData(dataSel)} para {unidadeSel?.nome}.</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {ocorrencias.map(oc => {
            const aula = oc.club_aulas
            const cont = contagens[oc.id] || { total:0, reservado:0, presente:0, falta:0 }
            const total = cont.reservado + cont.presente + cont.falta
            const cor   = tipoColor(aula?.tipo)
            const nomeCoach = primeiroNomeCoachOc(oc)

            return (
              <div key={oc.id}
                onClick={() => router.push(`/admin/justclub/calendario/${oc.id}`)}
                style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:16,
                  padding:'1.25rem 1.5rem', cursor:'pointer', transition:'all .15s',
                  display:'flex', alignItems:'center', gap:'1.5rem' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = cor)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '#e5e7eb')}>

                <div style={{ fontFamily:"'DM Mono', monospace", fontSize:24, fontWeight:700,
                  color:'#111', width:60, flexShrink:0 }}>
                  {(aula?.horario||'').slice(0,5)}
                </div>

                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                    <span style={{ fontSize:11, fontWeight:700, color:cor, background:`${cor}18`,
                      padding:'2px 10px', borderRadius:20 }}>{tipoLabel(aula?.tipo)}</span>
                  </div>
                  <div style={{ fontSize:14, fontWeight:600, color:'#111', marginBottom:2 }}>
                    {aula?.grupos_musculares?.nome || '—'}
                  </div>
                  <div style={{ fontSize:12, color:'#888' }}>
                    👤 {nomeCoach
                          ? nomeCoach
                          : <span style={{ color: VERMELHO, fontWeight:700 }}>Coach a definir</span>}
                    {' · '}{aula?.duracao_min || 50}min
                  </div>
                </div>

                <div style={{ display:'flex', gap:'1.5rem', flexShrink:0, alignItems:'center' }}>
                  <div style={{ textAlign:'center' }}>
                    <div style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:28, color:'#111', lineHeight:1 }}>{total}</div>
                    <div style={{ fontSize:10, color:'#aaa', textTransform:'uppercase', letterSpacing:0.5 }}>reservas</div>
                  </div>
                  <div style={{ textAlign:'center' }}>
                    <div style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:28, color:VERDE, lineHeight:1 }}>{cont.presente}</div>
                    <div style={{ fontSize:10, color:'#aaa', textTransform:'uppercase', letterSpacing:0.5 }}>presentes</div>
                  </div>
                  <div style={{ textAlign:'center' }}>
                    <div style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:28, color:'#111', lineHeight:1 }}>
                      {cont.total - total}
                    </div>
                    <div style={{ fontSize:10, color:'#aaa', textTransform:'uppercase', letterSpacing:0.5 }}>vagas</div>
                  </div>
                  <div style={{ fontSize:18, color:'#ccc' }}>›</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
