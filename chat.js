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
const feedback = document.getElementById("chatFeedback");
const feedbackText = document.getElementById("chatFeedbackText");
const sprite = document.getElementById("chatSprite");

const HINT_SEEN_KEY = "kaioozy_chat_hint_seen";

// Sprite frames used by the send animation, in the order they appear.
// Frame timings below intentionally match this cast: preparing the
// message, throwing the paper plane, watching it fly, delivery, and
// a quick celebration before settling back to idle.
const SPRITE_FRAMES = [
  "reading",
  "preparing",
  "throwing",
  "flying",
  "delivered",
  "celebrating",
  "idle",
];

let spritesPreloaded = false;
function preloadSprites() {
  if (spritesPreloaded) return;
  spritesPreloaded = true;
  for (const name of SPRITE_FRAMES) {
    const img = new Image();
    img.src = `./images/sprite/${name}.png`;
  }
}

function setSprite(name) {
  sprite.src = `./images/sprite/${name}.png`;
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

// Plays the character/paper-plane sequence while `resultPromise` (the
// real Supabase insert) resolves in the background. The animation
// never decides success or failure — it only decorates the wait, and
// always resolves to whatever `resultPromise` resolves to.
async function playSendAnimation(resultPromise) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  feedback.classList.remove("is-sending", "is-delivered");
  feedbackText.textContent = "Enviando...";
  feedbackText.className = "chat-feedback__text";
  setSprite("reading");

  form.hidden = true;
  feedback.hidden = false;

  if (reduceMotion) {
    const [result] = await Promise.all([resultPromise, wait(500)]);
    return result;
  }

  window.setTimeout(() => setSprite("preparing"), 200);
  window.setTimeout(() => setSprite("throwing"), 500);
  window.setTimeout(() => {
    setSprite("flying");
    feedback.classList.add("is-sending");
  }, 700);
  window.setTimeout(() => {
    setSprite("delivered");
    feedback.classList.add("is-delivered");
  }, 1200);
  window.setTimeout(() => setSprite("celebrating"), 1300);

  const [result] = await Promise.all([resultPromise, wait(1700)]);
  setSprite("idle");
  return result;
}

function openPanel() {
  panel.hidden = false;
  requestAnimationFrame(() => panel.classList.add("is-open"));
  toggle.setAttribute("aria-expanded", "true");
  iconOpen.setAttribute("hidden", "");
  iconClose.removeAttribute("hidden");
  hideHint();
  preloadSprites();
  document.getElementById("chatMessage").focus({ preventScroll: true });
}

function closePanel() {
  panel.classList.remove("is-open");
  toggle.setAttribute("aria-expanded", "false");
  iconOpen.removeAttribute("hidden");
  iconClose.setAttribute("hidden", "");
  window.setTimeout(() => {
    panel.hidden = true;
    // If the panel is closed mid-send (or right after), make sure the
    // next time it opens it shows the form again, not a stale toast.
    if (!feedback.hidden) {
      feedback.hidden = true;
      form.hidden = false;
    }
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

  formHint.textContent = "";
  formHint.className = "chat-form__hint";
  submitBtn.disabled = true;

  // The real send happens immediately and independently — the
  // animation is just decoration around this promise, never a
  // condition for it.
  const sendPromise = supabase.from("messages").insert({
    message,
    contact: form.contact.value.trim() || null,
    user_agent: navigator.userAgent,
    referrer: document.referrer || null,
  });

  const { error } = await playSendAnimation(sendPromise);
  submitBtn.disabled = false;

  if (error) {
    feedbackText.textContent = "Não foi possível enviar a mensagem.";
    feedbackText.className = "chat-feedback__text chat-feedback__text--error";
    window.setTimeout(() => {
      feedback.hidden = true;
      form.hidden = false;
    }, 2000);
    return;
  }

  form.reset();
  feedbackText.textContent = "Mensagem enviada!";
  feedbackText.className = "chat-feedback__text chat-feedback__text--success";
  window.setTimeout(() => {
    feedback.hidden = true;
    form.hidden = false;
    closePanel();
  }, 2200);
});

window.setTimeout(showHint, 1500);
