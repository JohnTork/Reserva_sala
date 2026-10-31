import { checkApiHealth } from "./api.js";

const form = document.querySelector(".login-form");
const apiStatus = document.querySelector("#api-status");
const requiredFields = [
  { input: document.querySelector("#email"), error: document.querySelector("#email-error") },
  { input: document.querySelector("#password"), error: document.querySelector("#password-error") },
];

checkApiHealth()
  .then(() => {
    apiStatus.textContent = "Serviço conectado.";
  })
  .catch((error) => {
    console.error("Não foi possível verificar a conexão com a API:", error);
    apiStatus.textContent = "Serviço indisponível. Tente novamente mais tarde.";
  });

function validateField(field) {
  const isEmpty = field.input.value.trim() === "";
  field.input.setAttribute("aria-invalid", String(isEmpty));
  field.error.textContent = isEmpty ? "Obrigatório" : "";
  return !isEmpty;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  requiredFields.forEach(validateField);
});

requiredFields.forEach((field) => {
  field.input.addEventListener("input", () => {
    if (field.input.value.trim() !== "") {
      validateField(field);
    }
  });
});
