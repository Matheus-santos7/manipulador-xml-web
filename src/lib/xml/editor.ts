// Em: src/lib/xml/editor.ts

import { XmlInfo } from "./info-extractor"; // Removido getXmlInfo, não é usado aqui
import {
  calcularDvChave,
  findElementDeep,
  findAllElementsDeep,
  getNodeText,
  setNodeText,
  setNodeAttr,
  saveXml,
} from "./utils";
import { VENDAS_CFOP, RETORNOS_CFOP, REMESSAS_CFOP } from "./constants";
import { Prisma } from "@prisma/client";
import * as path from "path";

/**
 * Helper to read an attribute value from a parsed XML node.
 */
function getNodeAttr(node: unknown, attrName: string): string | undefined {
  if (!node || typeof node !== "object") return undefined;
  // Ajuste para lidar com o prefixo '@_' do fast-xml-parser
  const n = node as Record<string, unknown>;
  const val = n[`@_${attrName}`];
  
  return typeof val === "string" ? val : val === undefined ? undefined : String(val);
}

// Tipo para a configuração completa do Prisma
type FullConfig = Prisma.ConfigurationProfileGetPayload<{
  include: {
    emitente: true;
    produto: true;
    impostos: true;
    data: true;
    alterarFlags: true;
    cstMappings: true;
  };
}>;

/**
 * Tradução de '_prepara_mapeamentos'
 *
 */
async function preparaMapeamentos(allInfos: XmlInfo[], config: FullConfig) {
  const chaveMapping: Record<string, string> = {}; // { [chaveAntiga]: novaChave }
  const referenceMap: Record<string, string> = {}; // { [chaveNota]: chaveReferenciada }
  let chaveDaVendaNova: string | null = null; // Original declaration

  const nfeInfos = allInfos.filter((info) => info.tipo === "nfe") as XmlInfo[];
  const nNFToKeyMap: Record<string, string> = {};
  for(const info of nfeInfos) {
    if (info.nfeNumber && info.chave) {
        nNFToKeyMap[info.nfeNumber] = info.chave;
    }
  }

  const { alterarFlags, emitente, data } = config;
  const alterarEmitente = alterarFlags?.emitente;
  const alterarData = alterarFlags?.data;
  const novoEmitente = emitente;
  const novaDataStr = data?.nova_data;

  for (const info of nfeInfos) {
    const originalKey = info.chave;
    if (!originalKey) continue;

    if (info.refNFe) {
      // O refNFe é uma chave completa, temos que extrair o nNF dela
      const referencedNnF = info.refNFe.substring(25, 34).replace(/^0+/, "");
      if (nNFToKeyMap[referencedNnF]) {
        referenceMap[originalKey] = nNFToKeyMap[referencedNnF];
      }
    }

    if (alterarEmitente || alterarData) {
      const cnpjOriginal = info.emitCnpj || "";
      const novoCnpj =
        alterarEmitente && novoEmitente?.CNPJ
          ? novoEmitente.CNPJ
          : cnpjOriginal;
      const novoCnpjNum = (novoCnpj || "").replace(/\D/g, "");

      let novoAnoMes = originalKey.substring(2, 6);
      if (alterarData && novaDataStr) {
        const [dia, mes, ano] = novaDataStr.split("/");
        novoAnoMes = `${ano.substring(2)}${mes}`;
      }

      const restoDaChave = originalKey.substring(20, 43);
      const novaChaveSemDv =
        originalKey.substring(0, 2) +
        novoAnoMes +
        novoCnpjNum.padStart(14, "0") +
        restoDaChave;
      const novaChaveComDv = novaChaveSemDv + calcularDvChave(novaChaveSemDv);

      chaveMapping[originalKey] = novaChaveComDv;

      // Identifica a chave da venda principal (baseado no nome do ficheiro)
      if (info.caminhoCompleto.includes("Venda.xml")) {
        chaveDaVendaNova = novaChaveComDv;
      }
    }
  }

  return { chaveMapping, referenceMap, chaveDaVendaNova };
}

