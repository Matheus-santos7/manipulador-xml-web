// Em: src/lib/xml-processor.ts

import * as fs from "fs";
import fsPromises from "fs/promises"; // Usamos a versão 'promises' para operações assíncronas
import path from "path";
import { XMLParser, XMLBuilder } from "fast-xml-parser";
import archiver from "archiver";
import db from "@/lib/db";
import { Prisma } from "@prisma/client";

// ----- (INÍCIO DA TRADUÇÃO DO SEU SCRIPT PYTHON) -----

// Definições de CFOP (do seu script)
const VENDAS_CFOP = [
  "5404",
  "6404",
  "5108",
  "6108",
  "5405",
  "6405",
  "5102",
  "6102",
  "5105",
  "6105",
  "5106",
  "6106",
  "5551",
];
const DEVOLUCOES_CFOP = [
  "1201",
  "2201",
  "1202",
  "1410",
  "2410",
  "2102",
  "2202",
  "2411",
];
const RETORNOS_CFOP = ["1949", "2949", "5902", "6902"];
const REMESSAS_CFOP = ["5949", "5156", "6152", "6949", "6905", "5901", "6901"];

// Configuração do Parser (para corresponder ao ElementTree)
const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: true, // Crucial para manter a ordem das tags
  parseTagValue: false, // Ler tudo como string
};
const builder = new XMLBuilder(parserOptions);
const parser = new XMLParser(parserOptions);

/**
 * Tradução de 'calcular_dv_chave'
 *
 */
function calcularDvChave(chave: string): string {
  if (chave.length !== 43) {
    throw new Error("A chave para cálculo do DV deve ter 43 dígitos.");
  }
  let soma = 0;
  let multiplicador = 2;
  for (let i = chave.length - 1; i >= 0; i--) {
    soma += parseInt(chave[i]) * multiplicador;
    multiplicador++;
    if (multiplicador > 9) {
      multiplicador = 2;
    }
  }
  const resto = soma % 11;
  const dv = 11 - resto;
  return dv === 0 || dv === 1 || dv === 10 || dv === 11 ? "0" : String(dv);
}

// Helper para encontrar elementos no JSON do fast-xml-parser
// (Tradução de 'find_element_deep')
//
function findElementDeep(obj: unknown, tagPath: string): unknown {
  const tags = tagPath.split("/");
  let current: unknown[] = [obj];

  for (const tag of tags) {
    const next: unknown[] = [];
    for (const node of current) {
      if (node && typeof node === "object" && !Array.isArray(node)) {
        // Encontra a chave que corresponde à tag (ignorando namespace)
        const nodeObj = node as Record<string, unknown>;
        const keys = Object.keys(nodeObj);
        const matchingKey = keys.find(
          (k) => k.endsWith(`:${tag}`) || k === tag
        );

        if (matchingKey && nodeObj[matchingKey]) {
          // nodeObj[matchingKey] pode ser um array ou um único item
          const val = nodeObj[matchingKey];
          if (Array.isArray(val)) {
            next.push(...(val as unknown[]));
          } else {
            next.push(val);
          }
        }
      } else if (Array.isArray(node)) {
        // Se for um array, procura em cada item
        for (const item of node) {
          if (item && typeof item === "object") {
            const itemObj = item as Record<string, unknown>;
            const keys = Object.keys(itemObj);
            const matchingKey = keys.find(
              (k) => k.endsWith(`:${tag}`) || k === tag
            );
            if (matchingKey && itemObj[matchingKey]) {
              const val = itemObj[matchingKey];
              if (Array.isArray(val)) {
                next.push(...(val as unknown[]));
              } else {
                next.push(val);
              }
            }
          }
        }
      }
    }
    current = next;
    if (current.length === 0) return null;
  }
  return current[0]; // Retorna o primeiro encontrado
}

// Helper para pegar o texto de um nó (que é um objeto complexo)
function getNodeText(node: unknown): string | null {
  if (!node || typeof node !== "object" || Array.isArray(node)) return null;
  const obj = node as Record<string, unknown>;
  const text = obj["#text"];
  return typeof text === "string" ? text : null;
}

