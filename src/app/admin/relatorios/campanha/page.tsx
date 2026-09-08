'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { KpiCard, PageHeader, Spinner, Insight, SectionTitle } from '@/components/ui'
import { CAMPANHA_SUMMER } from '@/lib/summer'

// ─────────────────────────────────────────────────────────────────────────────
// Funil da campanha — de onde vem a visita e quanto disso vira venda
//
// A conta é por SESSÃO, não por evento: quem abre a landing três vezes conta
// como uma visita só. O canal da sessão é o primeiro utm_source que ela teve e
// fica grudado até a compra — quem entra pelo e-mail, some por dois dias e
// volta pra comprar continua contando como e-mail, não como "direto".
//
// Os quatro degraus:
//   visita       → abriu a landing (ou a seção da campanha em /comprar)
//   ver_pacotes  → clicou em VER PACOTES
//   checkout     → chegou na tela de pagamento
//   compra       → virou venda de verdade (gravado no servidor, não na tela)
//
// "direto" = chegou sem utm nenhum: digitou o endereço, veio de um link sem
// marcação ou de um app que não repassa referrer.
// ─────────────────────────────────────────────────────────────────────────────

type Canal = {
  canal: string; visitas: number; ver_pacotes: number
  checkout: number; compras: number; receita: number
}
type Dia = { dia: string; visitas: number; compras: number }
type Dispositivo = { dispositivo: string; visitas: number; compras: number }
type Totais = {
  visitas: number; ver_pacotes: number; checkout: number
  compras: number; receita: number
}

const NOME_CANAL: Record<string, string> = {
  direto: 'Direto / sem marcação',
  instagram: 'Instagram',
  email: 'E-mail',
  whatsapp: 'WhatsApp',
}

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function pct(parte: number, total: number) {
  if (!total) return '—'
  return `${Math.round((parte / total) * 100)}%`
}

