import { NextRequest, NextResponse } from 'next/server'

// Tira o cliente do endereço técnico da Vercel (coach-ct.vercel.app) e leva
// para o domínio oficial, mantendo o mesmo caminho e os parâmetros.
// Só o host de produção da Vercel é redirecionado: previews (coach-ct-git-...)
// continuam funcionando. As rotas /api ficam de fora (matcher abaixo) porque
// crons da Vercel e as sincronizações TotalPass/Wellhub (pg_net) chamam o
// endereço da Vercel diretamente.
const HOST_VERCEL = 'coach-ct.vercel.app'
const DOMINIO_OFICIAL = 'www.justclubct.com.br'

export function middleware(req: NextRequest) {
  const host = (req.headers.get('host') || '').toLowerCase()
  if (host !== HOST_VERCEL) return NextResponse.next()

  const url = req.nextUrl.clone()
  url.protocol = 'https:'
  url.host = DOMINIO_OFICIAL
  url.port = ''
  return NextResponse.redirect(url, 308)
}

export const config = {
  matcher: ['/((?!api/|_next/|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)'],
}
