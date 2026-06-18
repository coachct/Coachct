import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Política de Privacidade — Just Club & CT',
  description: 'Como a Just Club & CT coleta, usa e protege seus dados pessoais.',
}

const wrap: React.CSSProperties = {
  background: '#080808', minHeight: '100vh', color: '#e8e8e8',
  fontFamily: "'DM Sans', system-ui, sans-serif", padding: '3rem 1.25rem',
}
const inner: React.CSSProperties = { maxWidth: 820, margin: '0 auto', lineHeight: 1.75 }
const h1: React.CSSProperties = { fontFamily: "'Bebas Neue', sans-serif", fontSize: 40, letterSpacing: 1, color: '#fff', marginBottom: 4 }
const h2: React.CSSProperties = { fontSize: 18, fontWeight: 700, color: '#fff', marginTop: 32, marginBottom: 8 }
const p: React.CSSProperties = { fontSize: 15, color: '#bdbdbd', marginBottom: 10 }
const li: React.CSSProperties = { fontSize: 15, color: '#bdbdbd', marginBottom: 6 }

export default function PoliticaPrivacidade() {
  return (
    <div style={wrap}>
      <div style={inner}>
        <h1 style={h1}>POLÍTICA DE PRIVACIDADE</h1>
        <p style={{ ...p, color: '#777', marginBottom: 24 }}>Just Club &amp; CT · Última atualização: junho de 2026</p>

        <p style={p}>
          Esta Política descreve como a <strong style={{ color: '#fff' }}>Just Club &amp; CT</strong> (JUST RUN ACADEMIA DE
          GINÁSTICA E CORRIDA LTDA) coleta, utiliza, armazena e protege os dados pessoais dos seus clientes e de quem
          entra em contato conosco, em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).
        </p>

        <h2 style={h2}>1. Dados que coletamos</h2>
        <ul>
          <li style={li}>Dados cadastrais: nome, CPF, e-mail, telefone e plano contratado.</li>
          <li style={li}>Dados de uso dos serviços: agendamentos, reservas, histórico de treinos e posição em filas de espera.</li>
          <li style={li}>Conteúdo das conversas que você inicia conosco pelos nossos canais de atendimento (WhatsApp e Direct do Instagram).</li>
        </ul>

        <h2 style={h2}>2. Como usamos os dados</h2>
        <ul>
          <li style={li}>Para identificar você e prestar o atendimento solicitado (informações, agendamentos, reservas, suporte).</li>
          <li style={li}>Para operar e melhorar nossos serviços e a comunicação com você.</li>
          <li style={li}>Para cumprir obrigações legais, contratuais e de segurança.</li>
        </ul>

        <h2 style={h2}>3. Atendimento por WhatsApp e Instagram</h2>
        <p style={p}>
          Oferecemos atendimento por WhatsApp e pelo Direct do Instagram (<strong style={{ color: '#fff' }}>@justclub.ct</strong>),
          incluindo respostas automatizadas. Tratamos apenas o conteúdo das mensagens que você nos envia, com a finalidade
          de responder às suas solicitações. Não coletamos dados sensíveis por esses canais e <strong style={{ color: '#fff' }}>nunca
          pedimos dados de cartão de crédito por mensagem</strong>.
        </p>

        <h2 style={h2}>4. Compartilhamento</h2>
        <p style={p}>
          Não vendemos seus dados. Compartilhamos informações apenas com prestadores necessários à operação (por exemplo,
          plataformas de mensagens da Meta, processador de pagamentos e infraestrutura de tecnologia) e quando exigido por lei.
        </p>

        <h2 style={h2}>5. Armazenamento e segurança</h2>
        <p style={p}>
          Mantemos seus dados pelo tempo necessário às finalidades acima e às obrigações legais, adotando medidas técnicas
          e organizacionais para protegê-los contra acesso não autorizado.
        </p>

        <h2 style={h2}>6. Seus direitos</h2>
        <p style={p}>
          Você pode solicitar acesso, correção, portabilidade ou exclusão dos seus dados, bem como revogar consentimentos.
          No WhatsApp, basta enviar <strong style={{ color: '#fff' }}>PARAR</strong> para deixar de receber mensagens. Para os
          demais pedidos, fale com a gente pelos canais oficiais abaixo.
        </p>

        <h2 style={h2}>7. Contato</h2>
        <p style={p}>
          Dúvidas sobre esta Política ou sobre seus dados? Fale conosco pelo WhatsApp, pelo Direct do Instagram
          <strong style={{ color: '#fff' }}> @justclub.ct</strong>, ou pessoalmente em nossas unidades (Just CT — Rua Fiandeiras, 392,
          Itaim Bibi; JustClub — Vila Olímpia e Pinheiros), São Paulo/SP.
        </p>
      </div>
    </div>
  )
}
