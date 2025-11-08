"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MaskedInput } from "@/components/ui/masked-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import Link from "next/link";

// --- 1. Definição do Schema (O "Tipo" do nosso Formulário) ---
// Isto diz ao TypeScript e ao Zod como são os nossos dados.
// É baseado 100% no nosso 'schema.prisma'.
// Usamos .nullable() e .optional() para campos que podem ser vazios.

const profileFormSchema = z.object({
  nome: z.string().min(1, "O nome é obrigatório"),

  emitente: z.object({
    CNPJ: z.string().nullable().optional(),
    xNome: z.string().nullable().optional(),
    CEP: z.string().nullable().optional(),
    xLgr: z.string().nullable().optional(),
    nro: z.string().nullable().optional(),
    xCpl: z.string().nullable().optional(),
    xBairro: z.string().nullable().optional(),
    xMun: z.string().nullable().optional(),
    UF: z.string().nullable().optional(),
    fone: z.string().nullable().optional(),
  }),

  produto: z.object({
    xProd: z.string().nullable().optional(),
    cEAN: z.string().nullable().optional(),
    cProd: z.string().nullable().optional(),
  }),

  impostos: z.object({
    pFCP: z.string().nullable().optional(),
    pICMS: z.string().nullable().optional(),
    pICMSUFDest: z.string().nullable().optional(),
    pICMSInter: z.string().nullable().optional(),
    pPIS: z.string().nullable().optional(),
    pCOFINS: z.string().nullable().optional(),
    pIPI: z.string().nullable().optional(),
  }),

  data: z.object({
    nova_data: z.string().nullable().optional(),
  }),

  alterarFlags: z.object({
    emitente: z.boolean().default(false),
    produtos: z.boolean().default(false),
    impostos: z.boolean().default(false),
    data: z.boolean().default(false),
    refNFe: z.boolean().default(false),
    cst: z.boolean().default(false),
    zerar_ipi_remessa_retorno: z.boolean().default(false),
    zerar_ipi_venda: z.boolean().default(false),
  }),
});

// Extrai o "tipo" do TypeScript a partir do schema do Zod
type ProfileFormValues = z.infer<typeof profileFormSchema>;

// --- 2. O Componente da Página de Edição ---

