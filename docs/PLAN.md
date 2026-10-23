# Moje Kuchařka – plán projektu

Soukromý projekt. Provoz výhradně v ČR, mimo prostředí CRA.
Stav k 2026-10-23.

## Cíl

Mobilní aplikace (iOS, Android) a volitelně web, ve které uživatel:

- se zaregistruje a přihlásí,
- ukládá recepty (název, suroviny v odrážkách, postup, obrázky),
- recepty vyhledává,
- vytváří nákupní seznamy ze surovin receptů,
- nahrává recept ručně nebo vyfocením textu (zpracování přes AI API),
- vidí automaticky dopočítané nutriční hodnoty,
- může recept nastavit jako veřejný a přidávat si do své kuchařky veřejné recepty ostatních.

## Architektura

```text
Klient: Expo (React Native) + Expo Router  ->  iOS, Android, web
   |  HTTPS
Supabase (region EU – Frankfurt)
   - Auth (registrace, přihlášení, obnova hesla)
   - PostgreSQL (recepty, suroviny, potraviny, seznamy) + Row Level Security
   - Storage (obrázky receptů)
   - Fulltext vyhledávání v PostgreSQL
   - Edge Functions (serverová logika, tajné klíče)
        fotka -> Gemini (vision, strukturovaný JSON)
              -> párování surovin s tabulkou foods
              -> převod jednotek na gramy
              -> výpočet nutričních hodnot -> uložení do DB
```

### Stack

| Vrstva | Volba |
|---|---|
| Klient | Expo (React Native) + Expo Router |
| Backend | Supabase (Auth, PostgreSQL, Storage, Edge Functions) |
| Rozpoznání receptu z fotky | Google Gemini API, model řady Flash, strukturovaný výstup |
| Nutriční data | Vlastní tabulka `foods` naimportovaná z Nutridatabáze.cz (dle licence), záložně CIQUAL |
| Balené výrobky (volitelně) | Open Food Facts (čárový kód, licence ODbL) |
| Buildy a publikace | EAS Build / Submit (iOS build v cloudu, bez Macu) |
| Web hosting | EAS Hosting nebo Vercel |
| Transakční e-maily | Brevo / Resend / Postmark (před produkcí) |
| Monitoring chyb | Sentry, EU region (před betou) |

### Datový model (návrh)

- `profiles` – rozšíření `auth.users`
- `recipes` – vlastník, název, postup, porce, `visibility` (`private` / `public`)
- `recipe_ingredients` – recept, text suroviny, množství, jednotka, gramy, vazba na `foods`
- `recipe_images`
- `recipe_nutrition` – vypočtené hodnoty na recept a porci
- `foods` – nutriční databáze (hodnoty na 100 g, české názvy)
- `unit_conversions` – lžíce, lžička, hrnek, ks, špetka -> gramy (případně dle potraviny)
- `saved_recipes` – uložené veřejné recepty jiných uživatelů
- `shopping_lists`, `shopping_list_items`

### Párování surovin a nutriční výpočet

1. Gemini z fotky nebo textu vrátí suroviny jako `{ name, quantity, unit }`.
2. Fulltext v PostgreSQL najde kandidáty v `foods`, uloží se nejlepší shoda.
3. Jednotky se převedou na gramy přes `unit_conversions`.
4. Uživatel může přiřazenou potravinu i množství ručně opravit.

## Bezpečnost

- Klíče Gemini, USDA / ostatní a `service_role` Supabase pouze v Supabase Edge Functions secrets.
- Klient obsahuje jen veřejný `anon` klíč, ochranu dat zajišťuje Row Level Security.
- Lokální klíče v `.env.local` (v `.gitignore`), pro buildy EAS secrets.
- Klíče nikdy do gitu ani do chatu.

## Účty a služby

| Položka | Stav / kdy |
|---|---|
| GitHub repozitář | hotovo |
| Supabase (Free, propojeno s GitHubem) | hotovo – ověřit region EU |
| Expo účet (expo.dev) + 2FA | založit nyní |
| Gemini API klíč (Google AI Studio) | založit nyní |
| Licence Nutridatabáze.cz (ÚZEI) | poptat nyní |
| Lokální prostředí: Node.js LTS, Git, VS Code, Supabase CLI, Expo Go | ověřit nyní |
| Doména `.cz` | před betou |
| Transakční SMTP + DNS (SPF, DKIM, DMARC) | před betou |
| Sentry (EU region) | před betou |
| Gemini placená úroveň (billing) | před zveřejněním – podmínky pro uživatele v EHP |
| Apple Developer Program (99 USD/rok) | před publikací |
| Google Play Console (25 USD jednorázově, povinné uzavřené testování) | před publikací |

## Právní minimum

- Zásady ochrany osobních údajů na veřejné URL (vyžadují obchody), včetně zpracování fotek u Googlu.
- Smazání účtu přímo v aplikaci (Apple i Google).
- Podmínky užití a nahlašování obsahu pro veřejné recepty, ošetření autorských práv u receptů z kuchařek.

## Postup vývoje

1. Účty a lokální prostředí (viz tabulka výše).
2. Datový model, migrace a RLS politiky v Supabase.
3. Kostra Expo aplikace: registrace a přihlášení, CRUD receptů, vyhledávání.
4. Import nutriční databáze a tabulky převodů jednotek.
5. Edge Function: fotka -> Gemini -> suroviny -> nutriční výpočet.
6. Nákupní seznamy, veřejné recepty, ukládání cizích receptů.
7. Testování přes Expo Go, Sentry, EAS buildy, beta.
8. Doména, SMTP, právní dokumenty, publikace v obchodech.

## Otevřené otázky

- Licence Nutridatabáze.cz pro použití v soukromé aplikaci.
- Webová verze ve stejném rozsahu jako mobil, nebo jen náhled veřejných receptů?
- Monetizace a limity (počet AI zpracování na uživatele).
