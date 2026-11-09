/* Udyam Digital - customer app (vanilla JS, no build step) */
(() => {
  'use strict';

  // ---------------------------------------------------------------- i18n (UI chrome)
  const T = {
    en: {
      tagline: 'Udyam Digital', hero: 'Get your business online in one sitting',
      heroSub: 'Internet, business SIMs, WhatsApp, CCTV, billing, all on one bill. Answer 8 quick questions and get a clear monthly price.',
      start: 'Start with Udyam Saathi', track: 'Track my order', expert: 'Talk to an expert',
      b1: '5-minute setup', b2: 'One bill, one number', b3: 'No visit needed', pick: 'Choose your language',
      typeHere: 'Type or speak your answer…', send: 'Send', steps: ['Advisor', 'Quote', 'KYC', 'Track'],
      seeQuote: 'Customise & buy →', perMonth: '/month', plusGst: '+ GST', bundleReady: 'Your recommended bundle',
      yourBundle: 'Your bundle', addMore: 'Add more (optional)', notAvail: 'Not available for you right now',
      term: 'Contract length', months: 'months', setup: 'One-time setup', firstBill: 'First bill (incl. GST)',
      readyBy: 'Everything live by', inclGst: 'incl. GST', toKyc: 'Continue to KYC →', share: 'Share on WhatsApp',
      connectivity: 'Internet connection', why: 'Why', qty: 'Qty', fixIssues: 'Please fix these before you continue',
      consentTitle: 'Your consent', agree: 'I agree, continue', business: 'Business details', documents: 'Documents',
      review: 'Review & sign', verify: 'Verify my documents', esign: 'E-sign & place order',
      askAnything: 'Ask anything, or say "remove CCTV" / "make it cheaper"…', back: '← Back',
    },
    hi: {
      tagline: 'उद्यम डिजिटल', hero: 'एक ही बार में अपना बिज़नेस डिजिटल बनाइए',
      heroSub: 'इंटरनेट, बिज़नेस सिम, WhatsApp, CCTV, बिलिंग, सब एक बिल पर। 8 आसान सवालों के जवाब दें और एक साफ़ मासिक कीमत पाएँ।',
      start: 'उद्यम साथी से शुरू करें', track: 'मेरा ऑर्डर ट्रैक करें', expert: 'एक्सपर्ट से बात करें',
      b1: '5 मिनट में सेटअप', b2: 'एक बिल, एक नंबर', b3: 'विज़िट की ज़रूरत नहीं', pick: 'अपनी भाषा चुनें',
      typeHere: 'जवाब लिखें या बोलें…', send: 'भेजें', steps: ['सलाहकार', 'कोटेशन', 'KYC', 'ट्रैक'],
      seeQuote: 'बदलें और खरीदें →', perMonth: '/माह', plusGst: '+ GST', bundleReady: 'आपका सुझाया गया बंडल',
      yourBundle: 'आपका बंडल', addMore: 'और जोड़ें (वैकल्पिक)', notAvail: 'अभी आपके लिए उपलब्ध नहीं',
      term: 'कॉन्ट्रैक्ट अवधि', months: 'महीने', setup: 'एक-बार का सेटअप', firstBill: 'पहला बिल (GST सहित)',
      readyBy: 'सब कुछ चालू होगा', inclGst: 'GST सहित', toKyc: 'KYC पर जाएँ →', share: 'WhatsApp पर भेजें',
      connectivity: 'इंटरनेट कनेक्शन', why: 'क्यों', qty: 'संख्या', fixIssues: 'आगे बढ़ने से पहले इन्हें ठीक करें',
      consentTitle: 'आपकी सहमति', agree: 'मैं सहमत हूँ, आगे बढ़ें', business: 'बिज़नेस जानकारी', documents: 'दस्तावेज़',
      review: 'जाँच और हस्ताक्षर', verify: 'मेरे दस्तावेज़ जाँचें', esign: 'ई-साइन करें और ऑर्डर दें',
      askAnything: 'कुछ भी पूछें, या लिखें "CCTV हटा दो" / "सस्ता करो"…', back: '← वापस',
    },
  };
  const t = (k) => (T[S.lang] && T[S.lang][k]) || T.en[k];

  // ---------------------------------------------------------------- state
  const S = {
    lang: localGet('lang') || 'en', meta: null, sid: null, view: 'welcome', messages: [], chips: [], multi: false,
    selected: new Set(), slot: null, progress: 0, profile: {}, rec: null, quote: null, busy: false, tts: false,
    kycStep: 'consent', consent: null, docs: {}, kyc: null, gst: null, udyam: null, order: null, previews: {},
  };
  function localGet(k) { try { return localStorage.getItem('ud_' + k); } catch (e) { return null; } }
  function localSet(k, v) { try { localStorage.setItem('ud_' + k, v); } catch (e) { /* private mode */ } }

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
  const fmtDate = (iso) => { const d = new Date(iso + 'T00:00:00'); return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); };

  async function api(path, body, opts = {}) {
    const init = { method: body === undefined ? 'GET' : 'POST', headers: {} };
    if (body instanceof FormData) init.body = body;
    else if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
    const r = await fetch(path, init);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { const msg = data.detail || 'Something went wrong'; if (!opts.quiet) toast(msg); throw new Error(msg); }
    return data;
  }
  function toast(msg) {
    const el = $('#toast'); el.textContent = msg; el.classList.remove('hidden');
    clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.add('hidden'), 3200);
  }
  function openModal(html) { $('#modal-body').innerHTML = html; $('#modal').classList.remove('hidden'); $('#modal').classList.add('flex'); }
  function closeModal() { $('#modal').classList.add('hidden'); $('#modal').classList.remove('flex'); }
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeModal(); });

  // ---------------------------------------------------------------- shell
  function renderShell() {
    document.documentElement.lang = S.lang;
    const sel = $('#lang-select');
    if (S.meta && !sel.options.length) {
      Object.entries(S.meta.languages).forEach(([k, v]) => sel.add(new Option(v, k)));
    }
    sel.value = S.lang;
    document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t); });
    const order = ['chat', 'quote', 'kyc', 'track'];
    const idx = order.indexOf(S.view);
    const stepper = $('#stepper');
    if (idx >= 0) {
      stepper.classList.remove('hidden');
      stepper.innerHTML = `<div class="flex items-center gap-1.5">${t('steps').map((s, i) => `
        <div class="flex-1"><div class="h-1.5 rounded-full ${i <= idx ? 'bg-brand-600' : 'bg-slate-200'}"></div>
        <div class="mt-1 text-[11px] font-medium ${i === idx ? 'text-brand-700' : 'text-slate-400'}">${esc(s)}</div></div>`).join('')}</div>`;
    } else stepper.classList.add('hidden');
    $('#chat-progress-wrap').classList.toggle('hidden', S.view !== 'chat');
    renderProgress();
    const side = $('#side-steps');
    const items = [['💬', 'Advisor', 'Chat or speak in 10 languages; get a bundle that follows every catalogue rule.'],
      ['🧾', 'Quote & checkout', 'One transparent monthly price; toggle add-ons and contract length.'],
      ['🪪', 'Smart KYC', 'Consent first, GSTIN/Udyam lookup, OCR + validation of documents.'],
      ['📦', 'Tracker', 'Live order status, so no more follow-up calls.']];
    side.innerHTML = items.map(([i, h, d], k) => `<li class="flex gap-3 ${k === idx ? '' : 'opacity-70'}"><span class="mt-0.5 text-lg">${i}</span><div><div class="font-semibold ${k === idx ? 'text-sun-400' : ''}">${h}</div><div class="text-brand-200">${d}</div></div></li>`).join('');
  }
  function go(view) { S.view = view; render(); window.scrollTo({ top: 0 }); }
  function render() {
    renderShell();
    const v = $('#view');
    ({ welcome: viewWelcome, chat: viewChat, quote: viewQuote, kyc: viewKyc, track: viewTrack, lookup: viewLookup }[S.view] || viewWelcome)(v);
  }

  // ---------------------------------------------------------------- welcome
  function viewWelcome(v) {
    const langs = S.meta ? Object.entries(S.meta.languages) : [];
    v.innerHTML = `
      <div class="fade-in flex flex-1 flex-col px-5 pb-8 pt-6">
        <div class="price-hero relative overflow-hidden p-6">
          <div class="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10"></div>
          <div class="absolute -bottom-16 right-10 h-40 w-40 rounded-full bg-sun-400/20"></div>
          <div class="relative">
            <div class="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold">✨ Udyam Saathi · AI advisor</div>
            <h2 class="mt-3 text-2xl font-extrabold leading-snug">${esc(t('hero'))}</h2>
            <p class="mt-2 text-sm text-brand-100">${esc(t('heroSub'))}</p>
          </div>
        </div>
        <div class="mt-4 grid grid-cols-3 gap-2 text-center text-xs font-semibold text-slate-600">
          <div class="card px-2 py-3"><div class="text-xl">⚡</div>${esc(t('b1'))}</div>
          <div class="card px-2 py-3"><div class="text-xl">🧾</div>${esc(t('b2'))}</div>
          <div class="card px-2 py-3"><div class="text-xl">📱</div>${esc(t('b3'))}</div>
        </div>
        <div class="mt-6 text-sm font-semibold text-slate-700">${esc(t('pick'))}</div>
        <div class="mt-2 grid grid-cols-3 gap-2" id="lang-grid">
          ${langs.map(([k, n]) => `<button data-lang="${k}" class="rounded-xl border px-2 py-2.5 text-sm font-semibold ${k === S.lang ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}">${esc(n)}</button>`).join('')}
        </div>
        <div class="mt-auto space-y-2.5 pt-8">
          <button class="btn-primary w-full text-base" id="start-btn">${esc(t('start'))} →</button>
          <div class="grid grid-cols-2 gap-2.5">
            <button class="btn-ghost text-sm" data-nav="lookup">📦 ${esc(t('track'))}</button>
            <button class="btn-ghost text-sm" data-action="callback">☎️ ${esc(t('expert'))}</button>
          </div>
          ${S.sid && S.rec ? `<button class="w-full text-sm font-semibold text-brand-700" data-nav="quote">↩ Resume my quote</button>` : ''}
        </div>
      </div>`;
    v.querySelectorAll('[data-lang]').forEach((b) => b.onclick = () => setLang(b.dataset.lang));
    $('#start-btn').onclick = startChat;
  }
  function setLang(l) { S.lang = l; localSet('lang', l); render(); }

  // ---------------------------------------------------------------- chat
  async function startChat() {
    if (S.starting) return;
    S.starting = true; S.sid = null;
    S.messages = []; S.rec = null; S.quote = null; S.kyc = null; S.docs = {}; S.consent = null; S.order = null; S.kycStep = 'consent';
    go('chat');
    showTyping(true);
    let r;
    try { r = await api('/api/chat/start', { language: S.lang, channel: 'web' }); } finally { S.starting = false; }
    S.sid = r.session_id; localSet('sid', S.sid);
    applyResp(r);
  }

  function applyResp(r) {
    showTyping(false);
    (r.messages || []).forEach((m) => pushMsg('bot', m));
    S.chips = r.chips || []; S.multi = !!r.multi; S.slot = r.slot; S.progress = r.progress || 0; S.profile = r.profile || S.profile;
    S.doneLabel = r.done_label;
    S.selected = new Set(S.chips.filter((c) => c.selected).map((c) => c.value));
    if (r.recommendation) { S.rec = r.recommendation; S.quote = r.quote; pushMsg('bundle', ''); }
    else if (r.quote) S.quote = r.quote;
    if (S.view === 'chat') { renderChips(); renderProgress(); }
    if (S.tts && r.messages && r.messages.length) speak(r.messages.join(' '));
  }

  function pushMsg(role, text) {
    S.messages.push({ role, text });
    const list = $('#chat-list');
    if (list) { list.insertAdjacentHTML('beforeend', msgHtml({ role, text })); scrollChat(); }
  }
  function msgHtml(m) {
    if (m.role === 'bundle') return bundleCard();
    return `<div class="fade-in flex ${m.role === 'user' ? 'justify-end' : 'gap-2'}">
      ${m.role === 'bot' ? '<div class="logo-mark small mt-0.5 shrink-0" style="width:28px;height:28px;font-size:13px;border-radius:9px">A</div>' : ''}
      <div class="bubble ${m.role}">${esc(m.text)}</div></div>`;
  }
  function bundleCard() {
    if (!S.rec || !S.quote) return '';
    const on = S.rec.items.filter((i) => i.on);
    return `<div class="fade-in card overflow-hidden shadow-card">
      <div class="price-hero rounded-none p-4">
        <div class="text-xs font-semibold uppercase tracking-wide text-brand-200">${esc(t('bundleReady'))}</div>
        <div class="mt-1 flex items-end gap-1"><span class="text-3xl font-extrabold">${inr(S.quote.monthly)}</span><span class="pb-1 text-sm text-brand-100">${esc(t('perMonth'))} ${esc(t('plusGst'))}</span></div>
        <div class="text-xs text-brand-100">${S.quote.term} ${esc(t('months'))} · ${esc(t('setup'))} ${inr(S.quote.setup)} · ${esc(t('readyBy'))} ${fmtDate(S.quote.expected_activation)}</div>
      </div>
      <ul class="divide-y divide-slate-100 px-4">
        ${on.map((i) => `<li class="flex items-start justify-between gap-3 py-2.5"><div><div class="text-sm font-semibold">${esc(i.name)} ${i.qty > 1 ? `<span class="text-slate-400">× ${i.qty}</span>` : ''}</div><div class="text-xs text-slate-500">${esc(i.why)}</div></div></li>`).join('')}
      </ul>
      ${S.rec.excluded.length ? `<div class="mx-4 mb-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">ℹ️ ${S.rec.excluded.map((x) => esc(x.why_not)).join('<br>ℹ️ ')}</div>` : ''}
      <div class="flex gap-2 p-4 pt-1"><button class="btn-primary flex-1" data-nav="quote">${esc(t('seeQuote'))}</button></div>
    </div>`;
  }
  function showTyping(on) {
    const list = $('#chat-list'); if (!list) return;
    const ex = $('#typing'); if (ex) ex.remove();
    if (on) { list.insertAdjacentHTML('beforeend', `<div id="typing" class="flex gap-2"><div class="bubble bot typing"><span></span> <span></span> <span></span></div></div>`); scrollChat(); }
  }
  function scrollChat() { const el = $('#chat-scroll'); if (el) el.scrollTop = el.scrollHeight; }

  function viewChat(v) {
    v.innerHTML = `
      <div id="chat-scroll" class="flex-1 overflow-y-auto px-4 py-4" style="max-height:calc(100vh - 300px)">
        <div id="chat-list" class="space-y-3">${S.messages.map(msgHtml).join('')}</div>
      </div>
      <div class="sticky bottom-0 border-t border-slate-100 bg-white">
        <div id="chips" class="scroll-x flex flex-wrap gap-2 px-4 pt-3"></div>
        <form id="chat-form" class="flex items-center gap-2 p-3">
          <button type="button" id="mic-btn" class="icon-btn h-11 w-11 shrink-0 text-lg" title="Speak" aria-label="Speak">🎤</button>
          <input id="chat-input" class="input flex-1" autocomplete="off" placeholder="${esc(S.rec ? t('askAnything') : t('typeHere'))}">
          <button class="btn-primary h-11 shrink-0 px-4 py-0" aria-label="${esc(t('send'))}">➤</button>
        </form>
      </div>`;
    $('#chat-form').onsubmit = (e) => { e.preventDefault(); const val = $('#chat-input').value.trim(); if (val) { $('#chat-input').value = ''; send({ text: val }); } };
    $('#mic-btn').onclick = toggleMic;
    renderChips(); scrollChat();
    if (!S.sid && !S.starting) startChat();
  }
  function renderProgress() { const p = $('#chat-progress'); if (p) p.style.width = S.progress + '%'; }
  function renderChips() {
    const box = $('#chips'); if (!box) return;
    if (!S.chips.length) {
      box.innerHTML = S.rec ? `<button class="chip" data-nav="quote">🧾 ${esc(t('seeQuote'))}</button><button class="chip" data-quick="make it cheaper">💸 Cheaper</button><button class="chip" data-quick="add CCTV">📹 + CCTV</button>` : '';
      box.querySelectorAll('[data-quick]').forEach((b) => b.onclick = () => send({ text: b.dataset.quick }));
      return;
    }
    const many = S.chips.length > 8 && !S.multi;
    box.className = many ? 'scroll-x flex gap-2 px-4 pt-3 max-h-28 flex-wrap overflow-y-auto' : 'flex flex-wrap gap-2 px-4 pt-3';
    box.innerHTML = S.chips.map((c) => `<button class="chip ${S.selected.has(c.value) ? 'selected' : ''}" data-v="${esc(c.value)}">${esc(c.label)}</button>`).join('') +
      (S.multi ? `<button class="chip selected" id="chips-done" style="background:#f59e0b;border-color:#f59e0b">${esc(S.doneLabel || 'Done ✓')}</button>` : '');
    box.querySelectorAll('[data-v]').forEach((b) => b.onclick = () => {
      const val = b.dataset.v;
      if (S.multi) { S.selected.has(val) ? S.selected.delete(val) : S.selected.add(val); b.classList.toggle('selected'); return; }
      send({ value: val, label: b.textContent });
    });
    const done = $('#chips-done');
    if (done) done.onclick = () => {
      const labels = S.chips.filter((c) => S.selected.has(c.value)).map((c) => c.label).join(', ');
      send({ value: [...S.selected].join(','), label: labels || done.textContent });
    };
  }
  async function send({ text, value, label }) {
    if (S.busy) return;
    S.busy = true;
    pushMsg('user', label || text || value);
    S.chips = []; renderChips(); showTyping(true);
    try {
      const r = await api('/api/chat/message', { session_id: S.sid, text: text ?? null, value: value ?? null });
      applyResp(r);
    } catch (e) { showTyping(false); }
    S.busy = false;
  }

  // voice in / out (browser speech APIs, free)
  let recog = null;
  function toggleMic() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast('Voice input works in Chrome / Edge'); return; }
    const btn = $('#mic-btn');
    if (recog) { recog.stop(); return; }
    recog = new SR();
    recog.lang = (S.meta && S.meta.speech[S.lang]) || 'en-IN';
    recog.interimResults = true;
    recog.onresult = (e) => { $('#chat-input').value = [...e.results].map((r) => r[0].transcript).join(''); };
    recog.onend = () => { btn.classList.remove('mic-on'); recog = null; const v = $('#chat-input').value.trim(); if (v) { $('#chat-input').value = ''; send({ text: v }); } };
    recog.onerror = () => toast('Could not hear that, please try again');
    btn.classList.add('mic-on'); recog.start();
  }
  function speak(text) {
    if (!window.speechSynthesis) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[₹]/g, 'rupees '));
    u.lang = (S.meta && S.meta.speech[S.lang]) || 'en-IN';
    speechSynthesis.speak(u);
  }
  $('#tts-btn').onclick = () => { S.tts = !S.tts; $('#tts-btn').classList.toggle('on', S.tts); $('#tts-btn').textContent = S.tts ? '🔊' : '🔈'; toast(S.tts ? 'Replies will be read aloud' : 'Voice replies off'); };

  // ---------------------------------------------------------------- quote
  function viewQuote(v) {
    if (!S.rec) { go(S.sid ? 'chat' : 'welcome'); return; }
    const q = S.quote, rec = S.rec;
    const on = rec.items.filter((i) => i.on || i.priority > 10);
    const addons = rec.items.filter((i) => !i.on && i.priority <= 10);
    const lineBy = Object.fromEntries((q.lines || []).map((l) => [l.product_id, l]));
    const connIds = rec.connectivity_options.map((c) => c.product_id);
    const itemRow = (i) => {
      const l = lineBy[i.product_id];
      const isConn = connIds.includes(i.product_id);
      return `<li class="py-3 ${i.on ? '' : 'opacity-60'}">
        <div class="flex items-start gap-3">
          <label class="switch mt-0.5"><input type="checkbox" data-toggle="${i.product_id}" ${i.on ? 'checked' : ''} ${isConn ? 'disabled' : ''}><span class="track"></span></label>
          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-2">
              <div class="text-sm font-semibold leading-snug">${esc(i.name)}</div>
              <div class="shrink-0 text-right text-sm font-bold">${l ? inr(l.monthly) : '<span class="text-slate-400 font-medium">-</span>'}</div>
            </div>
            <div class="mt-0.5 text-xs text-slate-500">${esc(i.why)}</div>
            <div class="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <div class="flex items-center rounded-lg border border-slate-200">
                <button class="px-2.5 py-1 text-base leading-none" data-qty="${i.product_id}" data-d="-1" aria-label="less">−</button>
                <span class="min-w-[26px] text-center font-semibold text-slate-700">${i.qty}</span>
                <button class="px-2.5 py-1 text-base leading-none" data-qty="${i.product_id}" data-d="1" aria-label="more">+</button>
              </div>
              <span>${esc(i.unit)}${l ? ` · ${inr(l.unit_price)} each` : ''}${l && l.setup_fee ? ` · setup ${inr(l.setup_fee)}` : ''}</span>
            </div>
          </div>
        </div></li>`;
    };
    v.innerHTML = `
      <div class="fade-in space-y-4 px-4 pb-28 pt-4">
        <div class="price-hero p-5">
          <div class="flex items-start justify-between">
            <div>
              <div class="text-xs font-semibold uppercase tracking-wide text-brand-200">${esc(S.profile.business_name || t('yourBundle'))}</div>
              <div class="mt-1 flex items-end gap-1"><span class="text-4xl font-extrabold tracking-tight">${inr(q.monthly)}</span><span class="pb-1.5 text-sm text-brand-100">${esc(t('perMonth'))}</span></div>
              <div class="text-sm text-brand-100">${inr(q.monthly_with_gst)} ${esc(t('inclGst'))} · ${q.lines.length} services · one bill</div>
            </div>
            <div class="rounded-xl bg-white/15 px-2.5 py-1.5 text-center text-[11px] leading-tight"><div class="font-bold text-base">${q.install_days}d</div>to go live</div>
          </div>
          <div class="mt-4 grid grid-cols-3 gap-2 text-center text-[11px]">
            <div class="rounded-xl bg-white/10 p-2"><div class="font-bold text-sm">${inr(q.setup)}</div>${esc(t('setup'))}</div>
            <div class="rounded-xl bg-white/10 p-2"><div class="font-bold text-sm">${inr(q.first_bill)}</div>${esc(t('firstBill'))}</div>
            <div class="rounded-xl bg-white/10 p-2"><div class="font-bold text-sm">${fmtDate(q.expected_activation)}</div>${esc(t('readyBy'))}</div>
          </div>
        </div>

        <div class="card p-4">
          <div class="mb-2 text-sm font-semibold">${esc(t('term'))}</div>
          <div class="seg">${[12, 24, 36].map((m) => `<button data-term="${m}" class="${q.term === m ? 'active' : ''}" ${q.allowed_terms.includes(m) ? '' : 'disabled title="A product in your bundle needs a longer contract"'}>${m} ${esc(t('months'))}</button>`).join('')}</div>
          <div class="mt-2 text-xs text-slate-500">Longer contract = lower monthly price. Prices exclude 18% GST.</div>
        </div>

        ${rec.connectivity_options.length > 1 ? `<div class="card p-4">
          <div class="mb-2 text-sm font-semibold">🌐 ${esc(t('connectivity'))}</div>
          <div class="space-y-2">${rec.connectivity_options.map((c) => `
            <label class="flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${c.product_id === rec.connectivity ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}">
              <input type="radio" name="conn" value="${c.product_id}" class="mt-1 accent-indigo-600" ${c.product_id === rec.connectivity ? 'checked' : ''}>
              <div><div class="text-sm font-semibold">${esc(c.name)}</div><div class="text-xs text-slate-500">${esc(c.description)}</div></div>
            </label>`).join('')}</div></div>` : ''}

        ${q.issues.length ? `<div class="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><div class="font-semibold">⚠️ ${esc(t('fixIssues'))}</div><ul class="mt-1 list-disc pl-5">${q.issues.map((x) => `<li>${esc(x.message)}</li>`).join('')}</ul></div>` : ''}

        <div class="card px-4 py-2">
          <div class="pt-2 text-sm font-semibold">${esc(t('yourBundle'))}</div>
          <ul class="divide-y divide-slate-100">${on.map(itemRow).join('')}</ul>
        </div>

        ${addons.length ? `<details class="card px-4 py-3" ${addons.some((a) => a.on) ? 'open' : ''}>
          <summary class="cursor-pointer text-sm font-semibold">➕ ${esc(t('addMore'))} <span class="font-normal text-slate-400">(${addons.length})</span></summary>
          <ul class="divide-y divide-slate-100">${addons.map(itemRow).join('')}</ul></details>` : ''}

        ${rec.excluded.length ? `<div class="card p-4"><div class="text-sm font-semibold">🚫 ${esc(t('notAvail'))}</div>
          <ul class="mt-2 space-y-1.5 text-xs text-slate-600">${rec.excluded.map((x) => `<li><span class="font-semibold text-slate-800">${esc(x.name)}</span>: ${esc(x.why_not)}</li>`).join('')}</ul></div>` : ''}

        <div class="grid grid-cols-2 gap-2">
          <a class="btn-ghost text-center text-sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(shareText())}">💬 ${esc(t('share'))}</a>
          <button class="btn-ghost text-sm" data-nav="chat">✏️ Ask Saathi</button>
        </div>
      </div>
      <div class="sticky bottom-0 z-10 border-t border-slate-100 bg-white/95 p-3 backdrop-blur">
        <button class="btn-primary w-full" id="to-kyc" ${q.valid ? '' : 'disabled'}>${esc(t('toKyc'))} <span class="font-normal opacity-80">· ${inr(q.monthly)}${esc(t('perMonth'))}</span></button>
      </div>`;
    v.querySelectorAll('[data-term]').forEach((b) => b.onclick = () => updateQuote({ term: +b.dataset.term }));
    v.querySelectorAll('[data-toggle]').forEach((c) => c.onchange = () => { const it = rec.items.find((i) => i.product_id === c.dataset.toggle); it.on = c.checked; updateQuote(); });
    v.querySelectorAll('[data-qty]').forEach((b) => b.onclick = () => { const it = rec.items.find((i) => i.product_id === b.dataset.qty); it.qty = Math.max(1, it.qty + +b.dataset.d); it.on = true; updateQuote(); });
    v.querySelectorAll('input[name=conn]').forEach((r) => r.onchange = async () => { const d = await api('/api/quote/connectivity', { session_id: S.sid, product_id: r.value }); S.rec = d.recommendation; S.quote = d.quote; render(); });
    $('#to-kyc').onclick = () => { go('kyc'); };
  }
  function shareText() {
    const q = S.quote; const on = S.rec.items.filter((i) => i.on);
    return `My Accel Business bundle: ${on.map((i) => `${i.name}${i.qty > 1 ? ' x' + i.qty : ''}`).join(', ')} = ${inr(q.monthly)}/month + GST (${q.term} months). Live in ~${q.install_days} days.`;
  }
  let qTimer = null;
  function updateQuote(extra = {}) {
    clearTimeout(qTimer);
    qTimer = setTimeout(async () => {
      const d = await api('/api/quote', { session_id: S.sid, items: S.rec.items.map((i) => ({ product_id: i.product_id, qty: i.qty, on: i.on })), term: extra.term || S.quote.term });
      S.rec = d.recommendation; S.quote = d.quote;
      const y = window.scrollY; render(); window.scrollTo({ top: y });
    }, 150);
  }

  // ---------------------------------------------------------------- KYC
  const DOCS = [
    ['gst_certificate', '🧾', 'GST certificate', 'REG-06 from the GST portal'],
    ['udyam_certificate', '🏭', 'Udyam certificate', 'From udyamregistration.gov.in'],
    ['signatory_id', '🪪', 'Signatory ID', 'Owner / partner / director'],
    ['address_proof', '💡', 'Address proof', 'Utility bill < 90 days old'],
  ];
  function kycNav() {
    const steps = [['consent', '1', t('consentTitle')], ['business', '2', t('business')], ['documents', '3', t('documents')], ['review', '4', t('review')]];
    const idx = steps.findIndex((s) => s[0] === S.kycStep);
    return `<div class="mb-4 flex items-center justify-between gap-1">${steps.map(([k, n, l], i) => `
      <button class="flex flex-1 flex-col items-center gap-1 text-[11px] font-medium ${i <= idx ? 'text-brand-700' : 'text-slate-400'}" ${i <= idx || (k !== 'consent' && S.consent) ? `data-kyc="${k}"` : 'disabled'}>
        <span class="grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${i < idx ? 'bg-brand-600 text-white' : i === idx ? 'bg-brand-100 text-brand-800 ring-2 ring-brand-500' : 'bg-slate-100'}">${i < idx ? '✓' : n}</span>${esc(l)}</button>`).join('')}</div>`;
  }
  function viewKyc(v) {
    if (!S.sid) { go('welcome'); return; }
    const body = { consent: kycConsent, business: kycBusiness, documents: kycDocuments, review: kycReview }[S.kycStep]();
    v.innerHTML = `<div class="fade-in px-4 pb-10 pt-4">${kycNav()}${body}</div>`;
    if (S._lastKycStep !== S.kycStep) { S._lastKycStep = S.kycStep; window.scrollTo({ top: 0 }); }
    v.querySelectorAll('[data-kyc]').forEach((b) => b.onclick = () => { S.kycStep = b.dataset.kyc; render(); });
    ({ consent: bindConsent, business: bindBusiness, documents: bindDocuments, review: bindReview }[S.kycStep])(v);
  }

  function kycConsent() {
    const hi = S.lang === 'hi';
    const rows = hi ? [
      ['क्या लेंगे', 'GSTIN, Udyam नंबर, GST/Udyam प्रमाणपत्र, हस्ताक्षरकर्ता ID, 90 दिन के अंदर का बिजली बिल।'],
      ['क्यों', 'सिर्फ़ आपके बिज़नेस की पहचान और पता सत्यापित करने और कनेक्शन चालू करने के लिए (टेलीकॉम KYC नियम)।'],
      ['कितने दिन', 'दस्तावेज़ की फ़ोटो सेव नहीं होती। जाँच के बाद केवल छिपे हुए (masked) नंबर और परिणाम रखे जाते हैं।'],
      ['आपके अधिकार', 'आप कभी भी सहमति वापस ले सकते हैं, डेटा देख, सुधार या मिटवा सकते हैं। शिकायत अधिकारी: grievance@accel.example'],
    ] : [
      ['What we collect', 'GSTIN, Udyam number, GST & Udyam certificates, signatory ID, a utility bill under 90 days old. Nothing else.'],
      ['Why', 'Only to verify your business identity and address and to activate your connection (telecom KYC rules). Not for marketing unless you opt in.'],
      ['How long', 'Document photos are never stored, only processed in memory. After checks we keep masked numbers + results for the contract period as the law requires.'],
      ['Your rights', 'Withdraw consent anytime, access, correct or erase your data, and nominate someone. Grievance officer: grievance@accel.example'],
    ];
    return `<div class="card p-5">
      <div class="flex items-center gap-2"><span class="text-2xl">🔒</span><div><div class="text-base font-bold">${esc(t('consentTitle'))}</div><div class="text-xs text-slate-500">Digital Personal Data Protection Act, 2023 · notice v${esc(S.meta.consent_version)}</div></div></div>
      <dl class="mt-4 space-y-3 text-sm">${rows.map(([a, b]) => `<div><dt class="font-semibold text-slate-800">${esc(a)}</dt><dd class="text-slate-600">${esc(b)}</dd></div>`).join('')}</dl>
      <div class="mt-5 space-y-2.5">
        <label class="flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50 p-3 text-sm"><input type="checkbox" id="c-kyc" class="mt-0.5 h-4 w-4 accent-indigo-600" ${S.consent ? 'checked' : ''}><span><b>Verify my KYC documents</b> <span class="text-xs text-red-600">(required)</span><br><span class="text-xs text-slate-500">GST/Udyam registry lookup, OCR of documents</span></span></label>
        <label class="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm"><input type="checkbox" id="c-upd" class="mt-0.5 h-4 w-4 accent-indigo-600" checked><span><b>Order updates on WhatsApp/SMS</b> <span class="text-xs text-slate-400">(optional)</span></span></label>
        <label class="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm"><input type="checkbox" id="c-mkt" class="mt-0.5 h-4 w-4 accent-indigo-600"><span><b>Offers and product news</b> <span class="text-xs text-slate-400">(optional)</span></span></label>
      </div>
      <button class="btn-primary mt-5 w-full" id="consent-btn">${esc(t('agree'))}</button>
      <button class="mt-3 w-full text-xs font-semibold text-brand-700" id="privacy-more">How we protect your data →</button>
      ${S.consent ? `<button class="mt-2 w-full text-xs font-semibold text-red-600" id="withdraw">Withdraw consent & erase my data</button>` : ''}
    </div>`;
  }
  function bindConsent(v) {
    $('#consent-btn').onclick = async () => {
      if (!$('#c-kyc').checked) { toast('KYC consent is needed to verify documents'); return; }
      S.consent = await api('/api/kyc/consent', { session_id: S.sid, purposes: { kyc: true, updates: $('#c-upd').checked, marketing: $('#c-mkt').checked } });
      toast('Consent recorded · ' + S.consent.consent_id);
      S.kycStep = 'business'; render();
    };
    $('#privacy-more').onclick = () => openModal(`<div class="text-lg font-bold">How we protect your data</div>
      <ul class="mt-3 space-y-3 text-sm">${Object.entries(S.meta.retention).map(([k, val]) => `<li><div class="font-semibold capitalize">${esc(k.replace(/_/g, ' '))}</div><div class="text-slate-600">${esc(val)}</div></li>`).join('')}
      <li><div class="font-semibold">Masking</div><div class="text-slate-600">GSTIN, ID and phone numbers are masked on screen, in logs and in the back-office.</div></li>
      <li><div class="font-semibold">Purpose limitation</div><div class="text-slate-600">KYC data is used only for KYC. Marketing needs a separate opt-in.</div></li></ul>
      <button class="btn-primary mt-5 w-full" data-close>OK</button>`);
    const w = $('#withdraw'); if (w) w.onclick = async () => { const r = await api('/api/kyc/withdraw', { session_id: S.sid }); S.consent = null; S.docs = {}; S.kyc = null; toast(r.message); render(); };
  }

  function gstinValid(g) {
    const C = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) return false;
    let tot = 0; for (let i = 0; i < 14; i++) { const p = C.indexOf(g[i]) * (i % 2 ? 2 : 1); tot += Math.floor(p / 36) + (p % 36); }
    return C[(36 - (tot % 36)) % 36] === g[14];
  }
  function regCard(r, kind) {
    if (!r) return '';
    if (!r.found) return `<div class="mt-2 rounded-xl bg-red-50 p-3 text-sm text-red-800">✖ ${esc((r.format && r.format.errors[0]) || 'Not found in the registry')}</div>`;
    if (kind === 'gst') {
      const ok = r.status === 'Active';
      return `<div class="mt-2 rounded-xl border ${ok ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'} p-3 text-sm">
        <div class="flex items-center justify-between"><b>${esc(r.trade_name)}</b><span class="status-pill ${ok ? 'st-pass' : 'st-fail'}">${ok ? '✓' : '✖'} ${esc(r.status)}</span></div>
        <div class="text-xs text-slate-600">${esc(r.legal_name)} · ${esc(r.constitution)}</div><div class="mt-1 text-xs text-slate-600">📍 ${esc(r.address)}</div>
        ${ok ? '' : '<div class="mt-2 text-xs font-semibold text-red-700">Products that need GST cannot be activated on a cancelled/suspended registration.</div>'}</div>`;
    }
    return `<div class="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm"><div class="flex items-center justify-between"><b>${esc(r.enterprise_name)}</b><span class="status-pill st-pass">✓ ${esc(r.enterprise_type)}</span></div>
      <div class="text-xs text-slate-600">${esc(r.nic_description)} · ${esc(r.major_activity)} · ${esc(r.city)}, ${esc(r.state)}</div></div>`;
  }
  function kycBusiness() {
    return `<div class="card space-y-5 p-5">
      <div><div class="text-base font-bold">🏢 ${esc(t('business'))}</div><div class="text-xs text-slate-500">We fetch details from the GST & Udyam registries so you type less.</div></div>
      <div><label class="text-sm font-semibold">GSTIN</label>
        <div class="mt-1 flex gap-2"><input id="gstin" class="input font-mono uppercase" maxlength="15" placeholder="27ABCDE1234F1Z5" value="${esc(S.gstInput || '')}"><button class="btn-ghost px-3 text-sm" id="gst-go">Fetch</button></div>
        <div id="gst-hint" class="mt-1 text-xs text-slate-500">15 characters. Checked instantly for typos.</div><div id="gst-card">${regCard(S.gst, 'gst')}</div></div>
      <div><label class="text-sm font-semibold">Udyam number <span class="font-normal text-slate-400">(optional)</span></label>
        <div class="mt-1 flex gap-2"><input id="udyam" class="input font-mono uppercase" placeholder="UDYAM-MH-00-1234567" value="${esc(S.udyamInput || '')}"><button class="btn-ghost px-3 text-sm" id="ud-go">Fetch</button></div>
        <div id="ud-card">${regCard(S.udyam, 'udyam')}</div>
        <div class="mt-1 text-xs text-slate-500">No Udyam yet? It's free and online at udyamregistration.gov.in, and we can help.</div></div>
      <div class="text-xs text-slate-500">You can also skip this: we'll read the numbers from your certificates.</div>
      <button class="btn-primary w-full" id="biz-next">Next: documents →</button>
    </div>`;
  }
  function bindBusiness() {
    const gi = $('#gstin');
    gi.oninput = () => {
      const g = gi.value.toUpperCase().replace(/\s/g, ''); gi.value = g; S.gstInput = g;
      gi.classList.remove('ok', 'bad');
      if (g.length === 15) { const ok = gstinValid(g); gi.classList.add(ok ? 'ok' : 'bad'); $('#gst-hint').textContent = ok ? '✓ Valid format and check digit' : '✖ Check digit does not match, so there may be a typo'; }
      else $('#gst-hint').textContent = `${g.length}/15 characters`;
    };
    $('#gst-go').onclick = async () => { S.gst = await api('/api/registry/gstin', { value: gi.value }); $('#gst-card').innerHTML = regCard(S.gst, 'gst'); };
    $('#ud-go').onclick = async () => { S.udyamInput = $('#udyam').value.toUpperCase(); S.udyam = await api('/api/registry/udyam', { value: S.udyamInput }); $('#ud-card').innerHTML = regCard(S.udyam, 'udyam'); };
    $('#udyam').oninput = (e) => { S.udyamInput = e.target.value.toUpperCase(); };
    $('#biz-next').onclick = () => { S.kycStep = 'documents'; render(); };
  }

  function docTile([key, icon, name, hint]) {
    const d = S.docs[key];
    const state = !d ? '' : d.loading ? '' : d.missing ? 'err' : (!d.type_ok || d.quality.blurry) ? 'err' : 'done';
    let inner = `<div class="text-xs text-slate-500">${esc(hint)}</div>`;
    if (d && d.loading) inner = `<div class="flex items-center gap-2 text-xs text-brand-700"><span class="spinner"></span> Reading document…</div>`;
    else if (d && d.missing) inner = `<div class="text-xs font-semibold text-red-700">Not provided</div>`;
    else if (d) {
      const f = d.fields || {};
      inner = `<div class="mt-1 flex flex-wrap gap-1">
          ${d.quality.blurry ? '<span class="status-pill st-fail">✖ Too blurry</span>' : '<span class="status-pill st-pass">✓ Readable</span>'}
          ${d.type_ok ? '' : `<span class="status-pill st-fail">✖ Looks like ${esc((d.detected_type || '').replace(/_/g, ' '))}</span>`}
          ${d.deskew_angle ? `<span class="status-pill st-info">↻ straightened ${Math.abs(d.deskew_angle)}°</span>` : ''}
          <span class="status-pill st-info">${esc(d.engine)}</span></div>
        <dl class="mt-2 grid grid-cols-[auto,1fr] gap-x-2 gap-y-0.5 text-[11px]">${Object.entries(f).slice(0, 6).map(([k, val]) => `<dt class="text-slate-400">${esc(k.replace(/_/g, ' '))}</dt><dd class="truncate font-medium text-slate-700">${esc(val)}</dd>`).join('')}</dl>`;
    }
    const prev = S.previews[key];
    return `<div class="doc-tile ${state} p-3" id="tile-${key}">
      <div class="flex gap-3">
        ${prev ? `<img src="${prev}" alt="" class="h-16 w-12 shrink-0 rounded-md border object-cover object-top">` : `<div class="grid h-16 w-12 shrink-0 place-items-center rounded-md bg-slate-100 text-2xl">${icon}</div>`}
        <div class="min-w-0 flex-1"><div class="flex items-center justify-between gap-2"><div class="text-sm font-semibold">${esc(name)}</div>
          <label class="cursor-pointer rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100">${d && !d.loading ? 'Replace' : '📷 Upload'}<input type="file" accept="image/*" capture="environment" class="hidden" data-up="${key}"></label></div>
          ${inner}</div></div></div>`;
  }
  function kycDocuments() {
    return `<div class="space-y-3">
      <div class="card p-4">
        <div class="text-base font-bold">📄 ${esc(t('documents'))}</div>
        <div class="text-xs text-slate-500">Take a photo or upload. We read it instantly; the photo is not stored.</div>
        <div class="mt-3 flex gap-2">
          <select id="sample" class="input py-2 text-sm">${Array.from({ length: 12 }, (_, i) => `K${String(i + 1).padStart(2, '0')}`).map((k) => `<option ${S.sample === k ? 'selected' : ''}>${k}</option>`).join('')}</select>
          <button class="btn-ghost shrink-0 px-3 py-2 text-xs" id="digilocker">🔐 Fetch via DigiLocker<br><span class="font-normal text-slate-400">(demo specimens)</span></button>
        </div>
      </div>
      ${DOCS.map(docTile).join('')}
      <button class="btn-primary w-full" id="verify-btn" ${Object.keys(S.docs).length && !Object.values(S.docs).some((d) => d.loading) ? '' : 'disabled'}>${esc(t('verify'))} →</button>
    </div>`;
  }
  function bindDocuments(v) {
    v.querySelectorAll('[data-up]').forEach((inp) => inp.onchange = async () => {
      const file = inp.files[0]; if (!file) return;
      const key = inp.dataset.up;
      S.previews[key] = URL.createObjectURL(file);
      S.docs[key] = { loading: true }; render();
      const fd = new FormData(); fd.append('session_id', S.sid); fd.append('doc_type', key); fd.append('file', file);
      try { S.docs[key] = await api('/api/kyc/extract', fd); } catch (e) { delete S.docs[key]; }
      S.kyc = null; render();
    });
    $('#digilocker').onclick = async () => {
      S.sample = $('#sample').value;
      DOCS.forEach(([k]) => { S.docs[k] = { loading: true }; S.previews[k] = null; }); render();
      try {
        const r = await api('/api/kyc/sample', { session_id: S.sid, applicant: S.sample });
        S.docs = {};
        r.documents.forEach((d) => { S.docs[d.doc_type] = d; S.previews[d.doc_type] = d.preview || null; });
      } catch (e) { S.docs = {}; }
      S.kyc = null; render();
    };
    $('#verify-btn').onclick = async () => {
      $('#verify-btn').innerHTML = '<span class="spinner"></span>';
      S.kyc = await api('/api/kyc/verify', { session_id: S.sid, gstin: S.gstInput || '', udyam: S.udyamInput || '' });
      if (S.kyc.quote_issues) { S.quote.issues = S.kyc.quote_issues; S.quote.valid = !S.kyc.quote_issues.length; }
      S.kycStep = 'review'; render();
    };
  }

  function kycReview() {
    if (!S.kyc) return `<div class="card p-5 text-sm">Upload your documents first.</div>`;
    const k = S.kyc;
    const color = { verified: 'border-emerald-200 bg-emerald-50 text-emerald-900', needs_attention: 'border-amber-200 bg-amber-50 text-amber-900', action_required: 'border-red-200 bg-red-50 text-red-900' }[k.status];
    const icon = { verified: '✅', needs_attention: '⚠️', action_required: '⛔' }[k.status];
    const pill = { pass: ['st-pass', '✓ Pass'], warn: ['st-warn', '! Check'], fail: ['st-fail', '✖ Fix'] };
    const sorted = [...k.checks].sort((a, b) => ({ fail: 0, warn: 1, pass: 2 }[a.status] - { fail: 0, warn: 1, pass: 2 }[b.status]));
    const canSign = k.status !== 'action_required';
    const qIssues = (S.quote.issues || []);
    return `<div class="space-y-3">
      <div class="rounded-2xl border p-4 ${color}"><div class="text-base font-bold">${icon} ${esc(k.summary)}</div>
        <div class="mt-1 text-xs">${k.pass_count} passed · ${k.warn_count} to check · ${k.fail_count} to fix</div>
        ${k.business ? `<div class="mt-2 text-xs">🏢 ${esc(k.business.trade_name)} · GSTIN ${esc(k.business.gstin_masked)} · ${esc(k.business.gst_status)}</div>` : ''}</div>
      <div class="card divide-y divide-slate-100">${sorted.map((c) => `
        <div class="p-3.5"><div class="flex items-start justify-between gap-2"><div class="text-sm font-semibold">${esc(c.title)}</div><span class="status-pill ${pill[c.status][0]} shrink-0">${pill[c.status][1]}</span></div>
          <div class="mt-0.5 text-xs text-slate-600">${esc(c.message)}</div>
          ${c.action ? `<div class="mt-1.5 text-xs font-semibold text-brand-700">👉 ${esc(c.action)}</div>` : ''}</div>`).join('')}</div>
      ${qIssues.length ? `<div class="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Your verified GST status changes your bundle: ${qIssues.map((x) => esc(x.message)).join(' ')} <button class="mt-2 block font-semibold text-brand-700" data-nav="quote">Review quote →</button></div>` : ''}
      ${canSign ? `<div class="card space-y-3 p-5">
          <div class="text-base font-bold">✍️ ${esc(t('review'))}</div>
          <div class="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">${S.quote.lines.length} services · <b>${inr(S.quote.monthly)}/month + GST</b> · ${S.quote.term} months · setup ${inr(S.quote.setup)}. Aadhaar OTP e-sign is simulated in this demo: enter any 6 digits.</div>
          <input id="name" class="input" placeholder="Your name" autocomplete="name">
          <input id="phone" class="input" placeholder="Mobile number (10 digits)" inputmode="numeric" maxlength="10" autocomplete="tel">
          <input id="otp" class="input tracking-[.4em]" placeholder="OTP ••••••" inputmode="numeric" maxlength="6">
          <button class="btn-primary w-full" id="sign-btn" ${S.quote.valid ? '' : 'disabled'}>${esc(t('esign'))}</button>
        </div>` : `<div class="grid grid-cols-2 gap-2"><button class="btn-primary text-sm" data-kyc="documents">Fix & re-upload</button><button class="btn-ghost text-sm" data-action="callback">Get help</button></div>`}
    </div>`;
  }
  function bindReview() {
    const b = $('#sign-btn'); if (!b) return;
    b.onclick = async () => {
      const name = $('#name').value.trim(), phone = $('#phone').value.trim(), otp = $('#otp').value.trim();
      if (!name) return toast('Please enter your name');
      if (!/^\d{10}$/.test(phone)) return toast('Enter a 10-digit mobile number');
      if (!/^\d{6}$/.test(otp)) return toast('Enter the 6-digit OTP');
      b.innerHTML = '<span class="spinner"></span>';
      try {
        await api('/api/kyc/esign', { session_id: S.sid, otp });
        S.order = await api('/api/orders', { session_id: S.sid, name, phone });
        localSet('order', S.order.id);
        go('track');
      } catch (e) { b.textContent = t('esign'); }
    };
  }

  // ---------------------------------------------------------------- tracker
  function viewLookup(v) {
    v.innerHTML = `<div class="fade-in space-y-4 px-5 pt-6">
      <div class="text-xl font-bold">📦 ${esc(t('track'))}</div>
      <div class="text-sm text-slate-500">No need to call support: see live status here.</div>
      <input id="oid" class="input font-mono uppercase" placeholder="Order ID e.g. UD123456" value="${esc(localGet('order') || '')}">
      <input id="p4" class="input" placeholder="Last 4 digits of your mobile" inputmode="numeric" maxlength="4">
      <button class="btn-primary w-full" id="find">Show status</button>
    </div>`;
    $('#find').onclick = async () => { S.order = await api(`/api/orders/${encodeURIComponent($('#oid').value.trim())}?phone4=${encodeURIComponent($('#p4').value.trim())}`); go('track'); };
  }
  function viewTrack(v) {
    const o = S.order;
    if (!o) { go('lookup'); return; }
    const icon = { done: '✓', current: '•', upcoming: '' };
    v.innerHTML = `<div class="fade-in space-y-4 px-4 pb-10 pt-4">
      <div class="price-hero p-5">
        <div class="flex items-start justify-between"><div><div class="text-xs uppercase tracking-wide text-brand-200">Order ${esc(o.id)}</div>
          <div class="mt-1 text-xl font-extrabold">${esc(o.business_name)}</div>
          <div class="text-sm text-brand-100">${inr(o.monthly)}/month + GST · ${o.term} months</div></div>
          <div class="text-right"><div class="text-3xl font-extrabold">${o.progress}%</div><div class="text-[11px] text-brand-200">as of ${fmtDate(o.today)}</div></div></div>
        <div class="mt-3 h-2 overflow-hidden rounded-full bg-white/20"><div class="h-full rounded-full bg-sun-400" style="width:${o.progress}%"></div></div>
        ${o.current ? `<div class="mt-3 text-sm">Next: <b>${esc(o.current.title)}</b> by ${fmtDate(o.current.eta)}</div>` : '<div class="mt-3 text-sm font-semibold">🎉 All services are live!</div>'}
      </div>
      <div class="card p-5"><ol class="timeline">${o.stages.map((s) => `
        <li class="${s.state}"><span class="node ${s.state === 'done' ? 'bg-brand-600 text-white' : s.state === 'current' ? 'bg-sun-400 text-white ring-4 ring-amber-100' : 'bg-slate-200 text-slate-400'}">${icon[s.state]}</span>
          <div class="flex items-center justify-between gap-2"><div class="text-sm font-semibold ${s.state === 'upcoming' ? 'text-slate-400' : ''}">${esc(s.title)}</div><div class="text-xs text-slate-500">${fmtDate(s.eta)}</div></div>
          <div class="text-xs text-slate-500">${esc(s.note)}</div></li>`).join('')}</ol></div>
      <div class="card p-4"><div class="mb-2 text-sm font-semibold">Your services</div>
        <ul class="divide-y divide-slate-100">${o.products.map((p) => `<li class="flex items-center justify-between py-2 text-sm"><span>${esc(p.name)}${p.qty > 1 ? ` <span class="text-slate-400">× ${p.qty}</span>` : ''}</span>
          <span class="status-pill ${p.status === 'Live' ? 'st-pass' : p.status === 'Installing' ? 'st-warn' : 'st-info'}">${p.status === 'Live' ? '✓' : p.status === 'Installing' ? '⚙' : '🗓'} ${esc(p.status)} · ${fmtDate(p.eta)}</span></li>`).join('')}</ul></div>
      <div class="card p-4 text-sm"><div class="font-semibold">🧰 ${esc(o.partner.type)}</div><div class="text-slate-700">${esc(o.partner.name)}</div><div class="mt-1 text-xs text-slate-500">${esc(o.partner.why)}</div>
        <div class="mt-3 rounded-xl bg-slate-50 p-3 text-xs">📞 One support number for every product: <b>${esc(o.support.single_number)}</b></div></div>
      <div class="card p-4"><div class="mb-2 text-sm font-semibold">💬 Updates sent to ${esc(o.phone_masked)} on WhatsApp</div>
        <div class="space-y-2">${o.notifications.map((n) => `<div class="wa-bubble">${esc(n)}</div>`).join('')}</div></div>
      <button class="btn-ghost w-full text-sm" id="adv">⏩ Demo: simulate next day</button>
      <button class="w-full text-sm font-semibold text-brand-700" data-nav="welcome">Start a new journey</button>
    </div>`;
    $('#adv').onclick = async () => { S.order = await api(`/api/orders/${o.id}/advance?days=1`, {}); render(); };
  }

  // ---------------------------------------------------------------- callback (human handoff)
  function callbackModal() {
    openModal(`<div class="text-lg font-bold">☎️ ${esc(t('expert'))}</div>
      <div class="mt-1 text-sm text-slate-500">A local Accel expert or partner will call you in your language. Your chat so far is shared with them so you don't repeat yourself.</div>
      <div class="mt-4 space-y-2.5"><input id="cb-name" class="input" placeholder="Name"><input id="cb-phone" class="input" placeholder="Mobile number" inputmode="numeric" maxlength="10">
      <select id="cb-slot" class="input"><option>Within 30 minutes</option><option>This evening</option><option>Tomorrow morning</option></select></div>
      <div class="mt-2 text-[11px] text-slate-400">Used only to call you back about this enquiry.</div>
      <div class="mt-4 grid grid-cols-2 gap-2"><button class="btn-ghost" data-close>Cancel</button><button class="btn-primary" id="cb-go">Request call</button></div>`);
    $('#cb-go').onclick = async () => {
      const phone = $('#cb-phone').value.trim();
      if (!/^\d{10}$/.test(phone)) return toast('Enter a 10-digit mobile number');
      const r = await api('/api/callback', { session_id: S.sid, name: $('#cb-name').value.trim() || 'Customer', phone, slot: $('#cb-slot').value });
      closeModal(); toast(r.message);
    };
  }

  // ---------------------------------------------------------------- global events
  document.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) { e.preventDefault(); go(nav.dataset.nav); return; }
    const act = e.target.closest('[data-action="callback"]');
    if (act) { e.preventDefault(); callbackModal(); }
  });
  $('#lang-select').onchange = (e) => {
    setLang(e.target.value);
    if (S.view === 'chat' && !S.rec && S.messages.length <= 2) startChat();
  };

  // ---------------------------------------------------------------- boot
  (async function boot() {
    S.meta = await api('/api/meta');
    const ai = S.meta.llm;
    $('#ai-status').textContent = ai.enabled ? `GenAI on: ${ai.provider} · ${ai.model}`
      : ai.paused ? `GenAI paused (free quota reached, ~${ai.paused_minutes} min): rules mode`
      : 'GenAI off: rules + local OCR mode (add a free Gemini key to enable)';
    if (location.pathname === '/track') S.view = 'lookup';
    render();
  })();
})();