export default function EditProfilePage() {
  const router = useRouter();
  const params = useParams(); // Hook para apanhar o [id] da URL
  const profileId = params.id as string;

  const [isLoading, setIsLoading] = useState(true);

  // Configuração do react-hook-form
  const form = useForm<ProfileFormValues>({
    // O cast abaixo resolve um problema de tipos que aparece quando há pequenas
    // diferenças entre as definições da versão do resolver e do react-hook-form.
    // É seguro em runtime — o zodResolver retorna um resolver compatível — e
    // evita confusão de tipos gerados pelo bundler/TTI.
    resolver: zodResolver(
      profileFormSchema
    ) as unknown as Resolver<ProfileFormValues>,
    // Valores padrão (importante para o formulário não reclamar)
    defaultValues: {
      nome: "",
      emitente: {},
      produto: {},
      impostos: {},
      data: {},
      alterarFlags: {},
    },
  });

  // --- 3.5 Lógica ViaCEP: observa o CEP e preenche endereço automaticamente
  const cepValue = form.watch("emitente.CEP");

  useEffect(() => {
    // Função para buscar o CEP na API ViaCEP
    const fetchCep = async (cep: string) => {
      const unmaskedCep = cep.replace(/\D/g, "");
      if (unmaskedCep.length !== 8) return;

      try {
        const res = await fetch(
          `https://viacep.com.br/ws/${unmaskedCep}/json/`
        );
        if (!res.ok) throw new Error("Falha ao buscar CEP");
        const data = await res.json();
        if (data.erro) {
          toast.error("CEP não encontrado");
          return;
        }

        form.setValue("emitente.xLgr", data.logradouro ?? "", {
          shouldDirty: true,
        });
        form.setValue("emitente.xBairro", data.bairro ?? "", {
          shouldDirty: true,
        });
        form.setValue("emitente.xMun", data.localidade ?? "", {
          shouldDirty: true,
        });
        form.setValue("emitente.UF", data.uf ?? "", { shouldDirty: true });
        toast.success("Endereço preenchido!");
      } catch (err) {
        toast.error("Erro ao buscar CEP");
      }
    };

    const id = setTimeout(() => {
      if (cepValue) fetchCep(cepValue);
    }, 500);

    return () => clearTimeout(id);
  }, [cepValue, form]);

  // --- 3. Lógica de FETCH (Buscar Dados) ---
  // Quando a página carrega, buscamos os dados do perfil e preenchemos o formulário.
  useEffect(() => {
    if (!profileId) return;

    const fetchProfileData = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/profiles/${profileId}`);
        if (!res.ok) {
          throw new Error("Perfil não encontrado");
        }
        const data = await res.json();

        // Ponto-chave: 'reset' preenche o formulário com os dados do banco
        form.reset({
          nome: data.nome,
          emitente: data.emitente,
          produto: data.produto,
          impostos: data.impostos,
          data: data.data,
          alterarFlags: data.alterarFlags,
        });
      } catch (error) {
        toast.error("Erro", {
          description: "Não foi possível carregar o perfil.",
        });
        router.push("/configuracoes"); // Volta para a página anterior
      } finally {
        setIsLoading(false);
      }
    };
    fetchProfileData();
  }, [profileId, form, router]);

  // --- 4. Lógica de SUBMIT (Salvar Dados) ---
  // Chamado quando o botão "Salvar" é clicado
  const onSubmit = async (data: ProfileFormValues) => {
    try {
      const res = await fetch(`/api/profiles/${profileId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data), // Envia todos os dados do formulário
      });

      if (res.ok) {
        toast.success("Sucesso!", {
          description: "Perfil atualizado com sucesso.",
        });
        router.push("/configuracoes"); // Volta para a lista
      } else {
        throw new Error("Falha ao salvar");
      }
    } catch (error) {
      toast.error("Erro", {
        description: "Não foi possível salvar as alterações.",
      });
    }
  };

  // Componente de "loading" enquanto busca os dados
  if (isLoading) {
    return (
      <div className="container mx-auto p-8">A carregar dados do perfil...</div>
    );
  }

  // --- 5. A Interface (UI) ---
  // Usamos o <Form> do Shadcn, que funciona com o 'form' do react-hook-form
  return (
    <div className="container mx-auto p-8">
      <Button asChild variant="outline" className="mb-4">
        <Link href="/configuracoes">← Voltar para a Lista</Link>
      </Button>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          {/* Card para o Nome Principal */}
          <Card>
            <CardHeader>
              <CardTitle>Editar Perfil</CardTitle>
              <CardDescription>
                A alterar o perfil de configuração.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="nome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome do Perfil</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ex: ATLAS"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Abas para organizar o resto do formulário */}
          <Tabs defaultValue="emitente" className="w-full">
            <TabsList>
              <TabsTrigger value="emitente">Emitente</TabsTrigger>
              <TabsTrigger value="produto">Produto</TabsTrigger>
              <TabsTrigger value="impostos">Impostos</TabsTrigger>
              <TabsTrigger value="data">Data</TabsTrigger>
              <TabsTrigger value="flags">Flags de Alteração</TabsTrigger>
            </TabsList>

            {/* Aba 1: Emitente */}
            <TabsContent value="emitente">
              <Card>
                <CardHeader>
                  <CardTitle>Dados do Emitente</CardTitle>
                  <CardDescription>
                    Dados do novo emitente a ser inserido no XML.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="emitente.CNPJ"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>CNPJ</FormLabel>
                        <FormControl>
                          <MaskedInput
                            mask="00.000.000/0000-00"
                            onAccept={(value: string) => field.onChange(value)}
                            defaultValue={field.value ?? ""}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="emitente.CEP"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>CEP</FormLabel>
                        <FormControl>
                          <MaskedInput
                            mask="00000-000"
                            onAccept={(value: string) => field.onChange(value)}
                            defaultValue={field.value ?? ""}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="emitente.xNome"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome (xNome)</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="emitente.xLgr"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Logradouro (xLgr)</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="emitente.nro"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Número (nro)</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="emitente.xBairro"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bairro (xBairro)</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="emitente.xMun"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Município (xMun)</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="emitente.UF"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>UF</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="emitente.fone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Telefone (fone)</FormLabel>
                        <FormControl>
                          <MaskedInput
                            mask="(00) 00000-0000"
                            onAccept={(value: string) => field.onChange(value)}
                            defaultValue={field.value ?? ""}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="emitente.xCpl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Complemento (xCpl)</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Aba 2: Produto */}
            <TabsContent value="produto">
              <Card>
                <CardHeader>
                  <CardTitle>Dados do Produto</CardTitle>
                  <CardDescription>
                    Novos dados do produto a serem inseridos.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="produto.xProd"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome (xProd)</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="produto.cEAN"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>EAN (cEAN)</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="produto.cProd"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Código (cProd)</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Aba 3: Impostos */}
            <TabsContent value="impostos">
              <Card>
                <CardHeader>
                  <CardTitle>Valores de Impostos</CardTitle>
                  <CardDescription>Novas alíquotas (em %)</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="impostos.pFCP"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>pFCP</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="impostos.pICMS"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>pICMS</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="impostos.pICMSUFDest"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>pICMSUFDest</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="impostos.pICMSInter"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>pICMSInter</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="impostos.pPIS"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>pPIS</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="impostos.pCOFINS"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>pCOFINS</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="impostos.pIPI"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>pIPI</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Aba 4: Data */}
            <TabsContent value="data">
              <Card>
                <CardHeader>
                  <CardTitle>Data</CardTitle>
                  <CardDescription>
                    Nova data a ser aplicada nos XMLs.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="data.nova_data"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nova Data</FormLabel>
                        <FormControl>
                          <MaskedInput
                            mask="00/00/0000"
                            placeholder="dd/mm/aaaa"
                            onAccept={(value: string) => field.onChange(value)}
                            defaultValue={field.value ?? ""}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Aba 5: Flags (Usando Switch) */}
            <TabsContent value="flags">
              <Card>
                <CardHeader>
                  <CardTitle>Flags de Alteração</CardTitle>
                  <CardDescription>
                    Ative ou desative quais seções dos XMLs devem ser alteradas.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Mapeamento das Flags (isto é o mais complexo) */}
                  {(
                    Object.keys(
                      form.getValues("alterarFlags")
                    ) as (keyof ProfileFormValues["alterarFlags"])[]
                  ).map((key) => (
                    <FormField
                      key={key}
                      control={form.control}
                      name={`alterarFlags.${key}`}
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                          <div className="space-y-0.5">
                            {/* Deixa o nome da flag bonito (ex: 'zerar_ipi_venda' -> 'Zerar ipi venda') */}
                            <FormLabel className="capitalize">
                              {key.replace(/_/g, " ")}
                            </FormLabel>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  ))}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Botão de Salvar principal */}
          <div className="flex justify-end">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting
                ? "A salvar..."
                : "Salvar Alterações"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