/**
 * Tradução de '_editar_nfe'
 *
 */
function editarNFe(
  xmlObj: unknown,
  config: FullConfig,
  chaveMapping: Record<string, string>,
  referenceMap: Record<string, string>
): { xmlObj: unknown; alteracoes: string[] } {
  const alteracoes: string[] = [];
  const infNFe = findElementDeep(xmlObj, "infNFe");
  if (!infNFe) return { xmlObj, alteracoes };

  const originalKey = getNodeAttr(infNFe, "Id")?.substring(3);
  if (!originalKey) return { xmlObj, alteracoes };

  const { alterarFlags, emitente, produto, impostos, data, cstMappings } =
    config;

  // Alterar Emitente
  if (alterarFlags?.emitente && emitente) {
    const emit = findElementDeep(infNFe, "emit");
    const ender = findElementDeep(emit, "enderEmit");
    for (const [campo, valor] of Object.entries(emitente)) {
      if (!valor || campo === "id" || campo === "profileId") continue;
      const targetElement = [
        "xLgr",
        "nro",
        "xCpl",
        "xBairro",
        "xMun",
        "UF",
        "fone",
        "CEP",
      ].includes(campo)
        ? ender
        : emit;
      const node = findElementDeep(targetElement, campo);
      if (node) {
        setNodeText(node as Record<string, unknown>, String(valor));
        alteracoes.push(`Emitente: <${campo}> alterado`);
      }
    }
  }

  // Mapeamento CST (criado a partir do seu config)
  const cstMappingsArr = Array.isArray(cstMappings) ? cstMappings : [];
  const mapeamentoCst: Record<
    string,
    { ICMS?: string; IPI?: string; PIS?: string; COFINS?: string }
  > = {};
  for (const m of cstMappingsArr) {
    const mm = m as Record<string, unknown>;
    const cfopKey = typeof mm.cfop === "string" ? mm.cfop : undefined;
    if (!cfopKey) continue;
    mapeamentoCst[cfopKey] = {
      ICMS: typeof mm.ICMS === "string" ? (mm.ICMS as string) : undefined,
      IPI: typeof mm.IPI === "string" ? (mm.IPI as string) : undefined,
      PIS: typeof mm.PIS === "string" ? (mm.PIS as string) : undefined,
      COFINS: typeof mm.COFINS === "string" ? (mm.COFINS as string) : undefined,
    };
  }

  // Alterar Produtos, Impostos, CST, IPI
  const dets = findAllElementsDeep(infNFe, "det");
  for (const det of dets) {
    const prod = findElementDeep(det, "prod");
    const imposto = findElementDeep(det, "imposto");
    if (!prod || !imposto) continue;

    // Produtos
    if (alterarFlags?.produtos && produto) {
      for (const [campo, valor] of Object.entries(produto)) {
        if (!valor || campo === "id" || campo === "profileId") continue;
        const node = findElementDeep(prod, campo);
        if (node) {
          setNodeText(node as Record<string, unknown>, String(valor));
          alteracoes.push(`Produto: <${campo}> alterado`);
        }
      }
    }

    // Impostos
    if (alterarFlags?.impostos && impostos) {
      for (const [campo, valor] of Object.entries(impostos)) {
        if (!valor || campo === "id" || campo === "profileId") continue;
        // Tenta encontrar o campo em qualquer sub-nível de <imposto>
        // (ex: pICMS pode estar em ICMS/ICMS00/pICMS)
        const node = findElementDeep(imposto, campo); 
        if (node) {
          setNodeText(node as Record<string, unknown>, String(valor));
          alteracoes.push(`Imposto: <${campo}> alterado`);
        }
      }
    }

    const cfopNode = findElementDeep(prod, "CFOP");
    const cfop = getNodeText(cfopNode);

    if (cfop) {
      // CST
      if (alterarFlags?.cst && mapeamentoCst[cfop]) {
        const regrasCst = mapeamentoCst[cfop];
        for (const [impostoNome, cstValor] of Object.entries(regrasCst)) {
          if (!cstValor) continue;
          const impostoTag = findElementDeep(imposto, impostoNome); // ICMS, IPI, PIS...
          if (impostoTag) {
            const cstTag = findElementDeep(impostoTag, "CST");
            if (cstTag) {
              setNodeText(cstTag as Record<string, unknown>, String(cstValor));
              alteracoes.push(`CST do ${impostoNome} alterado`);
            }
          }
        }
      }

      // Zerar IPI
      const ipiTag = findElementDeep(imposto, "IPI");
      if (ipiTag) {
        if (
          alterarFlags?.zerar_ipi_remessa_retorno &&
          [...REMESSAS_CFOP, ...RETORNOS_CFOP].includes(cfop)
        ) {
          ["vIPI", "vBC"].forEach((tag) =>
            setNodeText(
              findElementDeep(ipiTag, tag) as Record<string, unknown>,
              "0.00"
            )
          );
          setNodeText(
            findElementDeep(ipiTag, "pIPI") as Record<string, unknown>,
            "0.0000"
          );
          alteracoes.push("Valores de IPI zerados para remessa/retorno");
        }
        if (alterarFlags?.zerar_ipi_venda && VENDAS_CFOP.includes(cfop)) {
          ["vIPI", "vBC"].forEach((tag) =>
            setNodeText(
              findElementDeep(ipiTag, tag) as Record<string, unknown>,
              "0.00"
            )
          );
          setNodeText(
            findElementDeep(ipiTag, "pIPI") as Record<string, unknown>,
            "0.0000"
          );
          alteracoes.push("Valores de IPI zerados para venda");
        }
      }
    }
  }

  // Recalcula Totais IPI
  if (
    alterarFlags?.zerar_ipi_remessa_retorno ||
    alterarFlags?.zerar_ipi_venda
  ) {
    recalculaTotaisIpi(infNFe, alteracoes);
  }

  // Alterar Data
  if (alterarFlags?.data && data?.nova_data) {
    const [dia, mes, ano] = data.nova_data.split("/");
    const novaDataFmt = `${ano}-${mes}-${dia}T${new Date()
      .toISOString()
      .split("T")[1]
      .substring(0, 8)}-03:00`;

    const ide = findElementDeep(infNFe, "ide");
    ["dhEmi", "dhSaiEnt"].forEach((tag) => {
      const node = findElementDeep(ide, tag);
      if (node) {
        setNodeText(node as Record<string, unknown>, novaDataFmt);
        alteracoes.push(`Data: <${tag}> alterada`);
      }
    });

    const protNFe = findElementDeep(xmlObj, "protNFe/infProt");
    if (protNFe) {
      const tagRecbto = findElementDeep(protNFe, "dhRecbto");
      if (tagRecbto) {
        setNodeText(tagRecbto as Record<string, unknown>, novaDataFmt);
        alteracoes.push("Protocolo: <dhRecbto> alterado");
      }
    }
  }

  // Alterar Chave de Acesso
  if (chaveMapping[originalKey]) {
    const novaChave = chaveMapping[originalKey];
    setNodeAttr(infNFe as Record<string, unknown>, "Id", "NFe" + novaChave);
    alteracoes.push(`Chave de Acesso ID alterada`);

    const protNFe = findElementDeep(xmlObj, "protNFe/infProt");
    if (protNFe) {
      const chNFe = findElementDeep(protNFe, "chNFe");
      if (chNFe) {
        setNodeText(chNFe as Record<string, unknown>, novaChave);
        alteracoes.push("Chave de Acesso do Protocolo alterada");
      }
    }
  }

  // Alterar Chave de Referência (refNFe)
  if (alterarFlags?.refNFe && referenceMap[originalKey]) {
    const originalReferencedKey = referenceMap[originalKey];
    if (chaveMapping[originalReferencedKey]) {
      const newReferencedKey = chaveMapping[originalReferencedKey];
      const refNFeTag = findElementDeep(infNFe, "ide/NFref/refNFe");
      if (refNFeTag) {
        setNodeText(refNFeTag as Record<string, unknown>, newReferencedKey);
        alteracoes.push(`Chave de Referência alterada`);
      }
    }
  }

  return { xmlObj, alteracoes };
}

