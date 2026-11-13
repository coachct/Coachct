'use client'
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import EditorHibrido from '../Editor'

function Novo() {
  const sp = useSearchParams()
  return (
    <EditorHibrido
      dataInicial={sp.get('data') || undefined}
      faixaInicial={sp.get('faixa') ? Number(sp.get('faixa')) : undefined}
    />
  )
}

export default function NovoTreinoHibridoPage() {
  return <Suspense><Novo /></Suspense>
}
