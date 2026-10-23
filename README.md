# Moje Kuchařka

Mobilní aplikace (iOS, Android, web) pro ukládání receptů, nákupní seznamy a výpočet nutričních hodnot.
Expo SDK 58 + Supabase. Plán projektu: [docs/PLAN.md](docs/PLAN.md), datový model: [docs/DATA_MODEL.md](docs/DATA_MODEL.md).

## Spuštění

Požadavky: Node.js LTS, na telefonu aplikace Expo Go.

1. Zkopírujte `.env.example` do `.env.local` a doplňte URL projektu a publishable (anon) klíč
   ze Supabase Dashboard → Project Settings → API Keys. Secret / service_role klíč sem nikdy nepatří.
2. Nainstalujte závislosti a spusťte vývojový server:

   ```bash
   npm install
   npx expo start
   ```

3. QR kód naskenujte v Expo Go (Android) nebo fotoaparátem (iOS). Klávesa `w` otevře webovou verzi.

Pro vývoj doporučujeme v Supabase (Authentication → Sign In / Providers → Email) vypnout „Confirm email“,
vestavěný e-mail Supabase má velmi nízký limit.

## Struktura

| Cesta | Obsah |
|---|---|
| `src/app/` | Obrazovky (Expo Router): přihlášení, záložky Kuchařka / Objevit / Nákup / Profil, detail a nový recept |
| `src/lib/` | Supabase klient, typy, parser surovin, nákupní seznam |
| `src/components/` | Sdílené UI komponenty |
| `supabase/` | Migrace, testy a konfigurace databáze |

## CI

- `Database` – aplikuje migrace na lokální Postgres, spustí lint a pgTAP testy.
- `App` – typecheck (`tsc`) a webový build (`expo export`).

Po sloučení do `main` nasadí Supabase migrace automaticky (GitHub integrace, Deploy to production).
