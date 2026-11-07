const token = sessionStorage.getItem("reserve-me-token");
const content = document.querySelector("#dashboard-content");
const nav = document.querySelector("#dashboard-nav");
const message = document.querySelector("#dashboard-message");
const userName = document.querySelector("#user-name");
const userRole = document.querySelector("#user-role");

const roleNames = {
  coordinator: "Coordenador(a)",
  substitute: "Funcionário delegado",
  teacher: "Professor(a)",
  cleaning: "Limpeza",
};
const permissionNames = {
  "rooms:manage": "Gerenciar salas",
  "reservations:manage": "Gerenciar reservas",
  "cleaning:manage": "Gerenciar tarefas de limpeza",
};

let currentUser;
let permissions = [];
let currentSection = "";

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) {
    node.textContent = text;
  }
  if (className) {
    node.className = className;
  }
  return node;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  if (response.status === 401) {
    sessionStorage.removeItem("reserve-me-token");
    window.location.assign("index.html");
    throw new Error("Sua sessão expirou.");
  }
  if (response.status === 204) {
    return null;
  }
  const body = await response.text();
  if (!body.trim()) {
    throw new Error(`O servidor não enviou uma resposta (HTTP ${response.status}). Confira o terminal do backend.`);
  }
  let result;
  try {
    result = JSON.parse(body);
  } catch {
    throw new Error(`A API retornou uma resposta inesperada (HTTP ${response.status}). Confira o terminal do backend.`);
  }
  if (!response.ok) {
    throw new Error(result.error || "Não foi possível concluir a operação.");
  }
  return result;
}

function setMessage(text, isError = false) {
  message.textContent = text;
  message.dataset.type = isError ? "error" : "success";
}

function makeButton(text, action, className = "button button-secondary") {
  const button = element("button", text, className);
  button.type = "button";
  button.addEventListener("click", action);
  return button;
}

function addField(form, labelText, name, type = "text", required = true, options = {}) {
  const wrapper = element("div", undefined, "dashboard-field");
  const label = element("label", labelText);
  label.htmlFor = `field-${name}`;
  const input = element(type === "select" ? "select" : "input");
  input.id = `field-${name}`;
  input.name = name;
  input.required = required;
  if (type !== "select") {
    input.type = type;
  }
  if (options.min !== undefined) {
    input.min = options.min;
  }
  if (options.max !== undefined) {
    input.max = options.max;
  }
  if (options.step !== undefined) {
    input.step = options.step;
  }
  if (options.placeholder) {
    input.placeholder = options.placeholder;
  }
  if (options.options) {
    for (const option of options.options) {
      const optionNode = element("option", option.label);
      optionNode.value = option.value;
      input.append(optionNode);
    }
  }
  wrapper.append(label, input);
  form.insertBefore(wrapper, form.querySelector(".button-primary"));
  return input;
}

function createForm(title, submitText, onSubmit) {
  const form = element("form", undefined, "dashboard-form");
  form.noValidate = true;
  form.append(element("h3", title));
  const button = element("button", submitText, "button button-primary");
  button.type = "submit";
  form.append(element("p", "* Campos obrigatórios", "required-note"), button);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) {
      return;
    }
    button.disabled = true;
    try {
      await onSubmit(new FormData(form));
      form.reset();
    } catch (error) {
      setMessage(error.message, true);
    } finally {
      button.disabled = false;
    }
  });
  return form;
}

function createSection(title, description) {
  content.replaceChildren();
  content.append(element("h1", title), element("p", description, "section-description"));
}

function addList(items, renderItem, emptyMessage) {
  const list = element("div", undefined, "dashboard-list");
  if (items.length === 0) {
    list.append(element("p", emptyMessage, "empty-state"));
  }
  for (const item of items) {
    list.append(renderItem(item));
  }
  content.append(list);
}

