// Em: src/lib/xml-processor.ts

import * as fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import archiver from "archiver";
import db from "@/lib/db";
import { Prisma } from "@prisma/client";

// 1. Importar os seus módulos de lógica de negócio
import { renameFilesInBatch } from "./xml/renamer";
import { editFilesInBatch } from "./xml/editor";

// Tipo para a configuração completa do Prisma (movido de editor.ts para ser usado aqui)
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
 * @Documentação
 * Esta é a função principal que a API chama.
 * Orquestra todo o processo de:
 * 1. Salvar ficheiros
 * 2. Renomear ficheiros (usando renamer.ts)
 * 3. Editar ficheiros (usando editor.ts)
 * 4. Compactar o resultado
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
  const tempDir = path.join("/tmp", batchId); // Usar /tmp (ou 'os.tmpdir()')
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

    // ----- INÍCIO DA LÓGICA PORTADA -----

    // 4. ETAPA 1: Renomear ficheiros (usando renamer.ts)
    // Esta função lê os XMLs, extrai as infos, renomeia os ficheiros
    // e retorna a lista de infos já processada.
    const allInfos = await renameFilesInBatch(tempDir);
    console.log(`[Processor] ${allInfos.length} ficheiros renomeados e analisados.`);

    // 5. ETAPA 2: Editar ficheiros (usando editor.ts)
    // Esta função recebe as infos e a configuração do DB
    // e aplica as edições em todos os ficheiros.
    await editFilesInBatch(allInfos, config as FullConfig);
    console.log(`[Processor] Edição em lote concluída.`);

    // ----- FIM DA LÓGICA PORTADA -----

    // 6. Criar o ficheiro .zip
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

      // Adiciona a pasta temporária (agora com ficheiros editados) ao zip
      archive.directory(tempDir, false);

      archive.finalize();
    });
  } catch (error) {
    console.error("Erro no processamento batch:", error);
    // Limpa a pasta temporária em caso de erro
    if (tempDir) {
      await fsPromises.rm(tempDir, { recursive: true, force: true });
    }
    throw error; // Propaga o erro para a API route
  } finally {
    // 7. Limpa a pasta temporária após o sucesso (o .zip já foi criado)
    if (tempDir) {
      await fsPromises.rm(tempDir, { recursive: true, force: true });
      console.log(`Pasta temporária ${tempDir} removida.`);
    }
  }
}