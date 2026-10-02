/**
 * ⭐⭐ **O carimbo que torna "o que esta no ar" uma MEDICAO e nao uma crenca.**
 *
 * Edge Function nao diz de que commit ela veio, e o painel so mostra `version`, que sobe
 * tambem quando um secret muda -- entao ele nao prova codigo novo. Sem um carimbo, conferir se
 * um deploy pegou exige comparar comportamento, e mudanca interna (uma guarda, um escopo de
 * `delete`) nao muda comportamento nenhum visivel de fora. A pergunta fica sem resposta.
 *
 * ⚠️ **Bump manual, e de proposito.** Nao e o commit: e o marco que VOCE quer confirmar
 * que chegou. Mude quando publicar algo que precisa ser verificavel; deixe quieto no resto.
 *
 * ⭐ **Num arquivo proprio porque as DUAS funcoes o devolvem.** O `pluggy-register-item` empacota
 * os modulos desta pasta, entao um deploy so do webhook deixa o register-item com o codigo velho
 * da sincronizacao -- e o carimbo de cada um e o que denuncia isso.
 *
 * ⭐ No webhook so sai na resposta 200, que exige o segredo; no register-item, so com JWT. Quem nao
 * se autenticou nao aprende a versao implantada -- informacao util para quem estuda o alvo.
 */
export const VERSAO = '2026-10-02-backfill-e-produtos';
