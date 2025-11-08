import { NextResponse, NextRequest } from "next/server";
import db from "@/lib/db"; // O nosso cliente Prisma

/**
 * @Documentação GET /api/profiles/[id]
 * Busca um perfil de configuração específico com todas as suas relações.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const profile = await db.configurationProfile.findUnique({
      where: { id },
      // Ponto-chave: Trazemos todos os dados relacionados (emitente, produto, etc.)
      include: {
        emitente: true,
        produto: true,
        impostos: true,
        data: true,
        alterarFlags: true,
        cstMappings: true, // Traz os mapeamentos CST
      },
    });

    if (!profile) {
      return new NextResponse("Perfil não encontrado", { status: 404 });
    }

    return NextResponse.json(profile);
  } catch (error) {
    console.error("Erro ao buscar perfil:", error);
    return new NextResponse("Erro interno do servidor", { status: 500 });
  }
}

/**
 * @Documentação PUT /api/profiles/[id]
 * Atualiza um perfil de configuração e todos os seus dados.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await req.json();

    // Extraímos todos os dados do corpo da requisição
    // Estes nomes (emitente, produto) vêm do 'schema.prisma'
    const { nome, emitente, produto, impostos, data, alterarFlags } = body;

    // ---- PONTO-CHAVE (UPDATE) ----
    // Usamos um "nested update" do Prisma para atualizar tudo numa só transação.
    const { id } = await params;

    const updatedProfile = await db.configurationProfile.update({
      where: { id },
      data: {
        nome, // Atualiza o nome principal do perfil

        // Atualiza os dados relacionados
        emitente: { update: emitente },
        produto: { update: produto },
        impostos: { update: impostos },
        data: { update: data },
        alterarFlags: { update: alterarFlags },
        // (A lógica do CST Mappings é mais complexa, faremos depois)
      },
      // Inclui os dados atualizados na resposta
      include: {
        emitente: true,
        produto: true,
        impostos: true,
        data: true,
        alterarFlags: true,
      },
    });

    return NextResponse.json(updatedProfile);
  } catch (error) {
    console.error("Erro ao atualizar perfil:", error);
    return new NextResponse("Erro interno do servidor", { status: 500 });
  }
}

/**
 * @Documentação DELETE /api/profiles/[id]
 * Apaga um perfil de configuração.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Graças ao "onDelete: Cascade" no nosso schema.prisma,
    // apagar o perfil principal apagará automaticamente
    // todos os seus dados relacionados (emitente, produto, etc.)
    const { id } = await params;

    await db.configurationProfile.delete({
      where: { id },
    });

    return new NextResponse(null, { status: 204 }); // 204 = Sem Conteúdo (Sucesso)
  } catch (error) {
    console.error("Erro ao apagar perfil:", error);
    return new NextResponse("Erro interno do servidor", { status: 500 });
  }
}
