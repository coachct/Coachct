'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useUnidade } from '@/hooks/useUnidade'
import { useRouter } from 'next/navigation'
import { Search, Plus, ChevronRight, X, Check, Calendar, Unlock, AlertCircle, ShoppingCart, Package, DollarSign, Building2, Trash2, Zap, Gift, CalendarClock, Edit2, Mail, Copy, Clock, Link as LinkIcon, UserPlus, KeyRound, Camera, Upload, Trash, Wifi, WifiOff } from 'lucide-react'
import UnidadeSelector from '@/components/UnidadeSelector'

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const HORARIOS_FDS = ['08:00', '09:00', '10:00', '11:00', '12:00']

// === iDFace ===
const IDFACE_IP = '192.168.15.129'
const IDFACE_USER = 'admin'
const IDFACE_PASS = 'admin'

const statusConfig: Record<string, { label: string; color: string }> = {
  agendado:   { label: 'Agendado',   color: 'bg-blue-100 text-blue-700' },
  confirmado: { label: 'Confirmado', color: 'bg-green-100 text-green-700' },
  realizado:  { label: 'Realizado',  color: 'bg-gray-100 text-gray-600' },
  cancelado:  { label: 'Cancelado',  color: 'bg-red-100 text-red-600' },
  falta:      { label: 'Falta',      color: 'bg-orange-100 text-orange-700' },
}

const FORMAS_PAGAMENTO = [
  { key: 'pix', label: 'PIX' },
  { key: 'cartao_credito', label: 'Cartão de crédito' },
  { key: 'cartao_debito', label: 'Cartão de débito' },
  { key: 'dinheiro', label: 'Dinheiro' },
  { key: 'cortesia', label: 'Cortesia' },
]

function formatarBR(data: string | Date) {
  const d = typeof data === 'string' ? new Date(data + 'T12:00:00') : data
  return d.toLocaleDateString('pt-BR')
}

function validarEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

// === iDFace API ===
async function idfaceLogin(): Promise<string | null> {
  try {
    const res = await fetch(`http://${IDFACE_IP}/login.fcgi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: IDFACE_USER, password: IDFACE_PASS }),
    })
    const data = await res.json()
    return data?.session || null
  } catch (e) {
    console.error('iDFace login error:', e)
    return null
  }
}

async function idfaceBuscarUserId(session: string, cpf: string): Promise<number | null> {
  try {
    const res = await fetch(`http://${IDFACE_IP}/load_objects.fcgi?session=${session}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        object: 'users',
        where: { users: { registration: cpf } },
      }),
    })
    const data = await res.json()
    if (data?.users && data.users.length > 0) return data.users[0].id as number
    return null
  } catch (e) {
    console.error('iDFace buscar user error:', e)
    return null
  }
}

async function idfaceCriarUser(session: string, cpf: string, nome: string): Promise<number | null> {
  try {
    const res = await fetch(`http://${IDFACE_IP}/create_objects.fcgi?session=${session}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        object: 'users',
        values: [{ registration: cpf, name: nome }],
      }),
    })
    const data = await res.json()
    if (data?.ids && data.ids.length > 0) return data.ids[0] as number
    return null
  } catch (e) {
    console.error('iDFace criar user error:', e)
    return null
  }
}

async function idfaceAtualizarUser(session: string, userId: number, nome: string): Promise<boolean> {
  try {
    const res = await fetch(`http://${IDFACE_IP}/modify_objects.fcgi?session=${session}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        object: 'users',
        values: { name: nome },
        where: { users: { id: userId } },
      }),
    })
    const data = await res.json()
    return data?.changes >= 0
  } catch (e) {
    console.error('iDFace atualizar user error:', e)
    return false
  }
}

async function idfaceUploadFoto(session: string, userId: number, fotoBlob: Blob): Promise<{ ok: boolean; erro?: string }> {
  try {
    const timestamp = Math.floor(Date.now() / 1000)
    const url = `http://${IDFACE_IP}/user_set_image.fcgi?user_id=${userId}&timestamp=${timestamp}&match=0&session=${session}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: fotoBlob,
    })
    const data = await res.json()
    if (data?.success === true) return { ok: true }
    const erro = data?.errors?.[0]?.message || 'Erro desconhecido'
    return { ok: false, erro }
  } catch (e: any) {
    console.error('iDFace upload foto error:', e)
    return { ok: false, erro: e?.message || 'Erro de conexão' }
  }
}

async function idfaceRemoverUser(session: string, cpf: string): Promise<boolean> {
  try {
    const res = await fetch(`http://${IDFACE_IP}/destroy_objects.fcgi?session=${session}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        object: 'users',
        where: { users: { registration: cpf } },
      }),
    })
    const data = await res.json()
    return data?.changes >= 0
  } catch (e) {
    console.error('iDFace remove user error:', e)
    return false
  }
}

async function sincronizarIdFace(cpf: string, nome: string, fotoBlob: Blob): Promise<{ ok: boolean; erro?: string }> {
  const session = await idfaceLogin()
  if (!session) return { ok: false, erro: 'Não foi possível conectar ao iDFace. Verifique se o equipamento está ligado e na rede.' }
  let userId = await idfaceBuscarUserId(session, cpf)
  if (!userId) {
    userId = await idfaceCriarUser(session, cpf, nome)
    if (!userId) return { ok: false, erro: 'Erro ao criar usuário no iDFace.' }
  } else {
    await idfaceAtualizarUser(session, userId, nome)
  }
  const result = await idfaceUploadFoto(session, userId, fotoBlob)
  return result
}

