import { unzipSync } from 'fflate'

/** Um XML achatado de dentro do ZIP, com o caminho de onde veio. */
export interface ArquivoXml {
  caminho: string
  conteudo: string
}

const decodificador = new TextDecoder('utf-8')

function ehLixo(caminho: string): boolean {
  const baixo = caminho.toLowerCase()
  return baixo.includes('__macosx') || baixo.endsWith('/') || baixo.split('/').pop()!.startsWith('.')
}

/**
 * Abre o ZIP e devolve todos os XMLs de dentro, inclusive os que estão em
 * pastas ou em ZIPs aninhados — que é como os emissores costumam entregar.
 *
 * O limite de profundidade existe para um ZIP malformado (ou malicioso) que
 * se referencie não travar a aba do usuário.
 */
export function extrairXmls(dados: Uint8Array, profundidade = 0): ArquivoXml[] {
  if (profundidade > 4) return []

  const conteudo = unzipSync(dados)
  const xmls: ArquivoXml[] = []

  for (const [caminho, bytes] of Object.entries(conteudo)) {
    if (ehLixo(caminho) || bytes.length === 0) continue
    const baixo = caminho.toLowerCase()

    if (baixo.endsWith('.xml')) {
      xmls.push({ caminho, conteudo: decodificador.decode(bytes) })
    } else if (baixo.endsWith('.zip')) {
      xmls.push(...extrairXmls(bytes, profundidade + 1))
    }
  }

  return xmls
}

/** Lê um arquivo escolhido na tela: ZIP com XMLs dentro, ou um XML avulso. */
export async function lerArquivo(file: File): Promise<ArquivoXml[]> {
  const nome = file.name.toLowerCase()
  if (nome.endsWith('.xml')) {
    return [{ caminho: file.name, conteudo: await file.text() }]
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  return extrairXmls(bytes)
}