function dataBR(iso: string) {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}`
}

function hojeStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function RelatorioCampanhaPage() {
  const { perfil, loading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [campanha, setCampanha] = useState(CAMPANHA_SUMMER)
  const [de, setDe]   = useState('2026-09-07')
  const [ate, setAte] = useState(hojeStr())

  const [carregando, setCarregando] = useState(true)
  const [totais, setTotais]   = useState<Totais | null>(null)
  const [canais, setCanais]   = useState<Canal[]>([])
  const [dias, setDias]       = useState<Dia[]>([])
  const [aparelhos, setAparelhos] = useState<Dispositivo[]>([])

  useEffect(() => {
    if (!loading && perfil?.role !== 'admin') router.push('/')
  }, [perfil, loading])

  useEffect(() => { if (perfil) carregar() }, [perfil, campanha, de, ate])

  async function carregar() {
    setCarregando(true)
    const { data, error } = await supabase.rpc('relatorio_campanha', {
      p_campanha: campanha, p_de: de || null, p_ate: ate || null,
    })
    if (error) { console.error('Erro no relatório de campanha:', error); setCarregando(false); return }
    setTotais(data?.totais || null)
    setCanais(data?.canais || [])
    setDias(data?.dias || [])
    setAparelhos(data?.dispositivos || [])
    setCarregando(false)
  }

  const t = totais
  const maxVisitasDia = Math.max(1, ...dias.map(d => d.visitas))

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Funil da campanha"
        subtitle="De onde vem a visita e quanto disso vira venda. A conta é por pessoa, não por clique."
      />

      <div className="flex flex-wrap gap-3 items-end mb-6">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Campanha</label>
          <input value={campanha} onChange={e => setCampanha(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">De</label>
          <input type="date" value={de} onChange={e => setDe(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Até</label>
          <input type="date" value={ate} onChange={e => setAte(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>

      {carregando ? <Spinner /> : !t ? (
        <Insight variant="amber">Não foi possível carregar o relatório.</Insight>
      ) : t.visitas === 0 ? (
        <Insight variant="amber">
          Nenhuma visita registrada nesse período. Se a campanha acabou de subir, o rastreio só
          conta a partir do momento em que o código foi publicado.
        </Insight>
      ) : (
        <>
          {/* ── Os quatro degraus ── */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <KpiCard label="Visitas" value={String(t.visitas)} sub="abriram a campanha" />
            <KpiCard label="Viram os pacotes" value={String(t.ver_pacotes)}
              sub={`${pct(t.ver_pacotes, t.visitas)} das visitas`} />
            <KpiCard label="Chegaram no checkout" value={String(t.checkout)}
              sub={`${pct(t.checkout, t.visitas)} das visitas`} />
            <KpiCard label="Compraram" value={String(t.compras)}
              sub={`${pct(t.compras, t.visitas)} das visitas`}
              subColor="text-primary-600" />
            <KpiCard label="Receita" value={brl(Number(t.receita))}
              sub={t.compras ? `${brl(Number(t.receita) / t.compras)} por venda` : undefined} />
          </div>

          {t.checkout > 0 && (
            <Insight variant={t.compras / t.checkout < 0.5 ? 'amber' : 'green'}>
              <strong>{pct(t.compras, t.checkout)}</strong> de quem chegou no checkout fechou a compra.
              {t.checkout - t.compras > 0 && (
                <> São <strong>{t.checkout - t.compras}</strong> pessoas que abriram o pagamento e desistiram.</>
              )}
            </Insight>
          )}

          {/* ── Por canal ── */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 mb-6 mt-6">
            <SectionTitle>Por canal</SectionTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                    <th className="py-2 pr-3">Canal</th>
                    <th className="py-2 px-3 text-right">Visitas</th>
                    <th className="py-2 px-3 text-right">Pacotes</th>
                    <th className="py-2 px-3 text-right">Checkout</th>
                    <th className="py-2 px-3 text-right">Compras</th>
                    <th className="py-2 px-3 text-right">Conversão</th>
                    <th className="py-2 pl-3 text-right">Receita</th>
                  </tr>
                </thead>
                <tbody>
                  {canais.map(c => (
                    <tr key={c.canal} className="border-b border-gray-50 last:border-0">
                      <td className="py-2 pr-3 font-medium text-gray-900">
                        {NOME_CANAL[c.canal] || c.canal}
                      </td>
                      <td className="py-2 px-3 text-right">{c.visitas}</td>
                      <td className="py-2 px-3 text-right text-gray-500">{c.ver_pacotes}</td>
                      <td className="py-2 px-3 text-right text-gray-500">{c.checkout}</td>
                      <td className="py-2 px-3 text-right font-semibold">{c.compras}</td>
                      <td className="py-2 px-3 text-right">{pct(c.compras, c.visitas)}</td>
                      <td className="py-2 pl-3 text-right">{brl(Number(c.receita))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Dia a dia ── */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 mb-6">
            <SectionTitle>Dia a dia</SectionTitle>
            <div className="space-y-1.5">
              {dias.map(d => (
                <div key={d.dia} className="flex items-center gap-3 text-sm">
                  <span className="w-12 text-xs text-gray-500 shrink-0">{dataBR(d.dia)}</span>
                  <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                    <div className="h-full bg-primary-400 rounded"
                      style={{ width: `${(d.visitas / maxVisitasDia) * 100}%` }} />
                  </div>
                  <span className="w-14 text-right text-gray-600">{d.visitas}</span>
                  <span className="w-20 text-right text-xs text-gray-500">
                    {d.compras > 0 ? `${d.compras} venda${d.compras > 1 ? 's' : ''}` : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Aparelho ── */}
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <SectionTitle>Aparelho</SectionTitle>
            <div className="flex flex-wrap gap-3">
              {aparelhos.map(a => (
                <div key={a.dispositivo} className="bg-gray-50 rounded-xl p-4 min-w-[160px]">
                  <div className="text-xs text-gray-500 mb-1 capitalize">{a.dispositivo}</div>
                  <div className="text-xl font-semibold text-gray-900">{a.visitas}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {a.compras} compra{a.compras === 1 ? '' : 's'} · {pct(a.compras, a.visitas)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
