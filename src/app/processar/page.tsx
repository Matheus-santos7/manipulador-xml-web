// Em: src/app/processar/page.tsx

'use client';

import { useState, useEffect, ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

// Tipo simples para a lista de perfis
interface Profile {
  id: string;
  nome: string;
}

export default function ProcessarPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // 1. Buscar os perfis de configuração quando a página carrega
  useEffect(() => {
    const fetchProfiles = async () => {
      try {
        const res = await fetch('/api/profiles');
        const data = await res.json();
        setProfiles(data);
      } catch (error) {
        toast.error('Erro ao carregar perfis de configuração.');
      }
    };
    fetchProfiles();
  }, []);

  // 2. Função para guardar os ficheiros selecionados
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSelectedFiles(e.target.files);
  };

  // 3. Função para enviar o formulário (o "processamento")
  const handleSubmit = async () => {
    if (!selectedProfileId) {
      toast.warning('Por favor, selecione um perfil de configuração.');
      return;
    }
    if (!selectedFiles || selectedFiles.length === 0) {
      toast.warning('Por favor, selecione pelo menos um ficheiro XML.');
      return;
    }

    setIsLoading(true);
    toast.info('A processar... Por favor, aguarde.', {
      description: 'Isto pode demorar alguns segundos.',
    });

    // 4. Usamos 'FormData' para enviar ficheiros + dados
    const formData = new FormData();
    formData.append('profileId', selectedProfileId);
    
    // Adiciona todos os ficheiros ao FormData
    for (let i = 0; i < selectedFiles.length; i++) {
      formData.append('files', selectedFiles[i]);
    }

    try {
      // 5. Enviar para a nossa nova API de processamento
      const res = await fetch('/api/process', {
        method: 'POST',
        body: formData,
        // Não defina 'Content-Type', o navegador fá-lo-á por nós (necessário para 'boundary')
      });

      if (!res.ok) {
        throw new Error('Falha no processamento. Verifique a consola do servidor.');
      }

      // 6. Receber o ficheiro .zip de volta
      const blob = await res.blob();
      
      // 7. Criar um link de download e "clicá-lo"
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'xml_processados.zip'; // Nome do ficheiro
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      toast.success('Processamento concluído!', {
        description: 'O download do .zip foi iniciado.'
      });

    } catch (error: unknown) {
      let message = 'Ocorreu um erro desconhecido.';
      if (error instanceof Error) {
        message = error.message;
      } else if (typeof error === 'string') {
        message = error;
      } else {
        try {
          message = JSON.stringify(error);
        } catch {
          // keep default message
        }
      }
      toast.error('Erro no Processamento', {
        description: message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-8 max-w-2xl space-y-8">
      
      <Alert>
        <AlertTitle>Página Principal de Processamento</AlertTitle>
        <AlertDescription>
          Esta é a página final. A lógica do seu script Python `manipuladorXML.py` 
          será executada no servidor quando clicar em &quot;Processar&quot;.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Processar Lote de XML</CardTitle>
          <CardDescription>
            Escolha a configuração e envie os seus ficheiros XML para processamento.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          
          {/* Passo 1: Selecionar Perfil */}
          <div className="space-y-2">
            <Label>1. Escolha o Perfil de Configuração</Label>
            <Select
              onValueChange={setSelectedProfileId}
              disabled={isLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um perfil..." />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Passo 2: Fazer Upload dos Ficheiros */}
          <div className="space-y-2">
            <Label>2. Faça Upload dos Ficheiros XML</Label>
            <Input
              type="file"
              multiple // Permite múltiplos ficheiros
              accept=".xml, text/xml"
              onChange={handleFileChange}
              disabled={isLoading}
            />
          </div>

        </CardContent>
        <CardContent className="flex justify-end">
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? 'A processar...' : 'Processar e Fazer Download (.zip)'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}