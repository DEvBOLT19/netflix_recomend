/* ── State ───────────────────────────────────────────────────────────────────*/
const state = {
  browseGenre: "",
  browseSort:  "rating",
  browsePage:  1,
  browseTotal: 0,
  LIMIT:       24,
};

/* ── DOM refs ────────────────────────────────────────────────────────────────*/
const searchInput     = document.getElementById("searchInput");
const autocompleteBox = document.getElementById("autocomplete");
const featuredGrid    = document.getElementById("featuredGrid");
const browseGrid      = document.getElementById("browseGrid");
const genreChips      = document.getElementById("genreChips");
const sortSelect      = document.getElementById("sortSelect");
const pagination      = document.getElementById("pagination");
const modalOverlay    = document.getElementById("modalOverlay");
const modalBody       = document.getElementById("modalBody");
const toastEl         = document.getElementById("toast");

/* ── Utility ─────────────────────────────────────────────────────────────────*/
const starIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`;

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 2800);
}

function posterEl(url, cls = "card-poster") {
  if (url && url.startsWith("http")) {
    return `<img class="${cls}" src="${url}" alt="poster" loading="lazy" onerror="this.replaceWith(makePlaceholder('${cls}'))">`;
  }
  const ph = cls.includes("modal") ? "modal-poster-placeholder" : "card-poster-placeholder";
  return `<div class="${ph}">🎬</div>`;
}

function makePlaceholder(cls) {
  const d = document.createElement("div");
  d.className = cls.includes("modal") ? "modal-poster-placeholder" : "card-poster-placeholder";
  d.textContent = "🎬";
  return d;
}

/* ── Card builder ────────────────────────────────────────────────────────────*/
function buildCard(m, delayIndex = 0) {
  const div = document.createElement("div");
  div.className = "card";
  div.style.animationDelay = `${delayIndex * 40}ms`;
  div.innerHTML = `
    ${posterEl(m.poster)}
    <div class="card-body">
      <div class="card-title">${m.title}</div>
      <div class="card-meta">
        <span>${m.year || "—"}</span>
        <span class="card-rating">${starIcon} ${m.rating || "—"}</span>
      </div>
      <div class="card-genres">${m.genres || ""}</div>
    </div>`;
  div.addEventListener("click", () => openModal(m));
  return div;
}

function renderGrid(grid, movies) {
  grid.innerHTML = "";
  if (!movies.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="icon">🎞️</div><p>No movies found.</p></div>`;
    return;
  }
  movies.forEach((m, i) => grid.appendChild(buildCard(m, i)));
}

function skeletons(grid, n = 12) {
  grid.innerHTML = Array.from({length: n}, () =>
    `<div class="card"><div class="skeleton" style="aspect-ratio:2/3"></div>
      <div class="card-body"><div class="skeleton" style="height:14px;border-radius:4px;margin-bottom:6px"></div>
      <div class="skeleton" style="height:12px;border-radius:4px;width:60%"></div></div></div>`
  ).join("");
}

/* ── Featured ────────────────────────────────────────────────────────────────*/
async function loadFeatured() {
  skeletons(featuredGrid, 10);
  try {
    const res  = await fetch("/api/featured");
    const data = await res.json();
    renderGrid(featuredGrid, data);
  } catch {
    featuredGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p>Could not load featured movies.</p></div>`;
  }
}

/* ── Browse ──────────────────────────────────────────────────────────────────*/
async function loadBrowse() {
  skeletons(browseGrid, 24);
  const params = new URLSearchParams({
    genre: state.browseGenre,
    sort:  state.browseSort,
    page:  state.browsePage,
    limit: state.LIMIT,
  });
  try {
    const res  = await fetch(`/api/browse?${params}`);
    const data = await res.json();
    state.browseTotal = data.total;
    renderGrid(browseGrid, data.results);
    renderPagination();
  } catch {
    browseGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p>Could not load movies.</p></div>`;
  }
}

