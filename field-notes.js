const menuButton = document.querySelector("[data-menu-toggle]");
const navigation = document.querySelector("[data-nav]");
const header = document.querySelector("[data-header]");
const focusableSelector = 'a[href]:not([tabindex="-1"]), button:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([type="hidden"]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])';
const menuBackgroundState = new Map();

const setMenuBackgroundInert = (isInert) => {
  if (isInert) {
    if (menuBackgroundState.size) return;
    [...document.body.children].forEach((element) => {
      if (element === header || element.tagName === "SCRIPT") return;
      menuBackgroundState.set(element, element.inert);
      element.inert = true;
    });
    return;
  }

  menuBackgroundState.forEach((wasInert, element) => {
    element.inert = wasInert;
  });
  menuBackgroundState.clear();
};

const trapMenuFocus = (event) => {
  if (event.key !== "Tab" || !document.body.classList.contains("menu-open")) return;
  const focusable = [...header.querySelectorAll(focusableSelector)]
    .filter((element) => !element.hidden && element.getClientRects().length > 0);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (!header.contains(active)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus({ preventScroll: true });
  } else if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
};

const setMenuOpen = (isOpen, { returnFocus = false } = {}) => {
  document.body.classList.toggle("menu-open", isOpen);
  header?.classList.toggle("is-open", isOpen);
  menuButton?.setAttribute("aria-expanded", String(isOpen));
  menuButton?.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
  setMenuBackgroundInert(isOpen);

  if (isOpen) {
    requestAnimationFrame(() => navigation?.querySelector("a")?.focus({ preventScroll: true }));
  } else if (returnFocus) {
    requestAnimationFrame(() => menuButton?.focus({ preventScroll: true }));
  }
};

menuButton?.addEventListener("click", () => {
  const isOpen = !document.body.classList.contains("menu-open");
  setMenuOpen(isOpen, { returnFocus: !isOpen });
});

navigation?.addEventListener("click", (event) => {
  if (event.target.closest("a")) setMenuOpen(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Tab") trapMenuFocus(event);
  if (event.key === "Escape" && document.body.classList.contains("menu-open")) {
    setMenuOpen(false, { returnFocus: true });
  }
});
