"use client";

import React, { useEffect, useState, ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

// Tipo simples para a lista de perfis
interface Profile {
  id: string;
  nome: string;
}

export default function ProcessarPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // 1. Buscar os perfis de configuração quando a página carrega
  useEffect(() => {
    const fetchProfiles = async () => {
      try {
        const res = await fetch("/api/profiles");
        const data = await res.json();
        setProfiles(data || []);
      } catch (err) {
        console.error("Erro ao buscar perfis:", err);
      }
    };
    fetchProfiles();
  }, []);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setSelectedFiles(e.target.files);
  }

  async function handleSubmit() {
    if (!selectedProfileId) return toast("Selecione um perfil");
    if (!selectedFiles || selectedFiles.length === 0)
      return toast("Selecione pelo menos um ficheiro");

    const formData = new FormData();
    formData.append("profileId", selectedProfileId);
    for (let i = 0; i < selectedFiles.length; i++) {
      formData.append("files", selectedFiles[i]);
    }

    try {
      setIsLoading(true);
      const res = await fetch("/api/process", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Falha no processamento");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "xml_processados.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success("Download iniciado");
    } catch (err) {
      console.error("Erro ao enviar ficheiros:", err);
      toast.error("Erro ao processar ficheiros");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div>
      <h1>Processar XMLs</h1>
      <Card>
        <CardHeader>
          <CardTitle>Processamento em lote</CardTitle>
          <CardDescription>Escolha um perfil e ficheiros XML</CardDescription>
        </CardHeader>
        <CardContent>
          <Label>Perfil</Label>
          <Select
            onValueChange={(v) => setSelectedProfileId(v)}
            value={selectedProfileId}
          >
            <SelectTrigger aria-label="Perfil">
              <SelectValue placeholder="Escolha um perfil" />
            </SelectTrigger>
            <SelectContent>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Label style={{ marginTop: 12 }}>Ficheiros</Label>
          <Input type="file" multiple onChange={handleFileChange} />

          <div style={{ marginTop: 12 }}>
            <Button onClick={handleSubmit} disabled={isLoading}>
              {isLoading
                ? "A processar..."
                : "Processar e Fazer Download (.zip)"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
