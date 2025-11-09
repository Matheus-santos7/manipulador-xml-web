// Em: src/lib/xml/editor.ts

import { XmlInfo, getXmlInfo } from "./info-extractor";
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
 * Helper to read an attribute value from a parsed XML node (attributes are kept in the "$" property).
 */
function getNodeAttr(node: unknown, attrName: string): string | undefined {
  if (!node || typeof node !== "object") return undefined;
  const n = node as Record<string, unknown> & { $?: Record<string, unknown> };
  const attrs = n.$;
  if (attrs && typeof attrs === "object") {
    const val = attrs[attrName];
    return typeof val === "string" ? val : val === undefined ? undefined : String(val);
  }
  return undefined;
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
  const nNFToKeyMap = Object.fromEntries(
    nfeInfos.map((info) => [info.nfeNumber, info.chave])
  );

  const { alterarFlags, emitente, data } = config;
  const alterarEmitente = alterarFlags?.emitente;
  const alterarData = alterarFlags?.data;
  const novoEmitente = emitente;
  const novaDataStr = data?.nova_data;

  for (const info of nfeInfos) {
    const originalKey = info.chave;
    if (!originalKey) continue;

    if (info.refNFe) {
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
        // setNodeText expects a Record<string, unknown> | null | undefined
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
        const node = findElementDeep(imposto, campo); // Ex: 'ICMS/ICMS00/pICMS'
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

  // Recalcula Totais IPI (chamar helper)
  // TODO: Traduzir _recalcula_totais_ipi e chamá-la aqui

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

// ... (Traduções de _editar_cte, _editar_cancelamento, _editar_inutilizacao) ...

/**
 * Tradução de 'editar_arquivos' - Orquestrador
 *
 */
export async function editFilesInBatch(
  allInfos: XmlInfo[],
  config: FullConfig
) {
  // 1. Preparar Mapeamentos
  const { chaveMapping, referenceMap } = await preparaMapeamentos(
    allInfos,
    config
  );

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
        // TODO: Chamar editarCancelamento(xmlObj, config, chaveMapping);
        //
      } else if (info.tipo === "cte") {
        // TODO: Chamar editarCTe(xmlObj, config, chaveMapping, chaveDaVendaNova);
        //
      } else if (info.tipo === "inutilizacao") {
        // TODO: Chamar editarInutilizacao(xmlObj, config);
        //
      }

      if (alteracoes.length > 0) {
        // 3. Salvar XML modificado
        await saveXml(info.caminhoCompleto, xmlObj);
        console.log(
          `[OK] ${path.basename(
            info.caminhoCompleto
          )} editado: ${alteracoes.join(", ")}`
        );
      }
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      console.error(
        `[ERRO] Falha ao editar ${path.basename(info.caminhoCompleto)}: ${
          err.message
        }`
      );
    }
  }
}
