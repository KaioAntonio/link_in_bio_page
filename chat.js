import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Publishable key only — safe to expose in client code.
// Access is limited by a Row Level Security policy on the "messages"
// table that allows anonymous INSERT and nothing else.
const SUPABASE_URL = "https://pkqxefwecszqjzbjknvf.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_hNTr5bSeKxbhsbhyw9nOSg_Yk1HJm8G";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const toggle = document.getElementById("chatToggle");
const iconOpen = document.getElementById("chatIconOpen");
const iconClose = document.getElementById("chatIconClose");
const panel = document.getElementById("chatPanel");
const hint = document.getElementById("chatHint");
const form = document.getElementById("chatForm");
const formHint = document.getElementById("chatFormHint");
const submitBtn = form.querySelector(".chat-submit");

const HINT_SEEN_KEY = "kaioozy_chat_hint_seen";

function openPanel() {
  panel.hidden = false;
  requestAnimationFrame(() => panel.classList.add("is-open"));
  toggle.setAttribute("aria-expanded", "true");
  iconOpen.setAttribute("hidden", "");
  iconClose.removeAttribute("hidden");
  hideHint();
  document.getElementById("chatMessage").focus({ preventScroll: true });
}

function closePanel() {
  panel.classList.remove("is-open");
  toggle.setAttribute("aria-expanded", "false");
  iconOpen.removeAttribute("hidden");
  iconClose.setAttribute("hidden", "");
  window.setTimeout(() => {
    panel.hidden = true;
  }, 220);
}

function showHint() {
  if (sessionStorage.getItem(HINT_SEEN_KEY)) return;
  hint.classList.add("is-visible");
  sessionStorage.setItem(HINT_SEEN_KEY, "1");
  window.setTimeout(hideHint, 7000);
}

function hideHint() {
  hint.classList.remove("is-visible");
}

toggle.addEventListener("click", () => {
  if (panel.hidden) {
    openPanel();
  } else {
    closePanel();
  }
});

hint.addEventListener("click", openPanel);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !panel.hidden) closePanel();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  // Honeypot: real visitors never fill this hidden field.
  if (form.website.value) return;

  const message = form.message.value.trim();
  if (!message) {
    formHint.textContent = "Escreve algo antes de enviar :)";
    formHint.className = "chat-form__hint chat-form__hint--error";
    return;
  }

  submitBtn.disabled = true;
  formHint.textContent = "Enviando...";
  formHint.className = "chat-form__hint";

  const { error } = await supabase.from("messages").insert({
    message,
    contact: form.contact.value.trim() || null,
    user_agent: navigator.userAgent,
    referrer: document.referrer || null,
  });

  submitBtn.disabled = false;

  if (error) {
    formHint.textContent = "Não rolou agora, tenta de novo em instantes.";
    formHint.className = "chat-form__hint chat-form__hint--error";
    return;
  }

  form.reset();
  formHint.textContent = "Mensagem enviada! Te respondo em breve.";
  formHint.className = "chat-form__hint chat-form__hint--success";
  window.setTimeout(closePanel, 2200);
});

window.setTimeout(showHint, 1500);
