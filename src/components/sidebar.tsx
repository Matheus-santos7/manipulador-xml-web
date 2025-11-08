'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation'; // Hook para saber a página atual
import { SlidersHorizontal, FileCog } from 'lucide-react'; // Ícones

import { cn } from '@/lib/utils'; // Utilitário para classes condicionais
import { Button } from '@/components/ui/button';

// Definição dos nossos links de navegação
const navLinks = [
  {
    href: '/processar',
    label: 'Processar XMLs',
    icon: FileCog,
  },
  {
    href: '/configuracoes',
    label: 'Configurações',
    icon: SlidersHorizontal,
  },
];

export function Sidebar() {
  // Apahha o caminho atual da URL (ex: "/processar")
  const pathname = usePathname();

  return (
    <aside className="w-64 min-h-screen bg-background border-r p-4">
      <h2 className="text-lg font-semibold tracking-tight mb-4 px-2">
        Manipulador XML
      </h2>

      <nav className="flex flex-col space-y-1">
        {navLinks.map((link) => {
          // Verifica se o link é o ativo
          const isActive = pathname.startsWith(link.href);

          return (
            <Button
              key={link.href}
              asChild // Permite que o Botão se comporte como um Link
              variant="ghost" // Estilo "fantasma" (sem fundo)
              className={cn(
                'w-full justify-start', // Alinha texto à esquerda
                isActive && 'bg-accent text-accent-foreground' // Estilo de "ativo"
              )}
            >
              <Link href={link.href}>
                <link.icon className="mr-2 h-4 w-4" />
                {link.label}
              </Link>
            </Button>
          );
        })}
      </nav>
    </aside>
  );
}