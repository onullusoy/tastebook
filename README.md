# Tastebook — Akranlar Arası Yemek Tavsiyesi ve Keşif Platformu (MVP)

Tastebook, akranlar arasında güvenilir yemek deneyimi paylaşımları ve keşifleri yapılabilmesi için tasarlanmış bir sosyal ağ platformudur. Klasik harita veya restoran dizinleri yerine, **"Çevremdeki insanların gerçek deneyimlerine dayanarak nerede ve ne yemeliyim?"** sorusuna odaklanır.

Bu depo, projenin en güncel 2026 standartlarıyla (Node 22 LTS, Fastify 5, Next.js 15, Drizzle ORM, PostgreSQL, Redis, MinIO) geliştirilmiş, tam çalışan **Full-Stack Monorepo Pivot MVP** sürümünü barındırmaktadır.

---

## 📂 Proje Yapısı (Monorepo)

Proje, `pnpm` workspaces ve `Turborepo` ile yönetilen modüler bir monorepo mimarisine sahiptir:

```
tastebook/
├── apps/
│   ├── api/                          # Fastify REST API (Backend)
│   │   ├── src/
│   │   │   ├── modules/              # İşlevsel API Modülleri (Auth, Users, Entries, Media, Social, Feed, Lists)
│   │   │   ├── shared/               # Ortak eklentiler (db, redis, s3) ve middleware'ler (authGuard, errorHandler)
│   │   │   └── server.ts             # API Sunucu Giriş Noktası
│   │   └── test/                     # Integration & E2E Testleri (Vitest)
│   └── web/                          # Next.js 15 Web Uygulaması (Frontend)
│       ├── src/
│       │   ├── app/                  # App Router Sayfaları ve Layouts
│       │   ├── components/           # UI ve Modül Bileşenleri (Tailwind CSS 4)
│       │   ├── hooks/                # API veri çekme & mutasyon hook'ları (TanStack Query)
│       │   ├── lib/                  # API Client ve veri formatlama araçları
│       │   └── stores/               # İstemci durum yönetimi (Zustand)
├── packages/
│   ├── db/                           # Drizzle ORM Veritabanı Katmanı
│   │   ├── src/schema/               # PostgreSQL Tablo ve İndeks Tanımları
│   │   └── migrations/               # drizzle-kit ile üretilen SQL göç dosyaları
│   └── shared/                       # Paylaşılan Ortak Paket
│       ├── src/api-types/            # API Request/Response arayüzleri ve kontratları
│       └── src/schemas/              # Zod doğrulama şemaları (API & Form ortak kullanımı)
├── docker-compose.yml                # Geliştirme ortamı altyapısı (Postgres, Redis, MinIO)
├── docker-compose.prod.yml           # Üretim (Production) ortamı altyapısı (Tüm servisler dahil)
└── pnpm-workspace.yaml               # Workspace tanımları
```

---

## 🛠️ Neler Yapıldı? (Tamamlanan Özellikler)

Pivot kapsamında planlanan ve uygulanan tüm özellikler **126/126 entegrasyon testiyle doğrulanarak** eksiksiz tamamlanmıştır:

1. **Altyapı & Veritabanı (Phase 0)**:
   - Postgres, Redis ve MinIO için sağlık kontrolleri (healthcheck) entegre edilmiş Docker Compose yapısı kuruldu.
   - 9 adet Drizzle tablosu (`Users`, `TasteEntries`, `FoodItems`, `EntryMedia`, `Follows`, `Lists`, `ListItems`, `ListCollaborators`, `RefreshTokens`) ve sorgu performansını optimize eden özel indeksler oluşturuldu, veritabanına uygulandı.
   - API kontratları ve Zod şemaları `@tastebook/shared` altında paketlenerek Frontend ve Backend arasında sıfır kod tekrarı sağlandı.

2. **Kimlik Doğrulama & Güvenlik (Phase 1)**:
   - `Argon2id` ile güvenli şifreleme altyapısı.
   - Kısa ömürlü JWT Access Token (15 dk) ve `SHA-256` ile şifrelenip DB'de tutulan rotasyonlu Refresh Token (30 gün, HTTP-Only Cookie) mekanizması kuruldu.
   - Güvenlik duvarı (`authGuard`) ve gizlilik ihlallerini önleyici kurallar (Örn: Yetkisiz özel gönderi sorgularında 403 yerine 404 dönerek kaynağın varlığını gizleme) uygulandı.

