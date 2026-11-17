'use client'
// Acerto mensal da Ju — tela EXCLUSIVA do Ricardo (17/11/2026).
// A conta e a regra do acordo vivem na RPC acerto_ju, que só responde ao login
// dele; aqui é só exibição. Só cálculo: não lança despesa nem conta a pagar.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'
import { DONO_USER_ID } from '@/lib/dono'
import { AlertTriangle } from 'lucide-react'

const supabase = createClient()

type Linha = { unidade: string; wellhub: number; totalpass: number }
type Acerto = {
  competencia: string
  linhas: Linha[]
  faturamento: number
  percentual: number
  comissao: number
  fixo_por_unidade: number
  unidades: number
  fixo: number
  total: number
  faltando: string[]
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function fmtBRL(v: number): string {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function AcertoJuPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const ehDono = user?.id === DONO_USER_ID

  // Padrão: mês anterior (o acerto do dia 15 é sempre sobre o mês passado).
  const agora = new Date()
  const mesPadrao = agora.getMonth() === 0 ? 12 : agora.getMonth()
  const anoPadrao = agora.getMonth() === 0 ? agora.getFullYear() - 1 : agora.getFullYear()
  const [mes, setMes] = useState(mesPadrao)
  const [ano, setAno] = useState(anoPadrao)

  const [dados, setDados] = useState<Acerto | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (!ehDono) {
      router.replace('/admin/dashboard')
      return
    }
    let cancelado = false
    setCarregando(true)
    setErro(null)
    supabase
      .rpc('acerto_ju', { p_competencia: `${ano}-${String(mes).padStart(2, '0')}-01` })
      .then(({ data, error }) => {
        if (cancelado) return
        if (error) {
          setDados(null)
          setErro('Não foi possível carregar o acerto.')
        } else {
          setDados(data as Acerto)
        }
        setCarregando(false)
      })
    return () => { cancelado = true }
  }, [authLoading, ehDono, mes, ano, router])

  if (authLoading || !ehDono) return null

  const anoAtual = agora.getFullYear()
  const anos = [anoAtual - 1, anoAtual]
  // Pagamento: dia 15 do mês seguinte à competência.
  const mesPagto = mes === 12 ? 1 : mes + 1
  const anoPagto = mes === 12 ? ano + 1 : ano

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Financeiro Coordenação</h1>
        <p className="text-sm text-gray-500">
          2% do faturamento dos apps (Wellhub + TotalPass) + R$ 1.000 por unidade
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Faturamento de</label>
          <select
            value={mes}
            onChange={(e) => setMes(Number(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
          >
            {MESES.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Ano</label>
          <select
            value={ano}
            onChange={(e) => setAno(Number(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
          >
            {anos.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div className="text-sm text-gray-500 pb-2">
          Acerto em 15/{String(mesPagto).padStart(2, '0')}/{anoPagto}
        </div>
      </div>

      {carregando && <div className="text-sm text-gray-500">Carregando…</div>}
      {erro && <div className="text-sm text-red-600">{erro}</div>}

      {!carregando && dados && (
        <>
          {dados.faltando.length > 0 && (
            <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
              <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Mês incompleto — o total abaixo ainda não é o valor final.</div>
                <div className="mt-1">Falta lançar em Receitas: {dados.faltando.join(', ')}.</div>
              </div>
            </div>
          )}

          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <th className="text-left font-medium px-4 py-3">Unidade</th>
                  <th className="text-right font-medium px-4 py-3">Wellhub</th>
                  <th className="text-right font-medium px-4 py-3">TotalPass</th>
                  <th className="text-right font-medium px-4 py-3">Total</th>
                </tr>
              </thead>
              <tbody>
                {dados.linhas.map((l) => (
                  <tr key={l.unidade} className="border-t border-gray-100">
                    <td className="px-4 py-3 text-gray-900">{l.unidade}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtBRL(l.wellhub)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtBRL(l.totalpass)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {fmtBRL(Number(l.wellhub) + Number(l.totalpass))}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
                  <td className="px-4 py-3" colSpan={3}>Faturamento dos apps</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtBRL(dados.faturamento)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="bg-white border border-gray-100 rounded-xl p-5 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">
                {(dados.percentual * 100).toLocaleString('pt-BR')}% de {fmtBRL(dados.faturamento)}
              </span>
              <span className="tabular-nums">{fmtBRL(dados.comissao)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">
                Fixo — {dados.unidades} unidades × {fmtBRL(dados.fixo_por_unidade)}
              </span>
              <span className="tabular-nums">{fmtBRL(dados.fixo)}</span>
            </div>
            <div className="flex justify-between items-baseline border-t border-gray-100 pt-3 mt-1">
              <span className="font-semibold text-gray-900">Total a pagar</span>
              <span className="text-2xl font-bold text-gray-900 tabular-nums">{fmtBRL(dados.total)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
