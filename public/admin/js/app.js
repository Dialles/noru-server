(() => {
  const API_BASE = '/api';
  const DEFAULT_TENANT = 'noru';
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const meta = {
    dashboard:['Painel','Dashboard de reviews','Acompanhe os indicadores principais e o status do canal público.'],
    reviews:['Atendimento','Reviews recebidos','Analise comentários, notas baixas e retornos pendentes.'],
    settings:['Ajustes','Configurações do painel','Organize regras de coleta, links externos e mensagens em um único lugar.'],
    qr:['Distribuição','QR Code e link permanente','Gere o QR e mantenha cards impressos válidos.']
  };

  const state = {
    admin: null,
    currentSection: 'dashboard',
    currentFilter: 'all',
    selectedFeedbackId: null,
    settings: {},
    historyItems: []
  };

  const mobileMenu = window.matchMedia('(max-width:820px)');

  function syncSidebarState(){
    const expanded = mobileMenu.matches
      ? document.body.classList.contains('sidebar-open')
      : !document.body.classList.contains('sidebar-collapsed');
    $('#sidebarToggle')?.setAttribute('aria-expanded', String(expanded));
  }

  function toggleSidebar(){
    if(mobileMenu.matches){
      document.body.classList.toggle('sidebar-open');
    }else{
      document.body.classList.toggle('sidebar-collapsed');
      document.body.classList.remove('sidebar-open');
    }
    syncSidebarState();
  }

  function closeMobileSidebar(){
    document.body.classList.remove('sidebar-open');
    syncSidebarState();
  }

  function toast(message){
    const box = document.createElement('div');
    box.className = 'toast-msg';
    box.textContent = message;
    $('#toast')?.appendChild(box);
    setTimeout(() => box.remove(), 2800);
  }

  async function api(path, options = {}){
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');
    if(options.body !== undefined && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');

    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      credentials: 'include',
      body: options.body !== undefined && !(options.body instanceof FormData) ? JSON.stringify(options.body) : options.body
    });

    const data = await safeJson(res);
    if(res.status === 401){
      // No próprio login, um 401 é "senha errada" — não recarrega a tela de
      // auth (evita o flicker); o handler do formulário mostra a mensagem.
      if(!path.startsWith('/admin/auth/login')) showAuth();
      throw new Error(data?.error?.message || 'Sessão expirada. Faça login novamente.');
    }
    if(!res.ok || data?.ok === false){
      throw new Error(data?.error?.message || 'Falha na comunicação com o servidor.');
    }
    return data;
  }

  async function safeJson(res){
    try{return await res.json();}catch(_){return null;}
  }

  function showAuth(setup = false){
    document.body.classList.remove('is-authenticated');
    $('#loginForm').hidden = setup;
    $('#setupForm').hidden = !setup;
    $('#loginError').textContent = '';
    $('#setupError').textContent = '';
    setTimeout(() => (setup ? $('#setupToken') : $('#loginEmail'))?.focus(), 30);
  }

  function hideAuth(){
    document.body.classList.add('is-authenticated');
  }

  async function login(email, password){
    await api('/admin/auth/login', {method:'POST', body:{email, password}});
    await loadProtectedState();
  }

  async function setupAdmin(form){
    const body = {
      setup_token: $('#setupToken').value.trim(),
      tenant_slug: $('#setupTenantSlug').value.trim() || DEFAULT_TENANT,
      tenant_name: 'Noru Sushi Lounge',
      email: $('#setupEmail').value.trim(),
      password: $('#setupPassword').value,
      name: $('#setupName').value.trim() || 'Administrador'
    };

    const res = await fetch(`${API_BASE}/admin/setup`, {
      method: 'POST',
      headers: {'Content-Type':'application/json', 'x-setup-token': body.setup_token},
      body: JSON.stringify(body)
    });
    const data = await safeJson(res);
    if(!res.ok || data?.ok === false) throw new Error(data?.error?.message || 'Não foi possível criar o admin inicial.');

    toast('Admin inicial criado. Entrando no painel.');
    await login(body.email, body.password);
    form.reset();
    $('#setupTenantSlug').value = DEFAULT_TENANT;
    $('#setupName').value = 'Administrador';
  }

  async function logout(){
    try{ await api('/admin/auth/logout', {method:'POST', body:{}}); }
    catch(_){/* sessão pode já estar expirada */}
    state.admin = null;
    showAuth(false);
  }

  async function loadProtectedState(){
    const me = await api('/admin/me');
    state.admin = me.admin;
    $('#adminIdentity').textContent = me.admin?.name || me.admin?.email || 'Admin';
    hideAuth();
    await Promise.all([loadSettings(), loadDashboard(), loadFeedbacks()]);
  }

  async function bootSession(){
    try{
      await loadProtectedState();
    } catch(err){
      console.warn(err);
      showAuth(false);
    }
  }

  async function loadDashboard(){
    const data = await api('/admin/dashboard?days=30');
    const m = data.metrics || {};
    const avg = Number(m.average_rating || 0);
    $('#metricAverage').textContent = avg ? avg.toFixed(1).replace('.', ',') : '--';
    $('#metricTotal').textContent = formatNumber(m.total || 0);
    $('#metricAttention').textContent = formatNumber(m.needs_attention || 0);
    $('#metricClicks').textContent = formatNumber(m.review_clicks || 0);
    $('#metricTotalDelta').textContent = `${formatNumber(m.total || 0)} reviews em 30 dias`;
    $('#summaryRecent').textContent = data.recent?.length ? `${data.recent.length} últimos reviews carregados.` : 'Nenhum review recebido ainda.';
    $('#summaryPromoters').textContent = `${formatNumber(m.promoters || 0)} reviews com nota igual ou acima do corte.`;
    renderRecentHistory(data.recent || []);
  }

  async function loadFeedbacks(filter = state.currentFilter){
    state.currentFilter = filter;
    const table = $('#reviewTable');
    table.innerHTML = '<tr class="loading-row"><td colspan="6">Carregando reviews do servidor...</td></tr>';

    const params = new URLSearchParams({limit:'50', offset:'0'});
    if(filter && filter !== 'all') params.set('status', filter);

    const data = await api(`/admin/feedback?${params.toString()}`);
    renderReviews(data.feedbacks || []);
    const reviewNavCount = $('.nav button[data-section="reviews"] small');
    if(reviewNavCount) reviewNavCount.textContent = formatNumber(data.total || data.feedbacks?.length || 0);
  }

  function renderReviews(items){
    const table = $('#reviewTable');
    if(!items.length){
      table.innerHTML = '<tr><td colspan="6"><div class="empty-state">Nenhum review encontrado para este filtro.</div></td></tr>';
      return;
    }

    table.innerHTML = items.map(item => `
      <tr>
        <td><strong>${escapeHtml(item.customer_name || 'Cliente sem nome')}</strong><br><span class="muted small">${formatDate(item.created_at)}</span></td>
        <td><span class="stars">${stars(Number(item.rating || 0))}</span><br><span class="muted small">${Number(item.rating || 0)}/5</span></td>
        <td>${escapeHtml(shortText(item.comment || 'Sem comentário', 120))}</td>
        <td><span class="muted small">${escapeHtml(item.table_code || 'Página pública')}</span></td>
        <td><span class="status ${statusClass(item.status)}">${statusLabel(item.status)}</span></td>
        <td><button class="btn ghost" type="button" data-open-feedback="${escapeHtml(item.id)}">Abrir</button></td>
      </tr>
    `).join('');
  }

  async function openFeedback(id){
    state.selectedFeedbackId = id;
    const data = await api(`/admin/feedback/${encodeURIComponent(id)}`);
    const f = data.feedback || {};
    const scores = parseJson(f.question_scores_json) || {};

    $('#detailCreatedAt').textContent = formatDate(f.created_at);
    $('#detailCustomer').textContent = f.customer_name || 'Cliente sem nome';
    $('#detailRating').textContent = `${Number(f.rating || 0)}/5 ${stars(Number(f.rating || 0))}`;
    $('#detailContact').textContent = [f.customer_phone, f.customer_email].filter(Boolean).join(' · ') || 'Sem contato autorizado';
    $('#detailOrigin').textContent = [f.table_code, scores.origem].filter(Boolean).join(' · ') || 'Página pública';
    $('#detailComment').textContent = f.comment || 'Sem comentário';
    $('#detailStatus').value = f.status || 'new';
    $('#detailInternalNote').value = f.internal_note || '';
    $('#reviewModal').hidden = false;
  }

  async function saveFeedbackStatus(){
    if(!state.selectedFeedbackId) return;
    await api(`/admin/feedback/${encodeURIComponent(state.selectedFeedbackId)}`, {
      method: 'PATCH',
      body: {
        status: $('#detailStatus').value,
        internal_note: $('#detailInternalNote').value.trim()
      }
    });
    toast('Review atualizado.');
    $('#reviewModal').hidden = true;
    await Promise.all([loadFeedbacks(), loadDashboard()]);
  }

  async function loadSettings(){
    const data = await api('/admin/settings');
    state.settings = data.settings || {};
    fillSettingsForm(state.settings);
    syncQrFromSettings();
  }

  function fillSettingsForm(settings){
    $('#settingsReviewMinRating').value = String(settings.review_min_rating || 4);
    $('#settingsWhatsappUrl').value = settings.whatsapp_url || '';
    $('#settingsGoogleUrl').value = settings.google_review_url || '';
    $('#settingsTripadvisorUrl').value = settings.tripadvisor_review_url || '';
    $('#settingsInstagramUrl').value = settings.instagram_url || '';
    $('#settingsPublicMessage').value = settings.public_message || 'Obrigado por compartilhar sua experiência.';
    $('#settingsNegativeMessage').value = settings.negative_message || 'Obrigado pelo feedback. A equipe irá analisar com atenção.';
    $('#settingsStableQrUrl').value = absoluteUrl(settings.stable_qr_url || defaultPublicUrl());
    $('#settingsPublicPageUrl').value = absoluteUrl(settings.public_page_url || defaultPublicUrl());
  }

  function collectSettingsForm(){
    return {
      review_min_rating: Number($('#settingsReviewMinRating').value),
      whatsapp_url: normalizeOptionalUrl($('#settingsWhatsappUrl').value),
      google_review_url: normalizeOptionalUrl($('#settingsGoogleUrl').value),
      tripadvisor_review_url: normalizeOptionalUrl($('#settingsTripadvisorUrl').value),
      instagram_url: normalizeOptionalUrl($('#settingsInstagramUrl').value),
      public_message: $('#settingsPublicMessage').value.trim(),
      negative_message: $('#settingsNegativeMessage').value.trim(),
      stable_qr_url: normalizeOptionalUrl($('#settingsStableQrUrl').value) || defaultPublicUrl(),
      public_page_url: normalizeOptionalUrl($('#settingsPublicPageUrl').value) || defaultPublicUrl()
    };
  }

  async function saveSettings(overrides = null){
    const body = overrides || collectSettingsForm();
    const data = await api('/admin/settings', {method:'PATCH', body});
    state.settings = data.settings || state.settings;
    fillSettingsForm(state.settings);
    syncQrFromSettings();
    toast('Configurações salvas.');
  }

  function syncQrFromSettings(){
    const stable = absoluteUrl(state.settings.stable_qr_url || $('#settingsStableQrUrl')?.value || defaultPublicUrl());
    const target = absoluteUrl(state.settings.public_page_url || $('#settingsPublicPageUrl')?.value || defaultPublicUrl());
    $('#stableUrl').value = stable;
    $('#targetUrl').value = target;
    renderQr();
  }

  function renderRecentHistory(recent){
    if(!recent.length){
      state.historyItems = [{url: absoluteUrl(state.settings.public_page_url || defaultPublicUrl()), date:'Configuração atual', status:'Atual'}];
    }
    renderHistory();
  }

  function renderHistory(){
    const current = {
      url: $('#targetUrl')?.value || absoluteUrl(state.settings.public_page_url || defaultPublicUrl()),
      date: 'Destino configurado',
      status: 'Atual'
    };
    const items = [current, ...state.historyItems].slice(0, 5);
    $('#historyList').innerHTML = items.map((h,index) => `
      <div class="history-item">
        <div><strong>${escapeHtml(h.url)}</strong><span>${escapeHtml(h.date)}</span></div>
        <span class="status ${index === 0 ? 'done' : ''}">${escapeHtml(h.status)}</span>
      </div>
    `).join('');
  }

  function renderQr(){
    const stable = $('#stableUrl').value.trim() || defaultPublicUrl();
    const target = $('#targetUrl').value.trim() || defaultPublicUrl();
    $('#stableUrlView').textContent = stable;
    $('#dashboardStableUrl').textContent = stable;
    $('#dashboardTargetUrl').textContent = target;
    $('#summaryQr').textContent = `QR aponta para ${stable}`;

    const fallback = $('#qrFallback');
    const canvas = $('#qrCanvas');
    fallback.textContent = stable;
    if(window.QRCode){
      canvas.style.display = 'block';
      fallback.style.display = 'none';
      QRCode.toCanvas(canvas, stable, {width:220, margin:1, color:{dark:'#07101a', light:'#f6efe0'}}, err => {
        if(err){
          canvas.style.display = 'none';
          fallback.style.display = 'grid';
        }
      });
    }else{
      canvas.style.display = 'none';
      fallback.style.display = 'grid';
    }
  }

  async function saveRedirect(){
    const stable = normalizeOptionalUrl($('#stableUrl').value) || defaultPublicUrl();
    const target = normalizeOptionalUrl($('#targetUrl').value) || defaultPublicUrl();
    // Registra o destino anterior como "Anterior" só quando ele de fato mudou
    // (o destino atual já é prefixado por renderHistory, evitando duplicar).
    const previousTarget = absoluteUrl(state.settings.public_page_url || '');
    if(previousTarget && previousTarget !== target){
      state.historyItems.unshift({url: previousTarget, date: new Date().toLocaleString('pt-BR', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'}), status:'Anterior'});
    }
    await saveSettings({stable_qr_url: stable, public_page_url: target});
    renderHistory();
  }

  function downloadQr(){
    const canvas = $('#qrCanvas');
    if(canvas.style.display === 'none'){
      toast('QR ainda não foi gerado.');
      return;
    }
    const a = document.createElement('a');
    a.download = 'noru-qr-code-review.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
  }

  function setSection(id){
    state.currentSection = id;
    $$('.section').forEach(sec => sec.classList.toggle('active', sec.id === id));
    $$('.nav button').forEach(btn => btn.classList.toggle('active', btn.dataset.section === id));
    const [eyebrow, title, subtitle] = meta[id] || meta.dashboard;
    $('#pageEyebrow').textContent = eyebrow;
    $('#pageTitle').textContent = title;
    $('#pageSubtitle').textContent = subtitle;
    if(id === 'qr') renderQr();
    if(mobileMenu.matches) closeMobileSidebar();
  }

  function bindEvents(){
    $('#sidebarToggle')?.addEventListener('click', toggleSidebar);
    $('#sidebarBackdrop')?.addEventListener('click', closeMobileSidebar);
    mobileMenu.addEventListener('change', () => { document.body.classList.remove('sidebar-open'); syncSidebarState(); });

    $$('.nav button[data-section]').forEach(btn => btn.addEventListener('click', () => setSection(btn.dataset.section)));
    $$('[data-section-jump]').forEach(btn => btn.addEventListener('click', () => setSection(btn.dataset.sectionJump)));

    $$('.chip').forEach(chip => chip.addEventListener('click', async () => {
      $$('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      try{ await loadFeedbacks(chip.dataset.filter); }
      catch(err){ toast(err.message); }
    }));

    $('#reviewTable')?.addEventListener('click', ev => {
      const btn = ev.target.closest('[data-open-feedback]');
      if(!btn) return;
      openFeedback(btn.dataset.openFeedback).catch(err => toast(err.message));
    });

    $('#closeReviewModal')?.addEventListener('click', () => $('#reviewModal').hidden = true);
    $('#reviewModal')?.addEventListener('click', ev => { if(ev.target.id === 'reviewModal') $('#reviewModal').hidden = true; });
    $('#saveReviewStatus')?.addEventListener('click', () => saveFeedbackStatus().catch(err => toast(err.message)));

    $('#refreshBtn')?.addEventListener('click', () => loadProtectedState().then(() => toast('Dados atualizados.')).catch(err => toast(err.message)));
    $('#refreshReviewsBtn')?.addEventListener('click', () => loadFeedbacks().then(() => toast('Lista atualizada.')).catch(err => toast(err.message)));
    $('#logoutBtn')?.addEventListener('click', logout);

    $('#saveSettingsBtn')?.addEventListener('click', () => saveSettings().catch(err => toast(err.message)));
    $('#reloadSettingsBtn')?.addEventListener('click', () => loadSettings().then(() => toast('Configurações recarregadas.')).catch(err => toast(err.message)));

    $('#saveRedirectBtn')?.addEventListener('click', () => saveRedirect().catch(err => toast(err.message)));
    $('#stableUrl')?.addEventListener('input', renderQrDebounced);
    $('#targetUrl')?.addEventListener('input', renderQrDebounced);
    $('#copyStableBtn')?.addEventListener('click', async () => {
      try{ await navigator.clipboard.writeText($('#stableUrl').value.trim()); toast('Link fixo copiado.'); }
      catch(_){ toast('Não foi possível copiar automaticamente.'); }
    });
    $('#downloadQrBtn')?.addEventListener('click', downloadQr);
    $('#testTargetBtn')?.addEventListener('click', () => window.open($('#targetUrl').value.trim() || defaultPublicUrl(), '_blank', 'noopener,noreferrer'));
    $('#generateQrBtn')?.addEventListener('click', () => { renderQr(); toast('QR Code gerado.'); });
    $('#generateQrBtnInline')?.addEventListener('click', () => { renderQr(); toast('QR Code gerado.'); });

    $('#loginForm')?.addEventListener('submit', ev => {
      ev.preventDefault();
      $('#loginError').textContent = '';
      login($('#loginEmail').value.trim(), $('#loginPassword').value)
        .catch(err => {
          $('#loginError').textContent = err.message;
          if(/setup/i.test(err.message) || /admin inicial/i.test(err.message)) showAuth(true);
        });
    });

    $('#setupForm')?.addEventListener('submit', ev => {
      ev.preventDefault();
      $('#setupError').textContent = '';
      setupAdmin(ev.currentTarget).catch(err => $('#setupError').textContent = err.message);
    });

    $('#showSetupBtn')?.addEventListener('click', () => showAuth(true));
    $('#showLoginBtn')?.addEventListener('click', () => showAuth(false));
  }

  function stars(score){
    const safe = Math.max(0, Math.min(5, Number(score || 0)));
    return '★★★★★'.slice(0, safe) + '☆☆☆☆☆'.slice(0, 5 - safe);
  }

  function statusClass(status){
    return String(status || 'new');
  }

  function statusLabel(status){
    return ({
      new: 'Nova',
      needs_attention: 'Atenção',
      contacted: 'Contatada',
      resolved: 'Resolvida',
      archived: 'Arquivada',
      promoter: 'Promotora'
    })[status] || status || 'Nova';
  }

  function shortText(value, max){
    const text = String(value || '');
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  }

  function formatDate(value){
    if(!value) return '--';
    const date = new Date(value);
    if(Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('pt-BR', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'});
  }

  function formatNumber(value){
    return Number(value || 0).toLocaleString('pt-BR');
  }

  function parseJson(value){
    if(!value) return null;
    if(typeof value === 'object') return value;
    try{return JSON.parse(value);}catch(_){return null;}
  }

  function defaultPublicUrl(){
    return new URL(`/client/?tenant=${encodeURIComponent(DEFAULT_TENANT)}`, location.origin).href;
  }

  function absoluteUrl(value){
    if(!value) return '';
    try{return new URL(value, location.origin).href;}catch(_){return String(value);}
  }

  function normalizeOptionalUrl(value){
    const raw = String(value || '').trim();
    if(!raw) return '';
    try{return new URL(raw, location.origin).href;}catch(_){throw new Error('Informe uma URL válida.');}
  }

  function escapeHtml(value){
    return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'}[char]));
  }

  function debounce(fn, wait){
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }
  const renderQrDebounced = debounce(renderQr, 150);

  bindEvents();
  syncSidebarState();
  renderQr();
  bootSession();
})();
