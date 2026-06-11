# Hedefli Test Çalıştırma Kuralı (Targeted Testing Rule)

Zaman ve token tasarrufu sağlamak amacıyla projedeki testlerin çalıştırılmasında aşağıdaki kurallara kesinlikle uyulmalıdır:

1. **Her Seferinde Tüm Programı Test Etmeme Kuralı:**
   * Zaman ve token harcamasını en aza indirmek için, yapılan her değişiklikten sonra tüm programı/tüm test paketlerini (`npx pnpm test` veya `turbo test`) **çalıştırma**.
   * Yalnızca devasa, projenin geneline yayılan köklü mimari değişiklikler yapıldığında tüm testler çalıştırılabilir.

2. **Değişiklik Etki Analizi ve Hedefli Testler:**
   * Devasa olmayan değişikliklerde, önce yapılan değişikliğin hangi modülleri, servisleri veya durumları etkileyebileceğini analiz et.
   * Yalnızca bu analiz sonucunda etkilenen özel durumları ve ilgili test dosyalarını hedeflenmiş şekilde test et (Örn: `npx pnpm --filter @tastebook/api test src/modules/cities/cities.test.ts`).

3. **Verifikasyon Süreci:**
   * Bir değişiklik yaptığında, sadece o değişikliğin etkilediği dosyaları belirle ve yalnızca o dosyaların birim (unit) veya entegrasyon (integration) testlerini çalıştırarak doğrula.

