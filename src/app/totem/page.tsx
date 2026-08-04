'use client'
// Totem Self Check-in Express — Just Club (v1: identificação por CPF).
// Rota isolada, fullscreen/quiosque, travada na unidade do ?unidade=.
// Reconhecimento facial entra no Incremento 2. Fonte visual: self-checkin-club.html.
import { useCallback, useEffect, useRef, useState } from 'react'

type Unidade = { id: string; slug: string; nome: string }
type Reserva = {
  id: string; aulaTipo: string; aulaNome: string; horario: string; coach: string
  posicao: string | null; origem: string; isPartner: boolean; flow: string
}
type Screen =
  | 'loading' | 'config' | 'idle' | 'cpf' | 'validate'
  | 'reserva' | 'recepcao' | 'waiting' | 'done'

const POLL_MS = 3000
const RESET_DONE_MS = 12000
const INATIVIDADE_MS = 60000

export default function TotemPage() {
  const [unidade, setUnidade] = useState<Unidade | null>(null)
  const [screen, setScreen] = useState<Screen>('loading')
  const [cpf, setCpf] = useState('')
  const [nome, setNome] = useState('')
  const [reserva, setReserva] = useState<Reserva | null>(null)
  const [recepcaoMsg, setRecepcaoMsg] = useState('')
  const [statusMsg, setStatusMsg] = useState('')
  const tokenRef = useRef<string | null>(null)
  const pollRef = useRef<any>(null)
  const inatRef = useRef<any>(null)

  // ---- helpers ----
  const api = useCallback(async (path: string, init?: RequestInit) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init?.headers as any) }
    if (tokenRef.current) headers['x-totem-token'] = tokenRef.current
    const r = await fetch(path, { ...init, headers, cache: 'no-store' })
    return r.json().catch(() => ({}))
  }, [])

  // ---- carregamento inicial: valida a unidade ----
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search)
    const u = qs.get('unidade') || ''
    tokenRef.current = qs.get('k')
    if (!u) { setScreen('config'); return }
    api(`/api/totem/unidade?u=${encodeURIComponent(u)}`)
      .then((res) => {
        if (res?.unidade) { setUnidade(res.unidade); setScreen('idle') }
        else setScreen('config')
      })
      .catch(() => setScreen('config'))
  }, [api])

  // ---- relógio ----
  const [clock, setClock] = useState({ h: '--:--', d: '' })
  useEffect(() => {
    const tick = () => {
      const dt = new Date()
      const wd = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'][dt.getDay()]
      const mo = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'][dt.getMonth()]
      setClock({
        h: `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`,
        d: `${wd} · ${dt.getDate()} ${mo}`,
      })
    }
    tick(); const t = setInterval(tick, 1000); return () => clearInterval(t)
  }, [])

  // ---- reset por inatividade + limpeza ----
  const limpar = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])
  const irIdle = useCallback(() => {
    limpar(); setCpf(''); setNome(''); setReserva(null); setRecepcaoMsg(''); setStatusMsg(''); setScreen('idle')
  }, [limpar])

  useEffect(() => {
    if (inatRef.current) clearTimeout(inatRef.current)
    if (screen === 'idle' || screen === 'loading' || screen === 'config') return
    const ms = screen === 'done' ? RESET_DONE_MS : INATIVIDADE_MS
    // não expira enquanto aguarda parceiro (polling ativo)
    if (screen === 'reserva' && reserva?.flow === 'aguardar_parceiro') return
    inatRef.current = setTimeout(irIdle, ms)
    return () => { if (inatRef.current) clearTimeout(inatRef.current) }
  }, [screen, reserva, irIdle])

  // ---- CPF keypad ----
  const kp = (k: string) => {
    setCpf((c) => (k === 'back' ? c.slice(0, -1) : c.length < 11 ? c + k : c))
  }
  const cpfFmt = () => {
    if (!cpf) return '000.000.000-00'
    const p = cpf.padEnd(11, '•')
    return `${p.slice(0, 3)}.${p.slice(3, 6)}.${p.slice(6, 9)}-${p.slice(9, 11)}`
  }

  const identificar = async () => {
    if (cpf.length !== 11 || !unidade) return
    setScreen('validate')
    const res = await api('/api/totem/identificar', {
      method: 'POST', body: JSON.stringify({ unidade: unidade.slug, cpf }),
    })
    // pequeno respiro pra sensação de verificação
    await new Promise((r) => setTimeout(r, 900))

    if (res?.resultado === 'reserva' && res.reserva) {
      setNome(res.nome || ''); setReserva(res.reserva)
      if (res.reserva.flow === 'confirmado') { registrarPresenca(res.reserva, true); return }
      setScreen('reserva')
      if (res.reserva.flow === 'aguardar_parceiro') iniciarPolling(res.reserva)
      return
    }
    if (res?.resultado === 'cpf_invalido') { setCpf(''); setScreen('cpf'); return }
    if (res?.resultado === 'bloqueado') {
      setRecepcaoMsg('Seu acesso está com uma pendência. Passe na recepção para resolver. 💪'); setScreen('recepcao'); return
    }
    if (res?.resultado === 'nao_encontrado') {
      setRecepcaoMsg('Não encontramos esse CPF. Se é sua 1ª vez, passe na recepção para fazer seu cadastro. 👋'); setScreen('recepcao'); return
    }
    // sem_reserva (ou qualquer outro) → recepção
    setRecepcaoMsg('Você não tem uma reserva para agora. Passe na recepção para garantir sua vaga. 💪'); setScreen('recepcao')
  }

  // ---- crédito direto Just: confirmar presença ----
  const registrarPresenca = async (r: Reserva, jaConfirmado = false) => {
    setScreen('waiting')
    setStatusMsg(r.posicao ? `Reservando ${posLabel(r.posicao)}` : 'Registrando sua presença')
    if (!jaConfirmado) {
      await api('/api/totem/confirmar', { method: 'POST', body: JSON.stringify({ unidade: unidade!.slug, reservaId: r.id }) })
    }
    await new Promise((res) => setTimeout(res, 1000))
    setScreen('done')
  }

  // ---- parceiro pendente: aguarda webhook confirmar (status -> presente) ----
  const iniciarPolling = (r: Reserva) => {
    limpar()
    pollRef.current = setInterval(async () => {
      const res = await api(`/api/totem/reserva-status?unidade=${encodeURIComponent(unidade!.slug)}&reservaId=${r.id}`)
      if (res?.status === 'presente') { limpar(); registrarPresenca(r, true) }
    }, POLL_MS)
  }

  const posLabel = (p: string | null) =>
    !p ? '' : p.toUpperCase().startsWith('F') ? `Funcional ${p}` : `Esteira ${p}`

  const tipoClasse = (t: string) => (t === 'running_funcional' ? 'run' : 'lift')
  const tipoLabel = (t: string) => (t === 'running_funcional' ? 'Running + Funcional' : t === 'lift_for_girls' ? 'Lift For Girls' : 'Lift')

  // =================== RENDER ===================
  return (
    <div id="tt">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="stage">
        <div className="totem">
          <div className="top">
            <div>
              <div className="logo">JUST <b>CLUB</b></div>
              <div className="unit">{unidade ? `Check-in Express · ${unidade.nome}` : 'Self Check-in'}</div>
            </div>
            <div className="clock"><span>{clock.h}</span><small>{clock.d}</small></div>
          </div>

          <div className="screens">
            {/* LOADING */}
            {screen === 'loading' && (
              <section className="screen on center"><div className="spinner" /><p className="sub">Iniciando…</p></section>
            )}

            {/* CONFIG ERROR */}
            {screen === 'config' && (
              <section className="screen on center">
                <div className="badge-warn">!</div>
                <h2>Totem não configurado</h2>
                <p className="sub">Falta o parâmetro da unidade na URL. Ex.:<br /><b>/totem?unidade=just_club_pinheiros</b></p>
              </section>
            )}

            {/* IDLE */}
            {screen === 'idle' && (
              <section className="screen on">
                <div className="express-hdr">
                  <div className="ex-title">CHECK-IN <span>EXPRESS</span></div>
                  <div className="ex-sub">👋 Já tem reserva? Faça seu check-in. 1ª vez ou sem reserva? Fale com a recepção.</div>
                </div>
                <div className="grow center">
                  <div className="idlecam"><span className="face">🙂</span><div className="scanline" />
                    <i className="fc fc1" /><i className="fc fc2" /><i className="fc fc3" /><i className="fc fc4" />
                  </div>
                  <p className="sub" style={{ textAlign: 'center', marginTop: 12 }}>Reconhecimento facial <b>em breve</b></p>
                </div>
                <div className="stack">
                  <button className="btn" onClick={() => { setCpf(''); setScreen('cpf') }}>Fazer check-in</button>
                </div>
              </section>
            )}

            {/* CPF */}
            {screen === 'cpf' && (
              <section className="screen on">
                <button className="back" onClick={irIdle}>← Voltar</button>
                <h2>Digite seu CPF</h2>
                <div className="cpf-disp">{cpf ? cpfFmt() : <span className="ph">000.000.000-00</span>}</div>
                <div className="keys">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
                    <div key={n} className="key" onClick={() => kp(n)}>{n}</div>
                  ))}
                  <div className="key" onClick={() => kp('back')}>⌫</div>
                  <div className="key" onClick={() => kp('0')}>0</div>
                  <div className={'key act' + (cpf.length === 11 ? '' : ' off')} onClick={identificar}>OK</div>
                </div>
                <div className="grow" />
              </section>
            )}

            {/* VALIDATE */}
            {screen === 'validate' && (
              <section className="screen on center">
                <div className="avatar">🧑</div>
                <h2>Um instante…</h2>
                <div className="spinner" />
                <p className="sub">Verificando sua reserva e acesso</p>
              </section>
            )}

            {/* RESERVA */}
            {screen === 'reserva' && reserva && (
              <section className="screen on center">
                <div className="avatar">🧑</div>
                <h2>Olá, {nome.split(' ')[0]}</h2>
                <p className="sub" style={{ marginBottom: 4 }}>Encontramos sua reserva</p>
                <div className="nextcard">
                  <div className="lbl">Sua aula</div>
                  <div className="cls">{reserva.aulaNome}</div>
                  <div className="row">
                    <span className={'chip ' + tipoClasse(reserva.aulaTipo)}>{tipoLabel(reserva.aulaTipo)}</span>
                    <span className="chip time">{reserva.horario}</span>
                    {reserva.coach && <span className="chip time">{reserva.coach}</span>}
                    {reserva.posicao && <span className="chip run">{posLabel(reserva.posicao)}</span>}
                  </div>
                  <div className="origem">
                    <span className="oico" style={{ background: reserva.isPartner ? 'rgba(245,158,11,.18)' : 'rgba(91,141,239,.18)' }}>
                      {reserva.isPartner ? '🎫' : '💳'}
                    </span>
                    Reserva via <b>{reserva.origem}</b>
                  </div>
                </div>

                {reserva.flow === 'confirmar' ? (
                  <>
                    <div className="status ok"><span className="si">✓</span><span>Reserva com crédito Just Club — confirme que você chegou.</span></div>
                    <div className="grow" />
                    <div className="stack"><button className="btn ok" onClick={() => registrarPresenca(reserva)}>Confirmar presença ✓</button></div>
                  </>
                ) : (
                  <>
                    <div className="status pend"><span className="si">⏳</span>
                      <span>Check-in do <b>{reserva.origem}</b> pendente. Faça o check-in no app — assim que confirmar, seu treino é liberado automaticamente.</span>
                    </div>
                    <div className="grow" />
                    <div className="stack">
                      <button className="btn" disabled>Aguardando check-in do app…</button>
                      <button className="btn ghost sm" onClick={irIdle}>Não consigo — falar com a recepção</button>
                    </div>
                  </>
                )}
              </section>
            )}

            {/* RECEPÇÃO (sem reserva / não encontrado / bloqueado) */}
            {screen === 'recepcao' && (
              <section className="screen on center">
                <div className="badge-warn">!</div>
                <h2>Procure a recepção</h2>
                <p className="sub">{recepcaoMsg}</p>
                <div className="grow" />
                <button className="btn" onClick={irIdle}>Entendi</button>
              </section>
            )}

            {/* WAITING */}
            {screen === 'waiting' && (
              <section className="screen on center"><div className="spinner" /><h2>Confirmando…</h2><p className="sub">{statusMsg}</p></section>
            )}

            {/* DONE */}
            {screen === 'done' && reserva && (
              <section className="screen on center">
                <div className="check-badge">✓</div>
                <div className="bigmsg">Bom treino!</div>
                <p className="sub">{nome} · presença confirmada</p>
                {reserva.aulaTipo === 'running_funcional' && reserva.posicao && (
                  <div className="posbox"><div className="l">Sua posição</div><div className="n">{reserva.posicao}</div></div>
                )}
                <div className="nextcard" style={{ marginTop: 6 }}>
                  <div className="lbl">Presença registrada</div>
                  <div className="cls" style={{ fontSize: 16 }}>{reserva.aulaNome}</div>
                  <div className="row">
                    <span className="chip time">{reserva.horario}{reserva.coach ? ` · ${reserva.coach}` : ''}</span>
                    <span className="chip time">via {reserva.origem}</span>
                  </div>
                </div>
                <div className="grow" />
                <button className="btn ghost sm" onClick={irIdle}>Concluir</button>
              </section>
            )}
          </div>

          <div className="help"><span>Precisa de ajuda? Chame a recepção</span></div>
        </div>
      </div>
    </div>
  )
}

