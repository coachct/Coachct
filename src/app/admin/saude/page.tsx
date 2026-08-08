'use client'
import { useEffect, useState, useCallback, type CSSProperties } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'

const VERDE    = '#2ddd8b'
const VERMELHO = '#ff4444'
const AMARELO  = '#ffaa00'
const CINZA    = '#8a8a8a'

const supabase = createClient()

function tipoLabel(t: string) {
  if (t === 'lift') return 'Lift'
  if (t === 'lift_for_girls') return 'Lift for Girls'
  if (t === 'running_funcional') return 'Running'
  return t
}
function haQuanto(iso?: string) {
  if (!iso) return '—'
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'agora mesmo'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  return `há ${h}h`
}

export default function SaudeIntegracoes() {
  const { perfil } = useAuth() as any
  const [dbCheck, setDbCheck]   = useState<any>(null)   // checagens de banco ao vivo (rpc)
  const [snapshot, setSnapshot] = useState<any>(null)   // último snapshot do cron (traz a auth)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('')
    const [{ data: live, error: eLive }, { data: snap }] = await Promise.all([
      supabase.rpc('saude_integracoes'),
      supabase.from('integracoes_health').select('verificado_em, ok, relatorio').order('verificado_em', { ascending: false }).limit(1).maybeSingle(),
    ])
    if (eLive) setErro(eLive.message)
    setDbCheck(live || null)
    setSnapshot(snap || null)
    setCarregando(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // Fonte da verdade: checagens de banco vêm AO VIVO (rpc); auth vem do último
  // snapshot do cron (só o servidor tem as chaves dos apps).
  const over    = (dbCheck?.overbooking ?? []) as any[]
  const semPos  = (dbCheck?.sem_posicao ?? []) as any[]
  const filaTp  = dbCheck?.fila_totalpass ?? { itens: 0, mais_antigo_min: 0 }
  const filaWh  = dbCheck?.fila_wellhub ?? { itens: 0, mais_antigo_min: 0 }
  const authTp  = (snapshot?.relatorio?.auth_totalpass ?? []) as any[]
  const authRuim = authTp.filter(a => !a.ok)
  const filaTpRuim = (filaTp.mais_antigo_min ?? 0) > 30
  const filaWhRuim = (filaWh.mais_antigo_min ?? 0) > 30

  const problemas: string[] = []
  if (over.length) problemas.push(`${over.length} aula(s) futura(s) com overbooking`)
  if (authRuim.length) problemas.push(`auth TotalPass falhando (${authRuim.map(a => a.unidade).join(', ')})`)
  if (filaTpRuim) problemas.push('fila de sync TotalPass atrasada')
  if (filaWhRuim) problemas.push('fila de sync Wellhub atrasada')
  if (semPos.length) problemas.push(`${semPos.length} aula(s) com reserva sem posição`)
  const tudoOk = problemas.length === 0

  const cardStyle = (cor: string): CSSProperties => ({
    border: `1px solid ${cor}33`, background: `${cor}0d`, borderRadius: 14,
    padding: 18, display: 'flex', flexDirection: 'column', gap: 8,
  })
  const Pill = ({ cor, texto }: { cor: string; texto: string }) => (
    <span style={{ fontSize: 12, fontWeight: 800, color: '#fff', background: cor, padding: '3px 10px', borderRadius: 999 }}>{texto}</span>
  )

  if (perfil && perfil.papel && perfil.papel !== 'admin') {
    return <div style={{ padding: 24 }}>Acesso restrito.</div>
  }

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 6 }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, margin: 0 }}>🩺 Saúde das Integrações</h1>
        <button onClick={carregar} disabled={carregando}
          style={{ background: '#111', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', fontWeight: 700, cursor: 'pointer', opacity: carregando ? 0.6 : 1 }}>
          {carregando ? 'Verificando…' : '↻ Verificar agora'}
        </button>
      </div>
      <p style={{ color: CINZA, marginTop: 0, fontSize: 14 }}>
        Checagens de capacidade e filas rodam ao vivo. A autenticação dos apps é do último ciclo automático (a cada 3h) — {haQuanto(snapshot?.verificado_em)}.
      </p>

      {erro && <div style={{ color: VERMELHO, marginBottom: 12 }}>Erro: {erro}</div>}

      {/* Semáforo geral */}
      <div style={{ ...cardStyle(tudoOk ? VERDE : VERMELHO), marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 30 }}>{tudoOk ? '✅' : '🚨'}</span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: tudoOk ? VERDE : VERMELHO }}>
              {tudoOk ? 'Tudo funcionando' : `${problemas.length} problema(s) detectado(s)`}
            </div>
            {!tudoOk && <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{problemas.map((p, i) => <li key={i} style={{ color: '#c00', fontWeight: 600 }}>{p}</li>)}</ul>}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14 }}>
        {/* Auth dos apps */}
        <div style={cardStyle(authRuim.length ? VERMELHO : VERDE)}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <strong>Conexão com os apps</strong>
            <Pill cor={authRuim.length ? VERMELHO : VERDE} texto={authRuim.length ? 'FALHA' : 'OK'} />
          </div>
          {authTp.length === 0 && <span style={{ color: CINZA, fontSize: 13 }}>Sem snapshot ainda (aguarde o 1º ciclo do cron).</span>}
          {authTp.map((a, i) => (
            <div key={i} style={{ fontSize: 13, display: 'flex', gap: 6 }}>
              <span>{a.ok ? '🟢' : '🔴'}</span>
              <span><b>{a.unidade}</b>{!a.ok && a.erro ? ` — ${a.erro}` : ''}</span>
            </div>
          ))}
          <span style={{ color: CINZA, fontSize: 11 }}>TotalPass. (Wellhub entra na próxima versão.)</span>
        </div>

        {/* Filas de sync */}
        <div style={cardStyle(filaTpRuim || filaWhRuim ? VERMELHO : VERDE)}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <strong>Filas de sincronização</strong>
            <Pill cor={filaTpRuim || filaWhRuim ? VERMELHO : VERDE} texto={filaTpRuim || filaWhRuim ? 'ATRASO' : 'OK'} />
          </div>
          <div style={{ fontSize: 13 }}>{filaTpRuim ? '🔴' : '🟢'} TotalPass: <b>{filaTp.itens}</b> itens, mais antigo <b>{filaTp.mais_antigo_min} min</b></div>
          <div style={{ fontSize: 13 }}>{filaWhRuim ? '🔴' : '🟢'} Wellhub: <b>{filaWh.itens}</b> itens, mais antigo <b>{filaWh.mais_antigo_min} min</b></div>
          <span style={{ color: CINZA, fontSize: 11 }}>Atraso &gt; 30 min = sync travado (empurra vagas erradas).</span>
        </div>

        {/* Overbooking */}
        <div style={cardStyle(over.length ? VERMELHO : VERDE)}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <strong>Overbooking (aulas futuras)</strong>
            <Pill cor={over.length ? VERMELHO : VERDE} texto={over.length ? String(over.length) : 'OK'} />
          </div>
          {over.length === 0 && <span style={{ color: CINZA, fontSize: 13 }}>Nenhuma aula com mais reservas que a capacidade.</span>}
          {over.map((o, i) => (
            <div key={i} style={{ fontSize: 13 }}>🔴 <b>{o.unidade}</b> · {o.data} {String(o.horario).slice(0, 5)} · {tipoLabel(o.tipo)} — {o.ativas}/{o.capacidade_util} (<b style={{ color: VERMELHO }}>+{o.excesso}</b>)</div>
          ))}
        </div>

        {/* Sem posição */}
        <div style={cardStyle(semPos.length ? AMARELO : VERDE)}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <strong>Reservas sem posição</strong>
            <Pill cor={semPos.length ? AMARELO : VERDE} texto={semPos.length ? String(semPos.length) : 'OK'} />
          </div>
          {semPos.length === 0 && <span style={{ color: CINZA, fontSize: 13 }}>Nenhuma reserva de corrida sem esteira/funcional.</span>}
          {semPos.map((s, i) => (
            <div key={i} style={{ fontSize: 13 }}>🟡 <b>{s.unidade}</b> · {s.data} {String(s.horario).slice(0, 5)} — {s.qtd} reserva(s)</div>
          ))}
        </div>
      </div>
    </div>
  )
}