/**
 * Tradução de 'get_xml_info'
 *
 */
interface XmlInfo {
  tipo: string;
  caminho_completo: string;
  nfe_number: string | null;
  cfop: string | null;
  nat_op: string | null;
  ref_nfe: string | null;
  x_texto: string | null;
  chave: string;
  emit_cnpj: string | null;
  xmlObj: unknown;
}

function getXmlInfo(xmlObj: unknown, filePath: string): XmlInfo | null {
  try {
    const infNFe = findElementDeep(xmlObj, "infNFe") as Record<
      string,
      unknown
    > | null;
    if (!infNFe) return null;

    const ide = findElementDeep(infNFe, "ide") as Record<
      string,
      unknown
    > | null;
    const emit = findElementDeep(infNFe, "emit") as Record<
      string,
      unknown
    > | null;
    if (!ide || !emit) return null;

    // Try several possible id keys and ensure it's a string before substring
    const infNFeObj = infNFe as Record<string, unknown>;
    const rawId = (infNFeObj["@_Id"] ??
      infNFeObj["@Id"] ??
      infNFeObj["Id"]) as unknown;
    const chave = typeof rawId === "string" ? rawId.substring(3) : "";
    if (!chave) return null;

    return {
      tipo: "nfe",
      caminho_completo: filePath,
      nfe_number: getNodeText(findElementDeep(ide, "nNF")),
      cfop: getNodeText(findElementDeep(infNFe, "det/prod/CFOP")),
      nat_op: getNodeText(findElementDeep(ide, "natOp")),
      ref_nfe: getNodeText(findElementDeep(ide, "NFref/refNFe")),
      x_texto: getNodeText(findElementDeep(infNFe, "infAdic/obsCont/xTexto")),
      chave: chave,
      emit_cnpj: getNodeText(findElementDeep(emit, "CNPJ")),
      xmlObj: xmlObj, // Mantém o objeto para edição futura
    };
  } catch (e) {
    return null;
  }
}

// ... (Aqui viriam as traduções de 'processar_arquivos' e 'editar_arquivos')
// ... (Isto é EXTREMAMENTE complexo e longo, traduzindo toda a lógica de
// ... '_prepara_mapeamentos', '_editar_nfe', '_editar_cte', etc.)

// ----- (FIM DA TRADUÇÃO) -----

/**
 * Função principal que orquestra o processamento
 */