/**
 * Tradução de '_recalcula_totais_ipi'
 *
 */
function recalculaTotaisIpi(
  infNFe: unknown,
  alteracoes: string[]
): { vIPI: number; vNF: number } {
  const icmsTotTag = findElementDeep(infNFe, "total/ICMSTot");
  if (!icmsTotTag) return { vIPI: 0, vNF: 0 };

  const somas: Record<string, number> = {
    vProd: 0,
    vIPI: 0,
    vDesc: 0,
    vFrete: 0,
    vSeg: 0,
    vOutro: 0,
  };

  const safeGetFloat = (node: unknown, tagName: string): number => {
    const tag = findElementDeep(node, tagName); // Busca profunda para segurança
    const text = getNodeText(tag);
    return parseFloat(text || "0.00");
  };

  const dets = findAllElementsDeep(infNFe, "det");
  for (const det of dets) {
    const prod = findElementDeep(det, "prod");
    const imposto = findElementDeep(det, "imposto");

    // Soma valores do <prod>
    somas.vProd += safeGetFloat(prod, "vProd");
    somas.vDesc += safeGetFloat(prod, "vDesc");
    somas.vFrete += safeGetFloat(prod, "vFrete");
    somas.vSeg += safeGetFloat(prod, "vSeg");
    somas.vOutro += safeGetFloat(prod, "vOutro");

    // Soma vIPI de <imposto/IPI>
    const ipiTag = findElementDeep(imposto, "IPI");
    somas.vIPI += safeGetFloat(ipiTag, "vIPI");
  }

  // Calcula o novo vNF (baseado na regra do Python)
  // vNF = vProd - vDesc + vFrete + vSeg + vOutro + vIPI
  const novo_vNF =
    somas.vProd +
    somas.vIPI +
    somas.vFrete +
    somas.vSeg +
    somas.vOutro -
    somas.vDesc;

  // Atualiza as tags em ICMSTot
  const vIpiTotalTag = findElementDeep(icmsTotTag, "vIPI");
  const vNftotalTag = findElementDeep(icmsTotTag, "vNF");

  if (vIpiTotalTag) {
    setNodeText(
      vIpiTotalTag as Record<string, unknown>,
      somas.vIPI.toFixed(2)
    );
    alteracoes.push("Total vIPI recalculado");
  }
  if (vNftotalTag) {
    setNodeText(
      vNftotalTag as Record<string, unknown>,
      novo_vNF.toFixed(2)
    );
    alteracoes.push("Total vNF recalculado");
  }

  return { vIPI: somas.vIPI, vNF: novo_vNF };
}


