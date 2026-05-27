import fp from "fastify-plugin";
import { createDb } from "@tastebook/db";

export default fp(async (fastify) => {
  const db = createDb(fastify.config.DATABASE_URL);
  fastify.decorate("db", db);
  fastify.addHook("onClose", async () => {
    const pg = (db as any).session?.client;
    if (pg?.end) {
      await pg.end();
    }
  });
});
