// src/lib/wellhub/validate.ts
//
// Validate caller do Wellhub (Access Control) — SAÍDA.
//
// Pergunta ao Wellhub se um gympass_id (unique_token de 13 dígitos) tem
// ticket válido para hoje, via POST /access/v1/validate.
//
// Esta função SÓ faz a pergunta e devolve um resultado claro. Ela NÃO grava
// nada no banco nem registra cobrança — quem decide o que fazer com o
// resultado (atualizar status, lançar a cobrança) é o chamador.
//
// Alterna sandbox <-> produção por env, sem trocar código:
//   WELLHUB_API_KEY   -> bearer token (sandbox veio por email; prod depois)
//   WELLHUB_GYM_ID    -> 465 (sandbox) | 542542 (produção). Default 465.
//   WELLHUB_API_BASE  -> base da API. Default sandbox (apitesting...).

export type ResultadoValidate = {
  valido: boolean; // ticket válido pra hoje?
  gympassId: string;
  status: number; // HTTP status do Wellhub (0 = falha antes de receber resposta)
  validatedAt: string | null;
  gym: { id: number; product?: { id: number; description?: string } } | null;
  erro: string | null; // mensagem legível se algo deu errado / ticket inválido
  raw: unknown; // corpo cru da resposta, pra debug
};

const SANDBOX_BASE = 'https://apitesting.partners.gympass.com';

export async function validarTicket(gympassId: string): Promise<ResultadoValidate> {
  const base: ResultadoValidate = {
    valido: false,
    gympassId,
    status: 0,
    validatedAt: null,
    gym: null,
    erro: null,
    raw: null,
  };

  const apiKey = process.env.WELLHUB_API_KEY;
  const gymId = process.env.WELLHUB_GYM_ID ?? '465';
  const apiBase = process.env.WELLHUB_API_BASE ?? SANDBOX_BASE;

  if (!apiKey) return { ...base, erro: 'WELLHUB_API_KEY ausente' };
  if (!gympassId) return { ...base, erro: 'gympassId vazio' };

  let res: Response;
  try {
    res = await fetch(`${apiBase}/access/v1/validate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'X-Gym-Id': gymId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ gympass_id: gympassId }),
    });
  } catch (e: any) {
    return { ...base, erro: `falha de rede: ${e?.message ?? e}` };
  }

  // Lê o corpo uma vez; tenta JSON, mas guarda texto cru se não for.
  const texto = await res.text();
  let corpo: any = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    corpo = texto;
  }

  if (!res.ok) {
    return { ...base, status: res.status, raw: corpo, erro: `HTTP ${res.status}` };
  }

  // Resposta positiva do Wellhub: metadata.errors === 0 e results.validated_at presente.
  const errors = corpo?.metadata?.errors;
  const validatedAt: string | null = corpo?.results?.validated_at ?? null;
  const valido = errors === 0 && !!validatedAt;

  const gym = corpo?.results?.gym
    ? { id: corpo.results.gym.id, product: corpo.results.gym.product }
    : null;

  return {
    valido,
    gympassId,
    status: res.status,
    validatedAt,
    gym,
    erro: valido ? null : 'ticket nao validado',
    raw: corpo,
  };
}
