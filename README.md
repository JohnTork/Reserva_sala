# reserve.me

Frontend estático em `frontend/` e API Node.js em `backend/`, comunicando-se por HTTP. O MySQL local é executado em Docker.

## Requisitos

- Node.js 20.19+ e npm
- Docker com Docker Compose

## Configuração local

No PowerShell, na raiz do projeto:

```powershell
Copy-Item backend\.env.example backend\.env
npm --prefix backend install
npm --prefix frontend install
docker compose --env-file backend\.env up -d
```

Inicie a API e o frontend em terminais separados:

```powershell
npm --prefix backend run dev
```

```powershell
npm --prefix frontend run dev
```

Abra `http://localhost:5173`. O frontend encaminha as chamadas `/api` para a API em `http://localhost:3000`. As rotas `GET /api/health` e `GET /api/health/db` verificam a API e a conexão MySQL.

Para executar os testes do backend:

```powershell
npm --prefix backend test
```

Para gerar o frontend:

```powershell
npm --prefix frontend run build
```

Os valores de `backend\.env.example` são apenas para desenvolvimento local; substitua-os antes de qualquer ambiente compartilhado. O frontend atual preserva as telas existentes e ainda não implementa autenticação ou o fluxo de reservas.
