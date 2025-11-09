// Em: src/app/api/process/route.ts

import { NextRequest, NextResponse } from "next/server";
import multer from "multer";
type MulterFile = {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer?: Buffer;
  size?: number;
  [key: string]: unknown;
};
import type { RequestHandler, Request, Response, NextFunction } from "express";
import { processXMLBatch } from "@/lib/xml-processor";
import fs from "fs/promises";

// Configuração do Multer para guardar ficheiros na memória
const upload = multer({ storage: multer.memoryStorage() });

/**
 * @Documentação
 * Esta é uma API que não é 'Next.js' pura. Precisamos de 'promisify'
 * o middleware do multer para funcionar com o App Router.
 */

// Helper para "promisify" o multer
type ExpressLikeReq = {
  headers: Headers | Record<string, string | string[]>;
  body?: Record<string, unknown>;
  files?: unknown[];
  [key: string]: unknown;
};

type MulterMiddleware = RequestHandler;

function runMiddleware(req: NextRequest, fn: MulterMiddleware): Promise<void> {
  return new Promise((resolve, reject) => {
    // O 'req' do Next.js precisa de ser "adaptado" para o 'req' do Express
    // Use any casts at runtime since we're adapting NextRequest to what multer expects
    const expressReq = req as unknown as Request & ExpressLikeReq;

    // Pass a dummy Express-like response (multer doesn't use it) and handle callback
    const dummyRes = {} as unknown as Response;
    // call the multer handler with relaxed runtime types
    (
      fn as unknown as (req: Request, res: Response, next: NextFunction) => void
    )(expressReq, dummyRes, (result?: unknown) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve();
    });
  });
}

/**
 * @Documentação POST /api/process
 * Recebe o profileId e múltiplos ficheiros XML.
 * Processa-os e devolve um ficheiro .zip.
 */
export async function POST(req: NextRequest) {
  let tempZipPath: string | null = null;

  try {
    // 1. Executa o middleware Multer para apanhar os ficheiros
    // 'files' deve corresponder ao nome do campo no FormData
    await runMiddleware(req, upload.array("files"));

    // O 'req' foi modificado pelo multer e agora contém 'body' e 'files'
    interface ReqWithFiles {
      body?: Record<string, unknown>;
      files?: MulterFile[];
    }
    const reqWithFiles = req as unknown as ReqWithFiles;
    const rawProfileId = reqWithFiles.body?.profileId;
    // Ensure profileId is a string (reject if missing/invalid)
    if (typeof rawProfileId !== "string") {
      return new NextResponse("profileId e files são obrigatórios", {
        status: 400,
      });
    }
    const profileId = rawProfileId;
    const files = reqWithFiles.files ?? [];
    const multerFiles = files as MulterFile[];

    // Chama o processador com o array de ficheiros em memória (cada item tem originalname + buffer)
    tempZipPath = await processXMLBatch(profileId, multerFiles);

    // 3. Lê o .zip temporário
    if (!tempZipPath) {
      throw new Error("Ficheiro zip temporário não encontrado");
    }
    const zipBuffer = await fs.readFile(tempZipPath);

    // 4. Envia o .zip como resposta
    const headers = new Headers();
    headers.set("Content-Type", "application/zip");
    headers.set(
      "Content-Disposition",
      'attachment; filename="xml_processados.zip"'
    );

    return new NextResponse(zipBuffer, { headers });
  } catch (error: unknown) {
    console.error("Erro na API /api/process:", error);
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
        ? error
        : "Unknown error";
    return new NextResponse(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    // 5. Limpa o ficheiro .zip temporário
    if (tempZipPath) {
      await fs.unlink(tempZipPath);
      console.log(`Ficheiro zip temporário ${tempZipPath} removido.`);
    }
  }
}
