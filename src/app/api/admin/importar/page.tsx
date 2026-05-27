'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Upload, CheckCircle, AlertCircle, Users, Zap } from 'lucide-react'

type Resultado = {
  sucesso: boolean
  tipo: string
  total_arquivo?: number
  inseridos?: number
  creditos_inseridos?: number
  sem_cliente?: number
  erros?: number
  error?: string
}

export default function AdminImportarPage() {
  const { perfil, loading } = useAuth()
  const router = useRouter()

  const [etapa, setEtapa] = useState<1 | 2>(1)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [processando, setProcessando] = useState(false)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (loading) return
    if (!perfil) { router.push('/'); return }
    if ((perfil.role as any) !== 'admin') { router.push('/'); return }
  }, [loading, perfil])

  function selecionarArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.name.endsWith('.xlsx')) { alert('Apenas arquivos .xlsx são aceitos'); return }
    setArquivo(f)
    setResultado(null)
  }

  async function processar() {
    if (!arquivo) return
    setProcessando(true)
    setResultado(null)

    const form = new FormData()
    form.append('arquivo', arquivo)
    form.append('tipo', etapa === 1 ? 'clientes' : 'creditos')

    try {
      const res = await fetch('/api/admin/importar-clientes', { method: 'POST', body: form })
      const data = await res.json()
      setResultado(data)
      if (data.sucesso && etapa === 1) {
        // Avança automaticamente para etapa 2 após 2s
        setTimeout(() => { setEtapa(2); setArquivo(null); if (inputRef.current) inputRef.current.value = '' }, 2000)
      }
    } catch (e: any) {
      setResultado({ sucesso: false, tipo: '', error: e.message })
    } finally {
      setProcessando(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="text-base font-semibold text-gray-900">Importação de Clientes</div>
        <div className="text-xs text-gray-400 mt-0.5">Migração do sistema anterior</div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-8 space-y-6">

        {/* Progresso */}
        <div className="flex items-center gap-4">
          {[
            { n: 1, label: 'Cadastros', icon: Users },
            { n: 2, label: 'Créditos', icon: Zap },
          ].map(({ n, label, icon: Icon }) => (
            <div key={n} className="flex items-center gap-2 flex-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${etapa === n ? 'bg-primary-600 text-white' : etapa > n ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                {etapa > n ? '✓' : n}
              </div>
              <div>
                <div className={`text-sm font-medium ${etapa === n ? 'text-gray-900' : 'text-gray-400'}`}>{label}</div>
                <div className="text-xs text-gray-400">{n === 1 ? 'alunos-justclub.xlsx' : 'alunos-creditos-vencer.xlsx'}</div>
              </div>
              {n < 2 && <div className="flex-1 h-px bg-gray-200 mx-2"/>}
            </div>
          ))}
        </div>

        {/* Instruções */}
        <div className="card border-blue-200 bg-blue-50">
          <div className="text-sm font-semibold text-blue-900 mb-2">
            {etapa === 1 ? '1️⃣ Upload do cadastro de alunos' : '2️⃣ Upload dos créditos ativos'}
          </div>
          <div className="text-xs text-blue-700 leading-relaxed">
            {etapa === 1
              ? 'Faça o upload do arquivo "alunos-justclub.xlsx". O sistema irá importar todos os clientes silenciosamente — sem criar login ou enviar emails.'
              : 'Faça o upload do arquivo "alunos-creditos-vencer.xlsx". O sistema irá registrar os créditos de cada cliente com base no vencimento original.'}
          </div>
        </div>

        {/* Upload */}
        <div className="card">
          <div
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${arquivo ? 'border-primary-400 bg-primary-50' : 'border-gray-200 hover:border-gray-400'}`}
          >
            <Upload size={28} className={`mx-auto mb-3 ${arquivo ? 'text-primary-500' : 'text-gray-300'}`}/>
            {arquivo ? (
              <div>
                <div className="text-sm font-semibold text-gray-900">{arquivo.name}</div>
                <div className="text-xs text-gray-500 mt-1">{(arquivo.size / 1024 / 1024).toFixed(1)} MB · Pronto para importar</div>
              </div>
            ) : (
              <div>
                <div className="text-sm font-medium text-gray-600">Clique para selecionar o arquivo</div>
                <div className="text-xs text-gray-400 mt-1">Apenas .xlsx</div>
              </div>
            )}
          </div>
          <input ref={inputRef} type="file" accept=".xlsx" onChange={selecionarArquivo} className="hidden"/>

          {arquivo && (
            <button onClick={processar} disabled={processando}
              className={`w-full mt-4 btn py-3 font-semibold ${processando ? 'bg-gray-100 text-gray-400 cursor-wait' : 'bg-primary-600 text-white hover:bg-primary-700'}`}>
              {processando ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                  Processando... (pode demorar alguns minutos)
                </span>
              ) : etapa === 1 ? 'Importar cadastros →' : 'Importar créditos →'}
            </button>
          )}
        </div>

        {/* Resultado */}
        {resultado && (
          <div className={`card ${resultado.sucesso ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
            <div className="flex items-start gap-3">
              {resultado.sucesso
                ? <CheckCircle size={20} className="text-green-600 flex-shrink-0 mt-0.5"/>
                : <AlertCircle size={20} className="text-red-500 flex-shrink-0 mt-0.5"/>}
              <div className="flex-1">
                {resultado.sucesso ? (
                  <>
                    <div className="text-sm font-semibold text-green-900 mb-2">
                      {resultado.tipo === 'clientes' ? 'Cadastros importados!' : 'Créditos importados!'}
                    </div>
                    <div className="space-y-1 text-xs text-green-700">
                      {resultado.tipo === 'clientes' && (
                        <>
                          <div>Total no arquivo: <strong>{resultado.total_arquivo?.toLocaleString('pt-BR')}</strong></div>
                          <div>Inseridos: <strong>{resultado.inseridos?.toLocaleString('pt-BR')}</strong></div>
                          {(resultado.erros || 0) > 0 && <div className="text-orange-600">Erros: {resultado.erros}</div>}
                        </>
                      )}
                      {resultado.tipo === 'creditos' && (
                        <>
                          <div>Clientes com crédito: <strong>{resultado.total_arquivo}</strong></div>
                          <div>Créditos inseridos: <strong>{resultado.creditos_inseridos?.toLocaleString('pt-BR')}</strong></div>
                          {(resultado.sem_cliente || 0) > 0 && <div className="text-orange-600">Sem cadastro no sistema: {resultado.sem_cliente}</div>}
                          {(resultado.erros || 0) > 0 && <div className="text-red-600">Erros: {resultado.erros}</div>}
                        </>
                      )}
                    </div>
                    {resultado.tipo === 'clientes' && (
                      <div className="mt-3 text-xs text-green-600">Avançando para importação de créditos...</div>
                    )}
                    {resultado.tipo === 'creditos' && (
                      <div className="mt-3">
                        <div className="text-xs text-green-600 font-semibold mb-2">✅ Importação completa!</div>
                        <button onClick={() => router.push('/admin/clientes')}
                          className="btn btn-sm bg-green-600 text-white hover:bg-green-700">
                          Ver clientes →
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-sm text-red-700">{resultado.error || 'Erro desconhecido'}</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Aviso */}
        <div className="card border-amber-200 bg-amber-50 text-xs text-amber-700 leading-relaxed">
          ⚠️ A importação é silenciosa — nenhum email será enviado. Clientes sem CPF entram sem esse campo e podem ser completados quando comparecerem à recepção.
        </div>
      </div>
    </div>
  )
}
