import type { FastifyInstance } from "fastify";
import { authGuard } from "../../shared/middleware/auth-guard";
import { z } from "zod";

export default async function placesRoutes(fastify: FastifyInstance) {
  fastify.get("/places/autocomplete", { onRequest: [authGuard] }, async (request, reply) => {
    const querySchema = z.object({
      input: z.string().min(1),
      session_token: z.string().uuid().optional(),
      types: z.string().optional(),
    });

    const { input, session_token, types } = querySchema.parse(request.query);
    const apiKey = fastify.config.GOOGLE_PLACES_API_KEY;

    if (!apiKey) {
      return reply.status(400).send({ error: "Google Places API Key is not configured." });
    }

    // Rate limiting: max 100 autocomplete requests per user per minute
    const rateLimitKey = `rate_limit:places:autocomplete:${request.userId}`;
    const requestCount = await fastify.redis.incr(rateLimitKey);
    if (requestCount === 1) {
      await fastify.redis.expire(rateLimitKey, 60);
    }
    if (requestCount > 100) {
      return reply.status(429).send({ error: "Too many autocomplete requests. Please try again later." });
    }

    // Call Google Places API
    const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
    url.searchParams.set("input", input);
    url.searchParams.set("types", types || "establishment");
    url.searchParams.set("key", apiKey);
    if (session_token) {
      url.searchParams.set("sessiontoken", session_token);
    }

    try {
      const res = await fetch(url.toString());
      if (!res.ok) {
        throw new Error(`Google Places API returned status ${res.status}`);
      }
      const data = await res.json();
      return reply.status(200).send(data);
    } catch (err: any) {
      fastify.log.error(err, "Google Places API Error");
      return reply.status(500).send({ error: "Failed to fetch autocomplete suggestions" });
    }
  });

  fastify.get("/places/photo", async (request, reply) => {
    const querySchema = z.object({
      photo_reference: z.string().min(1),
      maxwidth: z.string().optional(),
      token: z.string().optional(),
    });

    const { photo_reference, maxwidth, token } = querySchema.parse(request.query);
    const apiKey = fastify.config.GOOGLE_PLACES_API_KEY;

    if (!apiKey) {
      return reply.status(400).send({ error: "Google Places API Key is not configured." });
    }

    // Verify token from query parameter or authorization header
    try {
      const authHeader = request.headers.authorization;
      let jwtToken: string | undefined;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        jwtToken = authHeader.substring(7);
      } else if (token) {
        jwtToken = token;
      }

      if (!jwtToken) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const decoded = await fastify.jwt.verify<{ sub: string }>(jwtToken);
      if (!decoded || !decoded.sub) {
        return reply.status(401).send({ error: "Unauthorized" });
      }
      request.userId = decoded.sub;
    } catch (err) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const url = new URL("https://maps.googleapis.com/maps/api/place/photo");
    url.searchParams.set("photo_reference", photo_reference);
    url.searchParams.set("maxwidth", maxwidth || "400");
    url.searchParams.set("key", apiKey);

    try {
      const res = await fetch(url.toString());
      if (!res.ok) {
        throw new Error(`Google Place Photo API returned status ${res.status}`);
      }

      const contentType = res.headers.get("content-type") || "image/jpeg";
      const buffer = await res.arrayBuffer();

      reply.header("Content-Type", contentType);
      reply.header("Cache-Control", "public, max-age=86400"); // Cache for 1 day
      return reply.send(Buffer.from(buffer));
    } catch (err: any) {
      fastify.log.error(err, "Google Place Photo Error");
      return reply.status(500).send({ error: "Failed to fetch place photo" });
    }
  });

  fastify.get("/places/city-photo", async (request, reply) => {
    const querySchema = z.object({
      city: z.string().min(1),
      token: z.string().optional(),
    });

    const { city, token } = querySchema.parse(request.query);
    const apiKey = fastify.config.GOOGLE_PLACES_API_KEY;

    if (!apiKey) {
      return reply.status(400).send({ error: "Google Places API Key is not configured." });
    }

    // Verify token from query parameter or authorization header
    try {
      const authHeader = request.headers.authorization;
      let jwtToken: string | undefined;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        jwtToken = authHeader.substring(7);
      } else if (token) {
        jwtToken = token;
      }

      if (!jwtToken) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const decoded = await fastify.jwt.verify<{ sub: string }>(jwtToken);
      if (!decoded || !decoded.sub) {
        return reply.status(401).send({ error: "Unauthorized" });
      }
      request.userId = decoded.sub;
    } catch (err) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const normalizedCity = city.trim().toLowerCase();
    const cacheKey = `city_photo_ref:${normalizedCity}`;

    let photoRef = await fastify.redis.get(cacheKey);

    if (!photoRef) {
      // Query Google Places Text Search for the city
      const searchUrl = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
      searchUrl.searchParams.set("query", `${city} city`);
      searchUrl.searchParams.set("key", apiKey);

      try {
        const res = await fetch(searchUrl.toString());
        if (res.ok) {
          const data = await res.json();
          const firstResult = data.results?.[0];
          if (firstResult && firstResult.photos && firstResult.photos.length > 0) {
            const ref = firstResult.photos[0].photo_reference;
            photoRef = ref;
            // Cache for 30 days
            await fastify.redis.set(cacheKey, ref, "EX", 30 * 24 * 60 * 60);
          }
        }
      } catch (err) {
        fastify.log.error(err, "Google Places City Search Error");
      }
    }

    if (!photoRef) {
      // Fallback redirect to placeholder image if no photo found
      return reply.redirect("/placeholder-food.png");
    }

    // Forward/fetch from Google Place Photo API
    const photoUrl = new URL("https://maps.googleapis.com/maps/api/place/photo");
    photoUrl.searchParams.set("photo_reference", photoRef);
    photoUrl.searchParams.set("maxwidth", "800");
    photoUrl.searchParams.set("key", apiKey);

    try {
      const res = await fetch(photoUrl.toString());
      if (!res.ok) {
        throw new Error(`Google Place Photo API returned status ${res.status}`);
      }

      const contentType = res.headers.get("content-type") || "image/jpeg";
      const buffer = await res.arrayBuffer();

      reply.header("Content-Type", contentType);
      reply.header("Cache-Control", "public, max-age=86400"); // Cache for 1 day
      return reply.send(Buffer.from(buffer));
    } catch (err: any) {
      fastify.log.error(err, "Google Place Photo Error for City");
      return reply.redirect("/placeholder-food.png");
    }
  });
}