/**
 * Tradução de '_editar_cancelamento'
 *
 */
function editarCancelamento(
  xmlObj: unknown,
  config: FullConfig,
  chaveMapping: Record<string, string>
): { xmlObj: unknown; alteracoes: string[] } {
  const alteracoes: string[] = [];
  const { alterarFlags, data } = config;

  const infEvento = findElementDeep(xmlObj, "infEvento");
  if (!infEvento) return { xmlObj, alteracoes };

  // Atualizar chave de referência chNFe (em <infEvento> e <retEvento>)
  const chNFeTags = findAllElementsDeep(xmlObj, "chNFe");
  for (const chNFeTag of chNFeTags) {
      const chNFe = getNodeText(chNFeTag);
      if (chNFe && chaveMapping[chNFe]) {
          setNodeText(chNFeTag as Record<string, unknown>, chaveMapping[chNFe]);
          alteracoes.push(`Cancelamento: <chNFe> alterada`);
      }
  }

  // Atualizar data do evento
  if (alterarFlags?.data && data?.nova_data) {
    const [dia, mes, ano] = data.nova_data.split("/");
    const novaDataFmt = `${ano}-${mes}-${dia}T${new Date()
      .toISOString()
      .split("T")[1]
      .substring(0, 8)}-03:00`;

    const dhEventoTag = findElementDeep(infEvento, "dhEvento");
    if (dhEventoTag) {
      setNodeText(dhEventoTag as Record<string, unknown>, novaDataFmt);
      alteracoes.push("Cancelamento: <dhEvento> alterado");
    }

    // Atualizar data de recebimento (no protocolo)
    const dhRecbtoTag = findElementDeep(xmlObj, "retEvento/infEvento/dhRecbto");
    if (dhRecbtoTag) {
      setNodeText(dhRecbtoTag as Record<string, unknown>, novaDataFmt);
      alteracoes.push("Protocolo: <dhRecbto> alterado");
    }
    
    // Atualizar dhRegEvento
    const dhRegTag = findElementDeep(xmlObj, "retEvento/infEvento/dhRegEvento");
     if (dhRegTag) {
      setNodeText(dhRegTag as Record<string, unknown>, novaDataFmt);
      alteracoes.push("Protocolo: <dhRegEvento> alterado");
    }
  }
  
  // Garante que todas as tags chNFe (mesmo as não mapeadas) sejam atualizadas
  // se corresponderem ao número da nota
  for (const chNFeTag of chNFeTags) {
      const chaveAntiga = getNodeText(chNFeTag);
      if (!chaveAntiga) continue;
      
      const numeroNota = chaveAntiga.substring(25, 34);
      let chaveCorreta: string | null = null;
      
      for(const novaChave of Object.values(chaveMapping)) {
          if (novaChave.substring(25, 34) === numeroNota) {
              chaveCorreta = novaChave;
              break;
          }
      }

      if (chaveCorreta && getNodeText(chNFeTag) !== chaveCorreta) {
          setNodeText(chNFeTag as Record<string, unknown>, chaveCorreta);
          alteracoes.push(`Cancelamento: <chNFe> sincronizada pelo número da nota`);
      }
  }
  
  return { xmlObj, alteracoes };
}

