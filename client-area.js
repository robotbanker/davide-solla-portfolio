const body = document.body;
const header = document.querySelector("[data-header]");
const nav = document.querySelector("[data-nav]");
const menuToggle = document.querySelector("[data-menu-toggle]");
const loginPanel = document.querySelector("[data-client-login-panel]");
const loginForm = document.querySelector("[data-client-login-form]");
const clientStatus = document.querySelector("[data-client-status]");
const gallerySection = document.querySelector("[data-client-gallery]");
const galleryTitle = document.querySelector("[data-client-gallery-title]");
const galleryCopy = document.querySelector("[data-client-gallery-copy]");
const galleryFrame = document.querySelector("[data-client-frame]");
const downloadLink = document.querySelector("[data-client-download]");
const logoutButton = document.querySelector("[data-client-logout]");
const clientStorageKey = "davide-client-gallery";
const clientSessionMs = 8 * 60 * 60 * 1000;

const setHeaderState = () => {
  header?.classList.toggle("is-scrolled", window.scrollY > 24);
};

const closeMenu = () => {
  body.classList.remove("menu-open");
  header?.classList.remove("is-open");
  menuToggle?.setAttribute("aria-expanded", "false");
  menuToggle?.setAttribute("aria-label", "Open navigation");
};

const setStatus = (message) => {
  clientStatus.textContent = message;
};

const saveClientSession = (client) => {
  sessionStorage.setItem(clientStorageKey, JSON.stringify({
    client,
    expiresAt: Date.now() + clientSessionMs
  }));
};

const readClientSession = () => {
  try {
    const session = JSON.parse(sessionStorage.getItem(clientStorageKey) || "{}");

    if (!session.client || Date.now() > Number(session.expiresAt || 0)) {
      sessionStorage.removeItem(clientStorageKey);
      return null;
    }

    return session.client;
  } catch (error) {
    sessionStorage.removeItem(clientStorageKey);
    return null;
  }
};

const showGallery = (client) => {
  const name = client.name || "Your";
  const url = client.embedUrl || client.lightroomUrl;

  galleryTitle.textContent = `${name} gallery`;
  galleryCopy.textContent = "Use the embedded gallery below, or open Lightroom directly for downloads.";
  downloadLink.href = client.lightroomUrl || url;
  galleryFrame.src = url;
  loginPanel.hidden = true;
  gallerySection.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
};

const showLogin = () => {
  galleryFrame.removeAttribute("src");
  loginPanel.hidden = false;
  gallerySection.hidden = true;
  loginForm.reset();
  setStatus("");
};

menuToggle?.addEventListener("click", () => {
  const isOpen = !body.classList.contains("menu-open");
  body.classList.toggle("menu-open", isOpen);
  header?.classList.toggle("is-open", isOpen);
  menuToggle.setAttribute("aria-expanded", String(isOpen));
  menuToggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
});

nav?.addEventListener("click", (event) => {
  if (event.target.closest("a")) {
    closeMenu();
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginForm.classList.add("was-submitted");

  if (!loginForm.checkValidity()) {
    return;
  }

  const submitButton = loginForm.querySelector('button[type="submit"]');
  const formData = new FormData(loginForm);

  submitButton.disabled = true;
  setStatus("Checking access...");

  try {
    const response = await fetch("/api/client?action=login", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        email: formData.get("email"),
        password: formData.get("password")
      })
    });
    const body = await response.json();

    if (!response.ok) {
      throw new Error(body.error || "Client login failed.");
    }

    saveClientSession(body.client);
    showGallery(body.client);
  } catch (error) {
    setStatus(error.message);
  } finally {
    submitButton.disabled = false;
  }
});

logoutButton.addEventListener("click", () => {
  sessionStorage.removeItem(clientStorageKey);
  showLogin();
});

window.addEventListener("scroll", setHeaderState, { passive: true });
setHeaderState();

const savedClient = readClientSession();

if (savedClient) {
  showGallery(savedClient);
}
