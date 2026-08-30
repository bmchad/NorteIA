/**
 * ⭐⭐ O modo é uma **propriedade do arquivo**, não uma escolha do usuário.
 *
 * A tela perguntava "imagem, planilha ou documento?" e depois restringia a resposta pelo
 * `accept` do input — ou seja, pedia de novo a informação que o arquivo já carrega.
 *
 * ⚠️ `file.type` vem vazio em alguns sistemas para `.xlsx`, então a extensão é a queda.
 */
export function modoDoArquivo(f: File): 'imagem' | 'pdf' | 'planilha' | null {
  const tipo = (f.type || '').toLowerCase();
  const ext = f.name.toLowerCase().split('.').pop() ?? '';

  if (tipo.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(ext)) return 'imagem';
  if (tipo === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (['xlsx', 'xls', 'csv'].includes(ext) || tipo.includes('spreadsheet') || tipo === 'text/csv') return 'planilha';
  return null;
}

/**
 * ⭐ Imagem e PDF são o **mesmo pipeline** — base64 inline, mesmo campo `arquivos`. Só a
 * planilha é pré-processada no browser e viaja como texto. A fronteira que importa para
 * misturar arquivos num envio é esta, e não os três modos.
 */
export const grupoDoModo = (m: 'imagem' | 'pdf' | 'planilha') => (m === 'planilha' ? 'planilha' : 'midia');

export const ROTULO_MODO = { imagem: 'imagens', pdf: 'PDFs', planilha: 'planilhas' } as const;
