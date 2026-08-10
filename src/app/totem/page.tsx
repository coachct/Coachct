'use client'
// Totem Self Check-in Express — Just Club.
// Rota isolada, fullscreen/quiosque, travada na unidade do ?unidade=.
// Entrada por rosto (face-api.js, embedding 128-d no servidor) OU CPF.
// Fonte visual/comportamental: self-checkin-club.html.
import { useCallback, useEffect, useRef, useState } from 'react'

type Unidade = { id: string; slug: string; nome: string; tipo: 'club' | 'ct' }
type Reserva = {
  id: string; aulaTipo: string; aulaNome: string; horario: string; coach: string
  posicao: string | null; origem: string; isPartner: boolean; flow: string
}
type Screen =
  | 'loading' | 'config' | 'idle' | 'cpf' | 'validate' | 'reserva' | 'recepcao'
  | 'waiting' | 'done' | 'enrollConsent' | 'enrollCapture' | 'enrollDone'
  | 'ctLiberado' | 'ctAguardando' | 'ctJaRegistrada'

const POLL_MS = 3000
const RESET_DONE_MS = 12000
const INATIVIDADE_MS = 60000
const SCAN_MS = 1600

export default function TotemPage() {
  const [unidade, setUnidade] = useState<Unidade | null>(null)
  const [screen, setScreen] = useState<Screen>('loading')
  const [cpf, setCpf] = useState('')
  const [cpfMode, setCpfMode] = useState<'checkin' | 'enroll'>('checkin')
  const [nome, setNome] = useState('')
  const [reserva, setReserva] = useState<Reserva | null>(null)
  const [recepcaoMsg, setRecepcaoMsg] = useState('')
  const [statusMsg, setStatusMsg] = useState('')
  const [ctInfo, setCtInfo] = useState<{ origem: string; produto?: string } | null>(null)
  const [scale, setScale] = useState(1)
  const [faceReady, setFaceReady] = useState(false)
  const [faceMsg, setFaceMsg] = useState('Câmera ativa · olhe para reconhecer')
  const [consentOk, setConsentOk] = useState(false)
  const [enrollNome, setEnrollNome] = useState('')
  const [enrollCpf, setEnrollCpf] = useState('')
  const [enrollMsg, setEnrollMsg] = useState('Posicione seu rosto')

  const tokenRef = useRef<string | null>(null)
  const testRef = useRef(false)
  const pollRef = useRef<any>(null)
  const inatRef = useRef<any>(null)
  const idleVideoRef = useRef<HTMLVideoElement | null>(null)
  const enrollVideoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const faRef = useRef<any>(null)
  const busyRef = useRef(false)
  const tryRef = useRef<(force: boolean) => void>(() => {})

  // ---------- fetch helper ----------
  const api = useCallback(async (path: string, init?: RequestInit) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init?.headers as any) }
    if (tokenRef.current) headers['x-totem-token'] = tokenRef.current
    const r = await fetch(path, { ...init, headers, cache: 'no-store' })
    return r.json().catch(() => ({}))
  }, [])

  // ---------- carregamento inicial: valida unidade ----------
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search)
    const u = qs.get('unidade') || ''
    tokenRef.current = qs.get('k')
    testRef.current = qs.get('test') === '1'
    if (!u) { setScreen('config'); return }
    api(`/api/totem/unidade?u=${encodeURIComponent(u)}`)
      .then((res) => { if (res?.unidade) { setUnidade(res.unidade); setScreen('idle') } else setScreen('config') })
      .catch(() => setScreen('config'))
  }, [api])

  // ---------- carrega os modelos de rosto (self-hosted em /models) ----------
  const loadFace = useCallback(async () => {
    if (faRef.current) return faRef.current
    try {
      const fa = await import('@vladmandic/face-api')
      await fa.nets.tinyFaceDetector.loadFromUri('/models')
      await fa.nets.faceLandmark68Net.loadFromUri('/models')
      await fa.nets.faceRecognitionNet.loadFromUri('/models')
      faRef.current = fa
      setFaceReady(true)
      return fa
    } catch { setFaceReady(false); return null }
  }, [])
  useEffect(() => { if (unidade) loadFace() }, [unidade, loadFace])

  // extrai o embedding 128-d do vídeo (ou null)
  const detectar = useCallback(async (el: HTMLVideoElement | null): Promise<number[] | null> => {
    const fa = faRef.current || (await loadFace())
    if (!fa || !el || !el.videoWidth) return null
    const det = await fa
      .detectSingleFace(el, new fa.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
      .withFaceLandmarks()
      .withFaceDescriptor()
    return det?.descriptor ? Array.from(det.descriptor as Float32Array) : null
  }, [loadFace])

  // ---------- câmera ----------
  const attachCamera = useCallback(async (el: HTMLVideoElement | null) => {
    try {
      if (!streamRef.current && navigator.mediaDevices?.getUserMedia) {
        streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      }
      if (el && streamRef.current) el.srcObject = streamRef.current
    } catch { /* câmera negada → placeholder; CPF segue funcionando */ }
  }, [])
  const stopCamera = useCallback(() => {
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null }
  }, [])
  useEffect(() => () => stopCamera(), [stopCamera])

  // ---------- relógio ----------
  const [clock, setClock] = useState({ h: '--:--', d: '' })
  useEffect(() => {
    const tick = () => {
      const dt = new Date()
      const wd = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'][dt.getDay()]
      const mo = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'][dt.getMonth()]
      setClock({ h: `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`, d: `${wd} · ${dt.getDate()} ${mo}` })
    }
    tick(); const t = setInterval(tick, 1000); return () => clearInterval(t)
  }, [])

  // ---- escala pra preencher o máximo do tablet (proporcional, sem distorcer) ----
  useEffect(() => {
    const calc = () => {
      const s = Math.min(window.innerWidth / 440, window.innerHeight / 840)
      setScale(s > 0 ? s : 1)
    }
    calc(); window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [])

  // ---------- reset por inatividade ----------
  const limparPoll = useCallback(() => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }, [])
  const irIdle = useCallback(() => {
    limparPoll(); busyRef.current = false
    setCpf(''); setNome(''); setReserva(null); setRecepcaoMsg(''); setStatusMsg('')
    setConsentOk(false); setEnrollNome(''); setEnrollCpf(''); setEnrollMsg('Posicione seu rosto')
    setCtInfo(null)
    setFaceMsg('Câmera ativa · olhe para reconhecer'); setScreen('idle')
  }, [limparPoll])
  useEffect(() => {
    if (inatRef.current) clearTimeout(inatRef.current)
    if (screen === 'idle' || screen === 'loading' || screen === 'config') return
    if (screen === 'reserva' && reserva?.flow === 'aguardar_parceiro') return
    const ms = (screen === 'done' || screen === 'ctLiberado' || screen === 'ctJaRegistrada') ? RESET_DONE_MS
      : screen === 'ctAguardando' ? 120000
      : INATIVIDADE_MS
    inatRef.current = setTimeout(irIdle, ms)
    return () => { if (inatRef.current) clearTimeout(inatRef.current) }
  }, [screen, reserva, irIdle])

  // ---------- roteia a resposta do servidor (mesma p/ rosto e CPF) ----------
  const iniciarPolling = (r: Reserva) => {
    limparPoll()
    pollRef.current = setInterval(async () => {
      const res = await api(`/api/totem/reserva-status?unidade=${encodeURIComponent(unidade!.slug)}&reservaId=${r.id}`)
      if (res?.status === 'presente') { limparPoll(); registrarPresenca(r, true) }
    }, POLL_MS)
  }
  const registrarPresenca = async (r: Reserva, jaConfirmado = false) => {
    setScreen('waiting')
    setStatusMsg(r.posicao ? `Reservando ${posLabel(r.posicao)}` : 'Registrando sua presença')
    if (!jaConfirmado) await api('/api/totem/confirmar', { method: 'POST', body: JSON.stringify({ unidade: unidade!.slug, reservaId: r.id }) })
    await new Promise((res) => setTimeout(res, 1000))
    setScreen('done')
  }
  const iniciarPollingCT = (clienteId: string) => {
    limparPoll()
    pollRef.current = setInterval(async () => {
      const r = await api(`/api/totem/ct-status?unidade=${encodeURIComponent(unidade!.slug)}&clienteId=${clienteId}`)
      if (r?.liberado) { limparPoll(); setCtInfo({ origem: r.origem, produto: r.produto }); setScreen('ctLiberado') }
    }, POLL_MS)
  }

  const tratarResposta = (res: any) => {
    // CT (musculação/acesso)
    if (res?.resultado === 'liberado') { setNome(res.nome || ''); setCtInfo({ origem: res.origem, produto: res.produto }); setScreen('ctLiberado'); return }
    if (res?.resultado === 'ct_ja_registrada') { setNome(res.nome || ''); setCtInfo({ origem: res.origem }); setScreen('ctJaRegistrada'); return }
    if (res?.resultado === 'aguardando_ct') { setNome(res.nome || ''); iniciarPollingCT(res.clienteId); setScreen('ctAguardando'); return }
    // Club (reserva)
    if (res?.resultado === 'reserva' && res.reserva) {
      setNome(res.nome || ''); setReserva(res.reserva)
      if (res.reserva.flow === 'confirmado') { registrarPresenca(res.reserva, true); return }
      setScreen('reserva')
      if (res.reserva.flow === 'aguardar_parceiro') iniciarPolling(res.reserva)
      return
    }
    if (res?.resultado === 'bloqueado') { setRecepcaoMsg('Seu acesso está com uma pendência. Passe na recepção para resolver. 💪'); setScreen('recepcao'); return }
    if (res?.resultado === 'nao_encontrado') { setRecepcaoMsg('Não encontramos esse CPF. Se é sua 1ª vez, passe na recepção para fazer seu cadastro. 👋'); setScreen('recepcao'); return }
    setRecepcaoMsg('Você não tem uma reserva para agora. Passe na recepção para garantir sua vaga. 💪'); setScreen('recepcao')
  }

  // ---------- reconhecimento facial (loop + botão) ----------
  const reconhecer = async (force: boolean) => {
    if (busyRef.current || !unidade) return
    busyRef.current = true
    if (force) setFaceMsg('Reconhecendo…')
    try {
      const emb = await detectar(idleVideoRef.current)
      if (!emb) { setFaceMsg('Câmera ativa · olhe para reconhecer'); return }
      setFaceMsg('Reconhecendo…')
      const res = await api('/api/totem/reconhecer', { method: 'POST', body: JSON.stringify({ unidade: unidade.slug, embedding: emb, test: testRef.current }) })
      if (res?.resultado === 'sem_match') { setFaceMsg(force ? 'Não reconhecemos seu rosto. Use o CPF ou cadastre.' : 'Câmera ativa · olhe para reconhecer'); return }
      tratarResposta(res)
    } catch { setFaceMsg('Câmera ativa · olhe para reconhecer') }
    finally { busyRef.current = false }
  }
  tryRef.current = reconhecer

  // ---------- câmera + loop de reconhecimento por tela ----------
  useEffect(() => {
    if (!unidade) return
    let interval: any
    if (screen === 'idle') {
      attachCamera(idleVideoRef.current)
      if (faceReady) interval = setInterval(() => tryRef.current(false), SCAN_MS)
    } else if (screen === 'enrollCapture') {
      attachCamera(enrollVideoRef.current)
    }
    return () => { if (interval) clearInterval(interval) }
  }, [screen, faceReady, unidade, attachCamera])

  // ---------- CPF ----------
  const kp = (k: string) => setCpf((c) => (k === 'back' ? c.slice(0, -1) : c.length < 11 ? c + k : c))
  const cpfFmt = () => { const p = cpf.padEnd(11, '•'); return `${p.slice(0, 3)}.${p.slice(3, 6)}.${p.slice(6, 9)}-${p.slice(9, 11)}` }
  const abrirCpf = (mode: 'checkin' | 'enroll') => { setCpfMode(mode); setCpf(''); setScreen('cpf') }

  const cpfConfirm = async () => {
    if (cpf.length !== 11 || !unidade) return
    if (cpfMode === 'enroll') {
      setScreen('validate')
      const res = await api('/api/totem/identificar', { method: 'POST', body: JSON.stringify({ unidade: unidade.slug, cpf }) })
      if (res?.nome) { setEnrollNome(res.nome); setEnrollCpf(cpf); setConsentOk(false); setScreen('enrollConsent') }
      else { setRecepcaoMsg('Não encontramos esse CPF. Passe na recepção para fazer seu cadastro. 👋'); setScreen('recepcao') }
      return
    }
    setScreen('validate')
    const res = await api('/api/totem/identificar', { method: 'POST', body: JSON.stringify({ unidade: unidade.slug, cpf, test: testRef.current }) })
    await new Promise((r) => setTimeout(r, 700))
    if (res?.resultado === 'cpf_invalido') { setCpf(''); setScreen('cpf'); return }
    tratarResposta(res)
  }

  // ---------- cadastro facial ----------
  const capturarRosto = async () => {
    if (!unidade) return
    setEnrollMsg('Capturando…')
    const emb = await detectar(enrollVideoRef.current)
    if (!emb) { setEnrollMsg('Não achamos seu rosto. Centralize, boa luz, sem boné.'); return }
    setEnrollMsg('Salvando no sistema…')
    const res = await api('/api/totem/cadastrar-rosto', { method: 'POST', body: JSON.stringify({ unidade: unidade.slug, cpf: enrollCpf, embedding: emb }) })
    if (res?.ok) setScreen('enrollDone')
    else setEnrollMsg('Não deu para salvar. Tente de novo ou fale com a recepção.')
  }

  const toggleFull = () => {
    const el: any = document.documentElement
    if (!document.fullscreenElement) (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el)
    else (document.exitFullscreen || (document as any).webkitExitFullscreen)?.call(document)
  }

  const posLabel = (p: string | null) => (!p ? '' : p.toUpperCase().startsWith('F') ? `Funcional ${p}` : `Esteira ${p}`)
  const tipoClasse = (t: string) => (t === 'running_funcional' ? 'run' : 'lift')
  const tipoLabel = (t: string) => (t === 'running_funcional' ? 'Running + Funcional' : t === 'lift_for_girls' ? 'Lift For Girls' : 'Lift')

  // =================== RENDER ===================
  return (
    <div id="tt">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="stage">
        <div className="totem" style={{ transform: `scale(${scale})` }}>
          <div className="top">
            <div>
              <div className="logo">JUST <b>{unidade?.tipo === 'ct' ? 'CT' : 'CLUB'}</b></div>
              <div className="unit">{unidade ? `Check-in Express · ${unidade.nome}` : 'Self Check-in'}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="clock"><span>{clock.h}</span><small>{clock.d}</small></div>
              <button className="fullbtn" onClick={toggleFull} aria-label="Tela cheia">⛶</button>
            </div>
          </div>

          <div className="screens">
            {screen === 'loading' && (
              <section className="screen on center"><div className="spinner" /><p className="sub">Iniciando…</p></section>
            )}

            {screen === 'config' && (
              <section className="screen on center">
                <div className="badge-warn">!</div>
                <h2>Totem não configurado</h2>
                <p className="sub">Falta o parâmetro da unidade na URL. Ex.:<br /><b>/totem?unidade=just_club_pinheiros</b></p>
              </section>
            )}

            {/* IDLE — fiel ao desenho */}
            {screen === 'idle' && (
              <section className="screen on">
                <div className="express-hdr">
                  <div className="ex-title">CHECK-IN <span>EXPRESS</span></div>
                  <div className="ex-sub">
                    {unidade?.tipo === 'ct' ? (
                      <>Se você já tem acesso (plano ou app parceiro), <b>olhe para a câmera</b> ou <b>digite seu CPF</b>.<br />
                      Sem acesso? <b>Dirija-se ao atendimento</b>.</>
                    ) : (
                      <>Se você já possui reserva, <b>olhe para a câmera</b> ou <b>digite seu CPF</b>.<br />
                      Se for sua 1ª vez ou estiver sem reserva, <b>dirija-se ao atendimento</b>.</>
                    )}
                  </div>
                </div>
                <div className="grow center">
                  <div className="idlecam">
                    <span className="face">🙂</span>
                    <video ref={idleVideoRef} autoPlay playsInline muted />
                    <div className="scanline" />
                    <i className="fc fc1" /><i className="fc fc2" /><i className="fc fc3" /><i className="fc fc4" />
                  </div>
                  <div className="live"><span className="dot" /> {faceReady ? faceMsg : 'Preparando reconhecimento…'}</div>
                </div>
                <div className="stack">
                  <button className="btn" onClick={() => abrirCpf('checkin')}>Digitar CPF</button>
                  <button className="btn pinkghost" onClick={() => abrirCpf('enroll')}>Cadastre aqui seu rosto</button>
                </div>
              </section>
            )}

            {/* CPF */}
            {screen === 'cpf' && (
              <section className="screen on">
                <button className="back" onClick={irIdle}>← Voltar</button>
                <h2>{cpfMode === 'enroll' ? 'Cadastrar rosto · seu CPF' : 'Digite seu CPF'}</h2>
                <div className="cpf-disp">{cpf ? cpfFmt() : <span className="ph">000.000.000-00</span>}</div>
                <div className="keys">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (<div key={n} className="key" onClick={() => kp(n)}>{n}</div>))}
                  <div className="key" onClick={() => kp('back')}>⌫</div>
                  <div className="key" onClick={() => kp('0')}>0</div>
                  <div className={'key act' + (cpf.length === 11 ? '' : ' off')} onClick={cpfConfirm}>OK</div>
                </div>
                <div className="grow" />
              </section>
            )}

            {screen === 'validate' && (
              <section className="screen on center">
                <div className="avatar">🧑</div><h2>Um instante…</h2><div className="spinner" />
                <p className="sub">Verificando seus dados</p>
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
                    <span className="oico" style={{ background: reserva.isPartner ? 'rgba(245,158,11,.18)' : 'rgba(91,141,239,.18)' }}>{reserva.isPartner ? '🎫' : '💳'}</span>
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
                    <div className="status pend"><span className="si">⏳</span><span>Check-in do <b>{reserva.origem}</b> pendente. Faça o check-in no app — assim que confirmar, seu treino é liberado automaticamente.</span></div>
                    <div className="grow" />
                    <div className="stack">
                      <button className="btn" disabled>Aguardando check-in do app…</button>
                      <button className="btn ghost sm" onClick={irIdle}>Não consigo — falar com a recepção</button>
                    </div>
                  </>
                )}
              </section>
            )}

            {screen === 'recepcao' && (
              <section className="screen on center">
                <div className="badge-warn">!</div><h2>Procure a recepção</h2>
                <p className="sub">{recepcaoMsg}</p><div className="grow" />
                <button className="btn" onClick={irIdle}>Entendi</button>
              </section>
            )}

            {screen === 'waiting' && (
              <section className="screen on center"><div className="spinner" /><h2>Confirmando…</h2><p className="sub">{statusMsg}</p></section>
            )}

            {/* DONE */}
            {screen === 'done' && reserva && (
              <section className="screen on center">
                <div className="check-badge">✓</div><div className="bigmsg">Bom treino!</div>
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

            {/* CT: acesso liberado */}
            {screen === 'ctLiberado' && (
              <section className="screen on center">
                <div className="check-badge">✓</div>
                <div className="bigmsg">Acesso liberado!</div>
                <p className="sub">{nome} · bom treino 💪</p>
                <div className="nextcard" style={{ marginTop: 6 }}>
                  <div className="lbl">Entrada registrada</div>
                  <div className="cls" style={{ fontSize: 16 }}>{ctInfo?.produto || 'Musculação'}</div>
                  {ctInfo?.origem && <div className="row"><span className="chip time">via {ctInfo.origem}</span></div>}
                </div>
                <div className="grow" />
                <button className="btn ghost sm" onClick={irIdle}>Concluir</button>
              </section>
            )}

            {/* CT: entrada já registrada hoje */}
            {screen === 'ctJaRegistrada' && (
              <section className="screen on center">
                <div className="badge-warn">✓</div>
                <div className="bigmsg" style={{ fontSize: 24 }}>Entrada já registrada hoje</div>
                <p className="sub">{nome} · você já fez seu check-in hoje 💪</p>
                {ctInfo?.origem && (
                  <div className="nextcard" style={{ marginTop: 6 }}>
                    <div className="lbl">Acesso de hoje</div>
                    <div className="row"><span className="chip time">via {ctInfo.origem}</span></div>
                  </div>
                )}
                <div className="grow" />
                <button className="btn ghost sm" onClick={irIdle}>Concluir</button>
              </section>
            )}

            {/* CT: aguardando check-in do parceiro */}
            {screen === 'ctAguardando' && (
              <section className="screen on center">
                <div className="avatar">🧑</div>
                <h2>Olá, {nome.split(' ')[0]}</h2>
                <div className="status pend" style={{ marginTop: 8 }}>
                  <span className="si">⏳</span>
                  <span>Ainda não encontramos seu acesso. Faça o <b>check-in no app (Wellhub / TotalPass)</b> aqui na unidade — assim que validar, liberamos automaticamente.</span>
                </div>
                <div className="live"><span className="dot" /> aguardando check-in no app…</div>
                <div className="grow" />
                <div className="stack">
                  <button className="btn ghost sm" onClick={irIdle}>Não consigo — falar com a recepção</button>
                </div>
              </section>
            )}

            {/* ENROLL: consentimento */}
            {screen === 'enrollConsent' && (
              <section className="screen on">
                <button className="back" onClick={irIdle}>← Voltar</button>
                <h2>Cadastrar seu rosto</h2>
                <p className="sub">Da próxima vez você entra só chegando ao totem, sem digitar CPF.</p>
                <div className="idpill"><span className="idico">👤</span> <b>{enrollNome}</b></div>
                <div className="consent">
                  <div className="lbl">Termo de consentimento · LGPD</div>
                  <p>Autorizo o Just Club a capturar e armazenar minha biometria facial com a finalidade exclusiva de identificar meu acesso e registrar minha presença nas aulas. Os dados ficam protegidos, não são compartilhados com terceiros, e posso revogar este consentimento a qualquer momento na recepção.</p>
                </div>
                <label className="check" onClick={() => setConsentOk((v) => !v)}>
                  <span className={'box' + (consentOk ? ' on' : '')}>{consentOk ? '✓' : ''}</span> Li e autorizo o uso da minha imagem
                </label>
                <div className="grow" />
                <button className="btn" disabled={!consentOk} onClick={() => { setEnrollMsg('Posicione seu rosto'); setScreen('enrollCapture') }}>Continuar</button>
              </section>
            )}

            {/* ENROLL: captura */}
            {screen === 'enrollCapture' && (
              <section className="screen on center">
                <button className="back" onClick={() => setScreen('enrollConsent')} style={{ alignSelf: 'flex-start' }}>← Voltar</button>
                <h2>Olhe para a câmera</h2>
                <p className="sub">Rosto centralizado, boa luz, sem boné.</p>
                <div className="cam-big">
                  <span className="face">🙂</span>
                  <video ref={enrollVideoRef} autoPlay playsInline muted />
                  <div className="scanline" />
                  <i className="fc fc1" /><i className="fc fc2" /><i className="fc fc3" /><i className="fc fc4" />
                </div>
                <div className="live" style={{ marginTop: 10 }}>{enrollMsg}</div>
                <div className="grow" />
                <button className="btn" onClick={capturarRosto}>📸 Capturar e salvar</button>
              </section>
            )}

            {screen === 'enrollDone' && (
              <section className="screen on center">
                <div className="check-badge">✓</div><div className="bigmsg">Rosto cadastrado!</div>
                <p className="sub">Na próxima visita é só chegar ao totem — a gente te reconhece automaticamente.</p>
                <div className="grow" />
                <button className="btn ok" onClick={irIdle}>Concluir</button>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// CSS escopado sob #tt (adaptado do protótipo self-checkin-club.html)
const CSS = `
#tt{position:fixed;inset:0;z-index:99999;overflow:hidden;
  --bg:#0a0a0f;--panel:#111119;--panel2:#16161f;--line:#26263a;--pink:#ff2d8e;--pink2:#ff5aa6;
  --lift:#5b8def;--run:#22c55e;--run2:#16a34a;--txt:#f5f5fa;--mut:#9a9ab0;--ok:#22c55e;--warn:#f59e0b;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  color:var(--txt);background:radial-gradient(1200px 600px at 50% -10%,#1a0f18 0%,#050509 60%);
  display:flex;align-items:center;justify-content:center;padding:20px}
#tt *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
#tt .stage{display:flex;flex-direction:column;align-items:center}
#tt .totem{position:relative;width:440px;height:840px;background:var(--bg);
  overflow:hidden;display:flex;flex-direction:column;transform-origin:center center;flex:0 0 auto}
#tt .top{display:flex;align-items:center;justify-content:space-between;padding:16px 20px 8px;flex:0 0 auto}
#tt .logo{font-weight:800;letter-spacing:1px;font-size:15px}
#tt .logo b{color:var(--pink)}
#tt .unit{font-size:11px;color:var(--mut);margin-top:2px}
#tt .clock{font-variant-numeric:tabular-nums;font-weight:700;font-size:15px;text-align:right}
#tt .clock small{display:block;font-weight:500;font-size:10px;color:var(--mut)}
#tt .fullbtn{background:var(--panel);border:1px solid var(--line);color:var(--mut);border-radius:9px;width:30px;height:30px;font-size:15px;cursor:pointer;flex:0 0 auto;display:flex;align-items:center;justify-content:center}
#tt .fullbtn:active{transform:scale(.94)}
#tt .screens{position:relative;flex:1 1 auto;overflow:hidden}
#tt .screen{position:absolute;inset:0;padding:10px 22px 18px;display:flex;flex-direction:column;animation:ttin .32s ease}
@keyframes ttin{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
#tt .center{align-items:center;justify-content:center;text-align:center}
#tt h2{font-size:22px;margin:4px 0 2px;font-weight:800;line-height:1.15}
#tt .sub{color:var(--mut);font-size:13px;margin:0 0 12px}
#tt .grow{flex:1 1 auto}
#tt .btn{border:none;border-radius:18px;padding:22px;font-size:20px;font-weight:700;color:#fff;
  background:linear-gradient(135deg,var(--pink),#e01f7c);cursor:pointer;width:100%;box-shadow:0 10px 26px rgba(255,45,142,.28)}
#tt .btn:active{transform:scale(.975)}
#tt .btn.ghost{background:var(--panel);border:1px solid var(--line);color:var(--txt);box-shadow:none;font-size:15px;padding:15px}
#tt .btn.sm{padding:13px;font-size:14px}
#tt .btn.ok{background:linear-gradient(135deg,#22c55e,#16a34a);box-shadow:0 10px 26px rgba(34,197,94,.28)}
#tt .btn.pinkghost{background:rgba(255,45,142,.08);border:1px solid rgba(255,45,142,.4);color:var(--pink2);box-shadow:none;font-size:18px;padding:18px}
#tt .btn[disabled]{opacity:.45;cursor:not-allowed;box-shadow:none}
#tt .stack{display:flex;flex-direction:column;gap:12px}
#tt .express-hdr{text-align:center;margin:8px 0 14px}
#tt .ex-title{font-size:36px;font-weight:900;letter-spacing:1px;line-height:1}
#tt .ex-title span{color:var(--pink)}
#tt .ex-sub{margin-top:14px;font-size:15px;font-weight:700;color:#fcd34d;background:rgba(245,158,11,.1);
  border:1px solid rgba(245,158,11,.32);padding:14px 18px;border-radius:16px;display:inline-block;line-height:1.55}
#tt .ex-sub b{color:#fde68a}
#tt .idlecam{position:relative;width:300px;height:360px;border-radius:26px;margin:0 auto;overflow:hidden;
  background:linear-gradient(160deg,#14141f,#0c0c14);border:1px solid var(--line);display:flex;align-items:center;justify-content:center}
#tt .idlecam .face{font-size:150px;opacity:.6;position:absolute}
#tt .idlecam video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scaleX(-1)}
#tt .scanline{position:absolute;left:0;right:0;height:3px;background:linear-gradient(90deg,transparent,var(--pink),transparent);box-shadow:0 0 14px var(--pink);animation:scan 2s ease-in-out infinite}
@keyframes scan{0%{top:6%}50%{top:92%}100%{top:6%}}
#tt .fc{position:absolute;width:22px;height:22px;border:3px solid var(--pink)}
#tt .fc1{top:12px;left:12px;border-right:none;border-bottom:none;border-radius:6px 0 0 0}
#tt .fc2{top:12px;right:12px;border-left:none;border-bottom:none;border-radius:0 6px 0 0}
#tt .fc3{bottom:12px;left:12px;border-right:none;border-top:none;border-radius:0 0 0 6px}
#tt .fc4{bottom:12px;right:12px;border-left:none;border-top:none;border-radius:0 0 6px 0}
#tt .live{display:inline-flex;gap:9px;align-items:center;justify-content:center;font-size:15px;color:var(--pink2);
  background:rgba(255,45,142,.1);border:1px solid rgba(255,45,142,.25);padding:11px 20px;border-radius:999px;margin-top:22px;text-align:center}
#tt .dot{width:7px;height:7px;border-radius:50%;background:var(--pink);box-shadow:0 0 10px var(--pink);animation:pulse 1.6s infinite;flex:0 0 auto}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
#tt .enroll-link{color:var(--pink2);font-size:13px;border-bottom:1px dashed rgba(255,90,166,.5);cursor:pointer}
#tt .cpf-disp{font-variant-numeric:tabular-nums;font-size:26px;font-weight:800;letter-spacing:2px;text-align:center;
  background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:12px;min-height:56px}
#tt .cpf-disp .ph{color:#3d3d52}
#tt .keys{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
#tt .key{background:var(--panel2);border:1px solid var(--line);border-radius:14px;padding:16px;font-size:22px;font-weight:700;color:var(--txt);cursor:pointer;text-align:center}
#tt .key:active{transform:scale(.95)}
#tt .key.act{background:linear-gradient(135deg,var(--pink),#e01f7c);border-color:transparent}
#tt .key.act.off{opacity:.5}
#tt .avatar{width:96px;height:96px;border-radius:50%;background:linear-gradient(135deg,#2a2a3d,#16161f);display:flex;align-items:center;justify-content:center;font-size:40px;margin:0 auto 12px;border:2px solid var(--line)}
#tt .spinner{width:54px;height:54px;border-radius:50%;border:5px solid #22223a;border-top-color:var(--pink);animation:spin 1s linear infinite;margin:0 auto 16px}
@keyframes spin{to{transform:rotate(360deg)}}
#tt .check-badge{width:96px;height:96px;border-radius:50%;background:rgba(34,197,94,.14);border:2px solid var(--ok);display:flex;align-items:center;justify-content:center;font-size:52px;margin:0 auto 14px;animation:pop .4s ease}
@keyframes pop{0%{transform:scale(.5);opacity:0}100%{transform:scale(1);opacity:1}}
#tt .badge-warn{width:88px;height:88px;border-radius:50%;background:rgba(245,158,11,.14);border:2px solid var(--warn);display:flex;align-items:center;justify-content:center;font-size:46px;font-weight:900;color:var(--warn);margin:0 auto 14px}
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
#tt .status{width:100%;border-radius:14px;padding:13px 14px;font-size:12.5px;font-weight:600;line-height:1.45;margin-bottom:12px;display:flex;gap:10px;align-items:flex-start;text-align:left}
#tt .status .si{font-size:17px;flex:0 0 auto}
#tt .status.ok{background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.4);color:#86efac}
#tt .status.pend{background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.4);color:#fcd34d}
#tt .bigmsg{font-size:30px;font-weight:900;margin:8px 0 4px}
#tt .posbox{background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.4);border-radius:18px;padding:18px;margin:12px 0;width:100%}
#tt .posbox .n{font-size:44px;font-weight:900;color:#86efac;line-height:1}
#tt .posbox .l{font-size:12px;color:var(--mut);text-transform:uppercase;letter-spacing:1.5px}
#tt .idpill{display:flex;align-items:center;gap:9px;background:rgba(91,141,239,.12);border:1px solid rgba(91,141,239,.35);border-radius:12px;padding:11px 13px;font-size:13px;color:#cfe0ff;margin-bottom:12px}
#tt .idpill b{color:#fff}
#tt .idpill .idico{font-size:16px}
#tt .consent{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:16px;text-align:left;max-height:250px;overflow:auto}
#tt .consent p{font-size:12.5px;color:#c7c7d6;line-height:1.55;margin:8px 0 0}
#tt .check{display:flex;align-items:center;gap:12px;margin-top:14px;font-size:14px;font-weight:600;cursor:pointer;padding:13px;border:1px solid var(--line);border-radius:14px}
#tt .check .box{width:24px;height:24px;border-radius:7px;border:2px solid var(--mut);flex:0 0 auto;display:flex;align-items:center;justify-content:center;font-size:15px;color:#fff}
#tt .check .box.on{background:var(--ok);border-color:var(--ok)}
#tt .cam-big{position:relative;width:220px;height:260px;border-radius:24px;margin:6px auto;overflow:hidden;background:linear-gradient(160deg,#14141f,#0c0c14);border:1px solid var(--line);display:flex;align-items:center;justify-content:center}
#tt .cam-big .face{font-size:96px;opacity:.6;position:absolute}
#tt .cam-big video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scaleX(-1)}
#tt .back{background:none;border:none;color:var(--mut);font-size:13px;cursor:pointer;padding:6px 0;text-align:left;align-self:flex-start}
#tt .help{flex:0 0 auto;padding:8px 22px 14px;text-align:center;color:var(--mut);font-size:12px}
`
