const form = document.querySelector(".login-form");
const emailInput = document.querySelector("#email");
const emailError = document.querySelector("#email-error");

function validateEmail() {
  const isEmpty = emailInput.value.trim() === "";
  emailInput.setAttribute("aria-invalid", String(isEmpty));
  emailError.textContent = isEmpty ? "Obrigatório" : "";
  return !isEmpty;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  validateEmail();
});

emailInput.addEventListener("input", () => {
  if (emailInput.value.trim() !== "") {
    validateEmail();
  }
});
