# MedWeb Billing Dashboard

Controle de custos e prestação de contas das ferramentas de desenvolvimento do projeto MedWeb.

## Stack

- **Frontend**: HTML/CSS/JS vanilla (single page)
- **Backend**: Vercel Serverless Functions (Node.js)
- **Auth**: GitHub OAuth → JWT cookie
- **Data**: Anthropic Admin API + custos fixos configurados

## Funcionalidades

- 🔐 Autenticação via GitHub (whitelist de usuários)
- 📊 Dashboard com custos em USD, BRL e IOF
- ⚡ Consumo de tokens via Anthropic Admin API (tempo real)
- 💰 Custos fixos: Claude Max, Lovable, Vercel, Apple Developer
- 📈 Percentual do orçamento total (R$ 536.500)
- 🔄 Fallback offline caso a API esteja indisponível

## Setup

### 1. GitHub OAuth App

Criar em: https://github.com/settings/applications/new

| Campo | Valor |
|---|---|
| Application name | MedWeb Billing |
| Homepage URL | `https://medweb-billing.vercel.app` |
| Authorization callback URL | `https://medweb-billing.vercel.app/api/auth/callback` |

### 2. Environment Variables (Vercel)

```bash
vercel env add GITHUB_CLIENT_ID
vercel env add GITHUB_CLIENT_SECRET
vercel env add JWT_SECRET           # openssl rand -hex 32
vercel env add ANTHROPIC_ADMIN_API_KEY
vercel env add ANTHROPIC_ORG_ID     # fd85d484-d7ae-4db3-a3af-a159f8323709
vercel env add ALLOWED_GITHUB_USERS # arthuroZassa,andrecripa
```

### 3. Deploy

```bash
npm install
vercel --prod
```

### Dev local

```bash
cp .env.example .env.local
# Preencher valores
vercel dev
```

## Estrutura

```
medweb-billing/
├── api/
│   ├── _auth.js          # JWT helper (shared)
│   ├── costs.js          # Billing data endpoint
│   └── auth/
│       ├── login.js      # GitHub OAuth redirect
│       ├── callback.js   # OAuth callback + JWT
│       ├── me.js         # Auth check
│       └── logout.js     # Clear session
├── public/
│   └── index.html        # Dashboard SPA
├── vercel.json
├── package.json
└── .env.example
```

## Manutenção

Para atualizar custos fixos, editar o array `FIXED_COSTS` em `api/costs.js`.
