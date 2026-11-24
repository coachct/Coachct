'use client'
import { useParams } from 'next/navigation'
import EditorHibrido from '@/app/ju/hibrido/Editor'

export default function CoachEditarTreinoHibridoPage() {
  const { id } = useParams<{ id: string }>()
  return <EditorHibrido key={id} treinoId={id} modo="coach" />
}
