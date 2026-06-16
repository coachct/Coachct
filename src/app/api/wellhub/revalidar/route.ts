// src/app/api/wellhub/revalidar/route.ts
//
// Re-roda a validação de um check-in já gravado (admin only).
// Usado pra recuperar entradas que ficaram 'erro' (ex.: validadas contra o
// ambiente errado antes do go-live) ou 'validado' sem valor (produto que
// passou a estar no cadastro depois). Seguro: o validate da Gympass é uso
// único, então não há risco de cobrança dupla.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase-server';
import { validarCheckin } from '@/lib/wellhub/validar-checkin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // 1. Autenticação: só admin/coordenadora
  const userClient = createServerSupabase();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ erro: 'nao autenticado' }, { status: 401 });
  }
  const { data: perfil } = await userClient
    .from('perfis')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (!perfil || !['admin', 'coordenadora'].includes((perfil as any).role)) {
    return NextResponse.json({ erro: 'sem permissao' }, { status: 403 });
  }

  // 2. entradaId do corpo
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: 'body invalido' }, { status: 400 });
  }
  const entradaId = body?.entradaId;
  if (!entradaId) {
    return NextResponse.json({ erro: 'entradaId ausente' }, { status: 400 });
  }

  // 3. Carrega a entrada (service role) pra pegar id_externo + produto do raw
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ erro: 'config ausente' }, { status: 500 });
  }
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: entrada, error } = await admin
    .from('entradas_walkin')
    .select('id, id_externo, origem, raw')
    .eq('id', entradaId)
    .maybeSingle();
  if (error || !entrada) {
    return NextResponse.json({ erro: 'entrada nao encontrada' }, { status: 404 });
  }
  if ((entrada as any).origem !== 'wellhub') {
    return NextResponse.json({ erro: 'origem nao suportada' }, { status: 400 });
  }

  const p = (entrada as any).raw?.event_data?.gym?.product;
  const gympassId =
    (entrada as any).id_externo ?? (entrada as any).raw?.event_data?.user?.unique_token;
  if (!gympassId) {
    return NextResponse.json({ erro: 'gympassId ausente' }, { status: 400 });
  }

  // 4. Re-roda a validação (atualiza status/valor na própria entrada)
  await validarCheckin({
    entradaId: (entrada as any).id,
    gympassId: String(gympassId),
    produtoId: p?.id != null ? String(p.id) : null,
    produtoDescricao: p?.description ?? null,
  });

  return NextResponse.json({ ok: true });
}
