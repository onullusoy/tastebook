import { buildApp } from "./app";

const start = async () => {
  const app = await buildApp();
  const port = app.config.API_PORT;
  const host = app.config.API_HOST;

  try {
    await app.listen({ port, host });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
// Trigger watcher restart again