3. **Yemek Değerlendirmeleri (Taste Entries) & Medya (Phase 2)**:
   - Yemek gönderileri sadece tek bir tabak yerine **bütünsel bir mekan deneyimini** yansıtır. Her değerlendirmede restoran adı, şehir, ülke, fiyat seviyesi (1-5), genel puan (0-10) ve isteğe bağlı alt puanlar (Ambiyans, Lezzet, Servis, Fiyat/Performans) tutulur.
   - Her değerlendirme altında birden fazla tüketilen yemek kalemi (`food_items`) sipariş sırasıyla listelenebilir.
   - Değerlendirme başına Maksimum 5 Görsel yükleme desteği ve MinIO (S3 uyumlu) nesne depolama entegrasyonu sağlandı.
   - Dosya yüklemelerinde gerçek dosya imzası (Magic Bytes) doğrulaması yapıldı (Spoofing koruması).
   - **Görsel Optimizasyon**: Yüklenen orijinal medya fotoğraflarının (1200px) ve kullanıcı avatar resimlerinin (150x150 cover) sunucu tarafında `sharp` ile sıkıştırılması, modern WebP formatına çevrilmesi ve feed/liste ekranları için otomatik küçük resimlerin (400px thumbnail) oluşturulması sağlandı.

4. **Sosyal Grafik (Phase 3)**:
   - Takip etme / takipten çıkma (`ON CONFLICT DO NOTHING` ile idempotent yapı).
   - Karşılıklı takip durumunda otomatik **"Arkadaş (Friend)"** tespiti ve listelemesi.

5. **Akıllı Akış Sistemi (Phase 4)**:
   - **Fan-out-on-read** tabanlı, performanslı akış (Feed) sorgusu.
   - Akışta gönderi gizlilik kurallarının uygulanması (Herkese Açık / Arkadaşlar / Özel).
   - Akışın Redis üzerinden önbelleğe alınması (`feed_version` tabanlı akıllı cache invalidation; yeni gönderi veya takip durumunda cache otomatik geçersiz kılınır).
   - Gelişmiş `(created_at, id)` tabanlı Base64url kodlu cursor pagination (sayfalama).

6. **Ortaklaşa Liste Sistemi (Phase 5)**:
   - Spotify çalma listesi mantığında kişisel ve ortak listeler oluşturabilme.
   - Liste sahiplerinin listelere katkıda bulunabilecek editörler/işbirlikçiler (`list_collaborators`) ekleyebilmesi.
   - Listelere gönderi ekleme, çıkarma ve liste elemanlarını tek seferde yeniden sıralama (`reorderItems`).

7. **Mobil Öncelikli Modern Arayüz (Phase 6)**:
   - **Next.js 15 (App Router)** ve **Tailwind CSS 4** ile geliştirilmiş tamamen duyarlı (Responsive) arayüz.
   - Değerlendirme oluştururken dinamik olarak alt kırılımlı puanlama (Ambiyans, Lezzet vb.), çoklu görsel yükleme, yemek listesi ekleme ve atmosfer etiketleri seçimi arayüzü.
   - TanStack Query v5 ile sonsuz kaydırma (Infinite Scroll), iskelet yükleme ekranları (Skeleton Loading) ve iyimser güncellemeler (Optimistic Updates).

---

## 🚀 Nasıl Çalıştırılır?

### Gereksinimler
- Node.js v22 veya üzeri
- Docker ve Docker Compose
- `pnpm` paket yöneticisi (Global kurulu değilse `npx pnpm` kullanabilirsiniz)

### 1. Geliştirme (Local Development) Ortamı

İlk olarak veritabanı, önbellek ve depolama servislerini Docker üzerinde başlatın:
```bash
docker compose up -d
```

Bağımlılıkları yükleyin ve projeyi başlatın:
```bash
# Bağımlılıkları yükleyin
npx pnpm install

# Veritabanı göçlerini (migration) uygulayın
npx pnpm db:generate
npx pnpm db:migrate

# Geliştirme sunucularını başlatın (API port 3001, Web port 3000)
npx pnpm dev
```

### 2. Testleri Çalıştırma

Tüm entegrasyon testlerini (Auth, Users, Media, Entries, Social, Feed, Lists) koşturmak için:
```bash
npx pnpm test
```

### 3. Canlı / Üretim (Production) Ortamı

Tüm uygulamayı (API, Web Frontend, Postgres, Redis, MinIO) tek bir komutla üretim modunda dockerize edilmiş olarak ayağa kaldırabilirsiniz:
```bash
docker compose -f docker-compose.prod.yml up --build -d
```

### 4. Hibrit Bulut ve Canlı Test Mimarisi (Hybrid Setup)

Proje, üretim seviyesindeki testler ve kesintisiz (7/24) kullanılabilirlik için bir Hibrit Bulut mimarisi üzerinde yapılandırılmıştır:

