// Em: src/lib/xml/renamer.ts

import * as fs from 'fs/promises';
import * as path from 'path';
import { getXmlInfo, XmlInfo } from './info-extractor';
import { parser } from './utils';
import { DEVOLUCOES_CFOP, VENDAS_CFOP, RETORNOS_CFOP, REMESSAS_CFOP } from './constants';

/**
 * Tradução de '_gerar_novo_nome_nfe'
 *
 */
function gerarNovoNomeNFe(info: XmlInfo): string {
  const { cfop, natOp, refNFe, xTexto, nfeNumber } = info;
  
  if (cfop && DEVOLUCOES_CFOP.includes(cfop) && refNFe) {
    const refNFeNum = refNFe.substring(25, 34).replace(/^0+/, '');
    if (natOp === "Retorno de mercadoria nao entregue") {
      return `${nfeNumber} - Insucesso de entrega da venda ${refNFeNum}.xml`;
    } else if (natOp === "Devolucao de mercadorias") {
      if (xTexto && (xTexto.includes("DEVOLUTION_PLACES") || xTexto.includes("SALE_DEVOLUTION"))) {
        return `${nfeNumber} - Devoluçao pro Mercado Livre da venda - ${refNFeNum}.xml`;
      } else if (xTexto && xTexto.includes("DEVOLUTION_devolution")) {
        return `${nfeNumber} - Devolucao da venda ${refNFeNum}.xml`;
      }
    }
  } else if (cfop && VENDAS_CFOP.includes(cfop)) {
    return `${nfeNumber} - Venda.xml`;
  } else if (cfop && RETORNOS_CFOP.includes(cfop) && refNFe) {
    const refNFeNum = refNFe.substring(25, 34).replace(/^0+/, '');
    if (natOp === "Outras Entradas - Retorno Simbolico de Deposito Temporario") {
      return `${nfeNumber} - Retorno da remessa ${refNFeNum}.xml`;
    } else if (natOp === "Outras Entradas - Retorno de Deposito Temporario") {
      return `${nfeNumber} - Retorno Efetivo da remessa ${refNFeNum}.xml`;
    }
  } else if (cfop && REMESSAS_CFOP.includes(cfop)) {
    if (refNFe) {
      return `${nfeNumber} - Remessa simbólica da venda ${refNFe.substring(25, 34).replace(/^0+/, '')}.xml`;
    } else {
      return `${nfeNumber} - Remessa.xml`;
    }
  }
  return ''; // Nenhum nome novo
}

/**
 * Tradução de 'processar_arquivos'
 *
 */
export async function renameFilesInBatch(tempDir: string) {
  const fileNames = await fs.readdir(tempDir);
  const xmlFiles = fileNames.filter(f => f.endsWith('.xml'));

  const nfeInfos: Record<string, XmlInfo> = {};
  const eventosInfo: XmlInfo[] = [];
  const allInfos: XmlInfo[] = [];

  // 1. Extrair infos (Tradução de _extrair_infos_xmls)
  //
  for (const fileName of xmlFiles) {
    const filePath = path.join(tempDir, fileName);
    const xmlContent = await fs.readFile(filePath, 'utf-8');
    const xmlObj = parser.parse(xmlContent);
    const info = getXmlInfo(xmlObj, filePath);

    if (info) {
      allInfos.push(info); // Guarda para a próxima etapa
      if (info.tipo === 'nfe' && info.nfeNumber) {
        nfeInfos[info.nfeNumber] = info;
      } else if (info.tipo === 'cancelamento') {
        eventosInfo.push(info);
      }
    }
  }

  // 2. Renomear NFes (Tradução de _renomear_nfe)
  //
  for (const info of Object.values(nfeInfos)) {
    const novoNome = gerarNovoNomeNFe(info);
    if (novoNome) {
      const caminhoNovoNome = path.join(tempDir, novoNome);
      if (info.caminhoCompleto !== caminhoNovoNome) {
        try {
          await fs.rename(info.caminhoCompleto, caminhoNovoNome);
          info.caminhoCompleto = caminhoNovoNome; // Atualiza o caminho
        } catch (e) {
          console.error(`Erro ao renomear ${info.caminhoCompleto}:`, e);
        }
      }
    }
  }

  // 3. Renomear Eventos (Tradução de _renomear_eventos)
  //
  const chaveToNfeMap = Object.fromEntries(
    Object.values(nfeInfos).map(info => [info.chave, info.nfeNumber])
  );
  
  for (const evento of eventosInfo) {
    if (evento.chaveCancelada) {
      const nfeNumberCancelado = chaveToNfeMap[evento.chaveCancelada];
      if (nfeNumberCancelado) {
        const novoNome = `CAN-${nfeNumberCancelado}.xml`;
        const caminhoNovoNome = path.join(tempDir, novoNome);
        if (evento.caminhoCompleto !== caminhoNovoNome) {
          try {
            await fs.rename(evento.caminhoCompleto, caminhoNovoNome);
            evento.caminhoCompleto = caminhoNovoNome; // Atualiza o caminho
          } catch (e) {
             console.error(`Erro ao renomear evento ${evento.caminhoCompleto}:`, e);
          }
        }
      }
    }
  }

  // Retorna todas as infos (já parsadas) para a próxima etapa
  return allInfos;
}