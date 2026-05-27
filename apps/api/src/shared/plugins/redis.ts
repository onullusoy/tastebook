import fp from "fastify-plugin";
import Redis from "ioredis";

export default fp(async (fastify) => {
  const redis = new Redis(fastify.config.REDIS_URL);
  fastify.decorate("redis", redis);
  fastify.addHook("onClose", async () => {
    await redis.quit();
  });
});
