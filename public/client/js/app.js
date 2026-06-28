(() => {
const qs = new URLSearchParams(location.search);

  const CONFIG = {
    API_BASE: '/api',
    TENANT_SLUG: qs.get('tenant') || qs.get('unidade') || 'noru',
    PUBLIC_REVIEW_MIN_SCORE: 4,
    WHATSAPP_URL: 'https://wa.me/5561992760230',
    PLATFORMS: [
      { id:'google', label:'Google', url:'https://www.google.com/search?q=NORU+Sushi+Lounge+Google+Avalia%C3%A7%C3%A3o' },
      { id:'tripadvisor', label:'Tripadvisor', url:'https://www.tripadvisor.com.br/UserReviewEdit-g303322-d24036991-Noru_Sushi_Noroeste-Brasilia_Federal_District.html' }
    ]
  };

  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const state = {
    overall: 0,
    tags: new Set(),
    focus: '',
    nps: null,
    comment: '',
    name: '',
    whatsapp: '',
    email: '',
    consent: false,
    submitted: false,
    submitting: false,
    serverResult: null,
    step: 0
  };

  const STEPS = [
    { key:'tags', label:'Sensações' },
    { key:'focus', label:'Ponto-chave' },
    { key:'nps', label:'Indicação' },
    { key:'comment', label:'Comentário' },
    { key:'contact', label:'Contato' },
    { key:'publish', label:'Publicar' }
  ];

  function initContext(){
    const mesa = qs.get('mesa') || qs.get('table') || '';
    const comanda = qs.get('comanda') || qs.get('conta') || qs.get('order') || '';
    $('#mesaField').value = mesa;
    $('#comandaField').value = comanda;
  }

  function setOverall(score, opts){
    if(state.submitted) return;
    opts = opts || {};
    const firstScore = !state.overall;
    state.overall = score;
    $('#overall').value = score;

    $$('.star').forEach(btn => {
      const btnScore = Number(btn.dataset.score);
      const selected = btnScore === score;
      btn.classList.toggle('on', btnScore <= score);
      btn.classList.remove('is-preview');
      btn.setAttribute('aria-checked', String(selected));
      btn.tabIndex = selected ? 0 : -1;
    });

    if(opts.focusStar){
      $(`.star[data-score="${score}"]`)?.focus({ preventScroll: true });
    }

    const labels = {
      1:'Sentimos que não foi como deveria. Responda o essencial em poucos toques.',
      2:'Obrigado por sinalizar. Vamos entender rápido onde agir.',
      3:'Experiência regular. Marque o que mais pesou na visita.',
      4:'Boa experiência. Faltam poucos toques para publicar também.',
      5:'Excelente. Vamos deixar seu review pronto para Google ou TripAdvisor.'
    };
    $('#scoreText').textContent = labels[score] || 'Toque nas estrelas para começar.';

    const card = $('.score-card');
    if(card){
      card.classList.remove('score-pulse');
      void card.offsetWidth;
      card.classList.add('score-pulse');
    }

    document.documentElement.classList.add('has-overall');
    $('#flowCard')?.setAttribute('aria-hidden','false');
    if(firstScore){ state.step = 0; }
    renderFlow();
  }

  function initOverall(){
    const stars = $$('.star');
    const group = $('.big-rating');
    const canHover = matchMedia('(hover: hover)').matches;

    stars.forEach((btn, i) => {
      btn.tabIndex = i === 0 ? 0 : -1;
      btn.addEventListener('click', () => setOverall(Number(btn.dataset.score)));
      btn.addEventListener('keydown', ev => {
        if(state.submitted) return;
        if(ev.key === 'ArrowRight' || ev.key === 'ArrowUp'){
          ev.preventDefault();
          setOverall(Math.min(5, (state.overall || 0) + 1), { focusStar: true });
        }
        if(ev.key === 'ArrowLeft' || ev.key === 'ArrowDown'){
          ev.preventDefault();
          setOverall(Math.max(1, (state.overall || 1) - 1), { focusStar: true });
        }
      });
      if(canHover){
        btn.addEventListener('pointerenter', () => {
          if(state.submitted) return;
          const s = Number(btn.dataset.score);
          stars.forEach(x => x.classList.toggle('is-preview', Number(x.dataset.score) <= s));
        });
      }
    });

    if(canHover && group){
      group.addEventListener('pointerleave', () => {
        stars.forEach(x => x.classList.remove('is-preview'));
      });
    }
  }

  function updateProgress(){
    const total = STEPS.length - 1; // exclude the thank-you screen
    const hasScore = Boolean(state.overall);
    const isPublish = STEPS[state.step]?.key === 'publish';
    const current = Math.min(state.step + 1, total);
    $('#flowStepLabel').textContent = hasScore ? STEPS[Math.min(state.step, STEPS.length - 1)].label : 'Início';
    $('#flowStepCount').textContent = !hasScore ? `0/${total}` : (isPublish ? 'Concluído' : `${current}/${total}`);
    $('#flowBar').style.setProperty('--flow-progress', !hasScore ? '0%' : (isPublish ? '100%' : `${(current / total) * 100}%`));
  }

  function setStage(html){
    const stage = $('#flowStage');
    stage.classList.remove('is-entering');
    stage.innerHTML = html;
    requestAnimationFrame(() => stage.classList.add('is-entering'));
  }

  function setActions(html=''){
    $('#flowActions').innerHTML = html;
  }

  function bindAction(id, handler){
    const el = $('#' + id);
    if(el) el.addEventListener('click', handler);
  }

  function renderFlow(){
    const card = $('#flowCard');
    const refocus = !!(card && card.contains(document.activeElement));
    updateProgress();
    $('#status').textContent = '';
    $('#status').className = 'status';
    card?.classList.remove('is-final');

    if(!state.overall){
      setStage(`
        <div class="flow-head">
          <span class="eyebrow">Rápido</span>
          <h2>Escolha a nota geral acima.</h2>
        </div>
        <p class="flow-note">Depois disso, respondemos só o essencial sem transformar o review em um formulário longo.</p>
      `);
      setActions('');
      return;
    }

    const step = STEPS[state.step]?.key || 'publish';
    ({ tags:renderTags, focus:renderFocus, nps:renderNps, comment:renderComment, contact:renderContact, publish:renderPublish }[step])();

    if(refocus){
      const heading = $('#flowStage h2');
      if(heading){
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
    }
  }

  function renderTags(){
    const options = [
      ['Sabor memorável','Comida'],
      ['Atendimento atencioso','Serviço'],
      ['Ambiente elegante','Salão'],
      ['Boa coquetelaria','Bar'],
      ['Tempo alto','Espera'],
      ['Ruído elevado','Ambiente'],
      ['Voltaria','Intenção'],
      ['Ocasião especial','Contexto']
    ];

    setStage(`
      <div class="flow-head">
        <span class="eyebrow">Sensações</span>
        <h2>O que marcou sua visita?</h2>
      </div>
      <div class="flow-options" id="tagOptions">
        ${options.map(([tag,meta]) => `
          <button class="flow-option" type="button" data-tag="${escapeHtml(tag)}" aria-pressed="${state.tags.has(tag)}">
            ${escapeHtml(tag)}<small>${escapeHtml(meta)}</small>
          </button>
        `).join('')}
      </div>
      <p class="flow-note">Toque em uma ou mais opções. Isso substitui várias perguntas longas.</p>
    `);

    $('#tagOptions').addEventListener('click', ev => {
      const btn = ev.target.closest('.flow-option');
      if(!btn) return;
      const tag = btn.dataset.tag;
      state.tags.has(tag) ? state.tags.delete(tag) : state.tags.add(tag);
      btn.setAttribute('aria-pressed', String(state.tags.has(tag)));
      $('#tags').value = Array.from(state.tags).join(', ');
    });

    setActions(`
      <button class="btn" type="button" id="nextStep">Continuar <span aria-hidden="true">→</span></button>
    `);
    bindAction('nextStep', nextStep);
  }

  function renderFocus(){
    const low = state.overall <= 3;
    const options = [
      ['comida', 'Comida', 'sabor, ponto ou apresentação'],
      ['atendimento', 'Atendimento', 'atenção, cordialidade e clareza'],
      ['ambiente', 'Ambiente', 'conforto, luz, música e ruído'],
      ['tempo', 'Tempo', 'espera, pratos ou fechamento'],
      ['valor', 'Valor percebido', 'experiência, qualidade e preço']
    ];

    setStage(`
      <div class="flow-head">
        <span class="eyebrow">Ponto-chave</span>
        <h2>${low ? 'Onde devemos agir primeiro?' : 'Qual ponto mais elevou sua nota?'}</h2>
      </div>
      <div class="flow-options" id="focusOptions">
        ${options.map(([key,label,meta]) => `
          <button class="flow-option" type="button" data-focus="${key}" aria-pressed="${state.focus === key}">
            ${label}<small>${meta}</small>
          </button>
        `).join('')}
      </div>
      <p class="flow-note">Essa resposta ajuda a equipe a entender rapidamente a prioridade da experiência.</p>
    `);

    $('#focusOptions').addEventListener('click', ev => {
      const btn = ev.target.closest('.flow-option');
      if(!btn) return;
      state.focus = btn.dataset.focus;
      $$('#focusOptions .flow-option').forEach(x => x.setAttribute('aria-pressed', String(x === btn)));
      window.setTimeout(nextStep, 90);
    });

    setActions(`
      <button class="btn ghost" type="button" id="prevStep">Voltar</button>
      <button class="btn ghost" type="button" id="skipStep">Pular</button>
    `);
    bindAction('prevStep', prevStep);
    bindAction('skipStep', nextStep);
  }

  function renderNps(){
    setStage(`
      <div class="flow-head">
        <span class="eyebrow">Indicação</span>
        <h2>Você indicaria o NORU?</h2>
      </div>
      <div class="nps-grid" id="npsOptions" role="radiogroup" aria-label="Probabilidade de recomendar de 0 a 10">
        ${Array.from({length:11}, (_,i) => `
          <button class="flow-option nps-choice" type="button" data-nps="${i}" role="radio" aria-checked="${state.nps === i}" aria-pressed="${state.nps === i}">${i}</button>
        `).join('')}
      </div>
      <div class="nps-scale"><span>Pouco provável</span><span>Muito provável</span></div>
      <p class="flow-note">Um toque basta. Essa etapa mede se a experiência vira recomendação real.</p>
    `);

    $('#npsOptions').addEventListener('click', ev => {
      const btn = ev.target.closest('.nps-choice');
      if(!btn) return;
      state.nps = Number(btn.dataset.nps);
      $('#npsValue').value = state.nps;
      $$('#npsOptions .nps-choice').forEach(x => {
        const active = x === btn;
        x.setAttribute('aria-checked', String(active));
        x.setAttribute('aria-pressed', String(active));
      });
      window.setTimeout(nextStep, 90);
    });

    setActions(`
      <button class="btn ghost" type="button" id="prevStep">Voltar</button>
      <button class="btn ghost" type="button" id="skipStep">Pular</button>
    `);
    bindAction('prevStep', prevStep);
    bindAction('skipStep', nextStep);
  }

  function renderComment(){
    setStage(`
      <div class="flow-head">
        <span class="eyebrow">Comentário</span>
        <h2>Quer deixar uma frase?</h2>
      </div>
      <label class="field">
        <span>Comentário opcional</span>
        <textarea id="quickComment" name="comentario" placeholder="Ex.: comida excelente, mas a conta demorou.">${escapeHtml(state.comment)}</textarea>
      </label>
      <p class="flow-note">Uma frase curta já ajuda a equipe e pode orientar seu review público depois.</p>
    `);

    const input = $('#quickComment');
    input.addEventListener('input', () => state.comment = input.value.trim());

    setActions(`
      <button class="btn" type="button" id="nextStep">Continuar <span aria-hidden="true">→</span></button>
      <button class="btn ghost" type="button" id="prevStep">Voltar</button>
      <button class="btn ghost" type="button" id="skipStep">Pular</button>
    `);
    bindAction('nextStep', () => { state.comment = input.value.trim(); nextStep(); });
    bindAction('prevStep', prevStep);
    bindAction('skipStep', nextStep);
  }

  function renderContact(){
    setStage(`
      <div class="flow-head contact-head">
        <span class="eyebrow">Contato</span>
        <h2>Podemos falar com você se precisar?</h2>
      </div>
      <div class="flow-contact">
        <label class="field">
          <span>Nome</span>
          <input id="quickName" name="nome" placeholder="Seu nome" autocomplete="name" value="${escapeHtml(state.name)}" />
        </label>
        <label class="field">
          <span>WhatsApp</span>
          <input id="quickWhatsapp" name="whatsapp" placeholder="(61) 99999-9999" inputmode="tel" autocomplete="tel" value="${escapeHtml(state.whatsapp)}" />
        </label>
        <label class="field">
          <span>E-mail</span>
          <input id="quickEmail" name="email" type="email" placeholder="seu@email.com" autocomplete="email" value="${escapeHtml(state.email)}" />
        </label>
      </div>
      <label class="consent">
        <input type="checkbox" id="quickConsent" name="autorizo_contato" ${state.consent ? 'checked' : ''} />
        <span>Autorizo o NORU a entrar em contato sobre este review.</span>
      </label>
      <p class="flow-note">Campos opcionais. Use WhatsApp ou e-mail para a equipe tratar rapidamente qualquer ponto da experiência.</p>
    `);

    const name = $('#quickName');
    const whatsapp = $('#quickWhatsapp');
    const email = $('#quickEmail');
    const consent = $('#quickConsent');
    const saveContact = () => {
      state.name = name.value.trim();
      state.whatsapp = whatsapp.value.trim();
      state.email = email.value.trim();
      state.consent = consent.checked;
    };
    [name, whatsapp, email].forEach(input => input.addEventListener('input', saveContact));
    consent.addEventListener('change', saveContact);

    setActions(`
      <button class="btn" type="button" id="submitBtn">Finalizar <span aria-hidden="true">→</span></button>
      <button class="btn ghost" type="button" id="prevStep">Voltar</button>
      <button class="btn ghost" type="button" id="skipStep">Pular</button>
    `);
    bindAction('submitBtn', () => { saveContact(); submitReview(); });
    bindAction('skipStep', submitReview);
    bindAction('prevStep', prevStep);
  }

  function renderPublish(){
    const payload = formPayload();
    const result = state.serverResult || {};
    const publicCopy = publicReviewText(payload);
    const recommends = result.next_action
      ? result.next_action === 'external_review'
      : payload.nota_geral >= CONFIG.PUBLIC_REVIEW_MIN_SCORE;
    const message = result.message || (recommends
      ? 'Review registrado. Publique também em uma plataforma e ajude outros clientes a conhecerem o NORU.'
      : 'Review registrado. A equipe irá analisar seu feedback com atenção.');
    const platforms = Array.isArray(result.platforms) && result.platforms.length ? result.platforms : CONFIG.PLATFORMS;

    setStage(`
      <div class="thanks show">
        <div class="jp-mark" aria-hidden="true">礼</div>
        <h2>Obrigado pelo review.</h2>
        <p>${escapeHtml(message)}</p>
        <div class="thanks-actions" id="thanksActions"></div>
        <p class="thanks-copy-note" id="copyNote" role="status" aria-live="polite"></p>
      </div>
    `);
    setActions('');
    $('#flowCard')?.classList.add('is-final');

    if(!recommends && CONFIG.WHATSAPP_URL){
      addPlatformButton({ label:'Falar com a equipe', href:CONFIG.WHATSAPP_URL, platform:'team', feedbackId:result.feedback_id, wide:true });
    }

    platforms.forEach(platform => {
      addPlatformButton({
        label: platform.label ? `Avaliar no ${platform.label}` : 'Publicar review',
        href: platform.url,
        platform: platform.id || 'external',
        feedbackId: result.feedback_id,
        copyText: publicCopy
      });
    });
  }

  function nextStep(){
    state.step = Math.min(STEPS.length - 1, state.step + 1);
    renderFlow();
  }

  function prevStep(){
    state.step = Math.max(0, state.step - 1);
    renderFlow();
  }

  function formPayload(){
    const canContact = state.consent;
    return {
      restaurante:'NORU Sushi Lounge',
      origem: $('#reviewForm [name="origem"]').value,
      data_iso: new Date().toISOString(),
      mesa: $('#mesaField').value || null,
      comanda: $('#comandaField').value || null,
      nota_geral: state.overall,
      metricas: { ponto_chave: state.focus || null },
      tags: Array.from(state.tags),
      nps: state.nps,
      comentario: state.comment,
      nome: canContact ? state.name : '',
      whatsapp: canContact ? state.whatsapp : '',
      email: canContact ? state.email : '',
      autorizo_contato: state.consent,
      user_agent: navigator.userAgent
    };
  }

  function apiPayload(payload){
    const tableParts = [];
    if(payload.mesa) tableParts.push(`mesa:${payload.mesa}`);
    if(payload.comanda) tableParts.push(`comanda:${payload.comanda}`);

    return {
      tenant_slug: CONFIG.TENANT_SLUG,
      rating: payload.nota_geral,
      comment: payload.comentario || undefined,
      customer_name: payload.autorizo_contato ? payload.nome : undefined,
      customer_phone: payload.autorizo_contato ? payload.whatsapp : undefined,
      customer_email: payload.autorizo_contato ? payload.email : undefined,
      visit_date: payload.data_iso.slice(0, 10),
      table_code: tableParts.join(' ') || undefined,
      contact_permission: payload.autorizo_contato,
      question_scores: {
        origem: payload.origem,
        mesa: payload.mesa,
        comanda: payload.comanda,
        ponto_chave: payload.metricas?.ponto_chave || null,
        tags: payload.tags || [],
        nps: payload.nps
      }
    };
  }

  async function postJson(path, body){
    const res = await fetch(`${CONFIG.API_BASE}${path}`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    const data = await safeJson(res);
    if(!res.ok || data?.ok === false){
      throw new Error(data?.error?.message || 'Falha de comunicação com o servidor.');
    }
    return data;
  }

  async function safeJson(res){
    try{return await res.json();}catch(_){return null;}
  }

  async function submitReview(){
    const status = $('#status');
    if(state.submitting || state.submitted) return;
    if(!state.overall){
      status.textContent = 'Selecione a nota geral em estrelas.';
      status.classList.add('error');
      return;
    }

    const submitBtn = $('#submitBtn');
    const skipBtn = $('#skipStep');
    state.submitting = true;
    if(submitBtn) submitBtn.disabled = true;
    if(skipBtn) skipBtn.disabled = true;

    const payload = formPayload();
    status.className = 'status';
    status.textContent = 'Registrando review...';

    try{
      const result = await postJson('/feedback', apiPayload(payload));
      state.serverResult = result;
      state.submitted = true;
      state.step = STEPS.findIndex(step => step.key === 'publish');
      status.textContent = '';
      renderFlow();
    } catch(err){
      console.error(err);
      status.textContent = err?.message || 'Não foi possível enviar agora. Chame a equipe ou tente novamente.';
      status.classList.add('error');
      if(submitBtn) submitBtn.disabled = false;
      if(skipBtn) skipBtn.disabled = false;
    } finally {
      state.submitting = false;
    }
  }

  function platformIcon(platform){
    if(platform === 'google'){
      return `<span class="platform-icon platform-icon-google" aria-hidden="true"><svg viewBox="0 0 32 32" role="img" focusable="false" xmlns="http://www.w3.org/2000/svg"><path fill="none" stroke="currentColor" stroke-width="4.4" stroke-linecap="round" d="M24.7 10.2A10.2 10.2 0 1 0 26 16"/><path fill="none" stroke="currentColor" stroke-width="4.4" stroke-linecap="round" d="M17.1 16H27"/><path fill="none" stroke="#18283a" stroke-width="1.2" stroke-linecap="round" opacity=".7" d="M24.7 10.2A10.2 10.2 0 1 0 26 16M17.1 16H27"/></svg></span>`;
    }
    if(platform === 'tripadvisor'){
      return `<span class="platform-icon platform-icon-tripadvisor" aria-hidden="true"><svg viewBox="0 0 32 32" role="img" focusable="false" xmlns="http://www.w3.org/2000/svg"><path fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" d="M4.8 12.9 3.1 9.1h5.1A15.9 15.9 0 0 1 16 7.2a15.9 15.9 0 0 1 7.8 1.9h5.1l-1.7 3.8"/><circle cx="10.1" cy="17" r="5.2" fill="none" stroke="currentColor" stroke-width="2.8"/><circle cx="21.9" cy="17" r="5.2" fill="none" stroke="currentColor" stroke-width="2.8"/><circle cx="10.1" cy="17" r="1.55" fill="currentColor"/><circle cx="21.9" cy="17" r="1.55" fill="currentColor"/><path fill="currentColor" d="M14 21.1 16 24l2-2.9a5.7 5.7 0 0 1-4 0Z"/><path fill="none" stroke="#18283a" stroke-width="1" stroke-linecap="round" opacity=".72" d="M4.8 12.9 3.1 9.1h5.1A15.9 15.9 0 0 1 16 7.2a15.9 15.9 0 0 1 7.8 1.9h5.1l-1.7 3.8"/></svg></span>`;
    }
    if(platform === 'team'){
      return `<span class="platform-icon platform-icon-team" aria-hidden="true"><svg viewBox="0 0 32 32" role="img" focusable="false" xmlns="http://www.w3.org/2000/svg"><path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round" d="M6 8.4h20a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2H14.6L9 25.6V20.9H6a2 2 0 0 1-2-2v-8.5a2 2 0 0 1 2-2Z"/><path fill="currentColor" d="M11 15.6a1.35 1.35 0 1 1 0-.02zM16 15.6a1.35 1.35 0 1 1 0-.02zM21 15.6a1.35 1.35 0 1 1 0-.02z"/></svg></span>`;
    }
    if(platform === 'instagram'){
      return `<span class="platform-icon" aria-hidden="true">◎</span>`;
    }
    return '';
  }

  function publicReviewText(payload){
    const parts = [`Review do NORU Sushi Lounge: ${payload.nota_geral}/5 estrelas.`];
    if(payload.comentario) parts.push(payload.comentario);
    if(payload.tags?.length) parts.push(`Destaques: ${payload.tags.join(', ')}.`);
    return parts.join('\n\n');
  }

  function addPlatformButton({label, href, platform, copyText, feedbackId, wide=false}){
    const actions = $('#thanksActions');
    if(!href || !actions) return;
    const a = document.createElement('a');
    a.className = 'btn platform-btn' + (wide ? ' is-wide' : '');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.innerHTML = `${platformIcon(platform)}<span>${label}</span>`;
    if(copyText){
      a.title = 'Seu comentário será copiado para você colar na plataforma.';
      a.addEventListener('click', () => {
        copyTextToClipboard(copyText);
        registerPlatformClick(platform, feedbackId);
        const note = $('#copyNote');
        if(note){
          note.textContent = 'Texto copiado — cole no review.';
          note.classList.add('show');
        }
      });
    }
    if(!copyText){
      a.addEventListener('click', () => registerPlatformClick(platform, feedbackId));
    }
    actions.appendChild(a);
  }

  function registerPlatformClick(platform, feedbackId){
    if(!platform) return;
    postJson('/feedback/click', {
      tenant_slug: CONFIG.TENANT_SLUG,
      feedback_id: feedbackId,
      platform
    }).catch(() => {});
  }

  function copyTextToClipboard(value){
    if(navigator.clipboard && window.isSecureContext){
      return navigator.clipboard.writeText(value).catch(() => Promise.resolve());
    }
    const area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly','');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try{ document.execCommand('copy'); }catch(err){}
    document.body.removeChild(area);
    return Promise.resolve();
  }

  function escapeHtml(value){
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[char]));
  }

  async function loadPublicConfig(){
    try{
      const res = await fetch(`${CONFIG.API_BASE}/feedback/config?tenant=${encodeURIComponent(CONFIG.TENANT_SLUG)}`, {
        headers:{'Accept':'application/json'}
      });
      const data = await safeJson(res);
      if(!res.ok || data?.ok === false) throw new Error(data?.error?.message || 'Configuração indisponível.');
      const settings = data.settings || {};
      CONFIG.PUBLIC_REVIEW_MIN_SCORE = Number(settings.review_min_rating || CONFIG.PUBLIC_REVIEW_MIN_SCORE);
      CONFIG.WHATSAPP_URL = settings.whatsapp_url || CONFIG.WHATSAPP_URL;
      if(Array.isArray(settings.platforms) && settings.platforms.length){
        CONFIG.PLATFORMS = settings.platforms.filter(item => item && item.url);
      }
    } catch(err){
      console.warn('Configuração pública não carregada.', err);
    }
  }

  function initReveal(){
    $$('.reveal').forEach(item => item.classList.add('in'));
  }

  function shouldUseRealtimeMotion(){
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse = matchMedia('(pointer: coarse)').matches;
    const narrow = matchMedia('(max-width: 900px)').matches;
    const saveData = navigator.connection && navigator.connection.saveData;
    const lowCpu = navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4;
    return !(reduce || coarse || narrow || saveData || lowCpu || document.visibilityState === 'hidden');
  }

  function initPointerEffects(){
    if(!shouldUseRealtimeMotion()) return;
    const root = document.documentElement;
    const glow = $('#glow');
    let mx = 0, my = 0, px = 0, py = 0;
    let raf = 0, lastX = 0, lastY = 0, hidden = false;

    const render = () => {
      raf = 0;
      if(hidden) return;
      if(glow){
        glow.style.transform = `translate3d(${px}px, ${py}px, 0)`;
      }
      const dx = Math.abs(mx - lastX);
      const dy = Math.abs(my - lastY);
      if(dx < .006 && dy < .006) return;
      lastX = mx;
      lastY = my;
      root.style.setProperty('--noru-shell-x', `${(mx * 8).toFixed(2)}px`);
      root.style.setProperty('--noru-shell-y', `${(my * 6).toFixed(2)}px`);
      root.style.setProperty('--noru-bg-x', `${(mx * -8).toFixed(2)}px`);
      root.style.setProperty('--noru-bg-y', `${(my * -7).toFixed(2)}px`);
      root.style.setProperty('--noru-orb-a-x', `${(mx * 12).toFixed(2)}px`);
      root.style.setProperty('--noru-orb-a-y', `${(my * 8).toFixed(2)}px`);
      root.style.setProperty('--noru-orb-b-x', `${(mx * -10).toFixed(2)}px`);
      root.style.setProperty('--noru-orb-b-y', `${(my * -7).toFixed(2)}px`);
    };

    window.addEventListener('pointermove', e => {
      px = e.clientX;
      py = e.clientY;
      mx = (px / window.innerWidth - .5) * 2;
      my = (py / window.innerHeight - .5) * 2;
      if(glow) glow.style.opacity = '.62';
      if(!raf) raf = requestAnimationFrame(render);
    }, {passive:true});

    if(glow){
      window.addEventListener('pointerleave', () => { glow.style.opacity = '0'; }, {passive:true});
    }
    document.addEventListener('visibilitychange', () => {
      hidden = document.visibilityState === 'hidden';
    }, {passive:true});
  }

  async function boot(){
    initContext();
    initOverall();
    initReveal();
    initPointerEffects();
    renderFlow();
    await loadPublicConfig();
    renderFlow();
  }

  boot();
})();