/* ── Pagination ──────────────────────────────────────────────────────────────*/
function renderPagination() {
  const totalPages = Math.ceil(state.browseTotal / state.LIMIT);
  if (totalPages <= 1) { pagination.innerHTML = ""; return; }

  let html = `<button class="page-btn" id="prevBtn" ${state.browsePage === 1 ? "disabled" : ""}>‹</button>`;

  const range = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - state.browsePage) <= 2) range.push(p);
    else if (range[range.length - 1] !== "…") range.push("…");
  }

  range.forEach(p => {
    if (p === "…") {
      html += `<span class="page-btn" style="pointer-events:none;opacity:.4">…</span>`;
    } else {
      html += `<button class="page-btn ${p === state.browsePage ? "active" : ""}" data-page="${p}">${p}</button>`;
    }
  });

  html += `<button class="page-btn" id="nextBtn" ${state.browsePage === totalPages ? "disabled" : ""}>›</button>`;
  pagination.innerHTML = html;

  pagination.querySelectorAll("[data-page]").forEach(btn =>
    btn.addEventListener("click", () => { state.browsePage = +btn.dataset.page; loadBrowse(); document.getElementById("browseSection").scrollIntoView({behavior:"smooth"}); })
  );

  document.getElementById("prevBtn")?.addEventListener("click", () => { state.browsePage--; loadBrowse(); });
  document.getElementById("nextBtn")?.addEventListener("click", () => { state.browsePage++; loadBrowse(); });
}

/* ── Genres ──────────────────────────────────────────────────────────────────*/
async function loadGenres() {
  try {
    const res  = await fetch("/api/genres");
    const data = await res.json();
    const top  = data.slice(0, 14); // show top 14 genres

    genreChips.innerHTML = `<div class="chip active" data-genre="">All</div>` +
      top.map(g => `<div class="chip" data-genre="${g}">${g}</div>`).join("");

    genreChips.querySelectorAll(".chip").forEach(chip => {
      chip.addEventListener("click", () => {
        genreChips.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        state.browseGenre = chip.dataset.genre;
        state.browsePage  = 1;
        loadBrowse();
      });
    });
  } catch { /* silent */ }
}

/* ── Sort ────────────────────────────────────────────────────────────────────*/
sortSelect?.addEventListener("change", () => {
  state.browseSort = sortSelect.value;
  state.browsePage = 1;
  loadBrowse();
});

/* ── Search / Autocomplete ───────────────────────────────────────────────────*/
let searchTimer;

searchInput?.addEventListener("input", () => {
  clearTimeout(searchTimer);
  const q = searchInput.value.trim();
  if (q.length < 2) { autocompleteBox.classList.remove("open"); return; }
  searchTimer = setTimeout(() => fetchAutocomplete(q), 300);
});

searchInput?.addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); doSearch(searchInput.value.trim()); }
  if (e.key === "Escape") autocompleteBox.classList.remove("open");
});

document.getElementById("searchBtn")?.addEventListener("click", () => doSearch(searchInput.value.trim()));

document.addEventListener("click", e => {
  if (!e.target.closest(".search-wrap")) autocompleteBox.classList.remove("open");
});

async function fetchAutocomplete(q) {
  try {
    const res  = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    renderAutocomplete(data.slice(0, 8));
  } catch { /* silent */ }
}

function renderAutocomplete(movies) {
  if (!movies.length) { autocompleteBox.classList.remove("open"); return; }
  autocompleteBox.innerHTML = movies.map(m => `
    <div class="autocomplete-item" data-title="${escHtml(m.title)}">
      ${m.poster && m.poster.startsWith("http")
        ? `<img class="autocomplete-thumb" src="${m.poster}" alt="" loading="lazy">`
        : `<div class="autocomplete-thumb placeholder">🎬</div>`}
      <div class="autocomplete-info">
        <strong>${m.title}</strong>
        <span>${m.year || ""} ${m.genres ? "· " + m.genres.split(",")[0] : ""}</span>
      </div>
    </div>`).join("");
  autocompleteBox.classList.add("open");
  autocompleteBox.querySelectorAll(".autocomplete-item").forEach(item => {
    item.addEventListener("click", () => {
      searchInput.value = item.dataset.title;
      autocompleteBox.classList.remove("open");
      doSearch(item.dataset.title);
    });
  });
}

