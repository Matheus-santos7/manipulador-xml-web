import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster as SonnerToaster } from '@/components/ui/sonner';
import { Sidebar } from '@/components/sidebar'; // <--- 1. Importar a Sidebar

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Manipulador XML',
  description: 'Aplicação web para manipular XMLs',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>
        {/* 2. Criar o layout flexível */}
        <div className="flex min-h-screen">
          <Sidebar /> {/* <-- A nossa nova sidebar fixa */}

          {/* 3. O 'children' é a sua página atual (com padding) */}
          <main className="flex-1 p-8 overflow-auto">
            {children}
          </main>
        </div>

        <SonnerToaster />
      </body>
    </html>
  );
}