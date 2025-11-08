"use client";

import { useState, useEffect, FormEvent } from "react";
import Link from "next/link"; // <--- 1. Importar Link
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface Profile {
  id: string;
  nome: string;
  criadoEm: string;
}

export default function ConfiguracoesPage() {
  const [newProfileName, setNewProfileName] = useState("");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // --- READ (Ler) ---
  const fetchProfiles = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/profiles");
      if (res.ok) {
        const data: Profile[] = await res.json();
        setProfiles(data);
      } else {
        toast.error("Erro", { description: "Falha ao buscar perfis." });
      }
    } catch {
      toast.error("Erro de rede", {
        description: "Não foi possível conectar à API.",
      });
    }
    setIsLoading(false);
  };

  useEffect(() => {
    // Evitar setState síncrono dentro do efeito — executar em microtask
    const t = setTimeout(() => {
      void fetchProfiles();
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // --- CREATE (Criar) ---
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!newProfileName.trim()) {
      toast.warning("Atenção", { description: "O nome não pode estar vazio." });
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: newProfileName }),
      });

      if (res.status === 201) {
        toast.success("Sucesso!", {
          description: `Perfil "${newProfileName}" criado.`,
        });
        setNewProfileName("");
        fetchProfiles(); // Atualiza a lista
      } else if (res.status === 409) {
        toast.error("Erro", {
          description: "Um perfil com este nome já existe.",
        });
      } else {
        toast.error("Erro", { description: "Falha ao criar o perfil." });
      }
    } catch {
      toast.error("Erro de rede", {
        description: "Não foi possível conectar à API.",
      });
    }
    setIsLoading(false);
  };

  // --- DELETE (Apagar) ---
  const handleDelete = async (profileId: string, profileName: string) => {
    try {
      const res = await fetch(`/api/profiles/${profileId}`, {
        method: "DELETE",
      });

      if (res.status === 204) {
        toast.success("Sucesso!", {
          description: `Perfil "${profileName}" apagado.`,
        });
        fetchProfiles(); // Atualiza a lista
      } else {
        toast.error("Erro", { description: "Falha ao apagar o perfil." });
      }
    } catch {
      toast.error("Erro de rede", {
        description: "Não foi possível conectar à API.",
      });
    }
  };

  return (
    <div className="container mx-auto p-8 space-y-8">
      {/* 1. Formulário de CRIAÇÃO (Sem alteração) */}
      <Card>
        <CardHeader>
          <CardTitle>Criar Novo Perfil</CardTitle>
          <CardDescription>
            Crie um novo perfil de configuração (ex: ATLAS, ITATIAIA).
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent>
            <Input
              placeholder="Nome do Perfil"
              value={newProfileName}
              onChange={(e) => setNewProfileName(e.target.value)}
              disabled={isLoading}
            />
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "A criar..." : "Criar Perfil"}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {/* 2. Tabela de LEITURA (Atualizada) */}
      <Card>
        <CardHeader>
          <CardTitle>Perfis Existentes</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="w-[300px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.length > 0 ? (
                profiles.map((profile) => (
                  <TableRow key={profile.id}>
                    <TableCell className="font-medium">
                      {profile.nome}
                    </TableCell>
                    <TableCell className="space-x-2">
                      {/* Botão EDITAR (Update) */}
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/configuracoes/${profile.id}`}>
                          Editar
                        </Link>
                      </Button>

                      {/* Botão APAGAR (Delete) com confirmação */}
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="destructive" size="sm">
                            Apagar
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Tem a certeza?</DialogTitle>
                            <DialogDescription>
                              Esta ação não pode ser desfeita. Isto apagará
                              permanentemente o perfil{" "}
                              <strong>{profile.nome}</strong> e todos os seus
                              dados.
                            </DialogDescription>
                          </DialogHeader>
                          <DialogFooter>
                            <DialogClose asChild>
                              <Button variant="outline">Cancelar</Button>
                            </DialogClose>
                            <DialogClose asChild>
                              <Button
                                variant="destructive"
                                onClick={() =>
                                  handleDelete(profile.id, profile.nome)
                                }
                                size="sm"
                              >
                                Confirmar
                              </Button>
                            </DialogClose>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={2} className="text-center">
                    {isLoading
                      ? "A carregar perfis..."
                      : "Nenhum perfil encontrado."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
