import './admin/globals.css';

export const runtime = 'nodejs';

export const metadata = {
  title: 'Neon Warm',
  description: 'Backend de validação de licença para a extensão Chrome Neon Warm.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
