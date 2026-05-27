# Tastebook MVP — Sosyal Yemek Günlüğü Platformu

Tastebook, yemek deneyimlerini kaydetmek ve paylaşmak için tasarlanmış, **"kimlik ve anı"** odaklı bir sosyal ağ platformudur. Bu platform bir restoran keşif veya harita uygulaması değil; yemek anılarınızı biriktirdiğiniz, kişisel ve sosyal bir görsel/yazılı yemek günlüğüdür.

Bu depo, projenin en güncel 2026 standartlarıyla (Node 22 LTS, Fastify 5, Next.js 15, Drizzle ORM, PostgreSQL, Redis, MinIO) geliştirilmiş, tam çalışan **Full-Stack Monorepo MVP** sürümünü barındırmaktadır.

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

MVP kapsamında planlanan ve uygulanan tüm özellikler **120/120 entegrasyon testiyle doğrulanarak** eksiksiz tamamlanmıştır:

1. **Altyapı & Veritabanı (Phase 0)**:
   - Postgres, Redis ve MinIO için sağlık kontrolleri (healthcheck) entegre edilmiş Docker Compose yapısı kuruldu.
   - 7 adet Drizzle tablosu (Users, TasteEntries, EntryMedia, Follows, Lists, ListItems, RefreshTokens) ve sorgu performansını uçuracak **22 adet özel indeks** oluşturuldu, veritabanına uygulandı.
   - API kontratları ve Zod şemaları `@tastebook/shared` altında paketlenerek Frontend ve Backend arasında sıfır kod tekrarı sağlandı.

2. **Kimlik Doğrulama & Güvenlik (Phase 1)**:
   - `Argon2id` ile güvenli şifreleme altyapısı.
   - Kısa ömürlü JWT Access Token (15 dk) ve `SHA-256` ile şifrelenip DB'de tutulan rotasyonlu Refresh Token (30 gün, HTTP-Only Cookie) mekanizması kuruldu.
   - Güvenlik duvarı (`authGuard`) ve gizlilik ihlallerini önleyici kurallar (Örn: Yetkisiz özel gönderi sorgularında 403 yerine 404 dönerek kaynağın varlığını gizleme) uygulandı.

3. **Yemek Gönderileri & Medya Yönetimi (Phase 2)**:
   - **Giriş Başına Maksimum 5 Görsel**: MinIO (S3 uyumlu) nesne depolama entegrasyonu sağlandı.
   - Dosya yüklemelerinde sadece uzantı kontrolü değil, dosyanın **büyüklüğü (Maks 10MB)** ve **Magic Bytes** (gerçek dosya imzası) doğrulaması yapıldı (Spoofing koruması).
   - Gönderi oluşturma, listeleme, güncelleme ve silme (silme durumunda MinIO'daki dosyaların otomatik temizlenmesi) süreçleri tamamlandı.

4. **Sosyal Grafik (Phase 3)**:
   - Takip etme / takipten çıkma (`ON CONFLICT DO NOTHING` ile idempotent yapı).
   - Karşılıklı takip durumunda otomatik **"Arkadaş (Friend)"** tespiti ve listelemesi.

5. **Akıllı Akış Sistemi (Phase 4)**:
   - **Fan-out-on-read** tabanlı, performanslı akış (Feed) sorgusu.
   - Akışta gönderi gizlilik kurallarının uygulanması (Herkese Açık / Arkadaşlar / Özel).
   - Akışın Redis üzerinden önbelleğe alınması (`feed_version` tabanlı akıllı cache invalidation; yeni gönderi veya takip durumunda cache otomatik geçersiz kılınır).
   - Gelişmiş `(created_at, id)` tabanlı Base64url kodlu cursor pagination (sayfalama).

6. **Liste Sistemi (Phase 5)**:
   - Spotify çalma listesi mantığında kişisel listeler oluşturabilme.
   - Listelere gönderi ekleme, çıkarma ve liste elemanlarını kimlik dizisiyle tek seferde yeniden sıralama (`reorderItems`).

7. **Mobil Öncelikli Modern Arayüz (Phase 6)**:
   - **Next.js 15 (App Router)** ve **Tailwind CSS 4** ile geliştirilmiş tamamen duyarlı (Responsive) arayüz.
   - Mobil cihazlar için sabit alt gezinti çubuğu (Bottom Navigation Bar), masaüstü için yan menü yapısı.
   - TanStack Query v5 ile sonsuz kaydırma (Infinite Scroll), iskelet yükleme ekranları (Skeleton Loading) ve iyimser güncellemeler (Optimistic Updates).
   - Profil düzenleme, avatar yükleme ve listelere gönderi kaydetme arayüzleri.

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
Bu komut sonrası Next.js uygulamasına `http://localhost:3000` adresinden, API'ye ise `http://localhost:3001` adresinden erişebilirsiniz.

---

## 🔮 Gelecekte Neler Yapılabilir? (Post-MVP / Yol Haritası)

MVP kapsamı dışında bırakılan ve gelecekte eklenebilecek geliştirmeler:

- **Badge Sistemi (Rozetler)**: Kullanıcıların yemek alışkanlıklarına göre (Örn: "Gurme Regular", "Hidden Gem Collector") otomatik rozetler kazanması.
- **Food Passport (Yemek Pasaportu)**: Kullanıcının yediği mutfakların, ülkelerin ve fiyat düzeylerinin otomatik analiz edilerek görselleştirildiği kullanıcı analitik profili.
- **Gelişmiş Etkileşimler**: Gönderilere yorum yapma ve beğenme/reaksiyon sisteminin eklenmesi.
- **İşbirlikçi Listeler**: Listelerin birden fazla kullanıcı tarafından ortaklaşa düzenlenebilmesi.
- **Görsel Optimizasyon**: Kullanıcıların yüklediği orijinal fotoğrafların sunucu tarafında sıkıştırılması, WebP formatına çevrilmesi ve küçük resimlerinin (thumbnail) otomatik oluşturulması.
