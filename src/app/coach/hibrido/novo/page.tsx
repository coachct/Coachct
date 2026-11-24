'use client'
import { Suspense } from 'react'
import EditorHibrido from '@/app/ju/hibrido/Editor'

// Coach monta um treino de Running & Hybrid; cai na biblioteca geral (a Ju/admin aloca a data).
export default function CoachNovoTreinoHibridoPage() {
  return <Suspense><EditorHibrido modo="coach" /></Suspense>
}