export async function processXMLBatch(
  profileId: string,
  files: Array<{
    originalname: string;
    buffer?: Buffer;
    [key: string]: unknown;
  }>
): Promise<string> {
  // 1. Criar uma pasta temporária única para este processamento
  const batchId = `batch_${Date.now()}`;
  const tempDir = path.join("/tmp", batchId); // Use /tmp (ou 'os.tmpdir()')
  const zipFilePath = path.join("/tmp", `${batchId}.zip`);
  await fsPromises.mkdir(tempDir, { recursive: true });

  try {
    // 2. Buscar a configuração completa do banco de dados
    const config = await db.configurationProfile.findUnique({
      where: { id: profileId },
      include: {
        emitente: true,
        produto: true,
        impostos: true,
        data: true,
        alterarFlags: true,
        cstMappings: true,
      },
    });
    if (!config) throw new Error("Perfil de configuração não encontrado.");

    // 3. Salvar ficheiros originais na pasta temporária
    for (const file of files) {
      if (!file.buffer) {
        throw new Error(`O ficheiro ${file.originalname} não contém buffer.`);
      }
      const filePath = path.join(tempDir, file.originalname);
      await fsPromises.writeFile(filePath, file.buffer);
    }
    console.log(`Ficheiros salvos em ${tempDir}`);

    // ----- AQUI COMEÇA A LÓGICA DO SEU SCRIPT -----
    // Esta é a parte que você precisa de traduzir

    //
    // ETAPA 1: TRADUÇÃO DE `processar_arquivos` (Renomeação)
    //
    //
    // 1. Ler todos os ficheiros de `tempDir`
    // 2. Para cada um, chamar `getXmlInfo` (traduzido acima)
    // 3. Construir o `nfe_infos` (mapa de informações)
    // 4. Implementar a lógica de `_gerar_novo_nome_nfe` (a sua lógica de if/else)
    // 5. Renomear os ficheiros dentro de `tempDir` usando `fs.rename`
    //
    // (Por agora, vamos apenas PULAR a renomeação e focar na edição)
    //

    //
    // ETAPA 2: TRADUÇÃO DE `editar_arquivos` (Edição)
    //
    //

    // 1. Chamar `_prepara_mapeamentos` (traduzido)
    //    - Isto envolve ler TODOS os ficheiros, calcular as *novas chaves*
    //      (usando `calcularDvChave`) e construir o `chave_mapping` e `reference_map`.
    //    - Ex: const { chave_mapping, reference_map } = await preparaMapeamentos(tempDir, config);

    // 2. Iterar sobre cada ficheiro em `tempDir` NOVAMENTE
    const fileNames = await fsPromises.readdir(tempDir);
    for (const fileName of fileNames) {
      const filePath = path.join(tempDir, fileName);
      const fileContent = await fsPromises.readFile(filePath, "utf-8");
      const xmlObj = parser.parse(fileContent);

      // 3. Chamar `_editar_nfe` (traduzido)
      //    - Ex: xmlObj = editarNFe(xmlObj, config, chave_mapping, reference_map);
      //    - Esta função teria de navegar no `xmlObj` (JSON) e
      //      substituir os valores do emitente, produto, impostos, flags, e
      //      crucialmente, a `refNFe` usando o `chave_mapping`.

      // (Esta é uma simulação simples de edição)
      const infNFe = findElementDeep(xmlObj, "infNFe");
      if (infNFe && config.alterarFlags?.emitente && config.emitente) {
        const emit = findElementDeep(infNFe, "emit");
        const xNomeNode = findElementDeep(emit, "xNome");
        if (
          xNomeNode &&
          typeof xNomeNode === "object" &&
          !Array.isArray(xNomeNode)
        ) {
          const xNomeObj = xNomeNode as Record<string, unknown>;
          xNomeObj["#text"] = config.emitente.xNome; // Exemplo de edição
          console.log(
            `Editado ${fileName}: xNome mudado para ${config.emitente.xNome}`
          );
        }
      }

      // 4. Salvar o XML modificado de volta (tradução de `_salvar_xml`)
      //
      let xmlString = builder.build(xmlObj);
      xmlString = xmlString.replace(/>\s+</g, "><").trim(); // Limpeza
      if (!xmlString.startsWith("<?xml")) {
        xmlString = '<?xml version="1.0" encoding="UTF-8"?>' + xmlString;
      }
      await fsPromises.writeFile(filePath, xmlString);
    }

    // ----- FIM DA LÓGICA DO SCRIPT -----

    // 4. Criar o ficheiro .zip
    console.log("A criar ficheiro zip...");
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver("zip", {
      zlib: { level: 9 }, // Compressão máxima
    });

    return new Promise((resolve, reject) => {
      output.on("close", () => {
        console.log(`Zip criado: ${zipFilePath} (${archive.pointer()} bytes)`);
        resolve(zipFilePath); // Retorna o caminho do zip
      });

      archive.on("error", (err) => reject(err));
      archive.pipe(output);

      // Adiciona a pasta temporária ao zip
      archive.directory(tempDir, false);

      archive.finalize();
    });
  } catch (error) {
    console.error("Erro no processamento batch:", error);
    throw error; // Propaga o erro
  } finally {
    // 5. Limpeza (opcional, pode querer manter para debug)
    // await fs.rm(tempDir, { recursive: true, force: true });
    // console.log(`Pasta temporária ${tempDir} removida`);
  }
}