* **Frontend Katmanı (Vercel):**
  - Next.js arayüzü Vercel üzerinde üretim modunda canlıda çalışmaktadır.
  - Vercel'deki frontend, backend ile `NEXT_PUBLIC_API_URL=https://crudeness-linguist-trickery.ngrok-free.dev` adresi üzerinden haberleşir.
  - **Önemli Ngrok Bypass Konfigürasyonu:** Ngrok'un ücretsiz planlarındaki interstitial (tarayıcı uyarısı) ekranının API isteklerini engellemesini önlemek için, frontend client tarafında (`api-client.ts`) tüm dış isteklerin başlığına `ngrok-skip-browser-warning: true` eklenmiştir.

* **Backend & Altyapı Katmanı (Ev Sunucusu):**
  - Fastify API sunucumuz ve diğer servisler (`postgres`, `redis`, `minio`), NVMe depolama (`/mnt/nvme_storage/projects/tastebook`) ile yerel bir Ubuntu Server (Lenovo Laptop) üzerinde Docker/Portainer altında 7/24 çalışmaktadır.
  - **Veritabanı Yedekleme (Auto-Backup):** Portainer stack yapısına `prodrigestivill/postgres-backup-local:16-alpine` imajını kullanan `tastebook-postgres-backup` servisi entegre edilmiştir. `postgres` konteynerine bağımlı çalışan bu servis, her gün otomatik (`@daily`) yedek (dump) alır. Yedekler, son 7 günlük rolling retention (dönüşümlü saklama) kuralı ile sunucunun NVMe diskinde `/mnt/nvme_storage/docker_volumes/postgres_backups` konumunda saklanır.
  - Sunucu lid switch uyarısını görmezden gelecek şekilde (`HandleLidSwitch=ignore` in `logind.conf`) ve düşük güç tüketim modlarında (`powertop --auto-tune` / `powersave` governor) yapılandırılmıştır.
  - **CORS Gereksinimi:** Fastify API'deki CORS ayarlarında (`app.ts`), Vercel origin'lerinden gelen ve ngrok bypass uyarısını içeren preflight isteklerine izin vermek amacıyla `allowedHeaders` listesine `"ngrok-skip-browser-warning"` eklenmiştir.

* **Networking & tmux Tünelcisi:**
  - Yerel sunucudaki 3001 API portu, `tastebook-tuneller` isimli kalıcı bir `tmux` oturumunda çalışan `ngrok` tüneli ile dış dünyaya güvenli şekilde açılmıştır.
  - Aynı oturum içinde `glances` ile sistem takibi ve `multitail -D -c -i <(docker logs -f tastebook-api)` ile gerçek zamanlı API log akışı izlenebilmektedir.

### 5. AdminJS Yönetici Paneli (Admin Dashboard)

Sistemdeki verileri (Kullanıcılar, Restoranlar, Değerlendirmeler, Listeler vb.) doğrudan yönetebilmek ve CRUD işlemlerini gerçekleştirebilmek amacıyla **AdminJS** aracı entegre edilmiştir.

- **Erişim Yolu:** Sunucunun `/admin` yolu üzerinden erişilebilir (Örn: `http://localhost:3001/admin` veya canlı backend adresi üzerinden `/admin`).
- **Kimlik Doğrulama:** Erişim, form tabanlı giriş ekranı ile korunmakta olup yetkisiz girişler engellenir. Oturum yönetimi güvenli çerezler (`adminjs_session`) yardımıyla sağlanır.
- **Gerekli Çevre Değişkenleri:**
  - `ADMIN_EMAIL`: Yönetici giriş e-postası (Örn: `admin@tastebook.app`)
  - `ADMIN_PASSWORD`: Yönetici giriş şifresi (En az 8 karakter)
  - `ADMIN_COOKIE_PASSWORD` (Opsiyonel): Çerez şifrelemesi için en az 32 karakterlik anahtar (Tanımlanmazsa `JWT_SECRET` kullanılır).
- **Hassas Veri Maskeleme:** Kullanıcı şifre özetleri (`passwordHash`) gibi kritik veriler arayüzden tamamen gizlenmiştir (`isVisible: false`).


---

## 🔮 Gelecekte Neler Yapılabilir? (Post-MVP / Yol Haritası)

MVP kapsamı dışında bırakılan ve gelecekte eklenebilecek geliştirmeler:

- **Badge Sistemi (Rozetler)**: Kullanıcıların yemek alışkanlıklarına göre (Örn: "Gurme Regular", "Hidden Gem Collector") otomatik rozetler kazanması.
- **Food Passport (Yemek Pasaportu)**: Kullanıcının yediği mutfakların, ülkelerin ve fiyat düzeylerinin otomatik analiz edilerek görselleştirildiği kullanıcı analitik profili.
