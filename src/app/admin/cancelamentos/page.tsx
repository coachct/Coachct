'use client'
import { useEffect, useState, useCallback, type CSSProperties } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'

const VERDE    = '#2ddd8b'
const VERMELHO = '#ff4444'
const AMARELO  = '#ffaa00'
const CINZA    = '#8a8a8a'

const supabase = createClient()

// Prazo que vale hoje (site e WhatsApp): cancelamento livre acima de 12h,
// entre 3h e 12h só com fila, abaixo de 3h não dá. A tela existe pra responder
// se dá pra afrouxar isso sem custar ocupação — ver src/lib/whatsapp/consultas.ts.
const PRAZO_ATUAL_H = 12

const ORIGEM_LABEL: Record<string, string> = {
  wellhub_app:          'App Wellhub',
  wellhub_app_late:     'App Wellhub (em cima da hora)',
  totalpass_pull:       'App TotalPass',
  totalpass_duplicada:  'TotalPass (reserva duplicada)',
  site_cliente:         'Site (cliente)',
  whatsapp:             'WhatsApp',
  admin:                'Admin',
  recepcao:             'Recepção',
  aula_cancelada:       'Aula cancelada por nós',
  nao_registrado:       'Antes de 20/09/2026',
}

function dataStr(d: Date) { return d.toISOString().slice(0, 10) }

