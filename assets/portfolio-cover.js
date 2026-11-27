(() => {
  const carousel = document.querySelector(".cover-carousel");
  if (!carousel) return;
  const stage = carousel.querySelector(".cover-stage");
  const slides = [...stage.querySelectorAll(":scope > article, :scope > template")];
  if (slides.length < 2) return;

  const controls = carousel.querySelector(".cover-controls");
  const play = controls.querySelector("[data-play]");
  const count = controls.querySelector(".cover-count b");
  const status = carousel.querySelector(".cover-status");
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let paused = motion.matches;
  let inView = true;
  let current = 0;
  let requested = 0;
  let timer;
  let revision = 0;

  function prepare(index) {
    const item = slides[index];
    if (item instanceof HTMLTemplateElement) {
      const frame = item.content.firstElementChild;
      item.replaceWith(frame);
      slides[index] = frame;
    }
    return slides[index];
  }

  function canRotate() {
    return !paused && inView && !document.hidden;
  }

  function schedule() {
    clearTimeout(timer);
    if (canRotate()) timer = setTimeout(() => move(1, false), 6500);
  }

  function setPaused(value) {
    paused = value;
    revision++;
    requested = current;
    play.toggleAttribute("data-paused", paused);
    play.setAttribute("aria-label", paused ? "Play slideshow" : "Pause slideshow");
    schedule();
  }

  async function move(direction, manual) {
    const start = requested;
    if (manual) setPaused(true);
    clearTimeout(timer);
    const ticket = ++revision;
    for (let step = 1; step <= slides.length; step++) {
      requested = (start + step * direction + slides.length) % slides.length;
      const frame = prepare(requested);
      const photo = frame.querySelector("img");
      try {
        await photo.decode();
      } catch {
        if (ticket !== revision) return;
        if (!photo.naturalWidth) continue;
      }
      if (ticket !== revision) return;
      if (!manual && !canRotate()) break;
      const previous = slides[current];
      const linkHadFocus = previous.contains(document.activeElement);
      previous.removeAttribute("data-current");
      previous.inert = true;
      current = requested;
      frame.inert = false;
      frame.setAttribute("data-current", "");
      count.textContent = String(current + 1).padStart(2, "0");
      if (manual) {
        status.textContent = frame.querySelector("h2").textContent + ", " + frame.querySelector("a").getAttribute("aria-label") + ", " + frame.getAttribute("aria-label");
        if (linkHadFocus) frame.querySelector("a").focus({ preventScroll: true });
      }
      break;
    }
    requested = current;
    schedule();
  }

  play.addEventListener("click", () => setPaused(!paused));
  controls.querySelectorAll("[data-step]").forEach((button) => {
    button.addEventListener("click", () => move(Number(button.dataset.step), true));
  });
  carousel.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    move(event.key === "ArrowLeft" ? -1 : 1, true);
  });
  carousel.addEventListener("focusin", (event) => {
    if (event.target !== play && event.target.matches(":focus-visible")) setPaused(true);
  });

  let touch;
  stage.addEventListener("touchstart", (event) => {
    touch = event.touches.length === 1 ? event.touches[0] : null;
  }, { passive: true });
  stage.addEventListener("touchcancel", () => { touch = null; });
  stage.addEventListener("touchend", (event) => {
    if (!touch) return;
    const dx = event.changedTouches[0].clientX - touch.clientX;
    const dy = event.changedTouches[0].clientY - touch.clientY;
    touch = null;
    if (Math.abs(dx) >= 45 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (event.cancelable) event.preventDefault();
      move(dx < 0 ? 1 : -1, true);
    }
  }, { passive: false });

  motion.addEventListener("change", () => { if (motion.matches) setPaused(true); });
  document.addEventListener("visibilitychange", schedule);
  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    schedule();
  }).observe(stage);
  setPaused(paused);
  controls.hidden = false;
})();
