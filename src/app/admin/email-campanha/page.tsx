'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PageHeader, Spinner, Insight, SectionTitle, Badge } from '@/components/ui'
import { htmlEmailCampanha } from '@/lib/email/campanha'

// ─────────────────────────────────────────────────────────────────────────────
// Disparo de e-mail de campanha
//
// Fluxo, de propósito em duas etapas: primeiro monta a fila (e você vê quantas
// pessoas são), depois manda rodada por rodada. Nada sai sozinho.
//
// O teto por rodada é a rampa de aquecimento. Subdomínio recém-criado não tem
// reputação: mandar 44 mil no primeiro dia é pedir pra ser bloqueado. Começa
// baixo, olha o resultado, e vai subindo.
// ─────────────────────────────────────────────────────────────────────────────

type Campanha = {
  id: string; nome: string; assunto: string; remetente: string; link: string
  status: string; teto_por_rodada: number; criado_em: string; campanha: string | null
}
type Contagem = { pendente: number; enviado: number; erro: number; pulado: number }

const RAMPA_SUGERIDA = [200, 500, 1500, 4000, 10000]

export default function EmailCampanhaPage() {
  const { perfil, loading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [campanhas, setCampanhas] = useState<Campanha[]>([])
  const [contagens, setContagens] = useState<Record<string, Contagem>>({})
  const [carregando, setCarregando] = useState(true)
  const [ocupado, setOcupado] = useState('')
  const [msg, setMsg] = useState('')
  const [erro, setErro] = useState('')

  const [form, setForm] = useState({
    nome: 'Summer Mode — disparo geral',
    assunto: 'Summer Mode: ON — treinos a partir de R$ 33,30',
    remetente: 'Just Club & CT <novidades@news.justct.com.br>',
    link: 'https://justclub.com.br/summer-mode?utm_source=email&utm_medium=disparo&utm_campaign=summer_mode',
    campanha: 'summer_mode',
    teto_por_rodada: 200,
  })

  useEffect(() => {
    if (!loading && perfil?.role !== 'admin') router.push('/')
  }, [perfil, loading])

  useEffect(() => { if (perfil) carregar() }, [perfil])

  async function token(): Promise<string> {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token || ''
  }

  async function carregar() {
    setCarregando(true)
    const { data: camps } = await supabase
      .from('email_campanhas').select('*').order('criado_em', { ascending: false }).limit(20)
    setCampanhas(camps || [])

    const cont: Record<string, Contagem> = {}
    for (const c of (camps || [])) {
      const base: Contagem = { pendente: 0, enviado: 0, erro: 0, pulado: 0 }
      for (const st of ['pendente', 'enviado', 'erro', 'pulado'] as const) {
        const { count } = await supabase.from('email_disparos')
          .select('id', { count: 'exact', head: true })
          .eq('campanha_id', c.id).eq('status', st)
        base[st] = count || 0
      }
      cont[c.id] = base
    }
    setContagens(cont)
    setCarregando(false)
  }

  async function chamar(rota: string, corpo: any): Promise<any> {
    const res = await fetch(rota, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
      body: JSON.stringify(corpo),
    })
    return { ok: res.ok, dados: await res.json() }
  }

  async function preparar() {
    setOcupado('preparar'); setMsg(''); setErro('')
    const { ok, dados } = await chamar('/api/email-campanha/preparar', form)
    setOcupado('')
    if (!ok) { setErro(dados?.error || 'Erro ao preparar'); return }
    setMsg(`Fila montada: ${dados.destinatarios} destinatários. Nenhum e-mail saiu ainda.`)
    carregar()
  }

  async function enviarRodada(id: string) {
    setOcupado(id); setMsg(''); setErro('')
    const { ok, dados } = await chamar('/api/email-campanha/enviar', { campanha_id: id })
    setOcupado('')
    if (!ok) { setErro(dados?.error || 'Erro ao enviar'); return }
    setMsg(
      dados.concluida
        ? 'Campanha concluída: não há mais ninguém na fila.'
        : `Rodada enviada: ${dados.enviados} e-mails${dados.erros ? `, ${dados.erros} com erro` : ''}. Faltam ${dados.restantes}.`
    )
    carregar()
  }

  async function mudarStatus(id: string, status: string) {
    await supabase.from('email_campanhas').update({ status }).eq('id', id)
    carregar()
  }

  const previa = htmlEmailCampanha({
    link: form.link,
    linkDescadastro: '#',
    nome: 'Ricardo',
  })

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Disparo de e-mail"
        subtitle="Monta a fila, confere o tamanho e manda em rodadas. Nada sai sozinho."
      />

      <Insight variant="amber">
        <strong>Antes do primeiro disparo:</strong> o subdomínio do remetente precisa estar
        verificado no Resend, com os DNS apontados. Se não estiver, o Resend recusa o envio.
        E vá subindo o teto aos poucos — sugestão de rampa: {RAMPA_SUGERIDA.join(' → ')}.
      </Insight>

      {msg  && <Insight variant="green">{msg}</Insight>}
      {erro && <Insight variant="red">{erro}</Insight>}

      <div className="grid md:grid-cols-2 gap-6 mt-6">
        {/* ── Nova campanha ── */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <SectionTitle>Nova campanha</SectionTitle>
          <div className="space-y-3">
            {([
              ['nome', 'Nome interno'],
              ['assunto', 'Assunto do e-mail'],
              ['remetente', 'Remetente'],
              ['link', 'Link de destino (com utm)'],
              ['campanha', 'Campanha (liga com o relatório de funil)'],
            ] as const).map(([campo, rotulo]) => (
              <div key={campo}>
                <label className="text-xs text-gray-500 block mb-1">{rotulo}</label>
                <input
                  value={(form as any)[campo]}
                  onChange={e => setForm({ ...form, [campo]: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            ))}
            <div>
              <label className="text-xs text-gray-500 block mb-1">E-mails por rodada</label>
              <input
                type="number" min={1} max={5000} value={form.teto_por_rodada}
                onChange={e => setForm({ ...form, teto_por_rodada: Number(e.target.value) })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <button onClick={preparar} disabled={ocupado === 'preparar'}
              className="w-full bg-primary-500 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60">
              {ocupado === 'preparar' ? 'Montando a fila...' : 'Criar campanha e montar a fila'}
            </button>
            <p className="text-xs text-gray-400 leading-relaxed">
              A fila pega todo cliente ativo, com e-mail válido, não bloqueado e que não pediu
              descadastro. Montar a fila não envia nada.
            </p>
          </div>
        </div>

        {/* ── Prévia da arte ── */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <SectionTitle>Prévia da arte</SectionTitle>
          <iframe
            title="Prévia do e-mail"
            srcDoc={previa}
            className="w-full rounded-lg border border-gray-100"
            style={{ height: 620, background: '#080808' }}
          />
        </div>
      </div>

      {/* ── Campanhas ── */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 mt-6">
        <SectionTitle>Campanhas</SectionTitle>
        {carregando ? <Spinner /> : campanhas.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma campanha criada ainda.</p>
        ) : (
          <div className="space-y-3">
            {campanhas.map(c => {
              const n = contagens[c.id] || { pendente: 0, enviado: 0, erro: 0, pulado: 0 }
              const total = n.pendente + n.enviado + n.erro + n.pulado
              const pct = total ? Math.round((n.enviado / total) * 100) : 0
              return (
                <div key={c.id} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                    <div>
                      <div className="font-medium text-gray-900">{c.nome}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{c.assunto}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{c.remetente}</div>
                    </div>
                    <Badge variant={
                      c.status === 'concluida' ? 'green'
                      : c.status === 'enviando' ? 'blue'
                      : c.status === 'pausada' ? 'amber' : 'gray'
                    }>{c.status}</Badge>
                  </div>

                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-primary-400 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-xs text-gray-500 mb-3">
                    {n.enviado} enviados · {n.pendente} na fila
                    {n.erro > 0 && <> · <span className="text-danger-600">{n.erro} com erro</span></>}
                    {n.pulado > 0 && <> · {n.pulado} descadastrados</>}
                    {' '}· {c.teto_por_rodada} por rodada
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    {c.status !== 'concluida' && (
                      <button onClick={() => enviarRodada(c.id)} disabled={ocupado === c.id || c.status === 'pausada'}
                        className="bg-primary-500 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
                        {ocupado === c.id ? 'Enviando...' : 'Enviar uma rodada'}
                      </button>
                    )}
                    {c.status === 'pausada' ? (
                      <button onClick={() => mudarStatus(c.id, 'enviando')}
                        className="border border-gray-200 rounded-lg px-4 py-2 text-sm">Retomar</button>
                    ) : c.status !== 'concluida' && (
                      <button onClick={() => mudarStatus(c.id, 'pausada')}
                        className="border border-gray-200 rounded-lg px-4 py-2 text-sm">Pausar</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
