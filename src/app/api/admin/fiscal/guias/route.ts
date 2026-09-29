// src/app/api/admin/fiscal/guias/route.ts
//
// POST: a equipe (admin/coordenadora) sobe o PDF/imagem de uma guia (DARF, DAS,
// DAMSP...). Guarda no bucket privado "fiscal-guias", pede ao Claude para ler a
// guia e sugerir a parcela/pendência correspondente, e grava em fiscal_guias com
// status 'lida'. Nada é aplicado aqui — quem subiu confere e confirma na tela
// (RPC fiscal_confirmar_guia).
//
// GET ?path=...: devolve URL assinada temporária para abrir o arquivo.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BUCKET = 'fiscal-guias'
const MAX_BYTES = 10 * 1024 * 1024 // 10MB
const MODELO = process.env.FISCAL_GUIA_MODELO || 'claude-sonnet-5-5'
const TIPOS_OK = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

async function autenticar(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return { erro: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) }
  const token = authHeader.replace('Bearer ', '')
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return { erro: NextResponse.json({ error: 'Sessão inválida' }, { status: 401 }) }
  const { data: perfil } = await supabase.from('perfis').select('id, role').eq('id', user.id).maybeSingle()
  if (!perfil || !['admin', 'coordenadora'].includes(perfil.role))
    return { erro: NextResponse.json({ error: 'Acesso negado' }, { status: 403 }) }
  return { supabase, user }
}

// O que o Claude devolve (via tool forçada — saída sempre estruturada)
const FERRAMENTA: Anthropic.Tool = {
  name: 'registrar_guia',
  description: 'Registra os dados lidos da guia de pagamento e a correspondência com a lista de débitos.',
  input_schema: {
    type: 'object',
    properties: {
      eh_guia: { type: 'boolean', description: 'false se o arquivo não for uma guia de pagamento de tributo' },
      tipo_documento: { type: 'string', description: 'DARF, DAS, DAS de parcelamento, DAMSP, DAMSP/TDM, GPS, DARF-PGFN etc.' },
      orgao: { type: 'string', enum: ['RFB', 'PGFN', 'PMSP', 'PGM', 'INSS', 'outro'] },
      contribuinte: { type: 'string', description: 'Nome/CNPJ do contribuinte como aparece na guia' },
      numero_parcelamento: { type: ['string', 'null'], description: 'Número do parcelamento/acordo/inscrição, se houver' },
      numero_parcela: { type: ['integer', 'null'], description: 'Número da parcela, se a guia informar' },
      codigo_receita: { type: ['string', 'null'] },
      periodo_apuracao: { type: ['string', 'null'], description: 'Período de apuração/competência como aparece' },
      vencimento: { type: ['string', 'null'], description: 'Data de vencimento/validade da guia, formato AAAA-MM-DD' },
      valor_principal: { type: ['number', 'null'] },
      valor_multa: { type: ['number', 'null'] },
      valor_juros: { type: ['number', 'null'] },
      valor_total: { type: ['number', 'null'], description: 'Valor total a pagar' },
      codigo_barras: { type: ['string', 'null'] },
      match_tipo: { type: 'string', enum: ['parcela', 'pendencia', 'nenhum'] },
      match_id: { type: ['string', 'null'], description: 'id EXATO do item da lista que corresponde à guia' },
      match_confianca: { type: 'string', enum: ['alta', 'media', 'baixa'] },
      observacao: {
        type: 'string',
        description: 'Em português, curto: por que casou com esse item e qualquer divergência relevante (valor, parcela, vencimento, número do acordo).',
      },
    },
    required: ['eh_guia', 'orgao', 'match_tipo', 'match_confianca', 'observacao'],
  },
}