async function doSearch(query) {
  if (!query) return;
  autocompleteBox.classList.remove("open");
  document.getElementById("searchResultsSection").style.display = "block";
  const grid  = document.getElementById("searchResultsGrid");
  const label = document.getElementById("searchResultsLabel");
  skeletons(grid, 6);
  label.textContent = `Results for "${query}"`;
  document.getElementById("searchResultsSection").scrollIntoView({behavior:"smooth", block:"start"});

  try {
    // Show search results AND recommendations
    const [searchRes, recRes] = await Promise.all([
      fetch(`/api/search?q=${encodeURIComponent(query)}`),
      fetch(`/api/recommend?title=${encodeURIComponent(query)}`),
    ]);
    const searchData = await searchRes.json();
    const recData    = await recRes.json();

    renderGrid(grid, searchData.slice(0, 12));

    // Show recommendations if we got them
    const recSection = document.getElementById("recSection");
    const recGrid    = document.getElementById("recGrid");
    if (recData.length) {
      recSection.style.display = "block";
      document.getElementById("recLabel").textContent = `Because you searched "${query}"`;
      renderGrid(recGrid, recData);
    } else {
      recSection.style.display = "none";
    }
  } catch {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p>Search failed. Is the Flask server running?</p></div>`;
  }
}

/* ── Modal ───────────────────────────────────────────────────────────────────*/
async function openModal(m) {
  modalOverlay.classList.add("open");
  document.body.style.overflow = "hidden";

  modalBody.innerHTML = `
    <div class="modal-inner">
      ${m.poster && m.poster.startsWith("http")
        ? `<img class="modal-poster" src="${m.poster}" alt="${escHtml(m.title)}">`
        : `<div class="modal-poster-placeholder">🎬</div>`}
      <div class="modal-content">
        <div class="modal-top">
          <h2 class="modal-title">${m.title}</h2>
          <button class="modal-close" id="modalCloseBtn">✕</button>
        </div>
        <div class="modal-badges">
          ${m.rating ? `<span class="badge rating-badge">⭐ ${m.rating}</span>` : ""}
          ${m.year   ? `<span class="badge year-badge">${m.year}</span>` : ""}
          ${m.genres.split(",").slice(0,3).filter(Boolean).map(g =>
            `<span class="badge">${g.trim()}</span>`).join("")}
        </div>
        ${m.overview ? `<p class="modal-overview">${m.overview}</p>` : ""}
        ${m.director ? `<p class="modal-meta"><span>Director </span><strong>${m.director}</strong></p>` : ""}
        ${m.cast     ? `<p class="modal-meta"><span>Cast </span><strong>${m.cast}</strong></p>` : ""}
        <div id="modalRecWrap" style="margin-top:.5rem">
          <p class="modal-rec-label">You might also like</p>
          <div class="modal-rec-grid" id="modalRecGrid">
            ${Array.from({length:6}, () =>
              `<div class="skeleton" style="aspect-ratio:2/3;border-radius:8px"></div>`).join("")}
          </div>
        </div>
      </div>
    </div>`;

  document.getElementById("modalCloseBtn").addEventListener("click", closeModal);

  // Load recommendations
  try {
    const res  = await fetch(`/api/recommend?title=${encodeURIComponent(m.title)}`);
    const data = await res.json();
    const grid = document.getElementById("modalRecGrid");
    grid.innerHTML = "";
    if (data.length) {
      data.slice(0, 6).forEach((r, i) => {
        const c = buildCard(r, i);
        c.addEventListener("click", () => openModal(r));
        grid.appendChild(c);
      });
    } else {
      document.getElementById("modalRecWrap").style.display = "none";
    }
  } catch { /* silent */ }
}

function closeModal() {
  modalOverlay.classList.remove("open");
  document.body.style.overflow = "";
}

modalOverlay?.addEventListener("click", e => {
  if (e.target === modalOverlay) closeModal();
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeModal();
});

/* ── Helpers ─────────────────────────────────────────────────────────────────*/
function escHtml(str) {
  return String(str).replace(/[&<>"']/g, c =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
}

/* ── Boot ────────────────────────────────────────────────────────────────────*/
(async () => {
  await Promise.all([loadFeatured(), loadGenres()]);
  await loadBrowse();
})();
