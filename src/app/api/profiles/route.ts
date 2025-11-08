// Em: src/app/api/profiles/route.ts

import { NextResponse, NextRequest } from 'next/server';
import db from '@/lib/db'; // O nosso cliente Prisma!

/**
 * @Documentação GET /api/profiles
 * Busca todos os perfis de configuração.
 */
export async function GET() {
  try {
    const profiles = await db.configurationProfile.findMany({
      // Ordena por nome para uma lista consistente
      orderBy: { nome: 'asc' }, 
    });

    return NextResponse.json(profiles);

  } catch (error) {
    console.error('Erro ao buscar perfis:', error);
    return new NextResponse('Erro interno do servidor', { status: 500 });
  }
}

/**
 * @Documentação POST /api/profiles
 * Cria um novo perfil de configuração (ex: "ATLAS", "ITATIAIA").
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { nome } = body;

    if (!nome) {
      return new NextResponse('O campo "nome" é obrigatório', { status: 400 });
    }

    // Verifica se um perfil com este nome já existe
    const existingProfile = await db.configurationProfile.findUnique({
      where: { nome },
    });

    if (existingProfile) {
      return new NextResponse('Já existe um perfil com este nome', { status: 409 });
    }

    // ---- PONTO-CHAVE ----
    // Ao criar o perfil, também criamos todos os seus sub-modelos vazios
    // (emitente, produto, etc.). Isto torna a lógica de "UPDATE" 
    // muito mais simples no futuro (não precisamos de verificar se existem, 
    // apenas os atualizamos).

    const newProfile = await db.configurationProfile.create({
      data: {
        nome: nome,
        // "Nested Writes" do Prisma para criar os registos relacionados
        emitente:     { create: {} },
        produto:      { create: {} },
        impostos:     { create: {} },
        data:         { create: {} },
        alterarFlags: { create: {} },
        // Mapeamentos CST (1-para-Muitos) serão adicionados depois, no "UPDATE"
      },
      // Inclui os sub-modelos na resposta
      include: {
        emitente: true,
        produto: true,
        impostos: true,
        data: true,
        alterarFlags: true,
      }
    });

    return NextResponse.json(newProfile, { status: 201 }); // 201 = Criado com sucesso

  } catch (error) {
    console.error('Erro ao criar perfil:', error);
    return new NextResponse('Erro interno do servidor', { status: 500 });
  }
}