# Tastebook

Tastebook is a full-stack social web application for restaurant reviews. 

Mainstream location and discovery platforms (like Google Maps or Yelp) are increasingly plagued by review manipulation, corporate bias, and automated bot accounts that inflate or destroy a venue's reputation for profit. Tastebook rejects this noise. 

Rather than serving as a generic, easily gamed directory, Tastebook focuses strictly on a trusted, closed-loop network. It answers the fundamental question: "Where and what should I eat based exclusively on my friends' real, unmanipulated experiences?" By filtering out public algorithmic feeds, every rating, photo, and review you see comes solely from your personal circle—ensuring absolute authenticity and zero bot interference.

**Live Demo:** [https://tastebook-web.vercel.app](https://tastebook-web.vercel.app)

---

## 🏗️ Architecture & Infrastructure

Tastebook operates on a hybrid cloud infrastructure optimized for performance, security, and low operational overhead:

- **Frontend (Edge Hosting):** The Next.js application is deployed to **Vercel**, delivering fast page loads, responsive styling, and global routing.
- **Backend & Storage (Self-Hosted):** The Fastify API server, PostgreSQL database, Redis instance, and MinIO object storage run within **Docker** container stacks managed by **Portainer** on a self-hosted Ubuntu Server.
- **Secure Networking:** A persistent, secure **ngrok tunnel** connects the edge frontend to the self-hosted Fastify API. CORS configurations and custom headers are implemented to handle preflight requests and bypass interstitial warning pages seamlessly.
- **Resilience:** The self-hosted server is optimized for continuous availability, including system configurations to handle power management efficiently (lid-state override, power governor rules).

---

## 📂 Project Structure

```
tastebook/
├── apps/
│   ├── api/                          # Fastify REST API (Backend)
│   └── web/                          # Next.js Web Application (Frontend)
├── packages/
│   ├── db/                           # Drizzle ORM Database Schema & Migrations
│   └── shared/                       # Shared validation schemas & API TypeScript definitions
├── docker-compose.yml                # Development services (PostgreSQL, Redis, MinIO)
└── package.json                      # Monorepo workspaces configuration
```

---

## 💻 Fully local development

The application can run entirely on the current computer, without the Ubuntu Server, Vercel, or
an ngrok tunnel. Docker is used only for the local PostgreSQL, Redis, and MinIO containers; the API
and web application run as local Node.js processes.

```bash
pnpm install
pnpm dev --only-local
```

`pnpm dev:local` is an equivalent shortcut. The launcher starts the three Docker services, waits
until they are ready, runs the database migrations, and then starts the API and web applications.
Open <http://localhost:3000>; the local API is available at <http://127.0.0.1:3001/api> and the
MinIO console at <http://127.0.0.1:19001>.

Local data is kept in Docker volumes between runs. To stop and remove the local containers without
deleting their volumes, run:

```bash
pnpm local:down
```

The launcher supplies development-only defaults for required secrets when they are absent. Values
already defined in the root `.env` (such as `GOOGLE_PLACES_API_KEY` or admin credentials) remain
available, but all database, Redis, MinIO, API, and web addresses are forcibly replaced with local
addresses for this mode. The ordinary `pnpm dev` command keeps its previous behavior and uses the
configured environment as-is.

## 🛠️ Key Technical Highlights

### 1. Monorepo Architecture & Build Optimization
Using **Turborepo** and **pnpm Workspaces**, the project compiles and builds efficiently. Shared code is modularized into dedicated workspace packages (`@tastebook/db` and `@tastebook/shared`), enabling clean separation of concerns and caching for faster pipelines.

### 2. End-to-End Type Safety
API request payloads, query parameters, and form schemas are validated using **Zod**. These schemas are housed within `@tastebook/shared` and imported by both the backend (Fastify schema validation) and frontend (React Hook Form), eliminating validation drift and code duplication.

### 3. Automated Database Backups
A dedicated, containerized backup service (`postgres-backup-local`) executes daily database dumps of the PostgreSQL instance. Backups are stored directly to NVMe storage with a rolling 7-day retention policy, ensuring quick recovery points without manual intervention.

### 4. S3-Compatible Media Optimization
Images uploaded to the platform are stored in a self-hosted **MinIO** object storage bucket. The upload pipeline includes:
- **Magic Byte Verification:** Inspecting image buffers for signatures to prevent file extension spoofing.
- **On-the-Fly Optimization:** Using `sharp` to compress and convert images into high-performance WebP formats, generating both standard previews and thumbnails dynamically.

### 5. Social Graph & Activity Feeds
- **Fan-Out-on-Read Feed:** A high-performance activity feed query matches social connections and filters visible posts (Public, Friends-only, or Private).
- **Feeds Cache:** Powered by **Redis** with a `feed_version` invalidation mechanism that automatically refreshes cache layers upon new entry submissions or relationship updates.

### 6. Robust Security & Privacy Design
- **Auth Flow:** Uses `Argon2id` for password hashing, and implements JWT Access Tokens alongside rotated Refresh Tokens stored in secure, HTTP-only cookies.
- **Privacy Masking:** Implements strict validation on user entries; unauthorized attempts to access private resources return a `404 Not Found` rather than a `403 Forbidden` to mask the existence of private data.