async function renderRooms() {
  createSection("Salas", "Cadastre espaços e consulte suas capacidades e recursos.");
  if (permissions.includes("*") || permissions.includes("rooms:manage")) {
    const form = createForm("Cadastrar sala", "Salvar sala", async (data) => {
      await api("/api/salas", {
        method: "POST",
        body: JSON.stringify({
          nome: data.get("nome"),
          andar: data.get("andar"),
          capacidade: Number(data.get("capacidade")),
          recursos: data.get("recursos").split(",").map((item) => item.trim()).filter(Boolean),
        }),
      });
      setMessage("Sala cadastrada.");
      await renderRooms();
    });
    addField(form, "Nome", "nome");
    addField(form, "Andar", "andar");
    addField(form, "Capacidade (máximo 30; auditório até 200)", "capacidade", "number", true, {
      min: 1,
      max: 200,
      step: 1,
    });
    addField(form, "Recursos separados por vírgula", "recursos", "text", false, {
      placeholder: "Quadro, Datashow",
    });
    content.append(form);
  }

  const rooms = await api("/api/salas");
  addList(rooms, (room) => {
    const card = element("article", undefined, "data-card");
    card.append(element("h3", room.nome));
    card.append(element("p", `${room.andar} · ${room.capacidade} lugares`));
    card.append(element("p", room.recursos.length ? room.recursos.join(", ") : "Sem recursos cadastrados"));
    if (permissions.includes("*") || permissions.includes("rooms:manage")) {
      const editForm = createForm("Editar sala", "Salvar alterações", async (data) => {
        await api(`/api/salas/${room.id}`, {
          method: "PUT",
          body: JSON.stringify({
            nome: data.get("nome"),
            andar: data.get("andar"),
            capacidade: Number(data.get("capacidade")),
            recursos: data.get("recursos").split(",").map((item) => item.trim()).filter(Boolean),
          }),
        });
        setMessage("Sala atualizada.");
        await renderRooms();
      });
      addField(editForm, "Nome", "nome");
      addField(editForm, "Andar", "andar");
      addField(editForm, "Capacidade (máximo 30; auditório até 200)", "capacidade", "number", true, {
        min: 1,
        max: 200,
        step: 1,
      });
      addField(editForm, "Recursos separados por vírgula", "recursos", "text", false);
      editForm.querySelector('[name="nome"]').value = room.nome;
      editForm.querySelector('[name="andar"]').value = room.andar;
      editForm.querySelector('[name="capacidade"]').value = room.capacidade;
      editForm.querySelector('[name="recursos"]').value = room.recursos.join(", ");
      editForm.hidden = true;
      const editButton = makeButton("Editar", () => {
        editForm.hidden = !editForm.hidden;
        editButton.setAttribute("aria-expanded", String(!editForm.hidden));
      });
      editButton.setAttribute("aria-expanded", "false");
      card.append(
        editButton,
        makeButton("Excluir", async () => {
          if (!window.confirm(`Excluir ${room.nome}?`)) {
            return;
          }
          await api(`/api/salas/${room.id}`, { method: "DELETE" });
          setMessage("Sala excluída.");
          await renderRooms();
        }),
        editForm,
      );
    }
    return card;
  }, "Ainda não há salas cadastradas.");
}

function reservationCard(reservation, manager) {
  const card = element("article", undefined, "data-card");
  card.append(element("h3", reservation.sala.nome));
  card.append(element("p", `${reservation.data} · ${reservation.inicio}–${reservation.fim}`));
  card.append(element("p", `${reservation.quantidade_alunos} alunos · ${reservation.responsavel}`));
  card.append(element("p", reservation.finalidade));
  card.append(element("p", `Situação: ${reservation.situacao}`));

  if (manager && reservation.situacao === "pendente") {
    card.append(makeButton("Aprovar", async () => {
      await updateReservation(reservation, "aprovada");
      await renderReservations();
    }, "button button-primary"));
  }
  if (reservation.situacao === "pendente") {
    card.append(makeButton("Cancelar", async () => {
      await api(`/api/reservas/${reservation.id}`, { method: "DELETE" });
      setMessage("Reserva cancelada.");
      await renderReservations();
    }));
  }
  return card;
}

async function updateReservation(reservation, situacao) {
  await api(`/api/reservas/${reservation.id}`, {
    method: "PUT",
    body: JSON.stringify({
      sala_id: reservation.sala.id,
      data: reservation.data,
      inicio: reservation.inicio,
      fim: reservation.fim,
      responsavel: reservation.responsavel,
      finalidade: reservation.finalidade,
      situacao,
      quantidade_alunos: reservation.quantidade_alunos,
    }),
  });
  setMessage("Reserva atualizada.");
}

