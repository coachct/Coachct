// src/lib/wellhub/assinatura.ts
//
// Verificação da assinatura dos webhooks do Wellhub (Access Control + Booking).
//
// O Wellhub assina o corpo CRU da requisição com HMAC-SHA1 usando o segredo
// compartilhado (WELLHUB_WEBHOOK_SECRET) e envia o resultado em hex MAIÚSCULO
// no header `x-gympass-signature`. A URL é única pra todos os eventos, então
// tanto o receiver de check-in quanto o de booking usam exatamente esta mesma
// verificação.
//
// Esta é a extração 1:1 da função `assinaturaValida` que já vivia inline em
// src/app/api/wellhub/checkin/route.ts — mesmo algoritmo, mesmo header, mesma
// comparação em tempo constante. Mantida aqui para reuso pelo handler de
// booking sem duplicar lógica nem tocar no fluxo de check-in existente.

import crypto from 'crypto';

/**
 * Confere a assinatura HMAC-SHA1 (hex maiúsculo) de um webhook do Wellhub.
 *
 * @param rawBody  Corpo CRU da requisição (string), exatamente como recebido —
 *                 precisa ser o texto antes de qualquer parse/serialize.
 * @param header   Valor do header `x-gympass-signature` (ou null se ausente).
 * @returns        true só se a assinatura bate; false se faltar segredo/header
 *                 ou se não conferir.
 */
export function assinaturaWellhubValida(rawBody: string, header: string | null): boolean {
  const secret = process.env.WELLHUB_WEBHOOK_SECRET;
  if (!secret || !header) return false;

  const esperado = crypto
    .createHmac('sha1', secret)
    .update(rawBody, 'utf8')
    .digest('hex')
    .toUpperCase();

  const recebido = header.trim().toUpperCase();

  const a = Buffer.from(esperado, 'utf8');
  const b = Buffer.from(recebido, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
