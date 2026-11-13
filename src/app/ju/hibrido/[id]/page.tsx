'use client'
import { Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import EditorHibrido from '../Editor'

function Editar() {
  const { id } = useParams<{ id: string }>()
  const sp = useSearchParams()
  return <EditorHibrido key={id} treinoId={id} dataInicial={sp.get('data') || undefined} />
}

export default function EditarTreinoHibridoPage() {
  return <Suspense><Editar /></Suspense>
}
