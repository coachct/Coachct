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
function horaCurta(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
}

// Régua do pull de reservas TotalPass — a mesma do sentinela
// (src/app/api/health/integracoes/route.ts). Ver incidente 08/09/2026.
const PULL_PARADO_MIN = 15
const SEM_MAPA_POLLS = 5

export default function SaudeIntegracoes() {
  const { perfil } = useAuth() as any
  const [dbCheck, setDbCheck]   = useState<any>(null)   // checagens de banco ao vivo (rpc)
  const [snapshot, setSnapshot] = useState<any>(null)   // último snapshot do cron (traz a auth)
  const [pulls, setPulls] = useState<any[]>([])         // histórico do pull de reservas TotalPass
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('')
    const [{ data: live, error: eLive }, { data: snap }, { data: log }] = await Promise.all([
      supabase.rpc('saude_integracoes'),
      supabase.from('integracoes_health').select('verificado_em, ok, relatorio').order('verificado_em', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('totalpass_pull_log')
        .select('criado_em, slots, criadas, reativadas, ja_tinha, sem_mapa, rejeitadas, incompletas')
        .order('criado_em', { ascending: false }).limit(12),
    ])
    if (eLive) setErro(eLive.message)
    setDbCheck(live || null)
    setSnapshot(snap || null)
    setPulls(log || [])
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
  const authWh  = (snapshot?.relatorio?.auth_wellhub ?? []) as any[]
  const authRuim = [...authTp, ...authWh].filter(a => !a.ok)
  const filaTpRuim = (filaTp.mais_antigo_min ?? 0) > 30
  const filaWhRuim = (filaWh.mais_antigo_min ?? 0) > 30

  // Pull de reservas TotalPass: o placar vem AO VIVO do histórico (totalpass_pull_log);
  // só "faz X horas que não entra reserva" vem do snapshot, porque depende de contar
  // horas de expediente no servidor. Ver incidente 08/09/2026 — o pull respondia
  // HTTP 200 o tempo todo enquanto nenhuma reserva do app entrava na agenda.
  const pullSnap  = snapshot?.relatorio?.pull_totalpass
  const pullLigado = pullSnap?.ativo !== false
  const ultPull = pulls[0]
  const minPull = ultPull ? Math.round((Date.now() - new Date(ultPull.criado_em).getTime()) / 60000) : null
  let seguidosSemMapa = 0
  for (const p of pulls) { if ((p.sem_mapa ?? 0) > 0) seguidosSemMapa++; else break }
  const pullParado   = pullLigado && minPull !== null && minPull > PULL_PARADO_MIN
  const semMapaRuim  = pullLigado && seguidosSemMapa >= SEM_MAPA_POLLS
  const semReservaRuim = pullLigado && !!pullSnap?.alerta_sem_reserva
  const pullRuim = pullParado || semMapaRuim || semReservaRuim

  const problemas: string[] = []
  if (over.length) problemas.push(`${over.length} aula(s) futura(s) com overbooking`)
  if (authRuim.length) problemas.push(`conexão com app falhando (${authRuim.map(a => a.unidade).join(', ')})`)
  if (pullParado) problemas.push(`pull de reservas TotalPass parado há ${minPull} min`)
  if (semMapaRuim) problemas.push(`${seguidosSemMapa} polls seguidos com slot sem mapa — reserva do app da TotalPass não está entrando na agenda`)
  if (semReservaRuim) problemas.push(`nenhuma reserva nova da TotalPass há ${pullSnap?.horas_comerciais_sem_reserva}h de expediente`)
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
        {/* Reservas do app TotalPass — o placar de cada pull, não só "respondeu 200" */}
        <div style={{ ...cardStyle(pullRuim ? VERMELHO : VERDE), gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <strong>Reservas que chegam do app da TotalPass</strong>
            <Pill cor={!pullLigado ? CINZA : pullRuim ? VERMELHO : VERDE} texto={!pullLigado ? 'DESLIGADO' : pullRuim ? 'FALHA' : 'OK'} />
          </div>

          {pulls.length === 0 && (
            <span style={{ color: CINZA, fontSize: 13 }}>Sem registro de pull ainda (a primeira leitura entra em até 2 min).</span>
          )}

          {pulls.length > 0 && (
            <>
              <div style={{ fontSize: 13 }}>
                {pullParado ? '🔴' : '🟢'} Último pull <b>{haQuanto(ultPull?.criado_em)}</b>
                {' · '}{ultPull?.criadas ?? 0} nova(s) · {ultPull?.ja_tinha ?? 0} já registrada(s)
                {' · '}<b style={{ color: (ultPull?.sem_mapa ?? 0) > 0 ? VERMELHO : undefined }}>{ultPull?.sem_mapa ?? 0} sem mapa</b>
                {' · '}{ultPull?.rejeitadas ?? 0} rejeitada(s)
              </div>
              <div style={{ fontSize: 13 }}>
                {semMapaRuim ? '🔴' : seguidosSemMapa > 0 ? '🟡' : '🟢'} Polls seguidos com slot <b>sem mapa</b>: <b>{seguidosSemMapa}</b>
                <span style={{ color: CINZA }}> (alerta a partir de {SEM_MAPA_POLLS})</span>
              </div>
              <div style={{ fontSize: 13 }}>
                {semReservaRuim ? '🔴' : '🟢'} Última reserva do app <b>{haQuanto(pullSnap?.ultima_reserva_em)}</b>
                {pullSnap?.horas_comerciais_sem_reserva != null && (
                  <span style={{ color: CINZA }}> · {pullSnap.horas_comerciais_sem_reserva}h de expediente sem reserva nova</span>
                )}
              </div>

              {/* Histórico curto: é o que faltava em 08/09 pra datar o começo do problema */}
              <div style={{ marginTop: 6, overflowX: 'auto' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: CINZA, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                  Últimos pulls
                </div>
                <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 420 }}>
                  <thead>
                    <tr style={{ color: CINZA, textAlign: 'right' }}>
                      <th style={{ textAlign: 'left', padding: '2px 10px 2px 0', fontWeight: 700 }}>Hora</th>
                      <th style={{ padding: '2px 10px', fontWeight: 700 }}>Slots</th>
                      <th style={{ padding: '2px 10px', fontWeight: 700 }}>Novas</th>
                      <th style={{ padding: '2px 10px', fontWeight: 700 }}>Já tinha</th>
                      <th style={{ padding: '2px 10px', fontWeight: 700 }}>Sem mapa</th>
                      <th style={{ padding: '2px 0 2px 10px', fontWeight: 700 }}>Rejeit.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pulls.map((p, i) => (
                      <tr key={i} style={{ textAlign: 'right', borderTop: '1px solid #0000000d' }}>
                        <td style={{ textAlign: 'left', padding: '3px 10px 3px 0' }}>{horaCurta(p.criado_em)}</td>
                        <td style={{ padding: '3px 10px' }}>{p.slots ?? 0}</td>
                        <td style={{ padding: '3px 10px', fontWeight: (p.criadas ?? 0) > 0 ? 800 : 400 }}>{p.criadas ?? 0}</td>
                        <td style={{ padding: '3px 10px' }}>{p.ja_tinha ?? 0}</td>
                        <td style={{ padding: '3px 10px', color: (p.sem_mapa ?? 0) > 0 ? VERMELHO : undefined, fontWeight: (p.sem_mapa ?? 0) > 0 ? 800 : 400 }}>{p.sem_mapa ?? 0}</td>
                        <td style={{ padding: '3px 0 3px 10px', color: (p.rejeitadas ?? 0) > 0 ? AMARELO : undefined }}>{p.rejeitadas ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <span style={{ color: CINZA, fontSize: 11 }}>
            &ldquo;Sem mapa&rdquo; = a TotalPass devolveu uma reserva para uma aula que não está no nosso mapa de eventos.
            Reserva nesse estado <b>não entra na agenda</b> e o aluno chega para a aula sem check-in.
          </span>
        </div>

        {/* Auth dos apps */}
        <div style={cardStyle(authRuim.length ? VERMELHO : VERDE)}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <strong>Conexão com os apps</strong>
            <Pill cor={authRuim.length ? VERMELHO : VERDE} texto={authRuim.length ? 'FALHA' : 'OK'} />
          </div>
          {authTp.length === 0 && authWh.length === 0 && <span style={{ color: CINZA, fontSize: 13 }}>Sem snapshot ainda (aguarde o 1º ciclo do cron ou clique em Verificar agora).</span>}
          {[{ app: 'TotalPass', lista: authTp }, { app: 'Wellhub', lista: authWh }].map(({ app, lista }) => (
            lista.length > 0 && (
              <div key={app} style={{ marginTop: 2 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: CINZA, textTransform: 'uppercase', letterSpacing: 0.5 }}>{app}</div>
                {lista.map((a: any, i: number) => (
                  <div key={i} style={{ fontSize: 13, display: 'flex', gap: 6 }}>
                    <span>{a.ok ? '🟢' : '🔴'}</span>
                    <span><b>{a.unidade}</b>{!a.ok && a.erro ? ` — ${a.erro}` : ''}</span>
                  </div>
                ))}
              </div>
            )
          ))}
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
