/* 纯前端应用：公开数据首次导入、本地持久化、hash 路由与管理操作。 */
(() => {
  "use strict";

  const DATA_KEY = "shanjian-tea.products.v1";
  const AUTH_KEY = "shanjian-tea.admin-until.v1";
  // 静态页面内的固定密钥是简易入口验证，不能保护服务器或隐藏数据。
  const ADMIN_KEY = "888888";
  const SESSION_MS = 2 * 60 * 60 * 1000;
  const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
  const $ = (selector) => document.querySelector(selector);
  const form = $("#tea-form");
  const loginDialog = $("#login-dialog");
  const deleteDialog = $("#delete-dialog");
  const state = { products: [], category: "", query: "", editingId: null, image: "", imageBusy: false, imageToken: 0, deleteId: null, authUntil: 0, storageFault: false };
  let toastTimer;

  const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const categories = () => [...new Set(state.products.map((tea) => tea.category))];
  const isValidImage = (image) => typeof image === "string" && (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(image) || /^\.\/assets\/[a-zA-Z0-9_.-]+\.(jpg|jpeg|png|webp|svg)$/i.test(image));
  const isValidProduct = (tea) => tea && typeof tea.id === "string" && tea.id.length > 0 && tea.id.length <= 100 && ["name", "origin", "category", "description"].every((key) => typeof tea[key] === "string" && tea[key].trim().length > 0) && tea.name.length <= 50 && tea.origin.length <= 80 && tea.category.length <= 30 && tea.description.length <= 2000 && Number.isInteger(tea.year) && tea.year >= 1900 && tea.year <= 2100 && isValidImage(tea.image);
  const isValidList = (data) => Array.isArray(data) && data.every(isValidProduct) && new Set(data.map((tea) => tea.id)).size === data.length;

  function showToast(message) {
    clearTimeout(toastTimer);
    $("#toast").textContent = message;
    $("#toast").hidden = false;
    toastTimer = setTimeout(() => { $("#toast").hidden = true; }, 4000);
  }

  function warnStorage(message) {
    $("#storage-warning").textContent = message;
    $("#storage-warning").hidden = false;
  }

  function loadProducts() {
    const seeds = window.TEA_SEED_DATA;
    state.products = isValidList(seeds) ? seeds.map((tea) => ({ ...tea })) : [];
    try {
      const saved = localStorage.getItem(DATA_KEY);
      if (saved !== null) {
        const data = JSON.parse(saved);
        if (!isValidList(data)) throw new Error("Invalid saved data");
        state.products = data;
      } else {
        localStorage.setItem(DATA_KEY, JSON.stringify(state.products));
      }
    } catch (error) {
      state.storageFault = true;
      warnStorage("本地存储不可用或数据无法读取。现展示初始数据，原有存储不会被覆盖。请检查浏览器的站点存储设置。");
    }
    try { state.authUntil = Number(localStorage.getItem(AUTH_KEY)) || 0; } catch (_) { /* 禁用存储时可在本次页面内登录。 */ }
  }

  // 先写入成功，再更新内存和界面；空间不足时保留原有产品。
  function saveProducts(nextProducts) {
    if (state.storageFault) {
      showFormError("本地存储当前不可用，请检查浏览器设置并重新打开页面后再保存。");
      return false;
    }
    try {
      localStorage.setItem(DATA_KEY, JSON.stringify(nextProducts));
      state.products = nextProducts;
      renderAll();
      return true;
    } catch (error) {
      const message = "保存失败，原数据已保留。浏览器空间可能不足，请减小图片，或先导出备份再删除不用的产品。";
      showFormError(message);
      showToast(message);
      return false;
    }
  }

  function authenticated() { return Number.isFinite(state.authUntil) && state.authUntil > Date.now() && state.authUntil <= Date.now() + SESSION_MS + 60000; }

  function requireAuth() {
    if (authenticated()) return true;
    openLogin();
    showToast("请先输入管理密钥，登录后继续操作。");
    return false;
  }

  function openLogin() {
    if (authenticated()) { location.hash = "admin"; return; }
    $("#login-form").reset();
    $("#login-error").hidden = true;
    if (!loginDialog.open) loginDialog.showModal();
  }

  function closeLogin() {
    loginDialog.close();
    if (location.hash === "#admin" && !authenticated()) location.hash = "collection";
  }

  function renderFilters() {
    const kinds = categories();
    if (state.category && !kinds.includes(state.category)) state.category = "";
    $("#category-filters").innerHTML = ["", ...kinds].map((kind) => `<button class="filter-button" type="button" data-category="${escapeHTML(kind)}" aria-pressed="${state.category === kind}">${escapeHTML(kind || "全部茶叶")}</button>`).join("");
    $("#category-options").innerHTML = kinds.map((kind) => `<option value="${escapeHTML(kind)}"></option>`).join("");
  }

  function renderCollection() {
    const query = state.query.toLocaleLowerCase();
    const visible = state.products.filter((tea) => (!state.category || tea.category === state.category) && (!query || `${tea.name} ${tea.origin}`.toLocaleLowerCase().includes(query)));
    $("#product-count").textContent = `共 ${visible.length} 味好茶`;
    $("#empty-state").hidden = visible.length > 0;
    $("#product-grid").innerHTML = visible.map((tea, index) => `<article class="tea-card" style="animation-delay:${Math.min(index, 8) * 35}ms"><a href="#tea/${encodeURIComponent(tea.id)}" aria-label="查看${escapeHTML(tea.name)}详情"><div class="card-image"><img src="${escapeHTML(tea.image)}" alt="${escapeHTML(tea.name)}茶叶示意图" width="600" height="530" loading="lazy" decoding="async"><span class="card-tag">${escapeHTML(tea.category)}</span></div><div class="card-info"><div class="card-title-row"><h3>${escapeHTML(tea.name)}</h3><span class="card-arrow" aria-hidden="true">↗</span></div><div class="card-meta"><span>${escapeHTML(tea.origin)}</span><span class="meta-divider">/</span><span>${tea.year} 年</span></div><p class="card-description">${escapeHTML(tea.description.split("\n")[0])}</p></div></a></article>`).join("");
  }

  function renderAdmin() {
    $("#admin-count").textContent = `(${state.products.length})`;
    const size = (JSON.stringify(state.products).length * 2 / 1024 / 1024).toFixed(2);
    $("#storage-meter").textContent = `数据估算 ${size} MB`;
    $("#admin-list").innerHTML = state.products.length ? state.products.map((tea) => `<article class="admin-list-item"><img src="${escapeHTML(tea.image)}" alt="${escapeHTML(tea.name)}" width="70" height="70" loading="lazy"><div class="admin-list-info"><h3>${escapeHTML(tea.name)}</h3><p>${escapeHTML(tea.category)} · ${escapeHTML(tea.origin)} · ${tea.year} 年</p></div><div class="admin-item-actions"><button class="text-button" type="button" data-action="edit" data-id="${escapeHTML(tea.id)}" aria-label="编辑${escapeHTML(tea.name)}">编辑</button><button class="text-button delete-button" type="button" data-action="delete" data-id="${escapeHTML(tea.id)}" aria-label="删除${escapeHTML(tea.name)}">删除</button></div></article>`).join("") : '<p class="admin-empty">还没有茶叶，添加第一款好茶吧。</p>';
  }

  function currentTeaId() {
    try { return location.hash.startsWith("#tea/") ? decodeURIComponent(location.hash.slice(5)) : null; }
    catch (_) { return null; }
  }

  function renderDetail() {
    const tea = state.products.find((item) => item.id === currentTeaId());
    if (!tea) {
      $("#detail-view").innerHTML = '<div class="not-found"><p class="eyebrow small">TEA NOT FOUND</p><h1 id="detail-title">这款茶暂未在藏</h1><p>它可能已被移除，去看看其他茶叶吧。</p><a class="button primary" href="#collection">返回茶叶列表 ↗</a></div>';
      document.title = "茶叶暂未在藏 · 山间有茗";
      return;
    }
    document.title = `${tea.name} · 山间有茗`;
    $("#detail-view").innerHTML = `<a class="back-link" href="#collection"><span aria-hidden="true">←</span> 返回茶叶品藏</a><div class="detail-layout"><img class="detail-image" src="${escapeHTML(tea.image)}" alt="${escapeHTML(tea.name)}高清茶叶图片" width="1000" height="1000"><div class="detail-copy"><span class="detail-category">${escapeHTML(tea.category)}</span><h1 id="detail-title">${escapeHTML(tea.name)}</h1><dl class="detail-facts"><div><dt>原产地</dt><dd>${escapeHTML(tea.origin)}</dd></div><div><dt>茶叶年份</dt><dd>${tea.year} 年</dd></div><div><dt>茶叶种类</dt><dd>${escapeHTML(tea.category)}</dd></div></dl><h2>关于这味茶</h2><p class="detail-description">${escapeHTML(tea.description)}</p><p class="detail-bottom">一叶一山 · 一茶一味</p></div></div>`;
  }

  function renderAll() {
    renderFilters();
    renderCollection();
    renderAdmin();
    if (location.hash.startsWith("#tea/")) renderDetail();
  }

  // Hash 路由可在 GitHub Pages 的任意子目录中刷新，无需服务器重写。
  function route() {
    const isAdmin = location.hash === "#admin";
    const isDetail = location.hash.startsWith("#tea/");
    $("#home-view").hidden = isDetail || (isAdmin && authenticated());
    $("#detail-view").hidden = !isDetail;
    $("#admin-view").hidden = !isAdmin || !authenticated();
    document.querySelectorAll("[data-nav]").forEach((link) => link.classList.toggle("active", location.hash === `#${link.dataset.nav}`));
    document.title = isAdmin && authenticated() ? "茶叶管理 · 山间有茗" : "山间有茗 · 茶叶品藏";
    if (isDetail) renderDetail();
    if (isAdmin && !authenticated()) openLogin();
    if (isAdmin || isDetail || !location.hash || location.hash === "#home") window.scrollTo({ top: 0, behavior: "instant" });
    else if (["#collection", "#story"].includes(location.hash)) requestAnimationFrame(() => $(location.hash).scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function showFormError(message) {
    $("#form-error").textContent = message;
    $("#form-error").hidden = !message;
  }

  function updateImagePreview() {
    $("#image-preview").hidden = !state.image;
    $("#upload-placeholder").hidden = !!state.image;
    $("#change-image").hidden = !state.image;
    if (state.image) $("#image-preview").src = state.image;
    else $("#image-preview").removeAttribute("src");
  }

  function resetEditor() {
    state.editingId = null;
    state.image = "";
    state.imageBusy = false;
    state.imageToken += 1;
    form.reset();
    $("#editor-title").textContent = "添加新茶";
    $("#editor-mode").textContent = "NEW TEA";
    $("#save-button").textContent = "保存这款茶 ↗";
    $("#save-button").disabled = false;
    $("#cancel-edit").hidden = true;
    $("#image-help").textContent = "自动缩至最长边 1200px 并压缩为 Base64；建议每张不超过 400 KB。";
    showFormError("");
    updateImagePreview();
  }

  function editTea(id) {
    if (!requireAuth()) return;
    const tea = state.products.find((item) => item.id === id);
    if (!tea) return;
    resetEditor();
    state.editingId = id;
    state.image = tea.image;
    ["name", "origin", "year", "category", "description"].forEach((key) => { form.elements.namedItem(key).value = tea[key]; });
    $("#editor-title").textContent = "编辑茶叶";
    $("#editor-mode").textContent = "EDIT TEA";
    $("#save-button").textContent = "保存修改 ↗";
    $("#cancel-edit").hidden = false;
    updateImagePreview();
    $(".editor-panel").scrollIntoView({ behavior: "smooth", block: "start" });
    form.elements.namedItem("name").focus({ preventScroll: true });
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("图片读取失败，请重新选择。"));
      reader.readAsDataURL(file);
    });
  }

  async function compressImage(file) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("请选择 JPG、PNG 或 WebP 格式的图片。");
    if (file.size > MAX_UPLOAD_BYTES) throw new Error("原图超过 8 MB，请先缩小图片后再上传。");
    const source = await readFile(file);
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("无法解码此图片，请选择有效的 JPG、PNG 或 WebP 图片。"));
      img.src = source;
    });
    if (image.naturalWidth * image.naturalHeight > 50000000) throw new Error("图片像素过大，请先缩小至 5000 万像素以内。");
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器无法处理图片，请更换浏览器后重试。");
    context.fillStyle = "#f8f7f2";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let result = canvas.toDataURL("image/jpeg", 0.84);
    if (result.length > 550000) result = canvas.toDataURL("image/jpeg", 0.65);
    if (result.length > 850000) throw new Error("压缩后图片仍然过大，请选择尺寸更小的图片。");
    return result;
  }

  $("#image-input").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!requireAuth()) { event.target.value = ""; return; }
    const token = ++state.imageToken;
    state.imageBusy = true;
    $("#save-button").disabled = true;
    $("#image-help").textContent = "正在压缩图片，请稍候…";
    showFormError("");
    try {
      const result = await compressImage(file);
      if (token !== state.imageToken) return;
      state.image = result;
      updateImagePreview();
      $("#image-help").textContent = `已处理为 JPEG · 约 ${Math.round(result.length * 0.75 / 1024)} KB，保存后写入本地。`;
    } catch (error) {
      if (token !== state.imageToken) return;
      showFormError(error.message || "图片处理失败，请选择其他图片。");
      $("#image-help").textContent = state.image ? "图片未替换，仍保留原图。" : "请选择有效的 JPG、PNG 或 WebP 图片。";
    } finally {
      if (token === state.imageToken) {
        state.imageBusy = false;
        $("#save-button").disabled = false;
        event.target.value = "";
      }
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!requireAuth()) return;
    if (state.imageBusy) { showFormError("图片正在处理中，请稍候再保存。"); return; }
    const values = new FormData(form);
    const tea = {
      id: state.editingId || `tea-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name: String(values.get("name")).trim(), origin: String(values.get("origin")).trim(),
      year: Number(values.get("year")), category: String(values.get("category")).trim(),
      description: String(values.get("description")).trim(), image: state.image
    };
    if (!tea.image) { showFormError("请上传一张茶叶图片。"); $("#image-input").focus(); return; }
    if (!isValidProduct(tea)) { showFormError("请填写所有必填字段，年份应为 1900 至 2100 之间的整数，内容不能只包含空格。"); return; }
    const wasEditing = !!state.editingId;
    if (wasEditing && !state.products.some((item) => item.id === state.editingId)) { showFormError("这款茶已在其他页面被删除，请取消编辑后重新添加。"); return; }
    const nextProducts = wasEditing ? state.products.map((item) => item.id === tea.id ? tea : item) : [...state.products, tea];
    if (saveProducts(nextProducts)) { resetEditor(); showToast(wasEditing ? "茶叶信息已更新，前台同步完成。" : "新茶已入藏，分类与前台同步完成。"); }
  });

  $("#login-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if ($("#admin-key").value !== ADMIN_KEY) {
      $("#login-error").textContent = "密钥不正确，请重新输入。";
      $("#login-error").hidden = false;
      $("#admin-key").setAttribute("aria-invalid", "true");
      $("#admin-key").select();
      return;
    }
    state.authUntil = Date.now() + SESSION_MS;
    try { localStorage.setItem(AUTH_KEY, String(state.authUntil)); } catch (_) { showToast("浏览器未允许保存登录状态，本次页面内仍可管理。"); }
    $("#admin-key").removeAttribute("aria-invalid");
    $("#admin-key").value = "";
    loginDialog.close();
    if (location.hash === "#admin") route(); else location.hash = "admin";
  });

  function exportData() {
    if (!requireAuth()) return;
    const content = `/* 山间有茗公开数据。替换仓库 data/products.js 后部署。\n * 本地旧数据优先；如需载入此版本，请先备份后清除该站点的浏览器数据。\n */\nwindow.TEA_SEED_DATA = ${JSON.stringify(state.products, null, 2).replace(/</g, "\\u003c")};\n`;
    const url = URL.createObjectURL(new Blob([content], { type: "text/javascript;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "products.js";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    showToast("已导出 products.js，可用作备份或仓库公开数据。");
  }

  document.addEventListener("click", (event) => {
    const filter = event.target.closest("[data-category]");
    if (filter) {
      state.category = filter.dataset.category;
      renderFilters();
      renderCollection();
      [...$("#category-filters").children].find((item) => item.dataset.category === state.category)?.focus({ preventScroll: true });
      return;
    }
    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) return;
    switch (actionButton.dataset.action) {
      case "settings": openLogin(); break;
      case "close-login": closeLogin(); break;
      case "clear-filters": state.category = ""; state.query = ""; $("#search-input").value = ""; renderFilters(); renderCollection(); break;
      case "cancel-edit": resetEditor(); break;
      case "edit": editTea(actionButton.dataset.id); break;
      case "delete": {
        if (!requireAuth()) return;
        const tea = state.products.find((item) => item.id === actionButton.dataset.id);
        if (!tea) return;
        state.deleteId = tea.id;
        $("#delete-description").textContent = `即将删除「${tea.name}」。`;
        deleteDialog.showModal();
        break;
      }
      case "cancel-delete": deleteDialog.close(); state.deleteId = null; break;
      case "confirm-delete": {
        deleteDialog.close();
        if (!requireAuth()) return;
        const deletedId = state.deleteId;
        if (deletedId && saveProducts(state.products.filter((tea) => tea.id !== deletedId))) {
          if (state.editingId === deletedId) resetEditor();
          showToast("茶叶已移除，分类与前台同步完成。");
        }
        state.deleteId = null;
        break;
      }
      case "logout":
        state.authUntil = 0;
        try { localStorage.removeItem(AUTH_KEY); } catch (_) { /* 内存退出仍然有效。 */ }
        resetEditor(); location.hash = "collection"; showToast("已退出管理。"); break;
      case "export": exportData(); break;
    }
  });

  $("#search-input").addEventListener("input", (event) => { state.query = event.target.value.trim(); renderCollection(); });
  loginDialog.addEventListener("cancel", (event) => { event.preventDefault(); closeLogin(); });
  deleteDialog.addEventListener("cancel", () => { state.deleteId = null; });
  window.addEventListener("hashchange", route);

  // 同一来源的其他标签页有修改时，立即同步列表、分类与正在查看的详情。
  window.addEventListener("storage", (event) => {
    if (event.key === AUTH_KEY || event.key === null) {
      try { state.authUntil = Number(localStorage.getItem(AUTH_KEY)) || 0; } catch (_) { state.authUntil = 0; }
      if (location.hash === "#admin" && !authenticated()) { resetEditor(); route(); }
    }
    if (event.key !== DATA_KEY && event.key !== null) return;
    try {
      const next = event.newValue === null || event.key === null ? window.TEA_SEED_DATA.map((tea) => ({ ...tea })) : JSON.parse(event.newValue);
      if (!isValidList(next)) throw new Error("Invalid synchronized data");
      state.products = next;
      if (state.editingId && !next.some((tea) => tea.id === state.editingId)) resetEditor();
      renderAll();
      showToast("茶叶品藏已与其他标签页同步。");
    } catch (_) { showToast("其他标签页的数据无法读取，当前展示已保留。"); }
  });

  $("#copyright-year").textContent = new Date().getFullYear();
  loadProducts();
  renderAll();
  route();
})();
