'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { RefreshCw, Users, Clock } from 'lucide-react'

const UNIDADE_CT = 'c28bf4bb-56f8-44ff-818a-c7836e58bcef'

const ORIGENS: Record<string, { label: string; bg: string; fg: string }> = {
  wellhub:   { label: 'Wellhub',   bg: '#f3e8ff', fg: '#7e22ce' },
  totalpass: { label: 'TotalPass', bg: '#d1fae5', fg: '#047857' },
  cliente:   { label: 'Cliente',   bg: '#fce7f3', fg: '#be185d' },
}

const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  recebido: { label: 'Recebido', bg: '#fef3c7', fg: '#b45309' },
  validado: { label: 'Validado', bg: '#dcfce7', fg: '#15803d' },
  erro:     { label: 'Erro',     bg: '#fee2e2', fg: '#b91c1c' },
}

const FILTROS = [
  { key: 'todos',     label: 'Todos' },
  { key: 'wellhub',   label: 'Wellhub' },
  { key: 'totalpass', label: 'TotalPass' },
  { key: 'cliente',   label: 'Cliente' },
]

// Início do dia de hoje no fuso de São Paulo (UTC-3, Brasil não tem DST).
// Usa Intl pra pegar o Y-M-D em SP — nunca toISOString pra data,
// pra não cair no bug de pular um dia depois das 21h.
function inicioHojeSP(): string {
  const hoje = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  return `${hoje}T00:00:00-03:00`
}

function horaSP(ts: string | Date): string {
  return new Date(ts).toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit', minute: '2-digit',
  })
}

type Entrada = {
  id: string
  origem: string
  status: string
  id_externo: string | null
  produto: string | null
  recebido_em: string
  cliente_id: string | null
  clientes: any
}

function nomeCliente(r: Entrada): string | null {
  const c = r.clientes
  if (!c) return null
  if (Array.isArray(c)) return c[0]?.nome ?? null
  return c.nome ?? null
}

export default function RecepcaoWalkIn() {
  const supabase = createClient()
  const [entradas, setEntradas] = useState<Entrada[]>([])
  const [filtro, setFiltro] = useState('todos')
  const [carregando, setCarregando] = useState(true)
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null)

  const buscar = useCallback(async () => {
    let query = supabase
      .from('entradas_walkin')
      .select('id, origem, status, id_externo, produto, recebido_em, cliente_id, clientes(nome)')
      .eq('unidade_id', UNIDADE_CT)
      .gte('recebido_em', inicioHojeSP())
      .order('recebido_em', { ascending: false })

    if (filtro !== 'todos') query = query.eq('origem', filtro)

    const { data, error } = await query
    if (!error && data) setEntradas(data as any)
    setAtualizadoEm(new Date())
    setCarregando(false)
  }, [filtro, supabase])

  useEffect(() => {
    setCarregando(true)
    buscar()
    const intervalo = setInterval(buscar, 10000)
    const aoFocar = () => buscar()
    window.addEventListener('focus', aoFocar)

    // Tempo real: recarrega na hora quando uma entrada entra ou muda de status
    // (ex.: recebido -> validado). O intervalo acima fica como rede de segurança.
    const canal = supabase
      .channel('recepcao_walkin')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'entradas_walkin' },
        () => buscar()
      )
      .subscribe()

    return () => {
      clearInterval(intervalo)
      window.removeEventListener('focus', aoFocar)
      supabase.removeChannel(canal)
    }
  }, [buscar, supabase])

  function nomeExibicao(r: Entrada): string {
    const nome = nomeCliente(r)
    if (nome) return nome
    const label = ORIGENS[r.origem]?.label ?? r.origem
    return r.id_externo ? `${label} · ${r.id_externo}` : label
  }

  return (
    <div style={{ padding: '32px 24px', maxWidth: 920, margin: '0 auto' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Users size={24} color="#ff2d9b" />
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: 0 }}>Walk In</h1>
        </div>
        <button
          onClick={() => buscar()}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, background: '#fff',
            border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px',
            cursor: 'pointer', color: '#374151', fontSize: 13,
          }}
        >
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>
      <p style={{ color: '#6b7280', fontSize: 14, marginTop: 0, marginBottom: 20 }}>
        Entradas de hoje — Just CT
      </p>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {FILTROS.map((f) => {
          const ativo = filtro === f.key
          return (
            <button
              key={f.key}
              onClick={() => setFiltro(f.key)}
              style={{
                padding: '6px 14px', borderRadius: 999, fontSize: 13, cursor: 'pointer',
                border: ativo ? '1px solid #ff2d9b' : '1px solid #e5e7eb',
                background: ativo ? '#ff2d9b' : '#fff',
                color: ativo ? '#fff' : '#374151',
                fontWeight: ativo ? 600 : 400,
              }}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {/* Lista */}
      {carregando ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: '48px 0' }}>Carregando…</div>
      ) : entradas.length === 0 ? (
        <div style={{
          textAlign: 'center', color: '#9ca3af', padding: '48px 0',
          background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb',
        }}>
          Nenhuma entrada hoje{filtro !== 'todos' ? ' nesse filtro' : ''}.
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          {entradas.map((r, i) => {
            const origem = ORIGENS[r.origem] ?? { label: r.origem, bg: '#f3f4f6', fg: '#374151' }
            const status = STATUS[r.status] ?? { label: r.status, bg: '#f3f4f6', fg: '#374151' }
            return (
              <div
                key={r.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                  borderTop: i === 0 ? 'none' : '1px solid #f3f4f6',
                }}
              >
                {/* Hora */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#6b7280', fontSize: 13, minWidth: 64 }}>
                  <Clock size={14} /> {horaSP(r.recebido_em)}
                </div>

                {/* Nome + produto */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 15, fontWeight: 600, color: '#111827',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {nomeExibicao(r)}
                  </div>
                  {r.produto && (
                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{r.produto}</div>
                  )}
                </div>

                {/* Origem */}
                <span style={{
                  fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999,
                  background: origem.bg, color: origem.fg,
                }}>
                  {origem.label}
                </span>

                {/* Status */}
                <span style={{
                  fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999,
                  background: status.bg, color: status.fg,
                }}>
                  {status.label}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {atualizadoEm && (
        <p style={{ textAlign: 'right', color: '#9ca3af', fontSize: 12, marginTop: 12 }}>
          {entradas.length} entrada{entradas.length === 1 ? '' : 's'} · atualizado {horaSP(atualizadoEm)}
        </p>
      )}
    </div>
  )
}
