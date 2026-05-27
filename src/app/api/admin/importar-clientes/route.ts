import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

export async function POST(req: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Não configurado' }, { status: 500 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const formData = await req.formData()
    const arquivo = formData.get('arquivo') as File
    const tipo = formData.get('tipo') as string // 'clientes' ou 'creditos'

    if (!arquivo) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })

    const buffer = await arquivo.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows: any[] = XLSX.utils.sheet_to_json(ws)

    if (tipo === 'clientes') {
      return await importarClientes(supabase, rows)
    } else if (tipo === 'creditos') {
      return await importarCreditos(supabase, rows)
    }

    return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

async function importarClientes(supabase: any, rows: any[]) {
  let inseridos = 0
  let ignorados = 0
  let erros = 0
  const BATCH = 100

  // Normaliza CPF
  function limparCpf(cpf: any): string | null {
    if (!cpf) return null
    const s = String(cpf).replace(/\D/g, '')
    return s.length === 11 ? s : null
  }

  // Deduplicar por CPF (mantém primeiro com mais dados)
  const mapa: Record<string, any> = {}
  for (const row of rows) {
    const cpf = limparCpf(row.txtCpf)
    const email = (row.txtEmail || '').trim().toLowerCase()
    if (!email || email === 'null') continue // pula sem email

    const chave = cpf || email
    if (!mapa[chave]) {
      mapa[chave] = {
        nome: (row.txtNome || '').trim(),
        email: email,
        telefone: row.txtTelefone && row.txtTelefone !== 'NULL' ? String(row.txtTelefone).trim() : null,
        cpf: cpf,
        bloqueado: false,
      }
    }
  }

  const clientes = Object.values(mapa)

  for (let i = 0; i < clientes.length; i += BATCH) {
    const lote = clientes.slice(i, i + BATCH)
    const { error } = await supabase.from('clientes').upsert(lote, {
      onConflict: 'cpf',
      ignoreDuplicates: true,
    })
    if (error) {
      // Tenta inserir um a um para não perder o lote inteiro
      for (const c of lote) {
        const { error: e2 } = await supabase.from('clientes').upsert(c, {
          onConflict: 'cpf',
          ignoreDuplicates: true,
        })
        if (e2) erros++
        else inseridos++
      }
    } else {
      inseridos += lote.length
    }
  }

  return NextResponse.json({
    sucesso: true,
    tipo: 'clientes',
    total_arquivo: rows.length,
    inseridos,
    ignorados,
    erros,
  })
}

async function importarCreditos(supabase: any, rows: any[]) {
  let inseridos = 0
  let semCliente = 0
  let erros = 0

  // Busca unidades club para mapear créditos
  const { data: unidades } = await supabase.from('unidades').select('id, nome, tipo').eq('tipo', 'club')
  const unidadePadrao = unidades?.[0]?.id // Vila Olímpia como padrão

  // Mapeamento de produtos antigos → tipo de crédito no novo sistema
  function mapearProduto(produto: string): string {
    const p = (produto || '').toLowerCase()
    if (p.includes('pinheiros')) return 'pinheiros'
    return 'club' // padrão Vila Olímpia
  }

  function unidadePorProduto(produto: string): string {
    const p = (produto || '').toLowerCase()
    const pinheiros = unidades?.find((u: any) => u.nome.toLowerCase().includes('pinheiros'))
    if (p.includes('pinheiros') && pinheiros) return pinheiros.id
    return unidadePadrao
  }

  for (const row of rows) {
    const email = (row.txtEmail || '').trim().toLowerCase()
    const cpf = row.txtCpf ? String(row.txtCpf).replace(/\D/g, '') : null
    const qtd = parseInt(row.intQtdCreditosVencer) || 0
    const vencimento = row.datVencimento instanceof Date
      ? row.datVencimento.toISOString().split('T')[0]
      : String(row.datVencimento || '').split('T')[0]

    if (qtd <= 0) continue

    // Busca o cliente pelo CPF ou email
    let cliente = null
    if (cpf && cpf.length === 11) {
      const { data } = await supabase.from('clientes').select('id').eq('cpf', cpf).maybeSingle()
      cliente = data
    }
    if (!cliente && email) {
      const { data } = await supabase.from('clientes').select('id').eq('email', email).maybeSingle()
      cliente = data
    }

    if (!cliente) { semCliente++; continue }

    const unidadeId = unidadePorProduto(row.txtProdutoTitulo || '')

    // Insere créditos em lote como creditos_avulsos
    // Máximo de 200 créditos por cliente para não explodir
    const qtdFinal = Math.min(qtd, 200)
    const creditos = Array.from({ length: qtdFinal }, () => ({
      cliente_id: cliente.id,
      unidade_id: unidadeId,
      tipo: 'credito_treino',
      usado: false,
      validade: vencimento,
      observacao: `Migração — ${row.txtProdutoTitulo}`,
    }))

    const { error } = await supabase.from('creditos_avulsos').insert(creditos)
    if (error) erros++
    else inseridos += qtdFinal
  }

  return NextResponse.json({
    sucesso: true,
    tipo: 'creditos',
    total_arquivo: rows.length,
    creditos_inseridos: inseridos,
    sem_cliente: semCliente,
    erros,
  })
}