/**
 * Tradução de '_editar_inutilizacao'
 *
 */
function editarInutilizacao(
  xmlObj: unknown,
  config: FullConfig
): { xmlObj: unknown; alteracoes: string[] } {
  const alteracoes: string[] = [];
  const { alterarFlags, emitente, data } = config;

  const infInut = findElementDeep(xmlObj, "infInut"); // <inutNFe/infInut>
  if (!infInut) return { xmlObj, alteracoes };

  let anoNovo: string | null = null;
  let cnpjNovo: string | null = null;
  
  if (alterarFlags?.emitente && emitente?.CNPJ) {
    const cnpjTag = findElementDeep(infInut, "CNPJ");
    if (cnpjTag) {
      cnpjNovo = emitente.CNPJ.replace(/\D/g, "");
      setNodeText(cnpjTag as Record<string, unknown>, cnpjNovo);
      alteracoes.push("Inutilização: <CNPJ> alterado");
    }
  }

  if (alterarFlags?.data && data?.nova_data) {
    const [dia, mes, ano] = data.nova_data.split("/");
    const novaDataObj = new Date(`${ano}-${mes}-${dia}`);
    
    const anoTag = findElementDeep(infInut, "ano");
    if (anoTag) {
      anoNovo = novaDataObj.getFullYear().toString().substring(2);
      setNodeText(anoTag as Record<string, unknown>, anoNovo);
      alteracoes.push("Inutilização: <ano> alterado");
    }

    // <retInutNFe/infInut/dhRecbto>
    const dhRecbtoTag = findElementDeep(xmlObj, "retInutNFe/infInut/dhRecbto"); 
    if (dhRecbtoTag) {
        const novaDataFmt = `${ano}-${mes}-${dia}T${new Date()
          .toISOString()
          .split("T")[1]
          .substring(0, 8)}-03:00`;
      setNodeText(dhRecbtoTag as Record<string, unknown>, novaDataFmt);
      alteracoes.push("Inutilização: <dhRecbto> alterado");
    }
  }

  // Atualizar ID
  const idAtual = getNodeAttr(infInut, "Id");
  if (idAtual && (anoNovo || cnpjNovo)) {
      const uf = idAtual.substring(2, 4);
      const ano = anoNovo || idAtual.substring(4, 6);
      const cnpj = (cnpjNovo || idAtual.substring(6, 20)).padStart(14, '0');
      const mod = idAtual.substring(20, 22);
      const serie = idAtual.substring(22, 25);
      const nNFIni = idAtual.substring(25, 34);
      const nNFFin = idAtual.substring(34, 43);
      
      const novaChave = `ID${uf}${ano}${cnpj}${mod}${serie}${nNFIni}${nNFFin}`;
      setNodeAttr(infInut as Record<string, unknown>, "Id", novaChave);
      alteracoes.push(`Inutilização: <Id> alterado`);
  }

  return { xmlObj, alteracoes };
}


