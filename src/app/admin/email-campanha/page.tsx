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
type Contagem = {
  pendente: number; enviado: number; erro: number; pulado: number
  pendenteAtivo: number; pendenteFrio: number
}

// Rampa do calendário combinado: 500 (ter) → 1.500 → 3.500 → 7.000 →
// 12.000 (seg) → 14.500. O resto sai depois de 22/09, quando a cota do
// Resend zera.
const RAMPA_SUGERIDA = [500, 1500, 3500, 7000, 12000, 14500]

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
  const [emailTeste, setEmailTeste] = useState('')

  const [form, setForm] = useState({
    nome: 'Summer Mode — disparo geral',
    assunto: 'Summer Mode: ON — treinos a partir de R$ 33,30',
    remetente: 'Just Club & CT <novidades@justclubct.com.br>',
    link: 'https://justclub.com.br/summer-mode?utm_source=email&utm_medium=disparo&utm_campaign=summer_mode',
    campanha: 'summer_mode',
    // Primeiro lote do calendário combinado. Vai pra quem treinou nos últimos
    // dias — caixa viva, reconhece a marca. É o que aquece o domínio novo.
    teto_por_rodada: 500,
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
      const base: Contagem = {
        pendente: 0, enviado: 0, erro: 0, pulado: 0,
        pendenteAtivo: 0, pendenteFrio: 0,
      }
      for (const st of ['pendente', 'enviado', 'erro', 'pulado'] as const) {
        const { count } = await supabase.from('email_disparos')
          .select('id', { count: 'exact', head: true })
          .eq('campanha_id', c.id).eq('status', st)
        base[st] = count || 0
      }
      // Quanto ainda resta da parte "quente" da base (quem já treinou,
      // reservou ou comprou). É o que diz se a próxima rodada ainda está
      // construindo reputação ou já entrou na parte fria.
      const { count: ativos } = await supabase.from('email_disparos')
        .select('id', { count: 'exact', head: true })
        .eq('campanha_id', c.id).eq('status', 'pendente')
        .not('ultima_atividade', 'is', null)
      base.pendenteAtivo = ativos || 0
      base.pendenteFrio = Math.max(0, base.pendente - base.pendenteAtivo)
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

  // A fila vai em lotes de 8 mil: montar os 44 mil de uma vez leva ~21s e a
  // chamada morre no meio, deixando a campanha com a fila vazia. Aqui o
  // navegador repete até acabar e mostra o quanto já entrou.
  async function preparar() {
    setOcupado('preparar'); setMsg(''); setErro('')

    let corpo: any = form
    let total = 0
    let campanhaId = ''

    for (let volta = 0; volta < 40; volta++) {
      const { ok, dados } = await chamar('/api/email-campanha/preparar', corpo)
      if (!ok) {
        setOcupado('')
        setErro(dados?.error || 'Erro ao montar a fila')
        await carregar()
        return
      }
      campanhaId = dados.campanha_id
      total += Number(dados.inseridos) || 0
      setMsg(`Montando a fila... ${total.toLocaleString('pt-BR')} até agora. Nada foi enviado.`)
      if (dados.acabou) break
      corpo = { campanha_id: campanhaId, depois_de: dados.ultimo_ord }
    }

    setOcupado('')
    setMsg(
      `Fila montada com ${total.toLocaleString('pt-BR')} destinatários. ` +
      `NENHUM e-mail saiu ainda — o envio é o passo 2, no card da campanha logo abaixo.`
    )
    // Espera a lista recarregar e leva a tela até ela: o passo 2 fica abaixo
    // da dobra, então sem isso parece que o clique não fez nada.
    await carregar()
    document.getElementById('passo-2')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
    await carregar()
  }

  // Manda um e-mail só, pro endereço digitado. Não encosta na fila.
  async function enviarTeste(id: string) {
    if (!emailTeste.trim()) { setErro('Digite o e-mail que vai receber o teste.'); return }
    setOcupado(`teste-${id}`); setMsg(''); setErro('')
    const { ok, dados } = await chamar('/api/email-campanha/teste', {
      campanha_id: id, email: emailTeste.trim(),
    })
    setOcupado('')
    if (!ok) { setErro(dados?.error || 'Erro ao enviar o teste'); return }
    setMsg(`Teste enviado para ${dados.para}. Ninguém saiu da fila. Confira a caixa de entrada (e o spam).`)
  }

  // Pausar/retomar e mudar o teto passam pela rota: a tabela só tem permissão
  // de leitura, então escrever direto daqui o banco recusa (e em silêncio).
  async function ajustar(
    id: string,
    mudancas: { status?: string; teto_por_rodada?: number; reenfileirar_erros?: boolean }
  ) {
    setMsg(''); setErro('')
    const { ok, dados } = await chamar('/api/email-campanha/ajustar', { campanha_id: id, ...mudancas })
    if (!ok) { setErro(dados?.error || 'Erro ao salvar'); return }
    if (mudancas.teto_por_rodada) setMsg(`Agora vai mandar ${mudancas.teto_por_rodada} por rodada.`)
    if (mudancas.reenfileirar_erros) {
      setMsg(`${Number(dados.reenfileirados).toLocaleString('pt-BR')} pessoas voltaram pra fila.`)
    }
    await carregar()
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
              className="w-full bg-primary-600 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60">
              {ocupado === 'preparar' ? 'Montando a fila...' : 'Passo 1 · Criar campanha e montar a fila'}
            </button>
            <p className="text-xs text-gray-400 leading-relaxed">
              A fila pega todo cliente ativo, com e-mail válido, não bloqueado e que não pediu
              descadastro, e ordena de quem treinou mais recente para o mais antigo.
              <strong className="text-gray-500"> Montar a fila não envia nada.</strong> O envio é o
              passo 2, no card da campanha logo abaixo — e sai em rodadas, uma por clique.
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
      <div id="passo-2" className="bg-white rounded-xl border border-gray-100 p-4 mt-6 scroll-mt-4">
        <SectionTitle>Passo 2 · Campanhas — é aqui que o e-mail sai</SectionTitle>
        {carregando ? <Spinner /> : campanhas.length === 0 ? (
          <p className="text-sm text-gray-500">
            Nenhuma campanha ainda. Crie uma acima e ela aparece aqui, com o botão de enviar
            e o progresso de quantos já saíram.
          </p>
        ) : (
          <div className="space-y-3">
            {campanhas.map(c => {
              const n: Contagem = contagens[c.id] || {
                pendente: 0, enviado: 0, erro: 0, pulado: 0,
                pendenteAtivo: 0, pendenteFrio: 0,
              }
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
                  </div>

                  {/* A fila sai do mais ativo pro mais frio. Enquanto sobrar
                      gente com atividade, os lotes ainda estão construindo
                      reputação. Depois disso, é a parte importada da base —
                      onde mora o bounce e a denúncia de spam. */}
                  {c.status !== 'concluida' && n.pendente > 0 && (
                    n.pendenteAtivo > 0 ? (
                      <Insight variant="green">
                        Ainda faltam <strong>{n.pendenteAtivo.toLocaleString('pt-BR')}</strong> pessoas
                        com treino, reserva ou compra no histórico. São elas que constroem a reputação
                        do domínio — mande para todas antes de encostar no resto.
                      </Insight>
                    ) : (
                      <Insight variant="amber">
                        A partir daqui a fila é só gente <strong>sem nenhuma atividade registrada</strong>
                        {' '}({n.pendenteFrio.toLocaleString('pt-BR')} pessoas). É a parte que gera bounce e
                        denúncia de spam. Confira o bounce no Resend antes de continuar, e suba o teto devagar.
                      </Insight>
                    )
                  )}

                  {/* Teste: um e-mail só, pro endereço digitado. A prévia ao
                      lado é um iframe; Gmail e Outlook renderizam diferente, e
                      é lá que aparece fonte trocada ou botão que não clica. */}
                  {c.status !== 'concluida' && (
                    <div className="flex items-end gap-2 flex-wrap mb-3 pb-3 border-b border-gray-100">
                      <div className="flex-1 min-w-[220px]">
                        <label className="text-xs text-gray-500 block mb-1">
                          Enviar um teste antes — não gasta ninguém da fila
                        </label>
                        <input
                          type="email" value={emailTeste} placeholder="seu@email.com"
                          onChange={e => setEmailTeste(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
                        />
                      </div>
                      <button onClick={() => enviarTeste(c.id)} disabled={ocupado === `teste-${c.id}`}
                        className="border border-gray-300 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
                        {ocupado === `teste-${c.id}` ? 'Enviando...' : 'Enviar e-mail de teste'}
                      </button>
                    </div>
                  )}

                  {c.status !== 'concluida' && (
                    <div className="flex items-end gap-2 flex-wrap mb-3 pb-3 border-b border-gray-100">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Enviar por rodada</label>
                        <input
                          type="number" min={1} max={20000}
                          defaultValue={c.teto_por_rodada}
                          onBlur={e => {
                            const v = Number(e.target.value)
                            if (v && v !== c.teto_por_rodada) ajustar(c.id, { teto_por_rodada: v })
                          }}
                          className="w-28 border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
                        />
                      </div>
                      <div className="flex gap-1.5 pb-0.5">
                        {RAMPA_SUGERIDA.map(v => (
                          <button key={v} onClick={() => ajustar(c.id, { teto_por_rodada: v })}
                            className={`rounded-lg px-2.5 py-1.5 text-xs border ${
                              c.teto_por_rodada === v
                                ? 'border-primary-400 bg-primary-50 text-primary-800 font-semibold'
                                : 'border-gray-200 text-gray-500'
                            }`}>
                            {v.toLocaleString('pt-BR')}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 flex-wrap">
                    {c.status !== 'concluida' && (
                      <button onClick={() => enviarRodada(c.id)} disabled={ocupado === c.id || c.status === 'pausada'}
                        className="bg-primary-600 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
                        {ocupado === c.id
                          ? 'Enviando...'
                          : `Enviar ${Math.min(c.teto_por_rodada, n.pendente).toLocaleString('pt-BR')} agora`}
                      </button>
                    )}
                    {c.status === 'pausada' ? (
                      <button onClick={() => ajustar(c.id, { status: 'enviando' })}
                        className="border border-gray-200 rounded-lg px-4 py-2 text-sm">Retomar</button>
                    ) : c.status !== 'concluida' && (
                      <button onClick={() => ajustar(c.id, { status: 'pausada' })}
                        className="border border-gray-200 rounded-lg px-4 py-2 text-sm">Pausar</button>
                    )}
                    {n.erro > 0 && (
                      <button onClick={() => ajustar(c.id, { reenfileirar_erros: true })}
                        className="border border-danger-200 text-danger-600 rounded-lg px-4 py-2 text-sm">
                        Devolver {n.erro.toLocaleString('pt-BR')} com erro pra fila
                      </button>
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
