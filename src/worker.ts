import { handleRequest } from './server/app';
import type { Env } from './server/types';

// Worker com static assets:
// - /api/*  → API (src/server/app.ts)
// - resto   → arquivos de public/ servidos pelo binding ASSETS
//   (os estáticos são resolvidos antes do Worker; esta chamada cobre
//    o fallback e aplica _redirects/_headers).
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return handleRequest(request, env);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