// CSS escopado sob #tt (adaptado do protótipo self-checkin-club.html)
const CSS = `
#tt{position:fixed;inset:0;z-index:99999;overflow:auto;
  --bg:#0a0a0f;--panel:#111119;--panel2:#16161f;--line:#26263a;--pink:#ff2d8e;--pink2:#ff5aa6;
  --lift:#5b8def;--run:#22c55e;--run2:#16a34a;--txt:#f5f5fa;--mut:#9a9ab0;--ok:#22c55e;--warn:#f59e0b;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  color:var(--txt);background:radial-gradient(1200px 600px at 50% -10%,#1a0f18 0%,#050509 60%);
  display:flex;align-items:center;justify-content:center;padding:20px}
#tt *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
#tt .stage{display:flex;flex-direction:column;align-items:center}
#tt .totem{position:relative;width:440px;max-width:96vw;height:840px;max-height:94vh;background:var(--bg);
  border-radius:34px;border:1px solid #2a2a3d;box-shadow:0 40px 90px rgba(0,0,0,.6),inset 0 0 0 8px #0c0c14;
  overflow:hidden;display:flex;flex-direction:column}
#tt .top{display:flex;align-items:center;justify-content:space-between;padding:16px 20px 8px;flex:0 0 auto}
#tt .logo{font-weight:800;letter-spacing:1px;font-size:15px}
#tt .logo b{color:var(--pink)}
#tt .unit{font-size:11px;color:var(--mut);margin-top:2px}
#tt .clock{font-variant-numeric:tabular-nums;font-weight:700;font-size:15px;text-align:right}
#tt .clock small{display:block;font-weight:500;font-size:10px;color:var(--mut)}
#tt .screens{position:relative;flex:1 1 auto;overflow:hidden}
#tt .screen{position:absolute;inset:0;padding:10px 22px 18px;display:flex;flex-direction:column;
  animation:ttin .32s ease}
@keyframes ttin{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
#tt .center{align-items:center;justify-content:center;text-align:center}
#tt h2{font-size:22px;margin:4px 0 2px;font-weight:800;line-height:1.15}
#tt .sub{color:var(--mut);font-size:13px;margin:0 0 12px}
#tt .grow{flex:1 1 auto}
#tt .btn{border:none;border-radius:18px;padding:18px;font-size:17px;font-weight:700;color:#fff;
  background:linear-gradient(135deg,var(--pink),#e01f7c);cursor:pointer;width:100%;
  box-shadow:0 10px 26px rgba(255,45,142,.28)}
#tt .btn:active{transform:scale(.975)}
#tt .btn.ghost{background:var(--panel);border:1px solid var(--line);color:var(--txt);box-shadow:none;font-size:15px;padding:15px}
#tt .btn.sm{padding:13px;font-size:14px}
#tt .btn.ok{background:linear-gradient(135deg,#22c55e,#16a34a);box-shadow:0 10px 26px rgba(34,197,94,.28)}
#tt .btn[disabled]{opacity:.45;cursor:not-allowed;box-shadow:none}
#tt .stack{display:flex;flex-direction:column;gap:12px}
#tt .express-hdr{text-align:center;margin:4px 0 6px}
#tt .ex-title{font-size:25px;font-weight:900;letter-spacing:1px;line-height:1}
#tt .ex-title span{color:var(--pink)}
#tt .ex-sub{margin-top:10px;font-size:12.5px;font-weight:700;color:#fcd34d;background:rgba(245,158,11,.1);
  border:1px solid rgba(245,158,11,.32);padding:8px 13px;border-radius:14px;display:inline-block;line-height:1.4}
#tt .idlecam{position:relative;width:150px;height:150px;border-radius:24px;margin:0 auto;overflow:hidden;
  background:linear-gradient(160deg,#14141f,#0c0c14);border:1px solid var(--line);display:flex;align-items:center;justify-content:center}
#tt .idlecam .face{font-size:72px;opacity:.85}
#tt .scanline{position:absolute;left:0;right:0;height:3px;background:linear-gradient(90deg,transparent,var(--pink),transparent);
  box-shadow:0 0 14px var(--pink);animation:scan 2s ease-in-out infinite}
@keyframes scan{0%{top:6%}50%{top:92%}100%{top:6%}}
#tt .fc{position:absolute;width:22px;height:22px;border:3px solid var(--pink)}
#tt .fc1{top:12px;left:12px;border-right:none;border-bottom:none;border-radius:6px 0 0 0}
#tt .fc2{top:12px;right:12px;border-left:none;border-bottom:none;border-radius:0 6px 0 0}
#tt .fc3{bottom:12px;left:12px;border-right:none;border-top:none;border-radius:0 0 0 6px}
#tt .fc4{bottom:12px;right:12px;border-left:none;border-top:none;border-radius:0 0 6px 0}
#tt .cpf-disp{font-variant-numeric:tabular-nums;font-size:26px;font-weight:800;letter-spacing:2px;text-align:center;
  background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:12px;min-height:56px}
#tt .cpf-disp .ph{color:#3d3d52}
#tt .keys{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
#tt .key{background:var(--panel2);border:1px solid var(--line);border-radius:14px;padding:16px;font-size:22px;
  font-weight:700;color:var(--txt);cursor:pointer;text-align:center}
#tt .key:active{transform:scale(.95)}
#tt .key.act{background:linear-gradient(135deg,var(--pink),#e01f7c);border-color:transparent}
#tt .key.act.off{opacity:.5}
#tt .avatar{width:96px;height:96px;border-radius:50%;background:linear-gradient(135deg,#2a2a3d,#16161f);display:flex;
  align-items:center;justify-content:center;font-size:40px;margin:0 auto 12px;border:2px solid var(--line)}
#tt .spinner{width:54px;height:54px;border-radius:50%;border:5px solid #22223a;border-top-color:var(--pink);
  animation:spin 1s linear infinite;margin:0 auto 16px}
@keyframes spin{to{transform:rotate(360deg)}}
#tt .check-badge{width:96px;height:96px;border-radius:50%;background:rgba(34,197,94,.14);border:2px solid var(--ok);
  display:flex;align-items:center;justify-content:center;font-size:52px;margin:0 auto 14px;animation:pop .4s ease}
@keyframes pop{0%{transform:scale(.5);opacity:0}100%{transform:scale(1);opacity:1}}
#tt .badge-warn{width:88px;height:88px;border-radius:50%;background:rgba(245,158,11,.14);border:2px solid var(--warn);
  display:flex;align-items:center;justify-content:center;font-size:46px;font-weight:900;color:var(--warn);margin:0 auto 14px}
#tt .nextcard{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:16px;text-align:left;width:100%;margin:6px 0 12px}
#tt .lbl{font-size:10px;letter-spacing:1.5px;color:var(--mut);text-transform:uppercase}
#tt .cls{font-size:19px;font-weight:800;margin:6px 0 2px}
#tt .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px}
#tt .chip{font-size:11px;font-weight:700;padding:5px 10px;border-radius:8px}
#tt .chip.lift{background:rgba(91,141,239,.15);color:#9cbcff}
#tt .chip.run{background:rgba(34,197,94,.15);color:#86efac}
#tt .chip.time{background:#1c1c28;color:#cfcfe0}
#tt .origem{display:flex;align-items:center;gap:9px;margin-top:12px;padding-top:12px;border-top:1px solid var(--line);font-size:13px;color:#cfcfe0}
#tt .origem .oico{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:15px}
#tt .origem b{color:#fff}
#tt .status{width:100%;border-radius:14px;padding:13px 14px;font-size:12.5px;font-weight:600;line-height:1.45;
  margin-bottom:12px;display:flex;gap:10px;align-items:flex-start;text-align:left}
#tt .status .si{font-size:17px;flex:0 0 auto}
#tt .status.ok{background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.4);color:#86efac}
#tt .status.pend{background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.4);color:#fcd34d}
#tt .bigmsg{font-size:30px;font-weight:900;margin:8px 0 4px}
#tt .posbox{background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.4);border-radius:18px;padding:18px;margin:12px 0;width:100%}
#tt .posbox .n{font-size:44px;font-weight:900;color:#86efac;line-height:1}
#tt .posbox .l{font-size:12px;color:var(--mut);text-transform:uppercase;letter-spacing:1.5px}
#tt .back{background:none;border:none;color:var(--mut);font-size:13px;cursor:pointer;padding:6px 0;text-align:left;align-self:flex-start}
#tt .help{flex:0 0 auto;padding:8px 22px 14px;text-align:center;color:var(--mut);font-size:12px}
`
