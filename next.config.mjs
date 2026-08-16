/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // As rotas da API já tratam CORS por origem explícita (ver src/lib/cors.js).
  // Nada de Access-Control-Allow-Origin: * aqui.
};

export default nextConfig;
