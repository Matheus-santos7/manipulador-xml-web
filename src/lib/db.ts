// Em: src/lib/db.ts

import { PrismaClient } from '@prisma/client';

// Declara um 'prisma' global para evitar múltiplas instâncias em desenvolvimento
declare global {
  var prisma: PrismaClient | undefined;
}

// Cria a conexão. Se estamos em desenvolvimento (process.env.NODE_ENV !== 'production'), 
// ele reutiliza a conexão global para que o 'hot-reload' não crie novas conexões.
export const db = globalThis.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalThis.prisma = db;

export default db;