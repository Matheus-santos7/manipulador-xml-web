import { XMLParser, XMLBuilder } from "fast-xml-parser";
import * as fs from "fs/promises";
// Nota: não usamos 'path' aqui — removido import desnecessário

// Configuração do Parser (para corresponder ao ElementTree)
const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: true, // Crucial para manter a ordem das tags
  parseTagValue: false, // Ler tudo como string
  trimValues: false,
};

export const parser = new XMLParser(parserOptions);
export const builder = new XMLBuilder(parserOptions);

/**
 * Tradução de 'calcular_dv_chave'
 *
 */
export function calcularDvChave(chave: string): string {
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

/**
 * Funções 'find_element_deep' e 'find_all_elements' adaptadas para o JSON do fast-xml-parser.
 * Isto é muito mais complexo que o ElementTree, pois precisamos de navegar no JSON.
 *
 */
export function findElementDeep(obj: unknown, tagPath: string): unknown | null {
  const tags = tagPath.split("/");
  let current: unknown[] = [obj];

  for (const tag of tags) {
    const next: unknown[] = [];
    for (const node of current) {
      if (!node || typeof node !== "object") continue;

      const nodeObj = node as Record<string, unknown>;
      const keys = Object.keys(nodeObj);
      const matchingKey = keys.find((k) => k.endsWith(`:${tag}`) || k === tag);

      if (matchingKey && nodeObj[matchingKey] !== undefined) {
        const children = nodeObj[matchingKey];
        if (Array.isArray(children)) {
          next.push(...(children as unknown[]));
        } else {
          next.push(children as unknown);
        }
      }
    }
    current = next;
    if (current.length === 0) return null;
  }
  return current[0] ?? null; // Retorna o primeiro encontrado
}

export function findAllElementsDeep(obj: unknown, tagPath: string): unknown[] {
  const tags = tagPath.split("/");
  let current: unknown[] = [obj];

  for (const tag of tags) {
    const next: unknown[] = [];
    for (const node of current) {
      if (!node || typeof node !== "object") continue;

      const nodeObj = node as Record<string, unknown>;
      const keys = Object.keys(nodeObj);
      const matchingKey = keys.find((k) => k.endsWith(`:${tag}`) || k === tag);

      if (matchingKey && nodeObj[matchingKey] !== undefined) {
        const children = nodeObj[matchingKey];
        if (Array.isArray(children)) {
          next.push(...(children as unknown[]));
        } else {
          next.push(children as unknown);
        }
      }
    }
    current = next;
    if (current.length === 0) return [];
  }
  return current; // Retorna todos os encontrados no último nível
}

/**
 * Helpers para ler e escrever o texto e atributos de um nó JSON.
 * O fast-xml-parser armazena texto em '#text' e atributos em '@_'.
 */
export function getNodeText(node: unknown): string | null {
  if (!node || typeof node !== "object" || Array.isArray(node)) return null;
  const n = node as Record<string, unknown>;
  const txt = n["#text"];
  return typeof txt === "string" ? txt : null;
}

export function setNodeText(
  node: Record<string, unknown> | null | undefined,
  text: string
): void {
  if (node && typeof node === "object" && !Array.isArray(node)) {
    node["#text"] = text;
  }
}

export function getNodeAttr(node: unknown, attrName: string): string | null {
  if (!node || typeof node !== "object" || Array.isArray(node)) return null;
  const n = node as Record<string, unknown>;
  const v = n[`@_${attrName}`];
  return typeof v === "string" ? v : null;
}

export function setNodeAttr(
  node: Record<string, unknown> | null | undefined,
  attrName: string,
  value: string
): void {
  if (node && typeof node === "object" && !Array.isArray(node)) {
    node[`@_${attrName}`] = value;
  }
}

/**
 * Tradução de '_salvar_xml'
 *
 */
export async function saveXml(
  filePath: string,
  xmlObj: unknown
): Promise<void> {
  const xmlStringRaw = builder.build(xmlObj as Record<string, unknown>);
  let xmlString = String(xmlStringRaw);

  // Replicação da sua lógica de regex para limpar namespaces e espaços
  //
  xmlString = xmlString.replace(
    / xmlns:ds="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#"/g,
    ""
  );
  xmlString = xmlString.replace(
    /<ds:Signature/g,
    `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"`
  );
  xmlString = xmlString.replace(/<\/ds:Signature/g, "</Signature");
  xmlString = xmlString.replace(/<ds:/g, "<").replace(/<\/ds:/g, "</");
  xmlString = xmlString.replace(/>\s+</g, "><").trim();
  xmlString = xmlString.replace(new RegExp("<(/?)(ns0:)", "g"), "<$1");
  xmlString = xmlString.replace(
    /xmlns:ns0="http:\/\/www\.portalfiscal\.inf\.br\/cte"/g,
    ""
  );

  if (!xmlString.startsWith("<?xml")) {
    xmlString = '<?xml version="1.0" encoding="UTF-8"?>' + xmlString;
  }

  await fs.writeFile(filePath, xmlString, "utf-8");
}
