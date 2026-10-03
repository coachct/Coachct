'use client'
// Termo de Adesão Wellhub / TotalPass (v1.2 — no-show R$ 99,00 Coach CT e
// R$ 49,90 JustClub). Usado nas telas de reserva das Clubs (/aulas e /mapa):
// quem reserva ou entra na fila com crédito de parceiro e ainda não tem um
// aceite gravado com a cláusula dos R$ 49,90 assina aqui antes de seguir.
// Grava em termos_aceites o texto inteiro, a versão e o navegador.
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { TEXTO_TERMO_WELLHUB_TOTALPASS, VERSAO_TERMO_WELLHUB_TOTALPASS } from '@/lib/contratos/termo-wellhub-totalpass'

const ACCENT = '#ff2d9b'

type Props = {
  aberto: boolean
  cliente: any
  tipoCredito: string
  unidadeId: string
  onAceito: () => void
  onFechar: () => void
}

export default function ModalTermoApps({ aberto, cliente, tipoCredito, unidadeId, onAceito, onFechar }: Props) {
  const supabase = createClient()
  const [aceite, setAceite] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  if (!aberto) return null

  async function aceitar() {
    if (!aceite || !cliente || salvando) return
    setSalvando(true); setErro('')
    const tipoPlano = /^totalpass/i.test(tipoCredito) ? 'totalpass' : 'wellhub'
    let clientePlanoId: string | null = null
    if (unidadeId) {
      const { data: cp } = await supabase.from('cliente_planos')
        .select('id, planos_disponiveis!inner(tipo, unidade_id)')
        .eq('cliente_id', cliente.id).eq('ativo', true)
        .eq('planos_disponiveis.tipo', tipoPlano)
        .eq('planos_disponiveis.unidade_id', unidadeId)
        .limit(1).maybeSingle()
      clientePlanoId = cp?.id || null
    }
    const { error } = await supabase.from('termos_aceites').insert({
      cliente_id: cliente.id,
      cliente_plano_id: clientePlanoId,
      tipo_plano: tipoPlano,
      nome_digitado: cliente.nome || '',
      cpf_confirmado: cliente.cpf,
      user_agent: navigator.userAgent,
      modo_aceite: 'online',
      versao_contrato: VERSAO_TERMO_WELLHUB_TOTALPASS,
      texto_contrato: TEXTO_TERMO_WELLHUB_TOTALPASS,
    })
    setSalvando(false)
    if (error) { setErro('Não foi possível registrar o aceite. Tente novamente.'); return }
    setAceite(false)
    onAceito()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000000e0', zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: '#111', border: '1px solid #333', borderRadius: 20, width: '100%', maxWidth: 500, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '1.5rem 1.5rem 1rem', borderBottom: '1px solid #222' }}>
          <div style={{ fontSize: 11, color: ACCENT, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>📄 Termo de Adesão — Wellhub / TotalPass</div>
          <div style={{ fontSize: 13, color: '#888', marginTop: 6, lineHeight: 1.5 }}>Atualizamos o termo. Leia e aceite para continuar com a sua reserva.</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem' }}>
          <pre style={{ fontSize: 12, color: '#aaa', lineHeight: 1.8, whiteSpace: 'pre-wrap', fontFamily: "'DM Sans', sans-serif" }}>{TEXTO_TERMO_WELLHUB_TOTALPASS}</pre>
        </div>
        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #222' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer', marginBottom: '1rem' }}>
            <input type="checkbox" checked={aceite} onChange={e => setAceite(e.target.checked)} style={{ marginTop: 2, accentColor: ACCENT, width: 16, height: 16, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: '#aaa', lineHeight: 1.5 }}>Li e aceito integralmente o Termo de Adesão — Wellhub / TotalPass, incluindo as regras de agendamento, cancelamento e o valor de no-show de R$ 49,90 nas aulas do JustClub.</span>
          </label>
          {erro && <div style={{ background: '#ff2d9b15', border: '1px solid #ff2d9b44', borderRadius: 8, padding: '0.6rem 1rem', fontSize: 13, color: ACCENT, marginBottom: '1rem' }}>{erro}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setAceite(false); setErro(''); onFechar() }} style={{ flex: 1, background: 'transparent', border: '1px solid #333', borderRadius: 10, padding: '0.75rem', color: '#888', fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>Voltar</button>
            <button onClick={aceitar} disabled={!aceite || salvando}
              style={{ flex: 2, background: aceite ? ACCENT : '#333', color: '#fff', border: 'none', borderRadius: 10, padding: '0.75rem', fontWeight: 600, fontSize: 14, cursor: aceite && !salvando ? 'pointer' : 'default', fontFamily: "'DM Sans', sans-serif" }}>
              {salvando ? 'Registrando...' : 'Aceitar e continuar →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
