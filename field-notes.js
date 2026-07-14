const menuButton = document.querySelector("[data-menu-toggle]");
const navigation = document.querySelector("[data-nav]");

const setMenuOpen = (isOpen) => {
  document.body.classList.toggle("menu-open", isOpen);
  menuButton?.setAttribute("aria-expanded", String(isOpen));
  menuButton?.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
};

menuButton?.addEventListener("click", () => {
  setMenuOpen(!document.body.classList.contains("menu-open"));
});

navigation?.addEventListener("click", (event) => {
  if (event.target.closest("a")) setMenuOpen(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setMenuOpen(false);
});