async function renderReservations() {
  const manager = permissions.includes("*") || permissions.includes("reservations:manage");
  createSection("Reservas", manager
    ? "Consulte as solicitações, aprove ou cancele os horários."
    : "Agende aulas e acompanhe suas solicitações.");

  const rooms = await api("/api/salas");
  if (permissions.includes("*") || permissions.includes("reservations:create_own")
    || permissions.includes("reservations:manage")) {
    const form = createForm("Agendar sala", "Enviar solicitação", async (data) => {
      await api("/api/reservas", {
        method: "POST",
        body: JSON.stringify({
          sala_id: Number(data.get("sala_id")),
          data: data.get("data"),
          inicio: data.get("inicio"),
          fim: data.get("fim"),
          quantidade_alunos: Number(data.get("quantidade_alunos")),
          finalidade: data.get("finalidade"),
        }),
      });
      setMessage("Solicitação enviada para aprovação.");
      await renderReservations();
    });
    addField(form, "Sala", "sala_id", "select", true, {
      options: rooms.map((room) => ({ value: String(room.id), label: `${room.nome} (${room.capacidade} lugares)` })),
    });
    const localToday = new Date();
    const minimumDate = new Date(localToday.getTime() - localToday.getTimezoneOffset() * 60000)
      .toISOString().slice(0, 10);
    addField(form, "Data", "data", "date", true, { min: minimumDate });
    addField(form, "Início", "inicio", "time");
    addField(form, "Fim", "fim", "time");
    addField(form, "Quantidade de alunos", "quantidade_alunos", "number", true, {
      min: 1,
      max: 200,
      step: 1,
    });
    addField(form, "Finalidade", "finalidade", "text", true);
    content.append(form);
  }

  const reservations = await api("/api/reservas");
  addList(reservations, (reservation) => reservationCard(reservation, manager), "Nenhuma reserva encontrada.");
}

async function renderUsers() {
  createSection("Acessos", "Aprove cadastros e defina o perfil de cada funcionário.");
  const users = await api("/api/usuarios");
  addList(users, (user) => {
    const card = element("article", undefined, "data-card");
    card.append(element("h3", user.nome));
    card.append(element("p", `${user.email} · ${roleNames[user.perfil]} · ${user.situacao}`));
    if (user.perfil !== "coordinator") {
      const form = element("form", undefined, "inline-form");
      const select = addField(form, "Perfil", `perfil-${user.id}`, "select", true, {
        options: [
          { value: "teacher", label: "Professor(a)" },
          { value: "substitute", label: "Funcionário delegado" },
          { value: "cleaning", label: "Limpeza" },
        ],
      });
      select.value = user.perfil;
      form.append(makeButton("Salvar acesso", async () => {
        await api(`/api/usuarios/${user.id}`, {
          method: "PATCH",
          body: JSON.stringify({ perfil: select.value, situacao: "ativo" }),
        });
        setMessage("Acesso aprovado/atualizado.");
        await renderUsers();
      }, "button button-primary"));
      if (user.situacao === "ativo") {
        form.append(makeButton("Bloquear", async () => {
          await api(`/api/usuarios/${user.id}`, {
            method: "PATCH",
            body: JSON.stringify({ perfil: user.perfil, situacao: "bloqueado" }),
          });
          setMessage("Acesso bloqueado.");
          await renderUsers();
        }));
      }
      card.append(form);
    }
    return card;
  }, "Não há funcionários cadastrados.");
}

async function renderDelegations() {
  createSection("Acesso temporário", "Conceda permissões específicas ao funcionário que substituirá o(a) coordenador(a).");
  const [users, delegations] = await Promise.all([
    api("/api/usuarios"),
    api("/api/usuarios/delegacoes"),
  ]);
  const activeUsers = users.filter((user) => user.situacao === "ativo" && user.perfil !== "coordinator");
  const form = createForm("Conceder permissão", "Conceder acesso", async (data) => {
    await api("/api/usuarios/delegacoes", {
      method: "POST",
      body: JSON.stringify({
        funcionario_id: Number(data.get("funcionario_id")),
        permissao: data.get("permissao"),
        expira_em: data.get("expira_em") || null,
      }),
    });
    setMessage("Permissão delegada.");
    await renderDelegations();
  });
  addField(form, "Funcionário", "funcionario_id", "select", true, {
    options: activeUsers.map((user) => ({ value: String(user.id), label: user.nome })),
  });
  addField(form, "Permissão", "permissao", "select", true, {
    options: Object.entries(permissionNames).map(([value, label]) => ({ value, label })),
  });
  addField(form, "Expira em (opcional)", "expira_em", "datetime-local", false);
  content.append(form);
  addList(delegations, (delegation) => {
    const card = element("article", undefined, "data-card");
    card.append(element("p", `${delegation.funcionario} · ${permissionNames[delegation.permissao]}`));
    card.append(element("p", delegation.revogada_em
      ? "Revogada"
      : delegation.expira_em
        ? `Válida até ${new Date(delegation.expira_em).toLocaleString("pt-BR")}`
        : "Sem data de expiração"));
    if (!delegation.revogada_em) {
      card.append(makeButton("Revogar", async () => {
        await api(`/api/usuarios/delegacoes/${delegation.id}`, { method: "DELETE" });
        setMessage("Acesso delegado revogado.");
        await renderDelegations();
      }));
    }
    return card;
  }, "Nenhuma permissão delegada.");
}

