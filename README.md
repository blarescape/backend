# blarescape / backend

API w [Fastify](https://fastify.dev) 5 + TypeScript, deploy na Vercel (zero-config).

## Start

```bash
npm install
cp .env.example .env
npm run dev        # http://localhost:3000
```

| Skrypt              | Co robi                                   |
| ------------------- | ----------------------------------------- |
| `npm run dev`       | serwer z hot-reloadem (tsx watch)         |
| `npm start`         | serwer bez watcha                         |
| `npm run typecheck` | sprawdzenie typów (`tsc --noEmit`)        |
| `npm test`          | testy (Vitest + `app.inject`)             |

## Struktura

```
src/
  index.ts        entrypoint — Vercel go wykrywa, lokalnie odpala listen()
  build-app.ts    fabryka aplikacji (pluginy, trasy) — używana też w testach
  routes/         trasy jako pluginy Fastify
test/             testy Vitest
```

Nowe trasy dodawaj jako plugin w `src/routes/` i rejestruj w `build-app.ts`.

> **Nie twórz** plików `src/app.*` ani `src/server.*` (ani `app.*`/`server.*`/`index.*` w root) —
> Vercel traktuje je jako entrypoint i może wziąć zły plik.

## Deploy na Vercel

Vercel sam wykrywa Fastify po `src/index.ts` — nie trzeba `vercel.json`. Cała aplikacja
idzie jako jedna Vercel Function (Fluid compute).

1. Vercel → **Add New → Project** → import `blarescape/backend`.
2. Framework preset: **Fastify** (wykrywa się sam).
3. Environment Variables: ustaw `CORS_ORIGIN` (adres(y) frontendu, po przecinku).
4. Deploy. Każdy PR dostaje preview deployment, `main` idzie na produkcję.

Lokalnie przez Vercel CLI (≥ 48.6.0): `vercel dev`, deploy: `vercel deploy`.

## Zmienne środowiskowe

| Nazwa         | Opis                                                        |
| ------------- | ----------------------------------------------------------- |
| `PORT`        | port lokalnie (domyślnie 3000), na Vercelu ignorowany       |
| `CORS_ORIGIN` | dozwolone originy, po przecinku; puste = CORS wyłączony     |
