'use client'
// Prévia da TV com o treino que está na tela do editor, ANTES de salvar.
// O editor grava o rascunho no navegador (localStorage) e abre esta página numa aba nova.
import { useEffect, useState } from 'react'
import { Treino, CHAVE_PREVIA_TV } from '@/lib/hibrido'
import Player, { Centro } from '../Player'

export default function HibridoTvPreviaPage() {
  const [t, setT] = useState<Treino | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CHAVE_PREVIA_TV)
      if (!raw) { setErro('Nenhum treino para mostrar. Volte ao editor e toque em "Ver na TV".'); return }
      setT(JSON.parse(raw))
    } catch {
      setErro('Não foi possível abrir a prévia. Volte ao editor e toque em "Ver na TV" de novo.')
    }
  }, [])

  if (erro) return <Centro>{erro}</Centro>
  if (!t) return <Centro>Carregando prévia…</Centro>
  return <Player treino={t} cabecalho="Prévia · não salvo" onFechar={() => window.close()} />
}
