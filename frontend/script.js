import { checkApiHealth } from "./api.js";

const form = document.querySelector("#auth-form");
const apiStatus = document.querySelector("#api-status");
const nameField = document.querySelector("#name-field");
const nameInput = document.querySelector("#name");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const submitButton = document.querySelector("#submit-button");
const registerButton = document.querySelector("#register-button");
const formMessage = document.querySelector("#form-message");
const recoverLink = document.querySelector("#recover-link");
let registering = false;

checkApiHealth()
  .then(() => {
    apiStatus.textContent = "Serviço conectado.";
  })
  .catch((error) => {
    console.error("Não foi possível verificar a conexão com a API:", error);
    apiStatus.textContent = "Serviço indisponível. Tente novamente mais tarde.";
  });

function setMessage(message, isError = false) {
  formMessage.textContent = message;
  formMessage.dataset.type = isError ? "error" : "success";
}

function validateInput(input, errorElement, message) {
  const invalid = !input.checkValidity() || input.value.trim() === "";
  input.setAttribute("aria-invalid", String(invalid));
  errorElement.textContent = invalid ? message : "";
  return !invalid;
}

async function readApiResponse(response) {
  const body = await response.text();
  if (!body.trim()) {
    throw new Error(
      `O servidor não enviou uma resposta (HTTP ${response.status}). Confira se o backend está rodando no terminal.`,
    );
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new Error(
      `A API retornou uma resposta inesperada (HTTP ${response.status}). Confira o terminal do backend.`,
    );
  }
}

registerButton.addEventListener("click", () => {
  registering = !registering;
  nameField.hidden = !registering;
  nameInput.required = registering;
  submitButton.textContent = registering ? "Enviar cadastro" : "Entrar";
  registerButton.textContent = registering ? "Já tenho cadastro" : "Criar conta";
  recoverLink.hidden = registering;
  setMessage(registering
    ? "Seu cadastro será enviado ao(à) coordenador(a) para aprovação."
    : "");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const emailValid = validateInput(emailInput, document.querySelector("#email-error"), "Informe um e-mail válido.");
  const passwordValid = validateInput(
    passwordInput,
    document.querySelector("#password-error"),
    registering ? "Use uma senha com pelo menos 10 caracteres." : "Informe sua senha.",
  );
  const nameValid = !registering
    || validateInput(nameInput, document.querySelector("#name-error"), "Informe seu nome.");
  if (!emailValid || !passwordValid || !nameValid) {
    return;
  }

  submitButton.disabled = true;
  setMessage(registering ? "Enviando cadastro..." : "Entrando...");
  try {
    const response = await fetch(registering ? "/api/auth/register" : "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(registering
        ? { nome: nameInput.value.trim(), email: emailInput.value.trim(), senha: passwordInput.value }
        : { email: emailInput.value.trim(), senha: passwordInput.value }),
    });
    const result = await readApiResponse(response);
    if (!response.ok) {
      throw new Error(result.error || "Não foi possível concluir a solicitação.");
    }

    if (registering) {
      registering = false;
      nameField.hidden = true;
      nameInput.required = false;
      form.reset();
      submitButton.textContent = "Entrar";
      registerButton.textContent = "Criar conta";
      recoverLink.hidden = false;
      setMessage(result.message, false);
      return;
    }

    sessionStorage.setItem("reserve-me-token", result.token);
    window.location.assign("painel.html");
  } catch (error) {
    setMessage(error.message, true);
  } finally {
    submitButton.disabled = false;
  }
});
