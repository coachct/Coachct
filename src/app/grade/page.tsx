'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function GradeRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/agendar')
  }, [])

  return null
}
