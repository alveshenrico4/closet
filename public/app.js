(function () {
  const REF_W = 340, REF_H = 453; // dimensões de referência do canvas p/ escalar miniaturas

  let items = [];
  let looks = [];
  let canvasItems = []; // look em edição: {cid, itemId, src, x, y, w, h, z}
  let selectedId = null;
  let zCounter = 1;

  // ---------- helpers ----------
  function toast(msg, isError) {
    const wrap = document.getElementById("toast-wrap");
    const el = document.createElement("div");
    el.className = "toast" + (isError ? " error" : "");
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  async function api(path, options) {
    const res = await fetch(path, options);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "Erro na requisição.");
    }
    return res.status === 204 ? null : res.json();
  }

  // ---------- NAV ----------
  document.querySelectorAll("nav button").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("nav button").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("view-" + btn.dataset.view).classList.add("active");
      if (btn.dataset.view === "builder") renderTray();
      if (btn.dataset.view === "saved") renderLooks();
    });
  });

  // ---------- CARREGAR DADOS ----------
  async function loadItems() {
    items = await api("/api/items");
    renderWardrobe();
  }
  async function loadLooks() {
    looks = await api("/api/looks");
    renderLooks();
  }

  // ---------- UPLOAD ----------
  const fileInput = document.getElementById("file-input");
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    const category = document.getElementById("category-input").value;

    // card temporário com spinner enquanto o backend remove o fundo
    const grid = document.getElementById("wardrobe-grid");
    document.getElementById("wardrobe-empty").style.display = "none";
    const placeholder = document.createElement("div");
    placeholder.className = "piece processing";
    placeholder.innerHTML = `<div class="spinner"></div><span>removendo fundo…</span>`;
    grid.prepend(placeholder);

    const formData = new FormData();
    formData.append("photo", file);
    formData.append("category", category);

    try {
      const item = await api("/api/items", { method: "POST", body: formData });
      items.unshift(item);
      placeholder.remove();
      renderWardrobe();
      toast(item.bgRemoved ? "Peça adicionada e fundo removido ✓" : "Peça adicionada");
    } catch (err) {
      placeholder.remove();
      toast(err.message, true);
    } finally {
      fileInput.value = "";
    }
  });

  // ---------- GUARDA-ROUPA ----------
  const CATS = ["top", "bottom", "calçado", "casaco", "acessório"];

  function renderWardrobe() {
    const grid = document.getElementById("wardrobe-grid");
    const empty = document.getElementById("wardrobe-empty");
    grid.innerHTML = "";
    empty.style.display = items.length ? "none" : "block";
    items.forEach(item => {
      const div = document.createElement("div");
      div.className = "piece";
      div.innerHTML = `
        <img src="${item.imageUrl}" alt="${item.name || "peça de roupa"}">
        <button class="del" title="remover">×</button>
        <div class="tag">
          <select>${CATS.map(c => `<option ${c === item.category ? "selected" : ""}>${c}</option>`).join("")}</select>
        </div>`;
      div.querySelector("select").addEventListener("change", async e => {
        const category = e.target.value;
        try {
          await api(`/api/items/${item.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ category })
          });
          item.category = category;
        } catch (err) { toast(err.message, true); }
      });
      div.querySelector(".del").addEventListener("click", async () => {
        try {
          await api(`/api/items/${item.id}`, { method: "DELETE" });
          items = items.filter(i => i.id !== item.id);
          renderWardrobe();
          toast("Peça removida");
        } catch (err) { toast(err.message, true); }
      });
      grid.appendChild(div);
    });
  }

  // ---------- TRAY (montar look) ----------
  function renderTray() {
    const tray = document.getElementById("tray");
    tray.innerHTML = "";
    if (!items.length) {
      loadItems();
    }
    items.forEach(item => {
      const div = document.createElement("div");
      div.className = "piece";
      div.innerHTML = `<img src="${item.imageUrl}">`;
      div.addEventListener("click", () => addToCanvas(item));
      tray.appendChild(div);
    });
  }

  function addToCanvas(item) {
    document.getElementById("canvas-hint").style.display = "none";
    canvasItems.push({
      cid: crypto.randomUUID(), itemId: item.id, src: item.imageUrl,
      x: 40, y: 40, w: 130, h: 130, z: zCounter++
    });
    renderCanvas();
  }

  function renderCanvas() {
    const canvas = document.getElementById("canvas");
    canvas.querySelectorAll(".draggable").forEach(n => n.remove());
    canvasItems.forEach(ci => {
      const el = document.createElement("div");
      el.className = "draggable" + (ci.cid === selectedId ? " selected" : "");
      el.style.left = ci.x + "px";
      el.style.top = ci.y + "px";
      el.style.width = ci.w + "px";
      el.style.height = ci.h + "px";
      el.style.zIndex = ci.z;
      el.innerHTML = `<img src="${ci.src}"><div class="remove-piece">×</div><div class="handle"></div>`;
      el.addEventListener("pointerdown", ev => startDrag(ev, ci));
      el.querySelector(".remove-piece").addEventListener("pointerdown", ev => {
        ev.stopPropagation();
        canvasItems = canvasItems.filter(c => c.cid !== ci.cid);
        if (!canvasItems.length) document.getElementById("canvas-hint").style.display = "flex";
        renderCanvas();
      });
      el.querySelector(".handle").addEventListener("pointerdown", ev => startResize(ev, ci));
      canvas.appendChild(el);
    });
  }

  function startDrag(ev, ci) {
    ev.preventDefault();
    selectedId = ci.cid;
    ci.z = zCounter++;
    renderCanvas();
    const canvas = document.getElementById("canvas");
    const rect = canvas.getBoundingClientRect();
    const offX = ev.clientX - rect.left - ci.x;
    const offY = ev.clientY - rect.top - ci.y;
    function move(e) {
      ci.x = Math.max(-ci.w * 0.4, Math.min(rect.width - ci.w * 0.6, e.clientX - rect.left - offX));
      ci.y = Math.max(-ci.h * 0.4, Math.min(rect.height - ci.h * 0.6, e.clientY - rect.top - offY));
      renderCanvas();
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function startResize(ev, ci) {
    ev.stopPropagation();
    ev.preventDefault();
    const startX = ev.clientX, startY = ev.clientY;
    const startW = ci.w, startH = ci.h;
    function move(e) {
      const delta = Math.max(e.clientX - startX, e.clientY - startY);
      ci.w = Math.max(40, startW + delta);
      ci.h = Math.max(40, startH + delta);
      renderCanvas();
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  document.getElementById("clear-canvas").addEventListener("click", () => {
    canvasItems = [];
    document.getElementById("canvas-hint").style.display = "flex";
    renderCanvas();
  });

  // ---------- SALVAR LOOK ----------
  document.getElementById("save-look").addEventListener("click", async () => {
    if (!canvasItems.length) { toast("Monte um look na tela antes de salvar.", true); return; }
    const nameInput = document.getElementById("look-name");
    const name = nameInput.value.trim() || "Look sem nome";
    const pieces = canvasItems.map(ci => ({
      itemId: ci.itemId, imageUrl: ci.src, x: ci.x, y: ci.y, w: ci.w, h: ci.h, z: ci.z
    }));
    try {
      const look = await api("/api/looks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, pieces })
      });
      looks.unshift(look);
      nameInput.value = "";
      canvasItems = [];
      document.getElementById("canvas-hint").style.display = "flex";
      renderCanvas();
      toast("Look salvo ✓");
      document.querySelector('nav button[data-view="saved"]').click();
    } catch (err) { toast(err.message, true); }
  });

  // ---------- LOOKS SALVOS ----------
  function renderLooks() {
    const grid = document.getElementById("looks-grid");
    const empty = document.getElementById("saved-empty");
    grid.innerHTML = "";
    empty.style.display = looks.length ? "none" : "block";
    looks.forEach(look => {
      const card = document.createElement("div");
      card.className = "look-card";
      const thumb = document.createElement("div");
      thumb.className = "thumb";
      look.pieces.forEach(p => {
        const img = document.createElement("img");
        img.src = p.imageUrl;
        img.style.left = (p.x / REF_W * 100) + "%";
        img.style.top = (p.y / REF_H * 100) + "%";
        img.style.width = (p.w / REF_W * 100) + "%";
        img.style.height = (p.h / REF_H * 100) + "%";
        img.style.zIndex = p.z;
        thumb.appendChild(img);
      });
      card.appendChild(thumb);
      const info = document.createElement("div");
      info.className = "info";
      info.innerHTML = `<span>${look.name}</span><button>remover</button>`;
      info.querySelector("button").addEventListener("click", async () => {
        try {
          await api(`/api/looks/${look.id}`, { method: "DELETE" });
          looks = looks.filter(l => l.id !== look.id);
          renderLooks();
        } catch (err) { toast(err.message, true); }
      });
      card.appendChild(info);
      grid.appendChild(card);
    });
  }

  // init
  loadItems().catch(err => toast(err.message, true));
  loadLooks().catch(() => {});
})();
