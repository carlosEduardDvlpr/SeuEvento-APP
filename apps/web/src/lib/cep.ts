import { BRAZIL_STATES, type BrazilState } from '@chacara/shared';
import { z } from 'zod';

/**
 * Busca do endereço pelo CEP, no ViaCEP (§9.12, novembro de 2026).
 *
 * Existe para a pessoa digitar oito números e ver rua, bairro, cidade e estado
 * aparecerem, em vez de escrever tudo no celular. É uma ajuda, não a fonte da
 * verdade: o formulário continua editável, e quem valida o endereço é o mesmo
 * schema da API.
 *
 * Vai direto do navegador ao ViaCEP, com `fetch` puro e não pelo `apiFetch`:
 * não é a nossa API, não leva token, e o envelope de erro da §11.1 não se aplica.
 * Por isso mesmo a resposta é tratada como dado de fora e passa por um schema
 * antes de chegar à tela.
 */

/** O que o CEP diz do endereço. O número e o complemento ficam com a pessoa. */
export type CepAddress = {
  street: string;
  district: string;
  city: string;
  /** `null` quando o ViaCEP devolve uma sigla que não é das 27 unidades da federação. */
  state: BrazilState | null;
};

/*
 * O ViaCEP responde 200 com `{ "erro": true }` para CEP que não existe. Já
 * respondeu `true` e `"true"`, por isso os dois.
 */
const notFoundSchema = z.object({ erro: z.union([z.literal(true), z.literal('true')]) });

const foundSchema = z.object({
  logradouro: z.string(),
  bairro: z.string(),
  localidade: z.string(),
  uf: z.string(),
});

const responseSchema = z.union([notFoundSchema, foundSchema]);

function isBrazilState(value: string): value is BrazilState {
  return (BRAZIL_STATES as readonly string[]).includes(value);
}

/**
 * Endereço do CEP, ou `null` quando ele não existe.
 *
 * CEP fora do formato de oito números também volta `null`, sem ir à rede: não
 * há o que buscar. Falha de rede, resposta que não é JSON ou JSON de outro
 * formato lançam erro, para a tela dizer que a busca falhou em vez de dizer que
 * o CEP não existe. O cancelamento pelo `signal` lança o `AbortError` do `fetch`.
 */
export async function lookupCep(cep: string, signal?: AbortSignal): Promise<CepAddress | null> {
  if (!/^\d{8}$/.test(cep)) return null;

  const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
    headers: { Accept: 'application/json' },
    ...(signal ? { signal } : {}),
  });

  if (!response.ok) throw new Error(`O ViaCEP respondeu ${response.status}.`);

  const data = responseSchema.parse(await response.json());
  if ('erro' in data) return null;

  const state = data.uf.trim().toUpperCase();

  return {
    street: data.logradouro.trim(),
    district: data.bairro.trim(),
    city: data.localidade.trim(),
    state: isBrazilState(state) ? state : null,
  };
}