export default function AdminClientesPage() {
  const { perfil, loading } = useAuth()
  const { unidadeAtiva, unidadesPermitidas, loading: loadingUnidade } = useUnidade()
  const router = useRouter()
  const supabase = createClient()

  const [busca, setBusca] = useState('')
  const [clientes, setClientes] = useState<any[]>([])
  const [loadingClientes, setLoadingClientes] = useState(false)
  const [clienteSel, setClienteSel] = useState<any>(null)
  const [aba, setAba] = useState<'dados' | 'planos' | 'agendamentos' | 'historico' | 'vendas' | 'agendar'>('dados')

  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState<any>({})
  const [salvando, setSalvando] = useState(false)

  const [historico, setHistorico] = useState<any[]>([])
  const [saldoMes, setSaldoMes] = useState<Record<string, any>>({})
  const [vendas, setVendas] = useState<any[]>([])
  const [planosCliente, setPlanosCliente] = useState<any[]>([])
  const [planosDisponiveis, setPlanosDisponiveis] = useState<any[]>([])
  const [todasUnidades, setTodasUnidades] = useState<any[]>([])

  const [diaSel, setDiaSel] = useState(0)
  const [semanaOffset, setSemanaOffset] = useState(0)
  const [horariosSel, setHorariosSel] = useState<any[]>([])

  const [modalSlot, setModalSlot] = useState<{ hora: string; data: string } | null>(null)
  const [tipoCredito, setTipoCredito] = useState('')
  const [agendando, setAgendando] = useState(false)
  const [erroModal, setErroModal] = useState('')

  const [novoCliente, setNovoCliente] = useState(false)
  const [formNovo, setFormNovo] = useState({ nome: '', email: '', telefone: '', cpf: '' })
  const [criando, setCriando] = useState(false)
  const [erroCriar, setErroCriar] = useState('')
  const [modalAcessoCriado, setModalAcessoCriado] = useState<{ email: string; senha?: string; sucessoEmail: boolean } | null>(null)

  const [criandoAcesso, setCriandoAcesso] = useState(false)
  const [erroCriarAcesso, setErroCriarAcesso] = useState('')

  const [modalVenda, setModalVenda] = useState(false)
  const [produtosDisp, setProdutosDisp] = useState<any[]>([])
  const [formVenda, setFormVenda] = useState({
    produto_id: '',
    quantidade: 1,
    valor_unitario: 0,
    desconto_percentual: 0,
    forma_pagamento: 'pix',
    observacao: '',
  })
  const [vendendo, setVendendo] = useState(false)
  const [erroVenda, setErroVenda] = useState('')

  const [modalAtivarPlano, setModalAtivarPlano] = useState<any>(null)
  const [salvandoPlano, setSalvandoPlano] = useState(false)
  const [erroAtivacao, setErroAtivacao] = useState('')

  const [modalLinkAceite, setModalLinkAceite] = useState<{ link: string; plano: any; cpId: string } | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [enviandoEmail, setEnviandoEmail] = useState(false)
  const [emailEnviado, setEmailEnviado] = useState(false)
  const [erroEmail, setErroEmail] = useState('')

  const [cancelandoId, setCancelandoId] = useState<string | null>(null)

  const [modalVencimento, setModalVencimento] = useState<any>(null)
  const [novoVencimento, setNovoVencimento] = useState('')
  const [ajustandoVencimento, setAjustandoVencimento] = useState(false)
  const [erroVencimento, setErroVencimento] = useState('')

  const [fotoUrl, setFotoUrl] = useState<string | null>(null)
  const [modalFoto, setModalFoto] = useState(false)
  const [streamCam, setStreamCam] = useState<MediaStream | null>(null)
  const [fotoCapturada, setFotoCapturada] = useState<string | null>(null)
  const [salvandoFoto, setSalvandoFoto] = useState(false)
  const [erroFoto, setErroFoto] = useState('')
  const [statusSync, setStatusSync] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle')
  const [erroSync, setErroSync] = useState('')
  const [resincronizando, setResincronizando] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (loading) return
    if (!perfil) { router.push('/'); return }
    if ((perfil.role as any) !== 'admin') { router.push('/'); return }
  }, [loading, perfil])

  useEffect(() => {
    if (!perfil) return
    if (busca.trim().length >= 2) buscarClientes()
    else setClientes([])
  }, [busca])

  useEffect(() => {
    if (perfil) carregarUnidadesEPlanos()
  }, [perfil])

  async function carregarUnidadesEPlanos() {
    const [{ data: unidades }, { data: planos }] = await Promise.all([
      supabase.from('unidades').select('*').eq('ativo', true).order('nome'),
      supabase.from('planos_disponiveis').select('*').eq('ativo', true),
    ])
    setTodasUnidades(unidades || [])
    setPlanosDisponiveis(planos || [])
  }

  async function buscarClientes() {
    setLoadingClientes(true)
    const { data } = await supabase
      .from('clientes')
      .select('*')
      .or(`nome.ilike.%${busca}%,cpf.ilike.%${busca}%,email.ilike.%${busca}%`)
      .order('nome')
      .limit(20)
    setClientes(data || [])
    setLoadingClientes(false)
  }

  async function abrirCliente(cliente: any) {
    setClienteSel(cliente)
    setForm({ ...cliente })
    setEditando(false)
    setAba('dados')
    setHistorico([])
    setVendas([])
    setModalSlot(null)
    setTipoCredito('')
    setErroCriarAcesso('')
    setFotoUrl(null)
    setStatusSync('idle')
    setErroSync('')
    await Promise.all([
      carregarSaldo(cliente.id),
      carregarHistorico(cliente.id),
      carregarVendas(cliente.id),
      carregarPlanosCliente(cliente.id),
      carregarFotoUrl(cliente),
    ])
  }

  async function carregarFotoUrl(cliente: any) {
    if (!cliente?.foto_url) { setFotoUrl(null); return }
    try {
      const { data, error } = await supabase.storage.from('fotos-clientes').createSignedUrl(cliente.foto_url, 3600)
      if (error || !data?.signedUrl) { setFotoUrl(null); return }
      setFotoUrl(data.signedUrl)
    } catch { setFotoUrl(null) }
  }

  async function carregarSaldo(clienteId: string) {
    const agora = new Date()
    const { data } = await supabase.rpc('saldo_creditos_cliente', {
      p_cliente_id: clienteId,
      p_mes: agora.getMonth() + 1,
      p_ano: agora.getFullYear(),
      p_unidade_id: null,
    })
    setSaldoMes(data || {})
  }

  async function carregarHistorico(clienteId: string) {
    const { data } = await supabase.from('agendamentos').select('*, unidades(nome)').eq('cliente_id', clienteId).order('data', { ascending: false }).limit(50)
    setHistorico(data || [])
  }

  async function carregarVendas(clienteId: string) {
    const { data } = await supabase.from('vendas').select('*, produtos(nome, tipo, subtipo), perfis:vendido_por(nome), unidades(nome)').eq('cliente_id', clienteId).order('vendido_em', { ascending: false }).limit(50)
    setVendas(data || [])
  }

  async function carregarPlanosCliente(clienteId: string) {
    const { data } = await supabase.from('cliente_planos').select(`
      id, ativo, contrato_aceito_em, inicio, fim, produto_id, venda_id,
      aceite_pendente, token_aceite, token_expira_em,
      planos_disponiveis(id, nome, tipo, creditos_mes, unidade_id, unidades(id, nome, tipo)),
      produtos(id, nome, subtipo, unidade_id, unidades(id, nome, tipo), dias_validade)
    `).eq('cliente_id', clienteId).order('contrato_aceito_em', { ascending: false })
    setPlanosCliente(data || [])
  }

  async function recarregarClienteSel() {
    if (!clienteSel) return
    const { data } = await supabase.from('clientes').select('*').eq('id', clienteSel.id).maybeSingle()
    if (data) { setClienteSel(data); await carregarFotoUrl(data) }
  }

  async function salvarEdicao() {
    setSalvando(true)
    const { error } = await supabase.from('clientes').update({
      nome: form.nome, email: form.email, telefone: form.telefone, cpf: form.cpf,
    }).eq('id', clienteSel.id)
    if (!error) {
      const updated = { ...clienteSel, ...form }
      setClienteSel(updated)
      setEditando(false)
      await carregarSaldo(updated.id)
      buscarClientes()
    }
    setSalvando(false)
  }

  async function desbloquear() {
    if (!confirm('Desbloquear este cliente?')) return
    await supabase.from('clientes').update({ bloqueado: false, motivo_bloqueio: null }).eq('id', clienteSel.id)
    setClienteSel({ ...clienteSel, bloqueado: false, motivo_bloqueio: null })
  }

  async function abrirModalFoto() {
    setErroFoto(''); setFotoCapturada(null); setModalFoto(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
      setStreamCam(stream)
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}) } }, 100)
    } catch (e: any) { setErroFoto('Não foi possível acessar a webcam: ' + (e?.message || 'permissão negada')) }
  }

  function fecharModalFoto() {
    if (streamCam) { streamCam.getTracks().forEach(t => t.stop()); setStreamCam(null) }
    setModalFoto(false); setFotoCapturada(null); setErroFoto('')
  }

  function capturarFoto() {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current; const canvas = canvasRef.current
    canvas.width = video.videoWidth; canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    setFotoCapturada(canvas.toDataURL('image/jpeg', 0.85))
  }

  function descartarCaptura() { setFotoCapturada(null) }
  function clicarUpload() { fileInputRef.current?.click() }

  async function processarArquivoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png'].includes(file.type)) { setErroFoto('Apenas imagens JPEG ou PNG são aceitas.'); return }
    if (file.size > 2 * 1024 * 1024) { setErroFoto('Imagem muito grande. Tamanho máximo: 2 MB.'); return }
    const reader = new FileReader()
    reader.onload = (ev) => setFotoCapturada(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  async function salvarFoto() {
    if (!fotoCapturada || !clienteSel?.cpf) return
    setSalvandoFoto(true); setErroFoto('')
    try {
      const res = await fetch(fotoCapturada)
      const blob = await res.blob()
      const cpfLimpo = clienteSel.cpf.replace(/\D/g, '')
      const fileName = `${cpfLimpo}.jpg`
      const { error: errUpload } = await supabase.storage.from('fotos-clientes').upload(fileName, blob, { contentType: 'image/jpeg', upsert: true })
      if (errUpload) { setErroFoto('Erro ao enviar foto: ' + errUpload.message); setSalvandoFoto(false); return }
      const { error: errUpdate } = await supabase.from('clientes').update({ foto_url: fileName }).eq('id', clienteSel.id)
      if (errUpdate) { setErroFoto('Erro ao salvar referência: ' + errUpdate.message); setSalvandoFoto(false); return }
      await recarregarClienteSel()
      fecharModalFoto()
      setStatusSync('syncing'); setErroSync('')
      const sync = await sincronizarIdFace(cpfLimpo, clienteSel.nome, blob)
      if (sync.ok) setStatusSync('success')
      else { setStatusSync('error'); setErroSync(sync.erro || 'Erro desconhecido na sincronização.') }
    } catch (e: any) { setErroFoto('Erro inesperado: ' + (e?.message || 'desconhecido')) }
    finally { setSalvandoFoto(false) }
  }

  async function ressincronizar() {
    if (!clienteSel?.cpf || !clienteSel?.foto_url) return
    setResincronizando(true); setStatusSync('syncing'); setErroSync('')
    try {
      const { data, error } = await supabase.storage.from('fotos-clientes').download(clienteSel.foto_url)
      if (error || !data) { setStatusSync('error'); setErroSync('Erro ao baixar foto do storage.'); setResincronizando(false); return }
      const cpfLimpo = clienteSel.cpf.replace(/\D/g, '')
      const sync = await sincronizarIdFace(cpfLimpo, clienteSel.nome, data)
      if (sync.ok) setStatusSync('success')
      else { setStatusSync('error'); setErroSync(sync.erro || 'Erro desconhecido.') }
    } catch (e: any) { setStatusSync('error'); setErroSync('Erro: ' + (e?.message || 'desconhecido')) }
    finally { setResincronizando(false) }
  }

  async function removerFoto() {
    if (!clienteSel?.foto_url) return
    if (!confirm('Remover a foto deste cliente? Ela também será removida do iDFace.')) return
    setSalvandoFoto(true); setErroFoto('')
    try {
      await supabase.storage.from('fotos-clientes').remove([clienteSel.foto_url])
      if (clienteSel.cpf) {
        const cpfLimpo = clienteSel.cpf.replace(/\D/g, '')
        const session = await idfaceLogin()
        if (session) await idfaceRemoverUser(session, cpfLimpo)
      }
      const { error } = await supabase.from('clientes').update({ foto_url: null }).eq('id', clienteSel.id)
      if (error) { setErroFoto('Erro ao remover: ' + error.message); setSalvandoFoto(false); return }
      setStatusSync('idle'); setErroSync('')
      await recarregarClienteSel()
    } catch (e: any) { setErroFoto('Erro: ' + (e?.message || 'desconhecido')) }
    finally { setSalvandoFoto(false) }
  }

  async function criarCliente() {
    setCriando(true); setErroCriar('')
    if (!formNovo.nome.trim() || formNovo.nome.trim().split(' ').length < 2) { setErroCriar('Nome completo é obrigatório (nome e sobrenome).'); setCriando(false); return }
    if (!formNovo.email.trim()) { setErroCriar('Email é obrigatório para criar o acesso ao sistema.'); setCriando(false); return }
    if (!validarEmail(formNovo.email)) { setErroCriar('Email inválido. Verifique o formato.'); setCriando(false); return }
    if (!formNovo.cpf.trim() || formNovo.cpf.replace(/\D/g, '').length !== 11) { setErroCriar('CPF inválido. Digite os 11 dígitos.'); setCriando(false); return }
    const cpfLimpo = formNovo.cpf.replace(/\D/g, '')
    const emailLimpo = formNovo.email.trim().toLowerCase()
    const { data: cpfExistente } = await supabase.from('clientes').select('id, nome').eq('cpf', cpfLimpo).maybeSingle()
    if (cpfExistente) { setErroCriar(`Já existe um cliente cadastrado com este CPF: ${cpfExistente.nome}`); setCriando(false); return }
    const { data: emailExistente } = await supabase.from('clientes').select('id, nome').eq('email', emailLimpo).maybeSingle()
    if (emailExistente) { setErroCriar(`Já existe um cliente cadastrado com este email: ${emailExistente.nome}`); setCriando(false); return }
    const { data: novoClienteData, error: errCli } = await supabase.from('clientes').insert({
      nome: formNovo.nome.trim(), email: emailLimpo, telefone: formNovo.telefone.trim(), cpf: cpfLimpo, bloqueado: false,
    }).select().single()
    if (errCli || !novoClienteData) { setErroCriar('Erro ao cadastrar: ' + (errCli?.message || 'desconhecido')); setCriando(false); return }
    try {
      const res = await fetch('/api/criar-acesso-cliente', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_id: novoClienteData.id }),
      })
      const result = await res.json()
      if (!res.ok) {
        setErroCriar('Cliente cadastrado, mas houve um erro ao criar o acesso: ' + (result.error || 'desconhecido') + '. Acesse o cliente e tente criar o acesso novamente.')
        setCriando(false); setNovoCliente(false); setFormNovo({ nome: '', email: '', telefone: '', cpf: '' }); setBusca(''); setClientes([])
        return
      }
      setNovoCliente(false); setFormNovo({ nome: '', email: '', telefone: '', cpf: '' }); setBusca(''); setClientes([])
      setModalAcessoCriado({ email: emailLimpo, senha: result.sucesso_parcial ? result.senha_provisoria : undefined, sucessoEmail: !!result.email_enviado })
    } catch (e: any) { setErroCriar('Cliente criado, mas falha ao criar acesso: ' + (e.message || 'desconhecido')) }
    finally { setCriando(false) }
  }

  async function criarAcessoClienteExistente() {
    if (!clienteSel) return
    if (!clienteSel.email) { setErroCriarAcesso('Cadastre o email do cliente antes de criar o acesso.'); return }
    setCriandoAcesso(true); setErroCriarAcesso('')
    try {
      const res = await fetch('/api/criar-acesso-cliente', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_id: clienteSel.id }),
      })
      const result = await res.json()
      if (!res.ok) { setErroCriarAcesso(result.error || 'Erro ao criar acesso'); setCriandoAcesso(false); return }
      await recarregarClienteSel()
      setModalAcessoCriado({ email: clienteSel.email, senha: result.sucesso_parcial ? result.senha_provisoria : undefined, sucessoEmail: !!result.email_enviado })
    } catch (e: any) { setErroCriarAcesso('Erro: ' + (e.message || 'desconhecido')) }
    finally { setCriandoAcesso(false) }
  }

  async function abrirVenda() {
    if (!unidadeAtiva) return
    const { data } = await supabase.from('produtos').select('*').eq('ativo', true).or(`unidade_id.eq.${unidadeAtiva.id},unidade_id.is.null`).order('nome')
    setProdutosDisp(data || [])
    setFormVenda({
      produto_id: data && data[0] ? data[0].id : '',
      quantidade: 1,
      valor_unitario: data && data[0] ? Number(data[0].valor) : 0,
      desconto_percentual: 0,
      forma_pagamento: 'pix',
      observacao: '',
    })
    setErroVenda(''); setModalVenda(true)
  }

  function selecionarProduto(produtoId: string) {
    const p = produtosDisp.find(x => x.id === produtoId)
    if (p) setFormVenda({ ...formVenda, produto_id: produtoId, valor_unitario: Number(p.valor) })
  }

  function aplicarCortesia() { setFormVenda({ ...formVenda, desconto_percentual: 100, forma_pagamento: 'cortesia' }) }
  function limparDesconto() { setFormVenda({ ...formVenda, desconto_percentual: 0, forma_pagamento: formVenda.forma_pagamento === 'cortesia' ? 'pix' : formVenda.forma_pagamento }) }

  async function confirmarVenda() {
    if (!unidadeAtiva) return
    if (!formVenda.produto_id) { setErroVenda('Selecione um produto.'); return }
    if (formVenda.quantidade < 1 || formVenda.quantidade > 20) { setErroVenda('Quantidade deve ser entre 1 e 20.'); return }
    if (formVenda.valor_unitario <= 0) { setErroVenda('Informe um valor válido.'); return }
    if (formVenda.desconto_percentual < 0 || formVenda.desconto_percentual > 100) { setErroVenda('Desconto inválido (0 a 100%).'); return }
    setVendendo(true); setErroVenda('')
    const { data, error } = await supabase.rpc('registrar_venda', {
      p_produto_id: formVenda.produto_id, p_cliente_id: clienteSel.id, p_quantidade: formVenda.quantidade,
      p_valor_unitario: formVenda.valor_unitario, p_forma_pagamento: formVenda.forma_pagamento,
      p_vendido_por: perfil?.id, p_unidade_id: unidadeAtiva.id,
      p_observacao: formVenda.observacao.trim() || null, p_desconto_percentual: formVenda.desconto_percentual,
    })
    setVendendo(false)
    if (error) { setErroVenda('Erro ao registrar venda: ' + error.message); return }
    if (data && !data.sucesso) { setErroVenda('Erro: ' + (data.motivo || 'desconhecido')); return }
    setModalVenda(false)
    await Promise.all([carregarSaldo(clienteSel.id), carregarVendas(clienteSel.id), carregarPlanosCliente(clienteSel.id)])
    setAba('vendas')
  }

  async function ativarPlano(planoId: string) {
    if (!clienteSel) return
    if (!clienteSel.email) { setErroAtivacao('Cliente sem email cadastrado. Cadastre o email antes de ativar o plano.'); return }
    if (!clienteSel.user_id) { setErroAtivacao('Cliente sem acesso ao sistema. Crie o acesso primeiro na aba Dados.'); return }
    setSalvandoPlano(true); setErroAtivacao('')
    try {
      const { data: tokenData, error: errToken } = await supabase.rpc('gerar_token_aceite')
      if (errToken || !tokenData) throw new Error('Erro ao gerar token de aceite')
      const token = tokenData as string
      const expiraEm = new Date(); expiraEm.setDate(expiraEm.getDate() + 7)
      const { data: existente } = await supabase.from('cliente_planos').select('id, ativo').eq('cliente_id', clienteSel.id).eq('plano_id', planoId).maybeSingle()
      let cliPlanoId: string | null = null
      if (existente) {
        const { error } = await supabase.from('cliente_planos').update({ ativo: true, inicio: new Date().toISOString().split('T')[0], fim: null, aceite_pendente: true, token_aceite: token, token_expira_em: expiraEm.toISOString(), contrato_aceito_em: null }).eq('id', existente.id)
        if (error) throw error
        cliPlanoId = existente.id
      } else {
        const { data: novo, error } = await supabase.from('cliente_planos').insert({ cliente_id: clienteSel.id, plano_id: planoId, ativo: true, inicio: new Date().toISOString().split('T')[0], aceite_pendente: true, token_aceite: token, token_expira_em: expiraEm.toISOString() }).select('id').single()
        if (error) throw error
        cliPlanoId = novo?.id || null
      }
      const linkAceite = `${window.location.origin}/aceite-termo?token=${token}`
      await carregarPlanosCliente(clienteSel.id)
      const planoInfo = planosDisponiveis.find(p => p.id === planoId)
      setModalAtivarPlano(null)
      setModalLinkAceite({ link: linkAceite, plano: planoInfo, cpId: cliPlanoId! })
      setCopiado(false); setEmailEnviado(false); setErroEmail('')
    } catch (e: any) { console.error(e); setErroAtivacao('Erro ao ativar plano: ' + (e.message || 'desconhecido')) }
    finally { setSalvandoPlano(false) }
  }

  async function copiarLink() {
    if (!modalLinkAceite) return
    try { await navigator.clipboard.writeText(modalLinkAceite.link); setCopiado(true); setTimeout(() => setCopiado(false), 3000) }
    catch (e) { alert('Não foi possível copiar. Selecione e copie manualmente.') }
  }

  async function enviarEmailAceite() {
    if (!modalLinkAceite || !clienteSel) return
    setEnviandoEmail(true); setErroEmail('')
    try {
      const res = await fetch('/api/enviar-aceite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cliente_plano_id: modalLinkAceite.cpId }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Erro ao enviar email')
      setEmailEnviado(true)
    } catch (e: any) { console.error(e); setErroEmail(e.message || 'Erro ao enviar email. Tente novamente ou envie o link manualmente.') }
    finally { setEnviandoEmail(false) }
  }

  async function reenviarLinkAceite(cp: any) {
    if (!clienteSel) return
    if (!cp.token_aceite) { alert('Este plano não tem token de aceite. Desative e ative novamente.'); return }
    const linkAceite = `${window.location.origin}/aceite-termo?token=${cp.token_aceite}`
    setModalLinkAceite({ link: linkAceite, plano: cp.planos_disponiveis, cpId: cp.id })
    setCopiado(false); setEmailEnviado(false); setErroEmail('')
  }

  async function desativarPlano(cpId: string) {
    if (!confirm('Desativar este plano? O cliente perderá acesso a partir de hoje.')) return
    await supabase.from('cliente_planos').update({ ativo: false, fim: new Date().toISOString().split('T')[0], aceite_pendente: false, token_aceite: null, token_expira_em: null }).eq('id', cpId)
    await carregarPlanosCliente(clienteSel.id)
    await carregarSaldo(clienteSel.id)
  }

  function abrirAjusteVencimento(cp: any) { setModalVencimento(cp); setNovoVencimento(cp.fim || ''); setErroVencimento('') }

  async function salvarNovoVencimento() {
    if (!modalVencimento) return
    if (!novoVencimento) { setErroVencimento('Informe uma data válida.'); return }
    setAjustandoVencimento(true); setErroVencimento('')
    const { error } = await supabase.from('cliente_planos').update({ fim: novoVencimento }).eq('id', modalVencimento.id)
    setAjustandoVencimento(false)
    if (error) { setErroVencimento('Erro ao salvar: ' + error.message); return }
    setModalVencimento(null)
    await carregarPlanosCliente(clienteSel.id)
  }

  async function cancelarAgendamento(agId: string) {
    if (!confirm('Cancelar este agendamento? O crédito será devolvido ao cliente.')) return
    setCancelandoId(agId)
    const { error } = await supabase.from('agendamentos').update({ status: 'cancelado', cancelado_em: new Date().toISOString(), motivo_cancelamento: 'Cancelado pelo admin' }).eq('id', agId)
    setCancelandoId(null)
    if (error) { alert('Erro ao cancelar: ' + error.message); return }
    await Promise.all([carregarSaldo(clienteSel.id), carregarHistorico(clienteSel.id)])
  }

  function planosDisponiveisParaAtivar() {
    if (!unidadeAtiva) return []
    const planosAtivos = planosCliente.filter(p => p.ativo).map(p => p.planos_disponiveis?.id).filter(Boolean)
    return planosDisponiveis.filter(p => p.unidade_id === unidadeAtiva.id && !planosAtivos.includes(p.id))
  }

  const diasSemana = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + semanaOffset * 7 + i)
    return d
  })

  useEffect(() => {
    if (aba === 'agendar' && unidadeAtiva) carregarHorariosAgendar()
  }, [aba, diaSel, semanaOffset, unidadeAtiva?.id])

  // 🔧 FIX: detecta FDS e busca escala_fds em vez de coach_horarios
  async function carregarHorariosAgendar() {
    if (!unidadeAtiva) return
    const dataSel = diasSemana[diaSel]
    const diaSemNum = dataSel.getDay()
    const dataStr = dataSel.toISOString().split('T')[0]
    const ehFds = diaSemNum === 0 || diaSemNum === 6

    const porHora: Record<string, number> = {}

    if (ehFds) {
      const { data: escala } = await supabase
        .from('escala_fds')
        .select('coach_id')
        .eq('data', dataStr)
        .eq('unidade_id', unidadeAtiva.id)
      const qtd = (escala || []).length
      if (qtd > 0) {
        for (const hora of HORARIOS_FDS) {
          porHora[hora] = qtd
        }
      }
    } else {
      const { data: hors } = await supabase
        .from('coach_horarios')
        .select('hora')
        .eq('dia_semana', diaSemNum)
        .eq('unidade_id', unidadeAtiva.id)
        .eq('ativo', true)
      for (const h of (hors || [])) {
        const hora = (h.hora || '').slice(0, 5)
        porHora[hora] = (porHora[hora] || 0) + 1
      }
    }

    const [{ data: ags }, { data: bloqueadas }] = await Promise.all([
      supabase.from('agendamentos').select('horario').eq('data', dataStr).eq('unidade_id', unidadeAtiva.id).neq('status', 'cancelado'),
      supabase.from('vagas_bloqueadas').select('horario, quantidade').eq('data', dataStr).eq('unidade_id', unidadeAtiva.id).eq('ativo', true),
    ])

    const ocupados: Record<string, number> = {}
    for (const a of (ags || [])) {
      const hora = (a.horario || '').slice(0, 5)
      ocupados[hora] = (ocupados[hora] || 0) + 1
    }
    const bloqueadasMap: Record<string, number> = {}
    for (const b of (bloqueadas || [])) {
      const hora = (b.horario || '').slice(0, 5)
      bloqueadasMap[hora] = (bloqueadasMap[hora] || 0) + (b.quantidade || 1)
    }

    const resultado = Object.entries(porHora).map(([hora, total]) => {
      const bloq = bloqueadasMap[hora] || 0
      const ocup = ocupados[hora] || 0
      return { hora, total, ocupados: ocup, bloqueadas: bloq, livres: Math.max(0, total - ocup - bloq) }
    }).sort((a, b) => a.hora.localeCompare(b.hora))

    setHorariosSel(resultado)
  }

  async function abrirModal(hora: string) {
    if (!unidadeAtiva) return
    const dataStr = diasSemana[diaSel].toISOString().split('T')[0]
    const dataObj = diasSemana[diaSel]
    const { data: saldoData } = await supabase.rpc('saldo_creditos_cliente', {
      p_cliente_id: clienteSel.id, p_mes: dataObj.getMonth() + 1, p_ano: dataObj.getFullYear(), p_unidade_id: unidadeAtiva.id,
    })
    setSaldoMes(saldoData || {})
    setModalSlot({ hora, data: dataStr }); setTipoCredito(''); setErroModal('')
  }

  async function confirmarAgendamento() {
    if (!tipoCredito) { setErroModal('Selecione o tipo de crédito.'); return }
    if (!modalSlot || !clienteSel || !unidadeAtiva) return
    setAgendando(true); setErroModal('')
    const { error } = await supabase.from('agendamentos').insert({
      cliente_id: clienteSel.id, data: modalSlot.data, horario: modalSlot.hora + ':00',
      status: 'agendado', tipo_credito: tipoCredito, unidade_id: unidadeAtiva.id,
    })
    if (error) { setErroModal('Erro ao agendar. Tente novamente.'); setAgendando(false); return }
    setModalSlot(null); setAgendando(false)
    await Promise.all([carregarSaldo(clienteSel.id), carregarHistorico(clienteSel.id)])
    setAba('agendamentos')
  }

  const hoje = new Date().toISOString().split('T')[0]
  const agendamentosFuturos = historico.filter(a => a.data >= hoje && ['agendado','confirmado'].includes(a.status)).sort((a, b) => a.data.localeCompare(b.data))
  const agendamentosPassados = historico.filter(a => a.data < hoje || ['realizado','falta','cancelado'].includes(a.status)).sort((a, b) => b.data.localeCompare(a.data))

  const abas = [
    { key: 'dados', label: 'Dados' },
    { key: 'planos', label: 'Planos' },
    { key: 'vendas', label: `Vendas${vendas.length > 0 ? ` (${vendas.length})` : ''}` },
    { key: 'agendamentos', label: `Agenda${agendamentosFuturos.length > 0 ? ` (${agendamentosFuturos.length})` : ''}` },
    { key: 'historico', label: 'Histórico' },
    { key: 'agendar', label: '+ Agendar' },
  ]

  const saldosUnidadeAtiva = Object.entries(saldoMes).filter(([_, info]: [string, any]) => info.unidade_id === unidadeAtiva?.id)
  const planosAppsParceiros = planosCliente.filter(p => p.ativo && p.planos_disponiveis)
  const planosJustCT = planosCliente.filter(p => p.ativo && p.produtos && p.produtos.subtipo === 'acesso')

  const appsPorUnidade: Record<string, any[]> = {}
  for (const cp of planosAppsParceiros) {
    const u = cp.planos_disponiveis?.unidades
    if (!u) continue
    if (!appsPorUnidade[u.id]) appsPorUnidade[u.id] = []
    appsPorUnidade[u.id].push(cp)
  }

  const saldosPorUnidade: Record<string, any[]> = {}
  for (const [key, info] of Object.entries(saldoMes)) {
    const uid = (info as any).unidade_id
    if (!uid) continue
    if (!saldosPorUnidade[uid]) saldosPorUnidade[uid] = []
    saldosPorUnidade[uid].push({ key, ...info as any })
  }

  function isPlanoVigente(cp: any): boolean { if (!cp.fim) return true; return cp.fim >= hoje }
  function diasRestantesPlano(cp: any): number | null {
    if (!cp.fim) return null
    return Math.ceil((new Date(cp.fim + 'T12:00:00').getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
  }

  const produtoSelecionado = produtosDisp.find(p => p.id === formVenda.produto_id)
  const valorOriginal = formVenda.quantidade * formVenda.valor_unitario
  const valorTotalComDesconto = valorOriginal * (1 - formVenda.desconto_percentual / 100)
  const ehCortesia = formVenda.desconto_percentual === 100
  const ehAcesso = produtoSelecionado?.subtipo === 'acesso'

  const clienteTemAcesso = !!clienteSel?.user_id
  const clienteTemEmailSemAcesso = !clienteTemAcesso && !!clienteSel?.email
  const clienteSemEmailSemAcesso = !clienteTemAcesso && !clienteSel?.email
  const clienteTemCpf = !!clienteSel?.cpf && clienteSel.cpf.replace(/\D/g, '').length === 11
  const clienteTemFoto = !!clienteSel?.foto_url

  if (loading || loadingUnidade || !perfil) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!unidadeAtiva) return (
    <div className="flex items-center justify-center h-screen p-6 text-center">
      <div>
        <AlertCircle size={32} className="text-orange-500 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-gray-900">Sem acesso a unidades</h2>
        <p className="text-sm text-gray-500 mt-2">Configure suas permissões em /admin/permissoes.</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">

      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          {clienteSel && (
            <button onClick={() => { setClienteSel(null); setBusca(''); setClientes([]) }} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          )}
          <div>
            <div className="text-base font-semibold text-gray-900">{clienteSel ? clienteSel.nome : 'Clientes'}</div>
            {!clienteSel && <div className="text-xs text-gray-400">Digite para buscar</div>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <UnidadeSelector />
          {!clienteSel && (
            <button onClick={() => setNovoCliente(true)} className="btn btn-sm gap-1 bg-primary-600 text-white hover:bg-primary-700">
              <Plus size={14} /> Novo
            </button>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-5">

        {!clienteSel && (
          <>
            <div className="relative mb-4">
              <Search size={14} className="absolute left-3 top-3 text-gray-400" />
              <input className="input pl-9 w-full" placeholder="Buscar por nome, CPF ou email..." value={busca} onChange={e => setBusca(e.target.value)} autoFocus />
            </div>
            {busca.trim().length < 2 ? (
              <div className="text-center py-16">
                <Search size={32} className="mx-auto text-gray-200 mb-3" />
                <div className="text-sm text-gray-400">Digite ao menos 2 caracteres para buscar</div>
              </div>
            ) : loadingClientes ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : clientes.length === 0 ? (
              <div className="card text-center py-12 text-gray-400 text-sm">
                Nenhum cliente encontrado para "{busca}".
                <br />
                <button onClick={() => setNovoCliente(true)} className="mt-3 text-primary-600 text-sm font-medium">+ Cadastrar novo cliente</button>
              </div>
            ) : (
              <div className="space-y-2">
                {clientes.map(c => (
                  <div key={c.id} onClick={() => abrirCliente(c)} className="card flex items-center gap-3 cursor-pointer hover:border-primary-200 transition-all">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-primary-700 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
                      {c.nome?.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">{c.nome}</span>
                        {c.bloqueado && <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">Bloqueado</span>}
                        {!c.user_id && <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">Sem acesso</span>}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {c.cpf && <span className="font-mono">{c.cpf}</span>}
                        {c.email && <span> · {c.email}</span>}
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {clienteSel && (
          <>
            {clienteSel.bloqueado && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 flex items-start gap-2">
                <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-red-700">Cliente bloqueado</div>
                  <div className="text-xs text-red-500">{clienteSel.motivo_bloqueio}</div>
                </div>
                <button onClick={desbloquear} className="btn btn-sm gap-1 text-green-600 hover:bg-green-50">
                  <Unlock size={12} /> Desbloquear
                </button>
              </div>
            )}

            <button onClick={abrirVenda} className="w-full mb-4 btn gap-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 py-3 font-semibold shadow-sm">
              <ShoppingCart size={16} /> Vender produto · {unidadeAtiva.nome}
            </button>

            <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
              {abas.map(a => (
                <button key={a.key} onClick={() => setAba(a.key as any)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${aba === a.key ? 'bg-primary-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-primary-300'}`}>
                  {a.label}
                </button>
              ))}
            </div>

            {aba === 'dados' && (
              <div className="space-y-4">
                <div className="bg-gradient-to-br from-primary-600 to-primary-800 rounded-2xl p-5 text-white flex items-center gap-4">
                  <div className="relative flex-shrink-0">
                    {fotoUrl ? (
                      <img src={fotoUrl} alt={clienteSel.nome} className="w-14 h-14 rounded-full object-cover border-2 border-white/30" />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-white/20 text-white text-xl font-bold flex items-center justify-center">
                        {clienteSel.nome?.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-lg leading-tight">{clienteSel.nome}</div>
                    <div className="text-primary-200 text-sm mt-0.5">{clienteSel.email || 'Sem email cadastrado'}</div>
                  </div>
                  {clienteTemAcesso ? (
                    <span className="bg-green-500 bg-opacity-30 border border-green-300 text-green-100 text-xs px-2 py-1 rounded-full font-semibold flex items-center gap-1 flex-shrink-0">
                      <Check size={12} /> Acesso ativo
                    </span>
                  ) : (
                    <span className="bg-orange-500 bg-opacity-30 border border-orange-300 text-orange-100 text-xs px-2 py-1 rounded-full font-semibold flex items-center gap-1 flex-shrink-0">
                      <KeyRound size={12} /> Sem acesso
                    </span>
                  )}
                </div>

                <div className={`card border-l-4 ${clienteTemFoto ? 'border-l-green-400 bg-green-50' : 'border-l-blue-400 bg-blue-50'}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${clienteTemFoto ? 'bg-green-200 text-green-700' : 'bg-blue-200 text-blue-700'}`}>
                      <Camera size={18} />
                    </div>
                    <div className="flex-1">
                      <div className={`text-sm font-semibold mb-1 ${clienteTemFoto ? 'text-green-900' : 'text-blue-900'}`}>
                        {clienteTemFoto ? 'Foto facial cadastrada' : 'Foto facial não cadastrada'}
                      </div>
                      {!clienteTemCpf ? (
                        <>
                          <div className="text-xs text-blue-700 mb-3">Para cadastrar a foto facial, primeiro cadastre o <strong>CPF</strong> do cliente clicando em "Editar" no card de informações abaixo.</div>
                          <button disabled className="btn btn-sm bg-gray-200 text-gray-400 cursor-not-allowed gap-1"><Camera size={12} /> Cadastre o CPF primeiro</button>
                        </>
                      ) : clienteTemFoto ? (
                        <>
                          {statusSync === 'syncing' && <div className="text-xs text-blue-700 mb-3 flex items-center gap-1"><div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /> Sincronizando com iDFace...</div>}
                          {statusSync === 'success' && <div className="text-xs text-green-700 mb-3 flex items-center gap-1"><Wifi size={12} /> Sincronizado com iDFace</div>}
                          {statusSync === 'error' && (
                            <div className="bg-orange-100 border border-orange-300 rounded-lg p-2 mb-3 text-xs text-orange-800 flex items-start gap-1">
                              <WifiOff size={12} className="mt-0.5 flex-shrink-0" />
                              <div><div className="font-semibold">Foto salva, mas não sincronizada com iDFace</div><div className="opacity-80 mt-0.5">{erroSync}</div></div>
                            </div>
                          )}
                          <div className="flex gap-2 flex-wrap">
                            <button onClick={abrirModalFoto} className="btn btn-sm gap-1 bg-primary-600 text-white hover:bg-primary-700"><Camera size={12} /> Trocar foto</button>
                            {statusSync === 'error' && <button onClick={ressincronizar} disabled={resincronizando} className="btn btn-sm gap-1 bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50"><Wifi size={12} /> {resincronizando ? 'Sincronizando...' : 'Tentar sincronizar de novo'}</button>}
                            <button onClick={removerFoto} disabled={salvandoFoto} className="btn btn-sm gap-1 text-red-600 border border-red-200 hover:bg-red-50"><Trash size={12} /> Remover</button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-xs text-blue-700 mb-3">Cadastre a foto facial do cliente. A foto será automaticamente sincronizada com o iDFace para reconhecimento na entrada.</div>
                          <button onClick={abrirModalFoto} className="btn btn-sm gap-1 bg-primary-600 text-white hover:bg-primary-700"><Camera size={12} /> Cadastrar foto facial</button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {!clienteTemAcesso && (
                  <div className="card border-l-4 border-l-orange-400 bg-orange-50">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-orange-200 text-orange-700 flex items-center justify-center flex-shrink-0"><KeyRound size={18} /></div>
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-orange-900 mb-1">Cliente sem acesso ao sistema</div>
                        {clienteSemEmailSemAcesso ? (
                          <>
                            <div className="text-xs text-orange-700 mb-3">Para criar o acesso, primeiro cadastre o email do cliente clicando em "Editar" no card abaixo.</div>
                            <button disabled className="btn btn-sm bg-gray-200 text-gray-400 cursor-not-allowed gap-1"><KeyRound size={12} /> Cadastre o email primeiro</button>
                          </>
                        ) : (
                          <>
                            <div className="text-xs text-orange-700 mb-3">Será gerada uma senha provisória e enviado um email de boas-vindas para <strong>{clienteSel.email}</strong> com os dados de acesso.</div>
                            {erroCriarAcesso && <div className="bg-red-50 border border-red-200 rounded-lg p-2 mb-3 text-xs text-red-700">{erroCriarAcesso}</div>}
                            <button onClick={criarAcessoClienteExistente} disabled={criandoAcesso} className="btn btn-sm gap-1 bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50">
                              <KeyRound size={12} />{criandoAcesso ? 'Criando acesso...' : 'Criar acesso e enviar boas-vindas'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {planosJustCT.filter(isPlanoVigente).length > 0 && (
                  <div className="card border-l-4 border-l-amber-400">
                    <div className="flex items-center gap-2 mb-3"><CalendarClock size={16} className="text-amber-600" /><div className="text-sm font-semibold text-gray-900">Plano Just CT ativo</div></div>
                    <div className="space-y-2">
                      {planosJustCT.filter(isPlanoVigente).map(cp => {
                        const dias = diasRestantesPlano(cp)
                        return (
                          <div key={cp.id} className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                            <div className="text-sm font-semibold text-amber-900">{cp.produtos?.nome}</div>
                            <div className="text-xs text-amber-700 mt-1">Válido até <strong>{cp.fim ? formatarBR(cp.fim) : '—'}</strong>{dias !== null && dias >= 0 && <span className="ml-1">({dias} dias restantes)</span>}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {Object.keys(saldosPorUnidade).length > 0 && (
                  <div className="card">
                    <div className="flex items-center gap-2 mb-3"><Zap size={16} className="text-primary-600" /><div className="text-sm font-semibold text-gray-900">Créditos disponíveis</div><span className="text-xs text-gray-400">· este mês</span></div>
                    <div className="space-y-3">
                      {todasUnidades.map(u => {
                        const saldosU = saldosPorUnidade[u.id]
                        if (!saldosU || saldosU.length === 0) return null
                        return (
                          <div key={u.id} className="border border-gray-100 rounded-xl p-3 bg-gray-50">
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.tipo === 'ct' ? 'bg-primary-100 text-primary-700' : 'bg-blue-100 text-blue-700'}`}>{u.tipo === 'ct' ? 'CT' : 'Club'}</span>
                              <span className="text-xs font-semibold text-gray-700">{u.nome}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              {saldosU.map((s: any) => (
                                <div key={s.key} className="bg-white rounded-lg p-2 text-center border border-gray-100">
                                  <div className={`text-2xl font-bold ${s.disponivel === 0 ? 'text-gray-300' : s.disponivel <= 2 ? 'text-orange-500' : 'text-primary-600'}`}>{s.disponivel}</div>
                                  <div className="text-xs text-gray-500 capitalize mt-0.5 truncate">{s.tipo_plano}</div>
                                  <div className="text-xs text-gray-400 mt-0.5">de {s.total}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div className="card">
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-sm font-semibold text-gray-900">Informações</div>
                    {!editando ? (
                      <button onClick={() => setEditando(true)} className="btn btn-sm text-primary-600">Editar</button>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={() => { setEditando(false); setForm(clienteSel) }} className="btn btn-sm text-gray-500">Cancelar</button>
                        <button onClick={salvarEdicao} disabled={salvando} className="btn btn-sm gap-1 bg-primary-600 text-white"><Check size={12} /> {salvando ? 'Salvando...' : 'Salvar'}</button>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: 'Nome', key: 'nome', type: 'text', full: true },
                      { label: 'Email', key: 'email', type: 'email', full: true },
                      { label: 'Telefone', key: 'telefone', type: 'text', full: false },
                      { label: 'CPF', key: 'cpf', type: 'text', full: false },
                    ].map(f => (
                      <div key={f.key} className={f.full ? 'col-span-2' : ''}>
                        <div className="text-xs text-gray-400 mb-1">{f.label}</div>
                        {editando ? (
                          <input type={f.type} className="input w-full" value={form[f.key] || ''} onChange={e => setForm({ ...form, [f.key]: e.target.value })} />
                        ) : (
                          <div className="text-sm font-medium text-gray-900">{clienteSel[f.key] || '—'}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {aba === 'planos' && (
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2 flex items-center gap-2"><CalendarClock size={12} /> Planos Just CT</div>
                  {planosJustCT.length === 0 ? (
                    <div className="card text-center py-6 text-gray-400 text-sm">Nenhum plano de acesso ativo. Venda um Plano Semestral ou Anual.</div>
                  ) : (
                    <div className="space-y-2">
                      {planosJustCT.map(cp => {
                        const vigente = isPlanoVigente(cp); const dias = diasRestantesPlano(cp)
                        return (
                          <div key={cp.id} className={`card border-l-4 ${vigente ? 'border-l-amber-400' : 'border-l-gray-300 opacity-60'}`}>
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0"><CalendarClock size={18} /></div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-semibold text-gray-900">{cp.produtos?.nome}</span>
                                  {!vigente && <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">Vencido</span>}
                                </div>
                                <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                                  <div>Início: <strong>{cp.inicio ? formatarBR(cp.inicio) : '—'}</strong></div>
                                  <div>Vencimento: <strong className={vigente ? 'text-amber-700' : 'text-red-600'}>{cp.fim ? formatarBR(cp.fim) : '—'}</strong>{vigente && dias !== null && <span className="text-gray-400 ml-1">({dias} dias restantes)</span>}</div>
                                  {cp.produtos?.unidades?.nome && <div>Unidade: {cp.produtos.unidades.nome}</div>}
                                </div>
                              </div>
                              <div className="flex flex-col gap-1">
                                <button onClick={() => abrirAjusteVencimento(cp)} className="btn btn-sm gap-1 text-amber-700 hover:bg-amber-50"><Edit2 size={11} /> Ajustar</button>
                                <button onClick={() => desativarPlano(cp.id)} className="btn btn-sm gap-1 text-red-500 hover:bg-red-50 text-xs"><Trash2 size={11} /> Cancelar</button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-xs font-semibold text-primary-700 uppercase tracking-wide mb-2 flex items-center gap-2"><Zap size={12} /> Apps Parceiros (Wellhub / TotalPass)</div>
                  {Object.keys(appsPorUnidade).length === 0 ? (
                    <div className="card text-center py-6 text-gray-400 text-sm">Cliente sem planos de app parceiro ativos.</div>
                  ) : (
                    todasUnidades.map(u => {
                      const planosU = appsPorUnidade[u.id] || []
                      if (planosU.length === 0) return null
                      return (
                        <div key={u.id} className="card mb-2">
                          <div className="flex items-center gap-2 mb-3">
                            <Building2 size={14} className="text-gray-400" />
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.tipo === 'ct' ? 'bg-primary-100 text-primary-700' : 'bg-blue-100 text-blue-700'}`}>{u.tipo === 'ct' ? 'CT' : 'Club'}</span>
                            <span className="text-sm font-semibold text-gray-900">{u.nome}</span>
                          </div>
                          <div className="space-y-2">
                            {planosU.map(cp => {
                              const pd = cp.planos_disponiveis
                              const saldoKey = Object.keys(saldoMes).find(k => saldoMes[k]?.unidade_id === u.id && saldoMes[k]?.tipo_plano === pd?.tipo)
                              const saldo = saldoKey ? saldoMes[saldoKey] : null
                              const pendente = cp.aceite_pendente
                              return (
                                <div key={cp.id} className={`border rounded-xl p-3 ${pendente ? 'border-orange-300 bg-orange-50' : 'border-gray-200'}`}>
                                  <div className="flex items-center gap-3">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-medium text-gray-900">{pd?.nome}</span>
                                        {pendente && <span className="text-xs px-2 py-0.5 rounded-full bg-orange-200 text-orange-800 font-semibold flex items-center gap-1"><Clock size={10} /> Aguardando aceite</span>}
                                      </div>
                                      <div className="text-xs text-gray-500 mt-0.5">{pd?.creditos_mes} sessões/mês{!pendente && saldo && <> · <span className="font-bold text-primary-600">{saldo.disponivel}</span> disponível este mês</>}</div>
                                      {cp.contrato_aceito_em && !pendente && <div className="text-xs text-gray-400 mt-0.5">Termo aceito em {new Date(cp.contrato_aceito_em).toLocaleDateString('pt-BR')}</div>}
                                      {pendente && cp.token_expira_em && <div className="text-xs text-orange-700 mt-1">Link válido até {new Date(cp.token_expira_em).toLocaleDateString('pt-BR')}</div>}
                                    </div>
                                    <div className="flex flex-col gap-1">
                                      {pendente && <button onClick={() => reenviarLinkAceite(cp)} className="btn btn-sm gap-1 bg-orange-500 text-white hover:bg-orange-600"><LinkIcon size={11} /> Ver link</button>}
                                      <button onClick={() => desativarPlano(cp.id)} className="btn btn-sm gap-1 text-red-500 hover:bg-red-50"><Trash2 size={12} /> Desativar</button>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })
                  )}

                  {planosDisponiveisParaAtivar().length > 0 && (
                    <div className="card border-2 border-dashed border-primary-200 bg-primary-50">
                      <div className="text-sm font-semibold text-primary-800 mb-3 flex items-center gap-2"><Plus size={14} /> Ativar app parceiro em {unidadeAtiva.nome}</div>
                      {!clienteTemAcesso && (
                        <div className="bg-orange-100 border border-orange-200 rounded-lg p-3 mb-3 text-xs text-orange-800 flex items-start gap-2">
                          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                          <div><strong>Atenção:</strong> Cliente sem acesso ao sistema. Vá para a aba <strong>Dados</strong> e crie o acesso antes de ativar planos.</div>
                        </div>
                      )}
                      <div className="space-y-2">
                        {planosDisponiveisParaAtivar().map(p => (
                          <button key={p.id} onClick={() => { setModalAtivarPlano(p); setErroAtivacao('') }} disabled={!clienteTemAcesso}
                            className={`w-full bg-white border border-gray-200 rounded-xl p-3 flex items-center justify-between transition-all text-left ${clienteTemAcesso ? 'hover:border-primary-400 cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}>
                            <div>
                              <div className="text-sm font-medium text-gray-900">{p.nome}</div>
                              <div className="text-xs text-gray-500">{p.creditos_mes} sessões/mês</div>
                            </div>
                            <Plus size={16} className="text-primary-600" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {aba === 'vendas' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm font-semibold text-gray-900">Histórico de vendas</div>
                  <button onClick={abrirVenda} className="btn btn-sm gap-1 bg-green-600 text-white hover:bg-green-700"><ShoppingCart size={12} /> Nova venda</button>
                </div>
                {vendas.length === 0 ? (
                  <div className="card text-center py-12 text-gray-400 text-sm">Nenhuma venda registrada para este cliente.</div>
                ) : (
                  <div className="space-y-2">
                    {vendas.map(v => {
                      const teveDesconto = v.desconto_percentual && v.desconto_percentual > 0
                      const ehCortesiaV = v.desconto_percentual === 100
                      return (
                        <div key={v.id} className="card">
                          <div className="flex items-start gap-3">
                            <div className={`w-10 h-10 rounded-xl ${ehCortesiaV ? 'bg-amber-100 text-amber-700' : 'bg-green-50 text-green-700'} flex items-center justify-center flex-shrink-0`}>
                              {ehCortesiaV ? <Gift size={18} /> : <Package size={18} />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold text-gray-900">{v.produtos?.nome || 'Produto removido'}</span>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">{v.quantidade}x</span>
                                {v.produtos?.subtipo === 'acesso' && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Acesso</span>}
                                {ehCortesiaV && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">🎁 Cortesia</span>}
                                {v.unidades?.nome && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{v.unidades.nome}</span>}
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                                {teveDesconto && !ehCortesiaV && v.valor_original && <span className="line-through text-gray-400">R$ {Number(v.valor_original).toFixed(2).replace('.', ',')}</span>}
                                <span className={`font-mono font-bold ${ehCortesiaV ? 'text-amber-700' : 'text-green-700'}`}>R$ {Number(v.valor_total).toFixed(2).replace('.', ',')}</span>
                                {teveDesconto && !ehCortesiaV && <span className="text-orange-600 font-medium">-{v.desconto_percentual}%</span>}
                                <span>{FORMAS_PAGAMENTO.find(f => f.key === v.forma_pagamento)?.label || v.forma_pagamento}</span>
                                <span>{new Date(v.vendido_em).toLocaleDateString('pt-BR')} {new Date(v.vendido_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                              {v.perfis?.nome && <div className="text-xs text-gray-400 mt-0.5">Vendido por {v.perfis.nome}</div>}
                              {v.observacao && <div className="text-xs text-gray-500 mt-1 italic">{v.observacao}</div>}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {aba === 'agendamentos' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm font-semibold text-gray-900">Próximos agendamentos</div>
                  <button onClick={() => setAba('agendar')} className="btn btn-sm gap-1 bg-primary-600 text-white"><Plus size={12} /> Agendar</button>
                </div>
                {agendamentosFuturos.length === 0 ? (
                  <div className="card text-center py-12 text-gray-400 text-sm">Nenhum agendamento futuro.</div>
                ) : (
                  <div className="space-y-2">
                    {agendamentosFuturos.map(ag => (
                      <div key={ag.id} className="card border-l-4 border-l-blue-400">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-blue-50 flex flex-col items-center justify-center flex-shrink-0">
                            <div className="text-sm font-bold text-blue-700 leading-none">{new Date(ag.data + 'T12:00:00').getDate()}</div>
                            <div className="text-xs text-blue-500 uppercase">{new Date(ag.data + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' })}</div>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-gray-900 capitalize">{new Date(ag.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long' })}</span>
                              <span className="font-mono text-xs text-gray-500">{(ag.horario || '').slice(0,5)}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${statusConfig[ag.status]?.color}`}>{statusConfig[ag.status]?.label}</span>
                              {ag.unidades?.nome && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{ag.unidades.nome}</span>}
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">{ag.tipo_credito}</div>
                          </div>
                          <button onClick={() => cancelarAgendamento(ag.id)} disabled={cancelandoId === ag.id} className="btn btn-sm gap-1 text-red-500 hover:bg-red-50 flex-shrink-0">
                            <X size={12} /> {cancelandoId === ag.id ? 'Cancelando...' : 'Cancelar'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {aba === 'historico' && (
              <div>
                <div className="text-sm font-semibold text-gray-900 mb-4">Histórico de treinos</div>
                {agendamentosPassados.length === 0 ? (
                  <div className="card text-center py-12 text-gray-400 text-sm">Nenhum histórico encontrado.</div>
                ) : (
                  <div className="space-y-2">
                    {agendamentosPassados.map(ag => (
                      <div key={ag.id} className={`card flex items-center gap-3 border-l-4 ${ag.status === 'realizado' ? 'border-l-green-400' : ag.status === 'falta' ? 'border-l-orange-400' : 'border-l-gray-200'}`}>
                        <div className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center flex-shrink-0 ${ag.status === 'realizado' ? 'bg-green-50' : ag.status === 'falta' ? 'bg-orange-50' : 'bg-gray-50'}`}>
                          <div className={`text-sm font-bold leading-none ${ag.status === 'realizado' ? 'text-green-700' : ag.status === 'falta' ? 'text-orange-700' : 'text-gray-500'}`}>{new Date(ag.data + 'T12:00:00').getDate()}</div>
                          <div className={`text-xs uppercase ${ag.status === 'realizado' ? 'text-green-500' : ag.status === 'falta' ? 'text-orange-500' : 'text-gray-400'}`}>{new Date(ag.data + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' })}</div>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-700 capitalize">{new Date(ag.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long' })}</span>
                            <span className="font-mono text-xs text-gray-400">{(ag.horario || '').slice(0,5)}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${statusConfig[ag.status]?.color}`}>{statusConfig[ag.status]?.label}</span>
                            {ag.unidades?.nome && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{ag.unidades.nome}</span>}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">{ag.tipo_credito}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {aba === 'agendar' && (
              <div>
                <div className="text-sm font-semibold text-gray-900 mb-4">Agendar em {unidadeAtiva.nome}</div>
                <div className="card">
                  <div className="flex items-center gap-2 mb-3">
                    <button onClick={() => { setSemanaOffset(o => Math.max(0, o - 1)); setDiaSel(0) }} disabled={semanaOffset === 0}
                      className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 disabled:opacity-30">‹</button>
                    <div className="flex gap-1 flex-1">
                      {diasSemana.map((d, i) => (
                        <button key={i} onClick={() => setDiaSel(i)}
                          className={`flex-1 py-2 rounded-lg text-center transition-all ${i === diaSel ? 'bg-primary-600 text-white' : 'bg-gray-50 border border-gray-200 text-gray-600 hover:border-primary-300'}`}>
                          <div className="text-xs font-medium">{DIAS_SEMANA[d.getDay()]}</div>
                          <div className="text-sm font-bold">{d.getDate()}</div>
                        </button>
                      ))}
                    </div>
                    <button onClick={() => { setSemanaOffset(o => Math.min(3, o + 1)); setDiaSel(0) }} disabled={semanaOffset === 3}
                      className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 disabled:opacity-30">›</button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {horariosSel.length === 0 && <div className="col-span-3 text-center py-6 text-gray-400 text-sm">Nenhum horário disponível.</div>}
                    {horariosSel.map(h => (
                      <button key={h.hora} onClick={() => h.livres > 0 && abrirModal(h.hora)} disabled={h.livres === 0}
                        className={`py-3 px-3 rounded-xl text-sm font-medium border transition-all ${h.livres === 0 ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed' : 'bg-white border-gray-200 text-gray-700 hover:border-primary-400 hover:bg-primary-50 active:scale-95'}`}>
                        <div className="font-bold">{h.hora}</div>
                        <div className="text-xs opacity-70 mt-0.5">{h.livres === 0 ? 'Lotado' : `${h.livres} vaga${h.livres !== 1 ? 's' : ''}`}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {modalFoto && (
        <div className="fixed inset-0 bg-black/70 z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="font-bold text-gray-900 flex items-center gap-2"><Camera size={18} className="text-primary-600" /> Foto facial</div>
                <div className="text-xs text-gray-400 mt-0.5">{clienteSel?.nome} · CPF {clienteSel?.cpf}</div>
              </div>
              <button onClick={fecharModalFoto} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <input type="file" accept="image/jpeg,image/png" ref={fileInputRef} onChange={processarArquivoUpload} style={{ display: 'none' }} />
            {!fotoCapturada ? (
              <>
                <div className="bg-black rounded-xl overflow-hidden mb-3 aspect-[4/3] relative">
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                  {!streamCam && <div className="absolute inset-0 flex items-center justify-center text-white text-sm">Carregando câmera...</div>}
                </div>
                <canvas ref={canvasRef} style={{ display: 'none' }} />
                <div className="flex gap-2">
                  <button onClick={capturarFoto} disabled={!streamCam} className="btn flex-1 bg-primary-600 text-white hover:bg-primary-700 gap-1 disabled:opacity-50"><Camera size={14} /> Tirar foto</button>
                  <button onClick={clicarUpload} className="btn gap-1 border border-gray-200 text-gray-700 hover:bg-gray-50"><Upload size={14} /> Enviar arquivo</button>
                </div>
              </>
            ) : (
              <>
                <div className="bg-gray-100 rounded-xl overflow-hidden mb-3 aspect-[4/3]">
                  <img src={fotoCapturada} alt="Captura" className="w-full h-full object-cover" />
                </div>
                <div className="flex gap-2">
                  <button onClick={descartarCaptura} className="btn flex-1 border border-gray-200 text-gray-700 hover:bg-gray-50 gap-1"><X size={14} /> Tirar outra</button>
                  <button onClick={salvarFoto} disabled={salvandoFoto} className="btn flex-1 bg-green-600 text-white hover:bg-green-700 gap-1 disabled:opacity-50"><Check size={14} /> {salvandoFoto ? 'Salvando...' : 'Confirmar e salvar'}</button>
                </div>
              </>
            )}
            {erroFoto && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-3 text-sm text-red-600 flex items-start gap-2"><AlertCircle size={14} className="mt-0.5 flex-shrink-0" />{erroFoto}</div>}
            <div className="text-xs text-gray-400 text-center mt-4">📸 Tire a foto com boa iluminação, rosto centralizado e sem óculos escuros ou bonés.</div>
          </div>
        </div>
      )}

      {modalSlot && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="font-bold text-gray-900">Confirmar agendamento</div>
                <div className="text-sm text-gray-400 mt-0.5 capitalize">{new Date(modalSlot.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })} · {modalSlot.hora}</div>
                <div className="text-xs text-gray-400">{unidadeAtiva.nome}</div>
              </div>
              <button onClick={() => setModalSlot(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="mb-4">
              <div className="text-xs text-gray-400 mb-2 uppercase tracking-wide font-semibold">Usar crédito de</div>
              <div className="space-y-2">
                {saldosUnidadeAtiva.length === 0 ? (
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm text-orange-700">Cliente sem créditos disponíveis nesta unidade.</div>
                ) : (
                  saldosUnidadeAtiva.map(([key, info]: [string, any]) => {
                    const restante = info.disponivel; const semSaldo = restante <= 0
                    return (
                      <div key={key} onClick={() => !semSaldo && setTipoCredito(info.tipo_plano)}
                        className={`border rounded-xl p-3 flex items-center gap-3 transition-all ${semSaldo ? 'opacity-40 cursor-not-allowed border-gray-100 bg-gray-50' : tipoCredito === info.tipo_plano ? 'bg-primary-50 border-primary-400 cursor-pointer' : 'border-gray-200 hover:border-primary-200 cursor-pointer bg-white'}`}>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${tipoCredito === info.tipo_plano ? 'border-primary-600 bg-primary-600' : 'border-gray-300'}`}>
                          {tipoCredito === info.tipo_plano && <div className="w-2 h-2 rounded-full bg-white" />}
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-gray-900 capitalize">{info.tipo_plano}</div>
                          <div className="text-xs text-gray-400">{restante} sessão{restante !== 1 ? 'ões' : ''} restante{restante !== 1 ? 's' : ''}</div>
                        </div>
                        {semSaldo && <span className="text-xs text-red-400 font-medium">Sem saldo</span>}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
            {erroModal && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-600">{erroModal}</div>}
            <div className="flex gap-2">
              <button onClick={() => setModalSlot(null)} className="btn flex-1 text-gray-500 border border-gray-200">Cancelar</button>
              <button onClick={confirmarAgendamento} disabled={agendando || !tipoCredito}
                className={`btn flex-1 font-medium transition-all ${tipoCredito ? 'bg-primary-600 text-white hover:bg-primary-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
                <Calendar size={14} className="mr-1.5" />{agendando ? 'Confirmando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalVenda && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="font-bold text-gray-900 flex items-center gap-2"><ShoppingCart size={18} className="text-green-600" /> Vender produto</div>
                <div className="text-xs text-gray-400 mt-0.5">para {clienteSel?.nome} · {unidadeAtiva.nome}</div>
              </div>
              <button onClick={() => setModalVenda(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            {produtosDisp.length === 0 ? (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-sm text-orange-700">Nenhum produto ativo disponível para esta unidade.</div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-500 mb-2 block font-medium uppercase tracking-wide">Produto</label>
                  <div className="space-y-2">
                    {produtosDisp.map(p => (
                      <label key={p.id} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${formVenda.produto_id === p.id ? 'border-green-400 bg-green-50' : 'border-gray-200'}`}>
                        <input type="radio" checked={formVenda.produto_id === p.id} onChange={() => selecionarProduto(p.id)} className="mt-1 accent-green-600" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-900">{p.nome}</span>
                            {p.subtipo === 'acesso' && <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Acesso</span>}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">R$ {Number(p.valor).toFixed(2).replace('.', ',')}{p.subtipo === 'acesso' ? ` · ${p.dias_validade} dias de acesso` : (p.creditos_por_venda > 1 ? ` · ${p.creditos_por_venda} créditos por venda` : '')}{p.subtipo !== 'acesso' && p.dias_validade && ` · validade ${p.dias_validade} dias`}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block font-medium">Quantidade</label>
                    <input type="number" min={1} max={20} className="input w-full" value={formVenda.quantidade} onChange={e => setFormVenda({ ...formVenda, quantidade: parseInt(e.target.value) || 1 })} />
                    {ehAcesso && formVenda.quantidade > 1 && <div className="text-xs text-amber-600 mt-1">⚠️ Vai somar a vigência (ex: 2x semestral = 360 dias)</div>}
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block font-medium">Valor unitário (R$)</label>
                    <input type="number" min={0} step="0.01" className="input w-full" value={formVenda.valor_unitario} onChange={e => setFormVenda({ ...formVenda, valor_unitario: parseFloat(e.target.value) || 0 })} />
                  </div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-amber-800">Desconto</span>
                    {ehCortesia ? (
                      <button onClick={limparDesconto} className="text-xs text-red-600 hover:underline">Remover cortesia</button>
                    ) : (
                      <button onClick={aplicarCortesia} className="btn btn-sm gap-1 bg-amber-500 text-white hover:bg-amber-600 text-xs"><Gift size={12} /> Cortesia 100%</button>
                    )}
                  </div>
                  {!ehCortesia && (
                    <div className="flex items-center gap-2">
                      <input type="number" min={0} max={100} step={1} className="input flex-1" placeholder="0" value={formVenda.desconto_percentual || ''} onChange={e => setFormVenda({ ...formVenda, desconto_percentual: parseFloat(e.target.value) || 0 })} />
                      <span className="text-sm text-amber-800 font-medium">%</span>
                    </div>
                  )}
                </div>
                <div className={`rounded-xl p-3 ${ehCortesia ? 'bg-amber-50 border border-amber-300' : 'bg-green-50 border border-green-200'}`}>
                  {formVenda.desconto_percentual > 0 && !ehCortesia && (
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-500">Valor original</span>
                      <span className="text-sm text-gray-500 line-through font-mono">R$ {valorOriginal.toFixed(2).replace('.', ',')}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-medium ${ehCortesia ? 'text-amber-800' : 'text-green-800'}`}>{ehCortesia ? '🎁 Cortesia (sem cobrança)' : 'Total da venda'}</span>
                    <span className={`font-mono text-xl font-bold ${ehCortesia ? 'text-amber-700' : 'text-green-700'}`}>R$ {valorTotalComDesconto.toFixed(2).replace('.', ',')}</span>
                  </div>
                  {ehAcesso && produtoSelecionado && <div className="mt-2 pt-2 border-t border-green-200 text-xs text-amber-700">📅 Vigência: {produtoSelecionado.dias_validade * formVenda.quantidade} dias a partir de hoje</div>}
                </div>
                {!ehCortesia && (
                  <div>
                    <label className="text-xs text-gray-500 mb-2 block font-medium uppercase tracking-wide">Forma de pagamento</label>
                    <div className="grid grid-cols-2 gap-2">
                      {FORMAS_PAGAMENTO.filter(f => f.key !== 'cortesia').map(f => (
                        <button key={f.key} onClick={() => setFormVenda({ ...formVenda, forma_pagamento: f.key })}
                          className={`p-3 rounded-xl border text-sm font-medium transition-all ${formVenda.forma_pagamento === f.key ? 'border-green-400 bg-green-50 text-green-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <label className="text-xs text-gray-500 mb-1 block font-medium">Observação (opcional)</label>
                  <textarea className="input w-full resize-none" rows={2} value={formVenda.observacao} onChange={e => setFormVenda({ ...formVenda, observacao: e.target.value })} placeholder={ehCortesia ? "Ex: cortesia primeiro cliente go-live" : "Ex: cliente pagou parcelado..."} />
                </div>
                {erroVenda && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600 flex items-start gap-2"><AlertCircle size={14} className="mt-0.5 flex-shrink-0" />{erroVenda}</div>}
                <div className="flex gap-2">
                  <button onClick={() => setModalVenda(false)} className="btn flex-1 text-gray-500 border border-gray-200">Cancelar</button>
                  <button onClick={confirmarVenda} disabled={vendendo} className={`btn flex-1 text-white gap-1 ${ehCortesia ? 'bg-amber-500 hover:bg-amber-600' : 'bg-green-600 hover:bg-green-700'}`}>
                    {ehCortesia ? <Gift size={14} /> : <DollarSign size={14} />}{vendendo ? 'Registrando...' : ehCortesia ? 'Confirmar cortesia' : 'Confirmar venda'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {modalAtivarPlano && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="font-bold text-gray-900">Ativar plano</div>
              <button onClick={() => setModalAtivarPlano(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="bg-primary-50 border border-primary-200 rounded-xl p-4 mb-4">
              <div className="font-semibold text-primary-900">{modalAtivarPlano.nome}</div>
              <div className="text-xs text-primary-700 mt-1">{modalAtivarPlano.creditos_mes} sessões/mês em {unidadeAtiva.nome}</div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-xs text-blue-800 space-y-2">
              <div className="font-semibold flex items-center gap-1"><Mail size={12} /> Como funciona</div>
              <div className="leading-relaxed">Será gerado um link único para o cliente <strong>{clienteSel?.nome}</strong> aceitar o Termo de Adesão Wellhub/TotalPass. Após a ativação, você pode <strong>enviar por email</strong> ou <strong>copiar o link</strong> para mandar via WhatsApp.</div>
              <div className="leading-relaxed pt-1 border-t border-blue-200">⚠️ Os créditos só serão liberados após o cliente aceitar o termo.</div>
            </div>
            {erroAtivacao && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-600">{erroAtivacao}</div>}
            <div className="flex gap-2">
              <button onClick={() => setModalAtivarPlano(null)} className="btn flex-1 text-gray-500 border border-gray-200">Cancelar</button>
              <button onClick={() => ativarPlano(modalAtivarPlano.id)} disabled={salvandoPlano} className="btn flex-1 bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
                {salvandoPlano ? 'Gerando link...' : 'Gerar link de aceite'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalLinkAceite && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="font-bold text-gray-900 flex items-center gap-2"><Check size={18} className="text-green-600" /> Link de aceite gerado</div>
                <div className="text-xs text-gray-400 mt-0.5">{modalLinkAceite.plano?.nome}</div>
              </div>
              <button onClick={() => setModalLinkAceite(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-4 text-xs text-orange-800">
              <div className="font-semibold mb-1 flex items-center gap-1"><Clock size={12} /> Aguardando aceite do cliente</div>
              <div className="leading-relaxed">O cliente precisa acessar o link, ler o Termo de Adesão e confirmar o aceite digitalmente. Os créditos só serão liberados após o aceite.</div>
            </div>
            <div className="mb-4">
              <div className="text-xs text-gray-500 mb-2 font-semibold uppercase tracking-wide">Link de aceite</div>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 break-all text-xs text-gray-700 font-mono mb-2">{modalLinkAceite.link}</div>
              <button onClick={copiarLink} className={`w-full btn gap-1 ${copiado ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                {copiado ? <><Check size={14} /> Copiado!</> : <><Copy size={14} /> Copiar link</>}
              </button>
            </div>
            <div className="border-t border-gray-200 pt-4">
              <div className="text-xs text-gray-500 mb-2 font-semibold uppercase tracking-wide">Enviar por email</div>
              <div className="text-xs text-gray-500 mb-3">Email do cliente: <strong className="text-gray-700">{clienteSel?.email}</strong></div>
              {emailEnviado ? (
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-700 flex items-center gap-2"><Check size={14} /> Email enviado com sucesso!</div>
              ) : (
                <button onClick={enviarEmailAceite} disabled={enviandoEmail} className="w-full btn gap-1 bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
                  <Mail size={14} /> {enviandoEmail ? 'Enviando...' : 'Enviar email com o link'}
                </button>
              )}
              {erroEmail && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-3 text-xs text-red-600 flex items-start gap-2"><AlertCircle size={12} className="mt-0.5 flex-shrink-0" />{erroEmail}</div>}
            </div>
            <button onClick={() => setModalLinkAceite(null)} className="w-full mt-4 btn text-gray-500 border border-gray-200">Fechar</button>
          </div>
        </div>
      )}

      {modalVencimento && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="font-bold text-gray-900 flex items-center gap-2"><CalendarClock size={18} className="text-amber-600" /> Ajustar vencimento</div>
                <div className="text-xs text-gray-400 mt-0.5">{modalVencimento.produtos?.nome}</div>
              </div>
              <button onClick={() => setModalVencimento(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-800">💡 Use este ajuste quando o cliente comprou o plano fora do sistema e você precisa retroagir ou estender o vencimento.</div>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-gray-500 mb-1">Início do plano</div>
                <div className="text-sm font-medium text-gray-900">{modalVencimento.inicio ? formatarBR(modalVencimento.inicio) : '—'}</div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">Nova data de vencimento</label>
                <input type="date" className="input w-full" value={novoVencimento} onChange={e => setNovoVencimento(e.target.value)} />
                <div className="text-xs text-gray-400 mt-1">Vencimento atual: {modalVencimento.fim ? formatarBR(modalVencimento.fim) : '—'}</div>
              </div>
            </div>
            {erroVencimento && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-3 text-sm text-red-600 flex items-start gap-2"><AlertCircle size={14} className="mt-0.5 flex-shrink-0" />{erroVencimento}</div>}
            <div className="flex gap-2 mt-6">
              <button onClick={() => setModalVencimento(null)} className="btn flex-1 text-gray-500 border border-gray-200">Cancelar</button>
              <button onClick={salvarNovoVencimento} disabled={ajustandoVencimento} className="btn flex-1 bg-amber-500 text-white hover:bg-amber-600 gap-1">
                <Check size={12} /> {ajustandoVencimento ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {novoCliente && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-gray-900 text-lg flex items-center gap-2"><UserPlus size={20} className="text-primary-600" /> Novo cliente</div>
              <button onClick={() => setNovoCliente(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="text-xs text-gray-500 mb-4">Após cadastrar, o sistema criará automaticamente o acesso e enviará as boas-vindas por email.</div>
            <div className="space-y-3">
              {[
                { label: 'Nome completo', key: 'nome', type: 'text', placeholder: 'Ex: Maria Silva', required: true },
                { label: 'Email', key: 'email', type: 'email', placeholder: 'cliente@email.com', required: true, hint: 'Será usado para acesso ao sistema e envio das boas-vindas' },
                { label: 'Telefone', key: 'telefone', type: 'text', placeholder: '(11) 99999-9999', required: false },
                { label: 'CPF', key: 'cpf', type: 'text', placeholder: '00000000000', required: true },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs text-gray-500 mb-1 block font-medium">{f.label} {f.required && <span className="text-red-500">*</span>}</label>
                  <input type={f.type} className="input w-full" placeholder={f.placeholder} value={(formNovo as any)[f.key]} onChange={e => setFormNovo({ ...formNovo, [f.key]: e.target.value })} />
                  {f.hint && <div className="text-xs text-gray-400 mt-1">{f.hint}</div>}
                </div>
              ))}
            </div>
            {erroCriar && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-3 text-sm text-red-600 flex items-start gap-2"><AlertCircle size={14} className="mt-0.5 flex-shrink-0" />{erroCriar}</div>}
            <div className="flex gap-2 mt-6">
              <button onClick={() => setNovoCliente(false)} className="btn flex-1 text-gray-500 border border-gray-200">Cancelar</button>
              <button onClick={criarCliente} disabled={criando} className="btn flex-1 bg-primary-600 text-white font-medium gap-1">
                <UserPlus size={14} />{criando ? 'Cadastrando...' : 'Cadastrar e criar acesso'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalAcessoCriado && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="font-bold text-gray-900 flex items-center gap-2"><Check size={18} className="text-green-600" />{modalAcessoCriado.sucessoEmail ? 'Acesso criado com sucesso' : 'Acesso criado'}</div>
              <button onClick={() => setModalAcessoCriado(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            {modalAcessoCriado.sucessoEmail ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
                <div className="flex items-start gap-3">
                  <Mail size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold text-green-900 mb-1">Email de boas-vindas enviado</div>
                    <div className="text-xs text-green-700 leading-relaxed">O cliente recebeu em <strong>{modalAcessoCriado.email}</strong> um email com os dados de acesso e a senha provisória.</div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-4 text-xs text-orange-800">
                  <div className="font-semibold mb-1">⚠️ Email não foi enviado</div>
                  <div className="leading-relaxed">O acesso foi criado, mas o email de boas-vindas falhou. Anote a senha provisória e passe ao cliente manualmente.</div>
                </div>
                <div className="bg-gray-900 rounded-xl p-4 mb-4">
                  <div className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Senha provisória</div>
                  <div className="font-mono text-2xl text-primary-300 font-bold tracking-wider mb-2">{modalAcessoCriado.senha}</div>
                  <div className="text-xs text-gray-400">Email de login: <span className="text-white font-mono">{modalAcessoCriado.email}</span></div>
                </div>
              </>
            )}
            <button onClick={() => setModalAcessoCriado(null)} className="w-full btn bg-primary-600 text-white hover:bg-primary-700">Entendi</button>
          </div>
        </div>
      )}
    </div>
  )
}
