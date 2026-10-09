// Sella site: the drifting sky, gentle parallax on the cursor, reveal-on-scroll and counting numbers.
(() => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // the sky: colour clouds + film grain, behind everything
  const sky = document.createElement("div");
  sky.className = "sky";
  sky.setAttribute("aria-hidden", "true");
  sky.innerHTML = `<div class="cloud small"><i></i></div><div class="cloud low"><i></i></div><div class="cloud big"><i></i></div><div class="cloud rim"><i></i></div><div class="grain"></div>`;
  document.body.prepend(sky);

  // the clouds lean a little towards the cursor (each at its own depth)
  if (!reduced && matchMedia("(hover: hover)").matches) {
    let raf = 0;
    addEventListener("pointermove", (e) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        sky.style.setProperty("--px", ((e.clientX / innerWidth - 0.5) * 2).toFixed(3));
        sky.style.setProperty("--py", ((e.clientY / innerHeight - 0.5) * 2).toFixed(3));
      });
    }, { passive: true });
  }

  // numbers count up the first time they come into view: <span data-count="1280" data-suffix=" %">
  const fmt = new Intl.NumberFormat("cs-CZ");
  function count(el) {
    const to = Number(el.dataset.count), dec = Number(el.dataset.dec || 0), suffix = el.dataset.suffix || "";
    const show = (v) => { el.textContent = (dec ? v.toFixed(dec).replace(".", ",") : fmt.format(Math.round(v))) + suffix; };
    if (reduced) return show(to);
    const t0 = performance.now(), dur = 1400;
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      show(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add("in");
      e.target.querySelectorAll("[data-count]").forEach(count);
      e.target.dispatchEvent(new CustomEvent("reveal"));
      io.unobserve(e.target);
    }
  }, { threshold: 0.18, rootMargin: "0px 0px -6% 0px" });
  document.querySelectorAll(".rv").forEach((el) => io.observe(el));

  window.Sella = { reduced };
})();
