'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'

const ACCENT = '#ff2d9b'

const CONTRATO_AGREGADORES = `JUST CT
TERMO DE ADESÃO — WELLHUB / TOTALPASS

Pelo presente Termo, o cliente adere aos serviços da Just CT nas condições abaixo descritas.

1. SERVIÇOS
O objeto do presente contrato é a prestação de serviços para a prática de atividades físicas, com coordenação e supervisão dos profissionais da Just CT, de acordo com as condições ofertadas e contratadas por intermédio do Wellhub ou TotalPass.

1.1 Sem prévio aviso, o horário de funcionamento e o quadro de atividades oferecidas pela Just CT poderão sofrer alterações operacionais, sem que isso configure falha na prestação dos serviços.

1.2 As modalidades e atividades disponíveis podem ser modificadas a critério exclusivo da Just CT, respeitando as condições contratadas via Wellhub.

2. RESPONSABILIDADES SOBRE O PLANO WELLHUB / TOTALPASS
A Just CT não possui qualquer controle sobre a contratação, pagamento, validação de acesso e/ou cancelamento dos planos contratados por meio do Wellhub ou TotalPass. Todas as dúvidas e/ou solicitações referentes à contratação, pagamento, acesso ou cancelamento do plano devem ser tratadas diretamente com o Wellhub ou TotalPass, conforme o aplicativo utilizado.

2.1 É responsabilidade exclusiva do cliente verificar junto ao Wellhub ou TotalPass se possui direito de acesso à Just CT e quais condições se aplicam ao seu plano.

2.2 Caso o cliente fique 30 (trinta) dias consecutivos sem realizar check-in válido pelo Wellhub ou TotalPass em qualquer unidade da Just CT, deverá, como condição para retomar o uso, assinar novo Termo de Adesão conforme as condições vigentes à época.

3. DECLARAÇÃO DE SAÚDE
O cliente deverá responder e assinar o PAR-Q (Questionário de Aptidão para Atividade Física) e o Termo de Responsabilidade para Prática de Atividade Física, e/ou apresentar atestado médico específico para a(s) atividade(s) contratada(s), renovando-o(s) anualmente ou na periodicidade determinada pela legislação vigente.

3.1 O não cumprimento desta cláusula poderá resultar na impossibilidade de acesso à academia e/ou à prática de atividades físicas, por razões de segurança e exigência legal.

4. EMERGÊNCIA E REMOÇÃO
Em caso de emergência ou urgência, o cliente autoriza desde já o seu encaminhamento aos serviços médicos ou hospitalares mais próximos. A Just CT fica isenta de qualquer responsabilidade quanto ao atendimento hospitalar ou clínico decorrente.

5. CONDUTA INADEQUADA E USO DOS EQUIPAMENTOS
A Just CT reserva-se o direito de não permitir o ingresso em suas instalações, de imediato e sem prejuízo de eventuais perdas e danos, de qualquer cliente que tenha praticado ou pratique condutas incompatíveis com o ambiente de uma academia, contrárias à moral e aos bons costumes, ou que desrespeite os termos do presente instrumento e/ou as normas internas da academia.

5.1 É obrigatório o uso adequado de todos os equipamentos e materiais disponíveis na academia. São expressamente proibidas condutas como: bater ou arremessar máquinas e equipamentos, jogar pesos ou anilhas no chão, e deixar de guardar e organizar os pesos e acessórios após o uso.

5.2 O descumprimento das normas de uso dos equipamentos descritas na cláusula 5.1 sujeitará o cliente às seguintes sanções, aplicadas de forma progressiva: (i) advertência formal, registrada pela equipe da Just CT; (ii) em caso de reincidência ou infração grave, rescisão imediata do contrato e proibição permanente de acesso às instalações da Just CT, independentemente de qualquer aviso adicional.

5.3 A Just CT reserva-se o direito de aplicar a rescisão contratual e a proibição de acesso de forma imediata, sem necessidade de advertência prévia, nos casos em que a conduta do cliente coloque em risco a integridade física de outros clientes, funcionários ou dos próprios equipamentos.

6. TRAJES E USO DAS INSTALAÇÕES
Para a prática de atividades físicas, é obrigatório o uso de trajes esportivos adequados. O uso de calçados esportivos e camiseta é obrigatório em todas as áreas da academia, sendo terminantemente proibido treinar descalço ou sem camiseta em qualquer ambiente das instalações da Just CT.

6.1 É terminantemente proibido o ingresso de pessoas portando armas de fogo nas instalações da Just CT.

7. RESPONSABILIDADE POR OBJETOS PESSOAIS
A Just CT não se responsabiliza pela supervisão e/ou guarda de pertences ou objetos deixados ou perdidos em suas dependências. Quando disponibilizados armários rotativos, o cliente é o único responsável por mantê-los devidamente trancados e por esvaziá-los ao término de cada utilização.

7.1 Objetos não identificados e/ou não retirados pelos seus proprietários serão mantidos pela Just CT por 60 (sessenta) dias. Após esse prazo, o cliente desde já concorda com a destinação ou doação dos itens.

8. MULTA POR NO-SHOW — RESERVA DE POSIÇÕES E HORÁRIOS
Para as modalidades e aulas que exigem pré-reserva de posição ou horário, o não comparecimento do cliente na atividade reservada — e a consequente ausência de check-in válido pelo Wellhub — caracteriza no-show, sujeitando o cliente ao pagamento de multa no valor de R$ 99,00 (noventa e nove reais).

8.1 A multa de no-show será cobrada independentemente do motivo da ausência, salvo nos casos em que o cancelamento da reserva tenha sido realizado pelo cliente dentro do prazo mínimo informado no momento da reserva.

8.2 O valor da multa será cobrado exclusivamente pela Just CT, e sua inadimplência poderá acarretar a suspensão do acesso às atividades com pré-reserva.

8.3 A Just CT reserva-se o direito de revisar o valor da multa de no-show, mediante comunicação prévia aos clientes.

9. SERVIÇO COACH CT
O Coach CT é uma modalidade exclusiva da Just CT, com treinos elaborados e supervisionados pela Coordenadora Juliana Hitomi. Os treinos abrangem todos os grupos musculares e são renovados mensalmente, sendo aplicados pelos coaches disponíveis no Studio.

9.1 Os treinos do Coach CT não são personalizados de forma individual. O cliente não possui direito de recusar a execução de exercícios, substituir máquinas, alterar séries, repetições ou qualquer outro parâmetro do treino elaborado pela coordenação. O programa deve ser seguido integralmente conforme passado pelo coach responsável na aula.

9.2 Caso o cliente insista reiteradamente em modificar os exercícios, questionar a metodologia ou descumprir as orientações do coach durante a aula, fica a critério exclusivo da Just CT encerrar a sessão imediatamente e bloquear o acesso do cliente ao serviço Coach CT, sem direito a reembolso ou compensação.

9.3 Clientes que utilizam aplicativos parceiros (TotalPass, Wellhub ou similares) são obrigados a realizar o check-in pelo respectivo aplicativo no momento da chegada ao Studio, obrigatoriamente na modalidade correta — treino com personal. É de responsabilidade exclusiva do cliente selecionar a modalidade adequada no ato do check-in.

9.3.1 Caso o check-in seja validado em modalidade diferente da correta, a diferença de valor correspondente ao treino Coach CT será cobrada obrigatoriamente no balcão da Just CT antes do início da aula, a título de compensação pelo serviço prestado.

9.3.2 Fica expressamente proibido ao cliente realizar o treino com o coach sem que o check-in tenha sido efetuado corretamente na modalidade personal. O descumprimento desta regra impedirá o acesso à sessão e poderá ensejar a aplicação da multa de no-show prevista na cláusula 8.

9.4 O agendamento pelo aplicativo parceiro não é vinculado à validação do plano contratado para a modalidade Coach CT. É responsabilidade exclusiva do cliente verificar, antes de realizar o agendamento, se o seu plano contempla o acesso ao Coach CT.

9.5 Limites mensais de acesso ao Coach CT por aplicativo parceiro: (i) clientes TotalPass: plano mínimo TP6, com direito a até 10 (dez) treinos por mês mediante check-in; (ii) clientes Wellhub: até 8 (oito) treinos por mês mediante check-in. O cliente que desejar realizar treinos além do limite do seu plano poderá adquirir treinos avulsos do Coach CT diretamente com a Just CT.

9.6 O cliente não poderá escolher o coach no momento do agendamento. A escolha somente poderá ocorrer na chegada ao Studio, quando a recepção informará os coaches disponíveis para aquela sessão. Caso o cliente não deseje realizar o treino com os coaches disponíveis por motivo pessoal, deverá optar pelo check-in na modalidade personal ou arcar com a multa de no-show no valor de R$ 99,00 (noventa e nove reais), conforme cláusula 8.

9.7 O cancelamento de reservas do Coach CT deve ser realizado com antecedência mínima de 12 (doze) horas em relação ao horário agendado. Após esse prazo, não será possível cancelar a reserva, e o não comparecimento será tratado como no-show, sujeitando o cliente à multa prevista na cláusula 8.

9.8 Em hipótese alguma o cliente poderá realizar o treino do Coach CT em horário ou dia diferente do previamente agendado. Não haverá reposição de aulas, transferência de horário ou aproveitamento da sessão em data distinta da reserva original.

10. DISPOSIÇÕES GERAIS
10.1 É vedado ao cliente prescrever ou supervisionar o treino de outros clientes nas dependências da academia.
10.2 É vedado ao cliente comercializar produtos ou serviços nas dependências da academia.
10.3 A tolerância ou o não exercício, pela Just CT, de quaisquer direitos assegurados neste Termo ou em lei, não importará em novação ou renúncia a tais direitos.

11. PRIVACIDADE E DADOS PESSOAIS
A Just CT respeita a privacidade de seus clientes. Ao aderir aos nossos serviços, o cliente autoriza o recebimento de comunicações e materiais promocionais. O cliente poderá, a qualquer momento, solicitar a exclusão de suas informações de nossas listas de comunicação por meio dos nossos canais de atendimento.

11.1 O cliente autoriza o tratamento de sua fotografia e/ou biometria, para finalidade exclusiva de identificação individual, bem como de dados de saúde necessários para realização de avaliações e prescrições de atividade física.`

