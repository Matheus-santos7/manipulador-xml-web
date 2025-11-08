-- CreateTable
CREATE TABLE "ConfigurationProfile" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfigurationProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmitenteConfig" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "CNPJ" TEXT,
    "xNome" TEXT,
    "xLgr" TEXT,
    "nro" TEXT,
    "xCpl" TEXT,
    "xBairro" TEXT,
    "xMun" TEXT,
    "UF" TEXT,
    "fone" TEXT,

    CONSTRAINT "EmitenteConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProdutoConfig" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "xProd" TEXT,
    "cEAN" TEXT,
    "cProd" TEXT,

    CONSTRAINT "ProdutoConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImpostosConfig" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "pFCP" TEXT,
    "pICMS" TEXT,
    "pICMSUFDest" TEXT,
    "pICMSInter" TEXT,
    "pPIS" TEXT,
    "pCOFINS" TEXT,
    "pIPI" TEXT,

    CONSTRAINT "ImpostosConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataConfig" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "nova_data" TEXT,

    CONSTRAINT "DataConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlterarFlags" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "emitente" BOOLEAN NOT NULL DEFAULT false,
    "produtos" BOOLEAN NOT NULL DEFAULT false,
    "impostos" BOOLEAN NOT NULL DEFAULT false,
    "data" BOOLEAN NOT NULL DEFAULT false,
    "refNFe" BOOLEAN NOT NULL DEFAULT false,
    "cst" BOOLEAN NOT NULL DEFAULT false,
    "zerar_ipi_remessa_retorno" BOOLEAN NOT NULL DEFAULT false,
    "zerar_ipi_venda" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AlterarFlags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CSTMapping" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "cfop" TEXT NOT NULL,
    "ICMS" TEXT,
    "IPI" TEXT,
    "PIS" TEXT,
    "COFINS" TEXT,

    CONSTRAINT "CSTMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConfigurationProfile_nome_key" ON "ConfigurationProfile"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "EmitenteConfig_profileId_key" ON "EmitenteConfig"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "ProdutoConfig_profileId_key" ON "ProdutoConfig"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "ImpostosConfig_profileId_key" ON "ImpostosConfig"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "DataConfig_profileId_key" ON "DataConfig"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "AlterarFlags_profileId_key" ON "AlterarFlags"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "CSTMapping_profileId_cfop_key" ON "CSTMapping"("profileId", "cfop");

-- AddForeignKey
ALTER TABLE "EmitenteConfig" ADD CONSTRAINT "EmitenteConfig_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ConfigurationProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoConfig" ADD CONSTRAINT "ProdutoConfig_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ConfigurationProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpostosConfig" ADD CONSTRAINT "ImpostosConfig_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ConfigurationProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataConfig" ADD CONSTRAINT "DataConfig_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ConfigurationProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlterarFlags" ADD CONSTRAINT "AlterarFlags_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ConfigurationProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CSTMapping" ADD CONSTRAINT "CSTMapping_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ConfigurationProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
