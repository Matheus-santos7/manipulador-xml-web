// Carrega variáveis de ambiente do arquivo .env ao executar este config
// Isso garante que o Prisma leia DATABASE_URL mesmo quando o CLI importa
// este arquivo como um módulo TypeScript/JS.
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  engine: "classic",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