export default function MeusPlanosPage() {
  const { perfil, loading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [cliente, setCliente] = useState<any>(null)
  const [planosDisponiveis, setPlanosDisponiveis] = useState<any[]>([])
  const [clientePlanos, setClientePlanos] = useState<any[]>([])
  const [loadingData, setLoadingData] = useState(true)

  const [modalPlano, setModalPlano] = useState<any>(null)
  const [nomeAceite, setNomeAceite] = useState('')
  const [aceiteCheck, setAceiteCheck] = useState(false)
  const [ativando, setAtivando] = useState(false)
  const [erroAtivacao, setErroAtivacao] = useState('')

  const agora = new Date()
  const mesAtual = agora.getMonth() + 1
  const anoAtual = agora.getFullYear()

  useEffect(() => {
    if (!loading && !perfil) router.push('/')
    if (!loading && perfil && !['cliente'].includes(perfil.role as string)) router.push('/equipe')
  }, [perfil, loading])

  useEffect(() => {
    if (perfil) loadDados()
  }, [perfil])

  async function loadDados() {
    const { data: cli } = await supabase
      .from('clientes')
      .select('*')
      .eq('user_id', perfil!.id)
      .maybeSingle()
    setCliente(cli)

    if (cli) {
      const [{ data: planos }, { data: cliPlanos }] = await Promise.all([
        supabase.from('planos_disponiveis')
          .select('*, unidades(nome, slug)')
          .eq('ativo', true)
          .neq('tipo', 'avulso')
          .order('nome'),
        supabase.from('cliente_planos')
          .select('*, planos_disponiveis(id, nome, tipo, unidade_id, creditos_mes, unidades(nome))')
          .eq('cliente_id', cli.id)
          .eq('ativo', true),
      ])

      setPlanosDisponiveis(planos || [])
      setClientePlanos(cliPlanos || [])
    }
    setLoadingData(false)
  }

  function planoJaAtivo(planoId: string) {
    return clientePlanos.some(cp => cp.planos_disponiveis?.id === planoId)
  }

  function abrirModalPlano(plano: any) {
    setModalPlano(plano)
    setNomeAceite('')
    setAceiteCheck(false)
    setErroAtivacao('')
  }

  async function ativarPlano() {
    if (!aceiteCheck) { setErroAtivacao('Você precisa aceitar os termos para continuar.'); return }
    if (!nomeAceite.trim()) { setErroAtivacao('Digite seu nome completo para confirmar o aceite.'); return }
    if (nomeAceite.trim().split(' ').length < 2) { setErroAtivacao('Digite seu nome completo (nome e sobrenome).'); return }
    if (!modalPlano || !cliente) return

    setAtivando(true)
    setErroAtivacao('')

    const { data: existente } = await supabase
      .from('cliente_planos')
      .select('id')
      .eq('cliente_id', cliente.id)
      .eq('plano_id', modalPlano.id)
      .maybeSingle()

    let erroPlano = null

    if (existente) {
      const { error } = await supabase
        .from('cliente_planos')
        .update({
          ativo: true,
          contrato_aceito_em: new Date().toISOString(),
          inicio: new Date().toISOString().split('T')[0],
        })
        .eq('id', existente.id)
      erroPlano = error
    } else {
      const { error } = await supabase
        .from('cliente_planos')
        .insert({
          cliente_id: cliente.id,
          plano_id: modalPlano.id,
          ativo: true,
          contrato_aceito_em: new Date().toISOString(),
          inicio: new Date().toISOString().split('T')[0],
        })
      erroPlano = error
    }

    if (erroPlano) {
      setErroAtivacao('Erro ao ativar plano. Tente novamente.')
      setAtivando(false)
      return
    }

    await supabase.rpc('gerar_creditos_mes', {
      p_mes: mesAtual,
      p_ano: anoAtual,
      p_dias_inatividade: 60,
    })

    setModalPlano(null)
    setAtivando(false)
    await loadDados()
  }

  async function sair() {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading || loadingData) return (
    <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: `4px solid ${ACCENT}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  const planosWellhub = planosDisponiveis.filter(p => p.tipo === 'wellhub')
  const planosTotalPass = planosDisponiveis.filter(p => p.tipo === 'totalpass')

  return (
    <div style={{ minHeight: '100vh', background: '#080808', fontFamily: "'DM Sans', sans-serif", color: '#f0f0f0' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .plano-card:hover { border-color: ${ACCENT} !important; }
        .nav-link-cliente:hover { color: ${ACCENT} !important; }
        @media (max-width: 640px) {
          .header-nav-r { gap: 0.5rem !important; }
          .header-nav-r .link-init { display: none !important; }
        }
      `}</style>

      {/* Header */}
      <div style={{ background: '#08080895', backdropFilter: 'blur(16px)', borderBottom: '1px solid #1a1a1a', padding: '0 1.5rem', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
        <div onClick={() => router.push('/')} style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: '#fff', letterSpacing: 2, cursor: 'pointer' }}>
          JUST<span style={{ color: ACCENT }}>CT</span>
        </div>
        <div className="header-nav-r" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <span onClick={() => router.push('/')} className="nav-link-cliente link-init"
            style={{ fontSize: 13, color: '#888', cursor: 'pointer', transition: 'color .2s' }}>
            Início
          </span>
          <span onClick={() => router.push('/minha-conta')} className="nav-link-cliente"
            style={{ fontSize: 13, color: '#888', cursor: 'pointer', transition: 'color .2s' }}>
            Minha conta
          </span>
          <span style={{ fontSize: 13, color: '#aaa', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT }} />
            {perfil?.nome?.split(' ')[0]}
          </span>
          <button onClick={sair} style={{ background: 'transparent', border: '1px solid #444', borderRadius: 8, padding: '0.4rem 1rem', color: '#bbb', fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
            Sair
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '2rem 1.5rem' }}>

        {/* Título */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: '#fff', letterSpacing: 1 }}>
            MEUS PLANOS
          </div>
          <div style={{ fontSize: 14, color: '#aaa', marginTop: 4 }}>
            Gerencie seus planos ativos e ative novos
          </div>
        </div>

        {/* ===== PLANOS ATIVOS ===== */}
        {clientePlanos.length > 0 && (
          <div style={{ marginBottom: '2.5rem' }}>
            <div style={{ fontSize: 11, color: '#aaff88', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' as const, marginBottom: '1rem' }}>
              ✅ Planos ativos
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {clientePlanos.map(cp => {
                const plano = cp.planos_disponiveis
                if (!plano) return null
                const corAgregador = plano.tipo === 'wellhub' ? '#9b59b6' : '#2980b9'
                const icone = plano.tipo === 'wellhub' ? '💜' : '🔵'
                return (
                  <div key={cp.id} style={{ background: '#0a0a0a', border: `1.5px solid ${corAgregador}`, borderRadius: 12, padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ fontSize: 22 }}>{icone}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{plano.nome}</div>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                        {plano.unidades?.nome} · {plano.creditos_mes} sessões por mês
                      </div>
                      {cp.contrato_aceito_em && (
                        <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>
                          Ativo desde {new Date(cp.contrato_aceito_em).toLocaleDateString('pt-BR')}
                        </div>
                      )}
                    </div>
                    <div style={{ background: corAgregador + '22', border: `1px solid ${corAgregador}`, borderRadius: 8, padding: '0.3rem 0.85rem', fontSize: 12, color: corAgregador === '#9b59b6' ? '#c77dff' : '#5dade2', fontWeight: 600, flexShrink: 0 }}>
                      ✓ Ativo
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ===== ATIVAR NOVOS PLANOS ===== */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ fontSize: 11, color: '#aaa', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' as const, marginBottom: '1rem' }}>
            {clientePlanos.length > 0 ? 'Ativar outros planos' : 'Planos disponíveis'}
          </div>

          <div style={{ background: '#0d0010', border: `1px solid ${ACCENT}33`, borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '1.5rem', fontSize: 13, color: '#bbb', lineHeight: 1.7 }}>
            Tem o app <strong style={{ color: '#fff' }}>Wellhub</strong> ou <strong style={{ color: '#fff' }}>TotalPass</strong>? Ative seu plano aqui e libere suas sessões Coach CT incluídas. Você pode ter planos em mais de uma unidade.
          </div>

          {/* Wellhub */}
          {planosWellhub.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 18 }}>💜</span>
                <span style={{ fontSize: 14, color: '#c77dff', fontWeight: 700 }}>Wellhub</span>
                <span style={{ fontSize: 11, color: '#555' }}>· até 8 sessões/mês</span>
              </div>
              {planosWellhub.map(plano => {
                const ativo = planoJaAtivo(plano.id)
                if (ativo) return null
                return (
                  <div key={plano.id} className="plano-card"
                    style={{ background: '#111', border: '1.5px solid #2a2a2a', borderRadius: 12, padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: 8, transition: 'border-color .2s' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{plano.nome}</div>
                      <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>
                        {plano.unidades?.nome} · {plano.creditos_mes} sessões/mês
                      </div>
                    </div>
                    <button onClick={() => abrirModalPlano(plano)}
                      style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: 8, padding: '0.45rem 1.1rem', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}>
                      Ativar
                    </button>
                  </div>
                )
              })}
              {planosWellhub.every(p => planoJaAtivo(p.id)) && (
                <div style={{ background: '#0a0a0a', border: '1px dashed #333', borderRadius: 12, padding: '0.85rem 1rem', fontSize: 12, color: '#555', textAlign: 'center' }}>
                  Você já ativou todos os planos Wellhub disponíveis
                </div>
              )}
            </div>
          )}

          {/* TotalPass */}
          {planosTotalPass.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 18 }}>🔵</span>
                <span style={{ fontSize: 14, color: '#5dade2', fontWeight: 700 }}>TotalPass</span>
                <span style={{ fontSize: 11, color: '#555' }}>· até 10 sessões/mês</span>
              </div>
              {planosTotalPass.map(plano => {
                const ativo = planoJaAtivo(plano.id)
                if (ativo) return null
                return (
                  <div key={plano.id} className="plano-card"
                    style={{ background: '#111', border: '1.5px solid #2a2a2a', borderRadius: 12, padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: 8, transition: 'border-color .2s' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{plano.nome}</div>
                      <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>
                        {plano.unidades?.nome} · {plano.creditos_mes} sessões/mês
                      </div>
                    </div>
                    <button onClick={() => abrirModalPlano(plano)}
                      style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: 8, padding: '0.45rem 1.1rem', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}>
                      Ativar
                    </button>
                  </div>
                )
              })}
              {planosTotalPass.every(p => planoJaAtivo(p.id)) && (
                <div style={{ background: '#0a0a0a', border: '1px dashed #333', borderRadius: 12, padding: '0.85rem 1rem', fontSize: 12, color: '#555', textAlign: 'center' }}>
                  Você já ativou todos os planos TotalPass disponíveis
                </div>
              )}
            </div>
          )}

          {planosDisponiveis.length === 0 && (
            <div style={{ background: '#111', border: '1px solid #333', borderRadius: 12, padding: '1.5rem', textAlign: 'center', color: '#555', fontSize: 13 }}>
              Nenhum plano disponível no momento.
            </div>
          )}
        </div>
      </div>

      {/* ===== MODAL ATIVAR PLANO ===== */}
      {modalPlano && (
        <div style={{ position: 'fixed', inset: 0, background: '#000000dd', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: 20, width: '100%', maxWidth: 520, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '1.5rem 1.5rem 1rem', borderBottom: '1px solid #222' }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#fff', letterSpacing: 1 }}>ATIVAR PLANO</div>
              <div style={{ fontSize: 14, color: ACCENT, fontWeight: 600, marginTop: 4 }}>{modalPlano.nome}</div>
              <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>
                {modalPlano.unidades?.nome} · {modalPlano.creditos_mes} sessões por mês
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem' }}>
              <div style={{ fontSize: 11, color: ACCENT, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 8 }}>
                📄 Termo de Adesão — Wellhub / TotalPass
              </div>
              <pre style={{ fontSize: 12, color: '#777', lineHeight: 1.8, whiteSpace: 'pre-wrap', fontFamily: "'DM Sans', sans-serif" }}>
                {CONTRATO_AGREGADORES}
              </pre>
            </div>
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #222' }}>
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>
                  Digite seu nome completo para confirmar o aceite:
                </div>
                <input
                  type="text"
                  value={nomeAceite}
                  onChange={e => setNomeAceite(e.target.value)}
                  placeholder="Nome Sobrenome"
                  style={{
                    width: '100%', background: '#0a0a0a',
                    border: `1px solid ${nomeAceite.length > 3 ? ACCENT + '66' : '#333'}`,
                    borderRadius: 8, padding: '0.65rem 1rem', color: '#fff', fontSize: 14,
                    fontFamily: "'DM Sans', sans-serif", outline: 'none',
                  }}
                />
              </div>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer', marginBottom: '1rem' }}>
                <input type="checkbox" checked={aceiteCheck} onChange={e => setAceiteCheck(e.target.checked)}
                  style={{ marginTop: 3, accentColor: ACCENT, width: 16, height: 16, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: '#aaa', lineHeight: 1.5 }}>
                  Li e aceito o Termo de Adesão Just CT — Wellhub / TotalPass, incluindo as regras de agendamento, cancelamento, multa por no-show e conduta nas dependências da academia.
                </span>
              </label>
              {erroAtivacao && (
                <div style={{ background: '#ff2d9b15', border: '1px solid #ff2d9b44', borderRadius: 8, padding: '0.6rem 1rem', fontSize: 13, color: ACCENT, marginBottom: '1rem' }}>
                  {erroAtivacao}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setModalPlano(null)}
                  style={{ flex: 1, background: 'transparent', border: '1px solid #333', borderRadius: 10, padding: '0.75rem', color: '#888', fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                  Cancelar
                </button>
                <button onClick={ativarPlano} disabled={ativando}
                  style={{ flex: 2, background: aceiteCheck && nomeAceite.trim().split(' ').length >= 2 ? ACCENT : '#333', color: '#fff', border: 'none', borderRadius: 10, padding: '0.75rem', fontWeight: 600, fontSize: 14, cursor: ativando ? 'default' : 'pointer', fontFamily: "'DM Sans', sans-serif", opacity: ativando ? 0.7 : 1, transition: 'background .2s' }}>
                  {ativando ? 'Ativando...' : 'Ativar plano ✓'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
