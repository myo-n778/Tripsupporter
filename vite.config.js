import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const gasUrl = env.VITE_GAS_URL;
  const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1];
  const base = process.env.VITE_BASE_PATH || (repositoryName ? `/${repositoryName}/` : '/');

  return {
    base,
    plugins: [
      react(),
      {
        name: 'gas-dev-proxy',
        configureServer(server) {
          if (!gasUrl) return;

          server.middlewares.use('/gas', async (req, res) => {
            try {
              const chunks = [];

              for await (const chunk of req) {
                chunks.push(chunk);
              }

              const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
              const targetUrl = new URL(gasUrl);
              const incomingUrl = new URL(req.url || '/', 'http://localhost');
              incomingUrl.searchParams.forEach((value, key) => {
                targetUrl.searchParams.set(key, value);
              });

              const response = await fetch(targetUrl.toString(), {
                method: req.method,
                headers: {
                  'content-type': req.headers['content-type'] || 'text/plain',
                },
                body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
                redirect: 'follow',
              });

              const text = await response.text();
              res.statusCode = response.status;
              res.setHeader('content-type', response.headers.get('content-type') || 'application/json; charset=utf-8');
              res.end(text);
            } catch (error) {
              res.statusCode = 502;
              res.setHeader('content-type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ status: 'error', message: String(error) }));
            }
          });
        },
      },
    ],
  };
});
