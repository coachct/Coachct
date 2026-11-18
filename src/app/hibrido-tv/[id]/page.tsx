'use client'
// Teste da TV pela Ju/admin (logado): roda um treino salvo específico.
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Treino, carregarTreino } from '@/lib/hibrido'
import Player, { Centro } from '../Player'

export default function HibridoTvTestePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user, perfil, loading: authLoading } = useAuth()
  const supabase = createClient()
  const [t, setT] = useState<Treino | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (authLoading || !user) return
    carregarTreino(supabase, id).then(tr => {
      if (!tr) { setErro('Treino não encontrado (ou sem permissão).'); return }
      setT(tr)
    })
  }, [id, authLoading, user])

  if (authLoading) return <Centro>Carregando…</Centro>
  if (!user || !perfil || !['admin', 'coordenadora'].includes(perfil.role)) {
    return <Centro>Entre com o usuário de admin ou coordenadora para abrir a TV. <Link href="/equipe" className="text-[#ff6db8] underline ml-2">Entrar</Link></Centro>
  }
  if (erro) return <Centro>{erro}</Centro>
  if (!t) return <Centro>Carregando treino…</Centro>
  return <Player treino={t} onFechar={() => router.push(`/ju/hibrido/${t.id}`)} />
}
