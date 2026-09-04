'use client'
// Cadastro da foto do Check-in Express, feito pelo PRÓPRIO cliente logado (minha-conta).
// Reusa o mesmo motor do totem (face-api.js, embedding 128-d no aparelho).
// Identidade vem da sessão logada — o endpoint valida o token.
import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'

type Fase = 'idle' | 'consent' | 'capture' | 'saving' | 'done' | 'erro'

const PINK = '#ff2d8e'

export default function CadastroRosto({
  onCadastrado,
  semMoldura = false,
  textoIdle,
}: {
  // Avisa a tela que o rosto foi salvo (ela some com o convite e atualiza o status).
  onCadastrado?: () => void
  // Dentro de um modal a moldura de card sobra — o modal já é a moldura.
  semMoldura?: boolean
  textoIdle?: string
} = {}) {
  const [fase, setFase] = useState<Fase>('idle')
  const [consentOk, setConsentOk] = useState(false)
  const [msg, setMsg] = useState('Posicione seu rosto, boa luz, sem boné')
  const [erro, setErro] = useState('')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const faRef = useRef<any>(null)

  const loadFace = useCallback(async () => {
    if (faRef.current) return faRef.current
    const fa = await import('@vladmandic/face-api')
    await fa.nets.tinyFaceDetector.loadFromUri('/models')
    await fa.nets.faceLandmark68Net.loadFromUri('/models')
    await fa.nets.faceRecognitionNet.loadFromUri('/models')
    faRef.current = fa
    return fa
  }, [])

  const stopCam = useCallback(() => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
  }, [])
  useEffect(() => () => stopCam(), [stopCam])

  // abre câmera ao entrar na captura
  useEffect(() => {
    if (fase !== 'capture') { stopCam(); return }
    (async () => {
      try {
        await loadFace()
        if (!streamRef.current) streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
        if (videoRef.current) videoRef.current.srcObject = streamRef.current
      } catch { setErro('Não consegui abrir a câmera. Verifique a permissão do navegador.'); setFase('erro') }
    })()
  }, [fase, loadFace, stopCam])

  const capturar = async () => {
    setMsg('Capturando…')
    try {
      const fa = await loadFace()
      const v = videoRef.current
      if (!v || !v.videoWidth) { setMsg('Câmera ainda carregando, tente de novo'); return }
      const det = await fa.detectSingleFace(v, new fa.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
        .withFaceLandmarks().withFaceDescriptor()
      if (!det?.descriptor) { setMsg('Não achei seu rosto. Centralize e tente de novo.'); return }
      const embedding = Array.from(det.descriptor as Float32Array)

      setFase('saving')
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) { setErro('Sessão expirada. Entre novamente.'); setFase('erro'); return }

      const r = await fetch('/api/conta/cadastrar-rosto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ embedding }),
      }).then(x => x.json()).catch(() => ({}))

      stopCam()
      if (r?.ok) { setFase('done'); onCadastrado?.() }
      else { setErro('Não deu para salvar agora. Tente novamente.'); setFase('erro') }
    } catch { setErro('Falha ao processar o rosto. Tente novamente.'); setFase('erro') }
  }

  const card: React.CSSProperties = semMoldura
    ? { fontFamily: "'DM Sans', sans-serif" }
    : {
        background: '#0d0d0d', border: '1px solid #222', borderRadius: 14,
        padding: '1.25rem', marginBottom: '1.5rem', fontFamily: "'DM Sans', sans-serif",
      }
  const titulo: React.CSSProperties = { fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: '#fff', letterSpacing: 1, marginBottom: 4 }
  const btn: React.CSSProperties = {
    width: '100%', background: PINK, color: '#fff', border: 'none', borderRadius: 10,
    padding: '0.8rem', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
  }
  const btnGhost: React.CSSProperties = { ...btn, background: 'transparent', border: '1px solid #333', color: '#aaa' }

  return (
    <div style={card}>
      {!semMoldura && <div style={titulo}>📸 CADASTRO PARA FOTO DO CHECK-IN EXPRESS</div>}

      {fase === 'idle' && (
        <>
          <div style={{ fontSize: 13, color: '#999', lineHeight: 1.6, marginBottom: '1rem' }}>
            {textoIdle || <>Cadastre seu rosto uma vez e faça o check-in nas unidades só chegando ao totem — <b style={{ color: '#ccc' }}>sem digitar CPF</b>.</>}
          </div>
          <button style={btn} onClick={() => { setConsentOk(false); setFase('consent') }}>Cadastrar meu rosto</button>
        </>
      )}

      {fase === 'consent' && (
        <>
          <div style={{ background: '#080808', border: '1px solid #222', borderRadius: 10, padding: '0.9rem', maxHeight: 180, overflow: 'auto', marginBottom: '0.9rem' }}>
            <div style={{ fontSize: 10, letterSpacing: 1.5, color: '#666', textTransform: 'uppercase', marginBottom: 6 }}>Termo de consentimento · LGPD</div>
            <div style={{ fontSize: 12.5, color: '#aaa', lineHeight: 1.55 }}>
              Autorizo o Just Club &amp; CT a capturar e armazenar minha biometria facial com a finalidade exclusiva de identificar meu acesso e registrar minha presença. Os dados ficam protegidos, não são compartilhados com terceiros, e posso revogar este consentimento a qualquer momento na recepção.
            </div>
          </div>
          <label onClick={() => setConsentOk(v => !v)} style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', fontSize: 13, color: '#ccc', padding: '0.6rem', border: '1px solid #333', borderRadius: 10, marginBottom: '0.9rem' }}>
            <span style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${consentOk ? '#22c55e' : '#555'}`, background: consentOk ? '#22c55e' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, flexShrink: 0 }}>{consentOk ? '✓' : ''}</span>
            Li e autorizo o uso da minha imagem
          </label>
          <button style={{ ...btn, opacity: consentOk ? 1 : 0.5, cursor: consentOk ? 'pointer' : 'not-allowed' }} disabled={!consentOk} onClick={() => { setMsg('Posicione seu rosto, boa luz, sem boné'); setFase('capture') }}>Continuar</button>
          <button style={{ ...btnGhost, marginTop: 8 }} onClick={() => setFase('idle')}>Cancelar</button>
        </>
      )}

      {fase === 'capture' && (
        <>
          <div style={{ position: 'relative', width: 200, height: 240, margin: '0 auto 0.9rem', borderRadius: 16, overflow: 'hidden', background: '#000', border: '1px solid #333' }}>
            <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
          </div>
          <div style={{ fontSize: 12.5, color: '#999', textAlign: 'center', marginBottom: '0.9rem' }}>{msg}</div>
          <button style={btn} onClick={capturar}>📸 Capturar e salvar</button>
          <button style={{ ...btnGhost, marginTop: 8 }} onClick={() => setFase('idle')}>Cancelar</button>
        </>
      )}

      {fase === 'saving' && (
        <div style={{ textAlign: 'center', padding: '1rem', color: '#999', fontSize: 13 }}>Salvando seu cadastro…</div>
      )}

      {fase === 'done' && (
        <div style={{ textAlign: 'center', padding: '0.5rem' }}>
          <div style={{ fontSize: 40, marginBottom: 6 }}>✅</div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: '#22c55e', letterSpacing: 1 }}>Rosto cadastrado!</div>
          <div style={{ fontSize: 13, color: '#999', marginTop: 6 }}>Na próxima visita é só chegar ao totem — a gente te reconhece automaticamente.</div>
          <button style={{ ...btnGhost, marginTop: '1rem' }} onClick={() => setFase('idle')}>Refazer o cadastro</button>
        </div>
      )}

      {fase === 'erro' && (
        <div style={{ textAlign: 'center', padding: '0.5rem' }}>
          <div style={{ fontSize: 13, color: '#ff8888', marginBottom: '1rem' }}>{erro}</div>
          <button style={btn} onClick={() => setFase('idle')}>Tentar de novo</button>
        </div>
      )}
    </div>
  )
}