export async function POST(req: NextRequest) {
  try {
    const auth = await autenticar(req)
    if (auth.erro) return auth.erro
    const { supabase, user } = auth

    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Arquivo ausente' }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Arquivo muito grande (máx 10MB).' }, { status: 400 })
    const mime = file.type || 'application/octet-stream'
    if (!TIPOS_OK.includes(mime))
      return NextResponse.json({ error: 'Envie a guia em PDF ou imagem (JPG/PNG).' }, { status: 400 })

    const bytes = Buffer.from(await file.arrayBuffer())
    const nome = file.name || 'guia'
    const safe = nome.replace(/[^\w.\-]+/g, '_').slice(0, 80)
    const path = `${new Date().toISOString().slice(0, 7)}/${Date.now()}-${safe}`

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false })
    if (upErr) return NextResponse.json({ error: 'Não consegui guardar o arquivo.' }, { status: 500 })

    // Lista de débitos em aberto para o Claude casar a guia
    const [{ data: parcelas }, { data: pendencias }] = await Promise.all([
      supabase
        .from('fiscal_parcelas')
        .select('id, numero, vencimento, valor, estimado, fiscal_acordos!inner(orgao, numero, descricao, qtd_parcelas, status)')
        .eq('pago', false)
        .in('fiscal_acordos.status', ['ativo', 'simulado'])
        .order('vencimento', { ascending: true })
        .limit(400),
      supabase
        .from('fiscal_pendencias')
        .select('id, orgao, descricao, valor')
        .neq('situacao', 'resolvida'),
    ])

    const listaParcelas = (parcelas || []).map((p: any) => ({
      id: p.id,
      orgao: p.fiscal_acordos.orgao,
      acordo: p.fiscal_acordos.descricao,
      numero_acordo: p.fiscal_acordos.numero,
      situacao_acordo: p.fiscal_acordos.status,
      parcela: `${p.numero}${p.fiscal_acordos.qtd_parcelas ? '/' + p.fiscal_acordos.qtd_parcelas : ''}`,
      vencimento: p.vencimento,
      valor_no_relatorio: Number(p.valor),
      valor_estimado: p.estimado,
    }))
    const listaPend = (pendencias || []).map((p: any) => ({
      id: p.id, orgao: p.orgao, descricao: p.descricao, valor_no_relatorio: p.valor,
    }))

    const bloco: Anthropic.ContentBlockParam =
      mime === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: bytes.toString('base64') } }
        : { type: 'image', source: { type: 'base64', media_type: mime as 'image/jpeg' | 'image/png' | 'image/webp', data: bytes.toString('base64') } }

    let dados: any = null
    let erroLeitura: string | null = null
    try {
      const client = new Anthropic() // lê ANTHROPIC_API_KEY do ambiente
      const resp = await client.messages.create({
        model: MODELO,
        max_tokens: 1500,
        tools: [FERRAMENTA],
        tool_choice: { type: 'tool', name: 'registrar_guia' },
        messages: [
          {
            role: 'user',
            content: [
              bloco,
              {
                type: 'text',
                text:
                  'Leia esta guia de pagamento de tributo da empresa (Brasil) e registre os dados com a ferramenta. ' +
                  'Use só o que está escrito na guia — campo que não aparece fica null, não deduza. ' +
                  'Depois compare com a lista de débitos em aberto abaixo e indique o item que corresponde a esta guia ' +
                  '(pelo número do parcelamento/inscrição, número da parcela, órgão, período e valor). ' +
                  'Se nenhum item corresponder com segurança, use match_tipo "nenhum". ' +
                  'Guias de parcelas em atraso costumam vir com multa e juros, então o total pode ser maior que o valor do relatório.\n\n' +
                  `PARCELAS EM ABERTO:\n${JSON.stringify(listaParcelas)}\n\n` +
                  `PENDÊNCIAS FORA DE ACORDO:\n${JSON.stringify(listaPend)}`,
              },
            ],
          },
        ],
      })
      const uso = resp.content.find((c) => c.type === 'tool_use') as Anthropic.ToolUseBlock | undefined
      dados = uso?.input ?? null
      if (!dados) erroLeitura = 'O leitor não devolveu os dados da guia.'
    } catch (e: any) {
      console.error('[fiscal/guias] leitura:', e?.message)
      erroLeitura = 'Não foi possível ler a guia automaticamente.'
    }

    // Só aceita o match se o id existir de fato na lista enviada
    let parcelaId: string | null = null
    let pendenciaId: string | null = null
    if (dados?.match_tipo === 'parcela' && listaParcelas.some((p) => p.id === dados.match_id)) parcelaId = dados.match_id
    if (dados?.match_tipo === 'pendencia' && listaPend.some((p) => p.id === dados.match_id)) pendenciaId = dados.match_id

    if (dados && dados.eh_guia === false) erroLeitura = 'O arquivo não parece ser uma guia de pagamento.'

    const venc = typeof dados?.vencimento === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dados.vencimento) ? dados.vencimento : null
    const total = typeof dados?.valor_total === 'number' ? dados.valor_total : null

    const { data: guia, error: insErr } = await supabase
      .from('fiscal_guias')
      .insert({
        arquivo_path: path,
        arquivo_nome: nome,
        status: erroLeitura ? 'erro' : 'lida',
        dados,
        orgao: dados?.orgao ?? null,
        valor_total: total,
        vencimento: venc,
        parcela_id: parcelaId,
        pendencia_id: pendenciaId,
        erro: erroLeitura,
        enviado_por: user.id,
      })
      .select('id')
      .single()
    if (insErr) return NextResponse.json({ error: 'Não consegui registrar a guia.' }, { status: 500 })

    return NextResponse.json({ ok: true, id: guia.id, erro: erroLeitura })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Erro ao processar a guia' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await autenticar(req)
    if (auth.erro) return auth.erro
    const p = String(req.nextUrl.searchParams.get('path') ?? '').trim()
    if (!p) return NextResponse.json({ error: 'Caminho ausente' }, { status: 400 })
    const { data, error } = await auth.supabase.storage.from(BUCKET).createSignedUrl(p, 3600)
    if (error || !data?.signedUrl) return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 })
    return NextResponse.json({ url: data.signedUrl })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Erro' }, { status: 500 })
  }
}