/**
 * Tradução de '_editar_cte'
 *
 */
function editarCTe(
  xmlObj: unknown,
  config: FullConfig,
  chaveMapping: Record<string, string>,
  chaveDaVendaNova: string | null
): { xmlObj: unknown; alteracoes: string[] } {
  const alteracoes: string[] = [];
  const { alterarFlags, emitente, data } = config;

  const infCte = findElementDeep(xmlObj, "infCte");
  if (!infCte) return { xmlObj, alteracoes };

  // Alterar Chave de Acesso do CTe (Id)
  const idAtual = getNodeAttr(infCte, "Id");
  if (alterarFlags?.data && data?.nova_data && idAtual && idAtual.startsWith("CTe")) {
      const uf = idAtual.substring(3, 5); // CTe[UF]...
      const [dia, mes, ano] = data.nova_data.split("/");
      const anoNovo = ano.substring(2); // "yy"
      // A data no CTe é AAMM, diferente da NFe (AAMM)
      const cnpj = idAtual.substring(7, 21); // AAMM[CNPJ]...
      const restoChave = idAtual.substring(21, 43);
      const dvOriginal = idAtual.substring(43);
      
      const novaChave = `CTe${uf}${anoNovo}${mes}${cnpj}${restoChave}${dvOriginal}`;
      setNodeAttr(infCte as Record<string, unknown>, "Id", novaChave);
      alteracoes.push(`Chave de acesso do CTe alterada`);
  }
  
  // Alterar Data de Emissão
  const ide = findElementDeep(infCte, "ide");
  if (ide && alterarFlags?.data && data?.nova_data) {
    const [dia, mes, ano] = data.nova_data.split("/");
    const novaDataFmt = `${ano}-${mes}-${dia}T${new Date()
      .toISOString()
      .split("T")[1]
      .substring(0, 8)}-03:00`;
      
    const dhEmiTag = findElementDeep(ide, "dhEmi");
    if (dhEmiTag) {
      setNodeText(dhEmiTag as Record<string, unknown>, novaDataFmt);
      alteracoes.push("CTe: <dhEmi> alterada");
    }
  }

  // Alterar Chave da NFe referenciada (infNFe/chave)
  const chaveTag = findElementDeep(infCte, "infCTeNorm/infDoc/infNFe/chave");
  if (chaveTag) {
      if (chaveDaVendaNova) {
          setNodeText(chaveTag as Record<string, unknown>, chaveDaVendaNova);
          alteracoes.push(`CTe: Referência <chave> FORÇADA para a chave da venda`);
      } else {
          alteracoes.push("[AVISO] Nova chave da venda não encontrada para referenciar no CTe.");
      }
  }

  // Alterar Remetente
  if (alterarFlags?.emitente && emitente) {
      const rem = findElementDeep(infCte, "rem");
      const enderRem = findElementDeep(rem, "enderReme");
      for (const [campo, valor] of Object.entries(emitente)) {
        if (!valor || campo === "id" || campo === "profileId") continue;
        const targetElement = [
          "xLgr",
          "nro",
          "xCpl",
          "xBairro",
          "xMun",
          "UF",
          "fone",
          "CEP", // Adicionado CEP
        ].includes(campo)
          ? enderRem
          : rem;
        const node = findElementDeep(targetElement, campo);
        if (node) {
          setNodeText(node as Record<string, unknown>, String(valor));
          alteracoes.push(`Remetente: <${campo}> alterado`);
        }
      }
  }

  // Sincronizar chave do protCTe/infProt/chCTe com a chave do infCte/Id
  const protCte = findElementDeep(xmlObj, "protCTe/infProt");
  if (protCte) {
      const chCteTag = findElementDeep(protCte, "chCTe");
      const idCte = getNodeAttr(infCte, "Id");
      if (chCteTag && idCte && idCte.startsWith("CTe")) {
          setNodeText(chCteTag as Record<string, unknown>, idCte.substring(3));
          alteracoes.push("Protocolo: <chCTe> sincronizado");
      }
      
      // Atualizar dhRecbto do protCTe
      if (alterarFlags?.data && data?.nova_data) {
          const dhRecbtoTag = findElementDeep(protCte, "dhRecbto");
          if (dhRecbtoTag) {
            const [dia, mes, ano] = data.nova_data.split("/");
            const novaDataFmt = `${ano}-${mes}-${dia}T${new Date()
              .toISOString()
              .split("T")[1]
              .substring(0, 8)}-03:00`;
            setNodeText(dhRecbtoTag as Record<string, unknown>, novaDataFmt);
            alteracoes.push("Protocolo: <dhRecbto> alterado");
          }
      }
  }

  return { xmlObj, alteracoes };
}


