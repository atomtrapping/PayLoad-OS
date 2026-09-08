import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppShell } from '@/components/shell/AppShell';
import { NotationDraftProvider } from '@/components/notations/NotationWorkspace';

export const viewport: Viewport = {
  themeColor: '#06060c',
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'dark',
};

export const metadata: Metadata = {
  title: {
    default: 'NotationsOS',
    template: '%s · NotationsOS',
  },
  description:
    'NotationsOS — Notation Systems\u2019 internal terminal: it operates, monitors and navigates the backend behind the Caravan, Tradewind and Landshark APIs. Corpus data here is a committed demonstration; the terminal executes no customer inference and constructs no production canonical state.',
  robots: { index: false, follow: false },
  authors: [{ name: 'Notation Systems' }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NotationDraftProvider><AppShell>{children}</AppShell></NotationDraftProvider>
      </body>
    </html>
  );
}
