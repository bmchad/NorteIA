import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ErroDeAgente } from '../../_shared/resposta.ts';
import { extrairArrayJson, gerar, type ArquivoInline } from '../lib/gemini.ts';
import { MODELO } from '../lib/modelos.ts';
import { memoriaDeCategoria } from '../lib/memoria-categoria.ts';
import { normalizar, type Categoria, type TransacaoBruta } from '../lib/normalizar.ts';
import { separarEstornos } from '../lib/estornos.ts';
import { memoriaDeCompromisso } from '../lib/compromisso.ts';
import { classificarPendentes } from './classificar-compromisso.ts';
import { aplicarRegras, carregarVocabulario, notasParaPrompt } from '../lib/vocabulario.ts';
import { montarPrompt, type Modo } from '../prompts/extrair-transacoes.ts';

/**
 * O agente de extração: um print, uma planilha ou um PDF entram; transações estruturadas
 * saem, já normalizadas e prontas para insert.
 *
 * Ele nunca escreve em `transactions`. Quem insere é o frontend, com a sessão do browser,
 * para que a escrita continue passando pela RLS do usuário e a função nunca precise da
 * service role. Ver context/30-decisoes-e-licoes.md D-012.
 */

export interface Requisicao {
  modo?: Modo;
  arquivos?: ArquivoInline[];
  csv?: string | null;
  instrucao?: string | null;
}

const MODOS: Modo[] = ['imagem', 'planilha', 'pdf'];

/**
 * Lê o ciclo e as categorias do próprio usuário, sob a RLS dele.
 *
 * Vêm daqui e não do corpo da requisição: o browser mandaria o que tem em memória, que
 * pode estar velho, e o prompt passaria a depender do estado de uma tela.
 */
async function contextoDoUsuario(supabase: SupabaseClient): Promise<{ cicloDia: number; categorias: Categoria[] }> {
  const [memoria, cats] = await Promise.all([
    supabase.from('memory').select('ciclo_dia').maybeSingle(),
    supabase.from('categories').select('id, nome').order('nome'),
  ]);

  if (cats.error) {
    throw new ErroDeAgente('ERRO_INTERNO', `Falha ao ler as categorias: ${cats.error.message}`, 500);
  }

  return {
    cicloDia: memoria.data?.ciclo_dia ?? 5,
    categorias: (cats.data ?? []) as Categoria[],
  };
}

function validar(req: Requisicao): { modo: Modo; arquivos: ArquivoInline[]; csv: string | null } {
  const modo = req.modo;
  if (!modo || !MODOS.includes(modo)) {
    throw new ErroDeAgente('REQUISICAO_INVALIDA', `O campo "modo" deve ser um de: ${MODOS.join(', ')}.`);
  }

  const arquivos = req.arquivos ?? [];
  const csv = req.csv ?? null;

  if (modo === 'planilha') {
    if (!csv || !csv.trim()) {
      throw new ErroDeAgente('REQUISICAO_INVALIDA', 'O modo "planilha" exige o campo "csv".');
    }
  } else if (arquivos.length === 0) {
    throw new ErroDeAgente('REQUISICAO_INVALIDA', `O modo "${modo}" exige ao menos um arquivo.`);
  }

  for (const a of arquivos) {
    if (!a?.base64 || !a?.mimeType) {
      throw new ErroDeAgente('REQUISICAO_INVALIDA', 'Cada arquivo precisa de "base64" e "mimeType".');
    }
  }

  return { modo, arquivos, csv };
}

export async function extrairTransacoes(req: Requisicao, supabase: SupabaseClient) {
  const { modo, arquivos, csv } = validar(req);
  const { cicloDia, categorias } = await contextoDoUsuario(supabase);

  const vocabulario = await carregarVocabulario(supabase);

  const prompt = montarPrompt({
    modo,
    cicloDia,
    categorias: categorias.map((c) => c.nome),
    csv,
    // As notas vão junto da instrução avulsa: são a mesma coisa, só que guardadas. As
    // regras NÃO vêm aqui — elas já rodam no código, sem token.
    instrucao: [req.instrucao?.trim(), notasParaPrompt(vocabulario.notas).trim()]
      .filter(Boolean).join(String.fromCharCode(10)) || null,
  });

  // A planilha vai como texto dentro do prompt; imagem e PDF vão como conteúdo inline.
  const texto = await gerar(MODELO.EXTRACAO, prompt, modo === 'planilha' ? [] : arquivos);
  const brutas = extrairArrayJson<TransacaoBruta>(texto);

  // O que o usuário já ensinou vale mais que o palpite do modelo, para os nomes que ele
  // já confirmou 3 vezes ou mais. Invisível para ele. Ver lib/memoria-categoria.ts.
  const nomes = brutas.map(t => t.nome ?? '').filter(Boolean);
  const [memoria, memoriaCompromisso] = await Promise.all([
    memoriaDeCategoria(supabase, nomes),
    memoriaDeCompromisso(supabase, nomes),
  ]);

  // Compra e estorno que se anulam no mesmo lote saem daqui. O front avisa quantos foram:
  // ⚠️ nada some sem o usuário saber. Ver lib/estornos.ts.
  // ⭐ O que o usuário DECLAROU vence o que ele confirmou e o que a IA inferiu: as regras
  // são aplicadas por último, sobre o resultado já normalizado. Ver lib/vocabulario.ts.
  const normalizadas = aplicarRegras(
    normalizar(brutas, categorias, memoria, memoriaCompromisso),
    vocabulario.regras,
  );

  const { ficam, estornos } = separarEstornos(normalizadas);

  // ⭐ O agente 2 entra aqui, e só sobre o que ficou: classificar uma compra que vai ser
  // descartada como estorno seria token gasto num rótulo que ninguém vê.
  // ⚠️ Depois da memória, nunca antes — o que o usuário já confirmou vence o palpite.
  const classificadas = await classificarPendentes(supabase, ficam);

  return { transacoes: classificadas, estornos };
}