/**
 * Tradução de 'editar_arquivos' - Orquestrador
 *
 */
export async function editFilesInBatch(
  allInfos: XmlInfo[],
  config: FullConfig
) {
  // 1. Preparar Mapeamentos
  const { chaveMapping, referenceMap, chaveDaVendaNova } = await preparaMapeamentos(
    allInfos,
    config
  );
  console.log(`[Editor] Mapeamento de ${Object.keys(chaveMapping).length} chaves preparado.`);
  if (chaveDaVendaNova) console.log(`[Editor] Chave da Venda principal detectada.`);

  // 2. Iterar e editar
  for (const info of allInfos) {
    let alteracoes: string[] = [];
    let xmlObj = info.xmlObj;

    try {
      if (info.tipo === "nfe") {
        ({ xmlObj, alteracoes } = editarNFe(
          xmlObj,
          config,
          chaveMapping,
          referenceMap
        ));
      } else if (info.tipo === "cancelamento") {
         ({ xmlObj, alteracoes } = editarCancelamento(
          xmlObj,
          config,
          chaveMapping
        ));
      } else if (info.tipo === "cte") {
        ({ xmlObj, alteracoes } = editarCTe(
          xmlObj,
          config,
          chaveMapping,
          chaveDaVendaNova
        ));
      } else if (info.tipo === "inutilizacao") {
        ({ xmlObj, alteracoes } = editarInutilizacao(xmlObj, config));
      }

      if (alteracoes.length > 0) {
        // 3. Salvar XML modificado
        // Usamos .filter(Boolean) para limpar entradas duplicadas ou vazias
        const uniqueAlteracoes = [...new Set(alteracoes.filter(Boolean))];
        
        await saveXml(info.caminhoCompleto, xmlObj);
        console.log(
          `[OK] ${path.basename(
            info.caminhoCompleto
          )} editado: ${uniqueAlteracoes.join(", ")}`
        );
      }
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      console.error(
        `[ERRO] Falha ao editar ${path.basename(info.caminhoCompleto)}: ${
          err.message
        }`,
        err.stack
      );
    }
  }
}