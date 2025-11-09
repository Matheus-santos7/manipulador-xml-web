import { findElementDeep, getNodeText, getNodeAttr } from "./utils";

// Interface para definir a estrutura dos dados extraídos
export interface XmlInfo {
  tipo: "nfe" | "cancelamento" | "cte" | "inutilizacao" | "unknown";
  caminhoCompleto: string;
  xmlObj: unknown;
  nfeNumber?: string | null;
  cfop?: string | null;
  natOp?: string | null;
  refNFe?: string | null;
  xTexto?: string | null;
  chave?: string | null;
  emitCnpj?: string | null;
  chaveCancelada?: string | null;
}

/**
 * Tradução de 'get_xml_info'
 *
 */
export function getXmlInfo(xmlObj: unknown, filePath: string): XmlInfo | null {
  try {
    // Verifica se é NFe, CTe ou Inutilização
    const isNFe = findElementDeep(xmlObj, "infNFe");
    const isCTe = findElementDeep(xmlObj, "infCte");
    const isInut = findElementDeep(xmlObj, "infInut");
    const isEvento = findElementDeep(xmlObj, "infEvento");

    if (isEvento) {
      // Tradução de 'get_evento_info'
      const tpEvento = getNodeText(findElementDeep(isEvento, "tpEvento"));
      if (tpEvento === "110111") {
        // Evento de Cancelamento
        return {
          tipo: "cancelamento",
          caminhoCompleto: filePath,
          xmlObj,
          chaveCancelada: getNodeText(findElementDeep(isEvento, "chNFe")),
        };
      }
    }

    if (isNFe) {
      const ide = findElementDeep(isNFe, "ide");
      const emit = findElementDeep(isNFe, "emit");
      const chave = getNodeAttr(isNFe, "Id")?.substring(3);

      return {
        tipo: "nfe",
        caminhoCompleto: filePath,
        xmlObj,
        nfeNumber: getNodeText(findElementDeep(ide, "nNF")),
        cfop: getNodeText(findElementDeep(isNFe, "det/prod/CFOP")),
        natOp: getNodeText(findElementDeep(ide, "natOp")),
        refNFe: getNodeText(findElementDeep(ide, "NFref/refNFe")),
        xTexto: getNodeText(findElementDeep(isNFe, "infAdic/obsCont/xTexto")),
        chave: chave,
        emitCnpj: getNodeText(findElementDeep(emit, "CNPJ")),
      };
    }

    if (isCTe) {
      return { tipo: "cte", caminhoCompleto: filePath, xmlObj: xmlObj };
    }

    if (isInut) {
      return {
        tipo: "inutilizacao",
        caminhoCompleto: filePath,
        xmlObj: xmlObj,
      };
    }

    return null; // Não é um tipo conhecido
  } catch (e) {
    console.error(`Erro ao extrair info de ${filePath}:`, e);
    return null;
  }
}