export default function AnaliseCancelamentos() {
  const { perfil } = useAuth() as any
  const [unidades, setUnidades] = useState<any[]>([])
  const [unidadeId, setUnidadeId] = useState('')
  const [soCheias, setSoCheias] = useState(true)
  const [de, setDe]   = useState(() => { const d = new Date(); d.setDate(d.getDate() - 90); return dataStr(d) })
  const [ate, setAte] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 1); return dataStr(d) })
  const [linhas, setLinhas] = useState<any[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    supabase.from('unidades').select('id, nome').order('nome')
      .then(({ data }) => setUnidades(data || []))
  }, [])

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('')
    const { data, error } = await supabase.rpc('club_cancelamentos_analise', {
      p_de: de,
      p_ate: ate,
      p_unidade_id: unidadeId || null,
      p_ocup_min: soCheias ? 0.8 : 0,
    })
    if (error) setErro(error.message === 'ACESSO_NEGADO' ? 'Acesso restrito.' : error.message)
    setLinhas(data || [])
    setCarregando(false)
  }, [de, ate, unidadeId, soCheias])

  useEffect(() => { carregar() }, [carregar])

  const total     = linhas.reduce((s, l) => s + Number(l.cancelamentos || 0), 0)
  const perdidas  = linhas.reduce((s, l) => s + Number(l.perdidas || 0), 0)
  // As faixas que hoje são bloqueadas pelo prazo de 12h — é o que se ganharia
  // liberando, e o que se arriscaria junto.
  const abaixoDoPrazo = linhas.filter(l => l.ordem >= 2 && l.ordem <= 4)
  const totalAbaixo    = abaixoDoPrazo.reduce((s, l) => s + Number(l.cancelamentos || 0), 0)
  const perdidasAbaixo = abaixoDoPrazo.reduce((s, l) => s + Number(l.perdidas || 0), 0)

  const corDaFaixa = (pct: number) => (pct >= 95 ? VERDE : pct >= 85 ? AMARELO : VERMELHO)

  const card: CSSProperties = {
    border: '1px solid #e6e6e6', background: '#fff', borderRadius: 14, padding: 18,
  }
  const th: CSSProperties = {
    textAlign: 'left', fontSize: 12, fontWeight: 800, color: CINZA,
    textTransform: 'uppercase', letterSpacing: 0.4, padding: '8px 10px', whiteSpace: 'nowrap',
  }
  const td: CSSProperties = { padding: '12px 10px', borderTop: '1px solid #f0f0f0', fontSize: 14 }
  const input: CSSProperties = {
    border: '1px solid #ddd', borderRadius: 10, padding: '8px 10px', fontSize: 14, background: '#fff',
  }

  if (perfil && perfil.papel && perfil.papel !== 'admin') {
    return <div style={{ padding: 24 }}>Acesso restrito.</div>
  }

  return (
    <div className="cancel-pagina" style={{ padding: 24, maxWidth: 900 }}>
      <style>{`
        @media (max-width: 767px) {
          .cancel-pagina { padding: 24px 0 !important; }
          .cancel-tabela { display: block; overflow-x: auto; }
        }
      `}</style>

      <h1 style={{ fontSize: 26, fontWeight: 900, margin: '0 0 6px' }}>🕗 Cancelamentos do Club</h1>
      <p style={{ color: CINZA, marginTop: 0, fontSize: 14, lineHeight: 1.5 }}>
        Para cada cancelamento, comparamos a ocupação da aula no instante em que cancelaram com a
        ocupação final. <strong>Reposta</strong> = a aula terminou com pelo menos a mesma lotação, ou
        seja, a vaga liberada voltou a ser preenchida. <strong>Perdida</strong> = a aula acabou com
        gente a menos. Hoje o prazo é de {PRAZO_ATUAL_H}h.
      </p>

      <div style={{ ...card, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 700, color: CINZA }}>
          DE
          <input type="date" value={de} onChange={e => setDe(e.target.value)} style={input} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 700, color: CINZA }}>
          ATÉ
          <input type="date" value={ate} onChange={e => setAte(e.target.value)} style={input} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 700, color: CINZA }}>
          UNIDADE
          <select value={unidadeId} onChange={e => setUnidadeId(e.target.value)} style={input}>
            <option value="">Todas</option>
            {unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, paddingBottom: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={soCheias} onChange={e => setSoCheias(e.target.checked)} />
          Só aulas cheias (80%+ no momento do cancelamento)
        </label>
      </div>

      {erro && (
        <div style={{ ...card, borderColor: `${VERMELHO}44`, background: `${VERMELHO}0d`, marginBottom: 16 }}>
          {erro}
        </div>
      )}

      {carregando ? (
        <div style={{ ...card, color: CINZA }}>Calculando…</div>
      ) : linhas.length === 0 ? (
        <div style={{ ...card, color: CINZA }}>Nenhum cancelamento no período com esse filtro.</div>
      ) : (
        <>
          <div style={{ ...card, marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: CINZA, marginBottom: 6 }}>
              Se o prazo caísse de {PRAZO_ATUAL_H}h para 3h, estes são os cancelamentos que passariam a ser
              permitidos no período filtrado:
            </div>
            <div style={{ fontSize: 22, fontWeight: 900 }}>
              {totalAbaixo} cancelamento{totalAbaixo === 1 ? '' : 's'} —{' '}
              <span style={{ color: perdidasAbaixo === 0 ? VERDE : AMARELO }}>
                {perdidasAbaixo} vaga{perdidasAbaixo === 1 ? '' : 's'} teria{perdidasAbaixo === 1 ? '' : 'm'} ficado vazia{perdidasAbaixo === 1 ? '' : 's'}
              </span>
            </div>
            <div style={{ fontSize: 13, color: CINZA, marginTop: 6 }}>
              No período todo: {total} cancelamento{total === 1 ? '' : 's'}, {perdidas} sem reposição.
            </div>
          </div>

          <div style={card}>
            <table className="cancel-tabela" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Antecedência</th>
                  <th style={th}>Cancelamentos</th>
                  <th style={th}>Repostas</th>
                  <th style={th}>Perdidas</th>
                  <th style={th}>% reposta</th>
                  <th style={th}>Ocupação no momento</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(l => {
                  const pct = Number(l.pct_reposta || 0)
                  const liberadaHoje = l.ordem === 1
                  return (
                    <tr key={l.ordem} style={{ background: liberadaHoje ? '#fafafa' : undefined }}>
                      <td style={{ ...td, fontWeight: 700 }}>
                        {l.faixa}
                        {liberadaHoje && <div style={{ fontSize: 11, color: CINZA, fontWeight: 400 }}>permitido hoje</div>}
                      </td>
                      <td style={td}>{l.cancelamentos}</td>
                      <td style={td}>{l.repostas}</td>
                      <td style={{ ...td, color: Number(l.perdidas) > 0 ? VERMELHO : CINZA, fontWeight: Number(l.perdidas) > 0 ? 700 : 400 }}>
                        {l.perdidas}
                      </td>
                      <td style={{ ...td, fontWeight: 800, color: corDaFaixa(pct) }}>{pct}%</td>
                      <td style={{ ...td, color: CINZA }}>{l.ocup_media_no_momento}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div style={{ ...card, marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>De onde vêm os cancelamentos</div>
            {linhas.map(l => {
              const origens = (l.origens || {}) as Record<string, number>
              const chaves = Object.keys(origens).sort((a, b) => origens[b] - origens[a])
              if (!chaves.length) return null
              return (
                <div key={l.ordem} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{l.faixa}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                    {chaves.map(k => (
                      <span key={k} style={{
                        fontSize: 12, background: k === 'nao_registrado' ? '#f0f0f0' : '#eef6ff',
                        color: k === 'nao_registrado' ? CINZA : '#1d4ed8',
                        padding: '3px 10px', borderRadius: 999,
                      }}>
                        {ORIGEM_LABEL[k] || k}: {origens[k]}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
            <div style={{ fontSize: 12, color: CINZA, marginTop: 10, lineHeight: 1.5 }}>
              A origem do cancelamento só passou a ser registrada em 20/09/2026. Tudo antes disso
              aparece como &quot;Antes de 20/09/2026&quot; — o que não atrapalha a conta de reposição,
              só não diz quem cancelou.
            </div>
          </div>
        </>
      )}
    </div>
  )
}