async function renderCleaning() {
  const manager = permissions.includes("*") || permissions.includes("cleaning:manage");
  createSection("Limpeza", manager
    ? "Atribua tarefas e acompanhe as atividades das salas."
    : "Consulte e conclua as tarefas atribuídas a você.");
  if (manager) {
    const [rooms, cleaningUsers] = await Promise.all([
      api("/api/salas"),
      permissions.includes("*") || permissions.includes("users:manage")
        ? api("/api/usuarios").then((users) => users.filter((user) => user.perfil === "cleaning" && user.situacao === "ativo"))
        : api("/api/usuarios/limpeza"),
    ]);
    const form = createForm("Atribuir tarefa", "Atribuir", async (data) => {
      await api("/api/tarefas-limpeza", {
        method: "POST",
        body: JSON.stringify({
          sala_id: Number(data.get("sala_id")),
          funcionario_id: Number(data.get("funcionario_id")),
          data: data.get("data"),
          descricao: data.get("descricao"),
        }),
      });
      setMessage("Tarefa atribuída.");
      await renderCleaning();
    });
    addField(form, "Sala", "sala_id", "select", true, {
      options: rooms.map((room) => ({ value: String(room.id), label: room.nome })),
    });
    addField(form, "Funcionário", "funcionario_id", "select", true, {
      options: cleaningUsers.map((user) => ({ value: String(user.id), label: user.nome })),
    });
    addField(form, "Data", "data", "date", true);
    addField(form, "Tarefa", "descricao");
    content.append(form);
  }

  const tasks = await api("/api/tarefas-limpeza");
  addList(tasks, (task) => {
    const card = element("article", undefined, "data-card");
    card.append(element("h3", `${task.sala_nome} · ${task.data}`));
    card.append(element("p", task.descricao));
    card.append(element("p", `${task.funcionario} · ${task.situacao}`));
    if (!manager && task.situacao === "pendente") {
      card.append(makeButton("Marcar como concluída", async () => {
        await api(`/api/tarefas-limpeza/${task.id}/concluir`, { method: "PATCH" });
        setMessage("Tarefa concluída.");
        await renderCleaning();
      }, "button button-primary"));
    }
    return card;
  }, "Nenhuma tarefa cadastrada.");
}

const sections = [
  { id: "salas", label: "Salas", visible: () => permissions.includes("*") || permissions.includes("rooms:read"), render: renderRooms },
  {
    id: "reservas",
    label: "Reservas",
    visible: () => permissions.includes("*") || permissions.some((permission) => permission.startsWith("reservations:")),
    render: renderReservations,
  },
  { id: "usuarios", label: "Acessos", visible: () => permissions.includes("users:manage"), render: renderUsers },
  { id: "delegacoes", label: "Delegações", visible: () => currentUser.perfil === "coordinator", render: renderDelegations },
  {
    id: "limpeza",
    label: "Limpeza",
    visible: () => permissions.includes("*") || permissions.some((permission) => permission.startsWith("cleaning:")),
    render: renderCleaning,
  },
];

async function showSection(id) {
  currentSection = id;
  for (const button of nav.querySelectorAll("button")) {
    button.setAttribute("aria-current", String(button.dataset.section === id));
  }
  setMessage("");
  try {
    await sections.find((section) => section.id === id).render();
  } catch (error) {
    createSection("Não foi possível carregar", error.message);
    setMessage(error.message, true);
  }
}

async function start() {
  if (!token) {
    window.location.replace("index.html");
    return;
  }
  try {
    const result = await api("/api/auth/me");
    currentUser = result.usuario;
    permissions = result.permissoes;
    userName.textContent = currentUser.nome;
    userRole.textContent = roleNames[currentUser.perfil];
    const availableSections = sections.filter((section) => section.visible());
    if (availableSections.length === 0) {
      createSection("Acesso ainda não liberado", "Aguarde a aprovação do(a) coordenador(a) ou a liberação das permissões necessárias.");
      return;
    }
    for (const section of availableSections) {
      const button = element("button", section.label, "nav-button");
      button.type = "button";
      button.dataset.section = section.id;
      button.addEventListener("click", () => showSection(section.id));
      nav.append(button);
    }
    await showSection(availableSections[0].id);
  } catch (error) {
    setMessage(error.message, true);
  }
}

document.querySelector("#logout-button").addEventListener("click", async () => {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } finally {
    sessionStorage.removeItem("reserve-me-token");
    window.location.assign("index.html");
  }
});

start();
