import { buildApp } from './app.js';
import { env, isProduction } from './config/env.js';

const app = await buildApp();

// Em produção o processo roda em container e precisa aceitar conexão externa.
// Em desenvolvimento fica só em loopback, para não expor a API na rede local.
const host = isProduction ? '0.0.0.0' : '127.0.0.1';

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'Encerrando a API');
    void app.close().then(() => process.exit(0));
  });
}

try {
  await app.listen({ port: env.PORT, host });
} catch (error) {
  app.log.fatal({ err: error }, 'Falha ao subir a API');
  process.exit(1);
}
