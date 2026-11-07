# reserve.me

Frontend estático em `frontend/` e API Node.js em `backend/`, comunicando-se por HTTP. O MySQL local é executado em Docker.

## Requisitos

- Node.js 20.19+ e npm
- Docker com Docker Compose

## Configuração local

1. Abra o Docker Desktop e espere o Docker indicar que está em execução.
2. Abra o PowerShell na pasta do projeto (`Reserva_sala`). Se ainda não criou o arquivo de configuração, execute:

   ```powershell
   Copy-Item backend\.env.example backend\.env
   ```

3. Abra o arquivo de configuração:

   ```powershell
   notepad backend\.env
   ```

4. No Bloco de Notas, preencha os três campos vazios no final do arquivo. Use seus próprios dados:

   ```text
   INITIAL_COORDINATOR_NAME=Seu Nome
   INITIAL_COORDINATOR_EMAIL=seu.email@escola.com
   INITIAL_COORDINATOR_PASSWORD=uma-senha-com-pelo-menos-10-caracteres
   ```

   Não coloque aspas. Escolha uma senha com pelo menos 10 caracteres. Salve com `Ctrl+S` e feche o Bloco de Notas. Não compartilhe essa senha nem envie o arquivo `backend\.env` para outras pessoas.

5. No PowerShell, inicie o MySQL:

   ```powershell
   docker compose --env-file backend\.env up -d
   ```

6. Instale as dependências (se ainda não estiverem instaladas):

   ```powershell
   npm --prefix backend install
   npm --prefix frontend install
   ```

7. Abra um segundo terminal PowerShell na pasta do projeto. No primeiro terminal, inicie o backend:

   ```powershell
   npm --prefix backend run dev
   ```

   Aguarde a mensagem `API listening on port 3001`. Na primeira inicialização, o sistema cria o banco de dados e a conta de Coordenador(a).

8. No segundo terminal, inicie o frontend:

   ```powershell
   npm --prefix frontend run dev
   ```

9. Abra `http://localhost:5173` no navegador. Entre com o e-mail e a senha que colocou nas variáveis `INITIAL_COORDINATOR_EMAIL` e `INITIAL_COORDINATOR_PASSWORD`. Depois do login, você poderá cadastrar salas e administrar os acessos pelo painel.

Se a conta de Coordenador(a) já tiver sido criada anteriormente, mudar essas variáveis não troca a senha da conta existente. As credenciais iniciais só são usadas para criar a primeira conta master do banco.

O frontend encaminha chamadas `/api` para a API em `http://localhost:3001`. A porta separada evita conflito com outros serviços locais que usam a porta 3000. As rotas `GET /api/health` e `GET /api/health/db` verificam a API e a conexão MySQL.

Se o terminal do frontend mostrar `HTTP 405` ou o backend indicar `EADDRINUSE`, pare a execução antiga com `Ctrl+C` nos terminais correspondentes e inicie novamente com os comandos acima. Confirme a API abrindo `http://127.0.0.1:3001/api/health`; a resposta deve ser `{"status":"ok"}`. Reinicie também o Vite depois de qualquer alteração em `frontend\vite.config.js`.

O cadastro público cria uma conta de professor pendente; o(a) Coordenador(a) aprova o cadastro e define se o perfil será professor, funcionário delegado ou limpeza. O(a) Coordenador(a) pode conceder permissões específicas e opcionais com data de expiração. Os perfis de professor e limpeza só acessam seus próprios dados/tarefas. As rotas de negócio exigem uma sessão obtida em `POST /api/auth/login` e token Bearer; use `POST /api/auth/register` para solicitar cadastro e `POST /api/auth/logout` para encerrar a sessão.

O painel permite que a coordenação cadastre salas, aprove acessos, gerencie reservas e tarefas de limpeza e conceda/revogue delegações. Professores podem agendar e cancelar suas próprias solicitações pendentes. Funcionários de limpeza consultam e concluem as tarefas atribuídas a eles.

Ao iniciar, a API cria a tabela `salas` se ela ainda não existir. O CRUD está disponível em `/api/salas`:

| Método | Rota | Ação |
| --- | --- | --- |
| `GET` | `/api/salas` | Lista as salas |
| `GET` | `/api/salas/:id` | Busca uma sala |
| `POST` | `/api/salas` | Cadastra uma sala |
| `PUT` | `/api/salas/:id` | Atualiza uma sala |
| `DELETE` | `/api/salas/:id` | Exclui uma sala |

O corpo de `POST` e `PUT` usa JSON com `nome` (texto), `andar` (texto), `capacidade` (inteiro de 1 a 30; o auditório pode ter até 200) e `recursos` (lista de textos, por exemplo `["Quadro", "Datashow"]`). Recursos vazios são permitidos. Consultas de salas exigem usuário autenticado; cadastrar, atualizar e excluir exige coordenação ou permissão delegada.

Ao iniciar, a API também cria a tabela `reservas`. O CRUD está disponível em `/api/reservas`:

| Método | Rota | Ação |
| --- | --- | --- |
| `GET` | `/api/reservas` | Lista as reservas |
| `GET` | `/api/reservas/:id` | Busca uma reserva |
| `POST` | `/api/reservas` | Cria uma reserva (situação padrão: `pendente`) |
| `PUT` | `/api/reservas/:id` | Atualiza uma reserva |
| `DELETE` | `/api/reservas/:id` | Cancela uma reserva |

O corpo de `POST` e `PUT` usa `sala_id`, `data` (`AAAA-MM-DD`), `inicio` e `fim` (`HH:MM`), `quantidade_alunos` (inteiro positivo) e `finalidade`. O responsável vem da conta autenticada. Novas solicitações ficam pendentes. A capacidade da sala é validada e reservas pendentes/aprovadas não podem se sobrepor na mesma sala e data. Só a coordenação ou um funcionário delegado pode aprovar; o cancelamento preserva o registro e libera o horário.

O gerenciamento de pessoas fica em `/api/usuarios`; a coordenação pode aprovar/bloquear cadastros com `PATCH /api/usuarios/:id` usando `{ "perfil": "teacher|substitute|cleaning", "situacao": "ativo|bloqueado" }`. Delegações são gerenciadas em `/api/usuarios/delegacoes`. A equipe de limpeza consulta suas tarefas em `/api/tarefas-limpeza` e conclui uma tarefa com `PATCH /api/tarefas-limpeza/:id/concluir`; coordenação ou permissão delegada cria tarefas com `POST /api/tarefas-limpeza`.

Para inserir dados de demonstração, execute `backend\sql\seed.sql` uma vez contra o banco configurado; o script inclui três salas e cinco reservas e evita duplicá-las ao ser reexecutado.

Para executar os testes do backend:

```powershell
npm --prefix backend test
```

Para gerar o frontend:

```powershell
npm --prefix frontend run build
```

Os valores de `backend\.env.example` são apenas para desenvolvimento local; substitua-os antes de qualquer ambiente compartilhado. A API armazena senhas com hash e guarda somente o hash dos tokens de sessão.
