const ENCRYPTED_CHAT_URL = './data/chat.enc.json';

const state = {
  messages: [],
  meta: null,
  mode: 'day',
  dataset: 'daily',
  chart: null,
  labels: [],
  values: [],
  cumulativeValues: [],
  selectedA: null,
  selectedB: null,
  hoverIndex: -1,
  searchTimer: null,
  searchSeq: 0,
};

const els = {
  metaLine: document.getElementById('metaLine'),
  unlockPanel: document.getElementById('unlockPanel'),
  unlockForm: document.getElementById('unlockForm'),
  passwordInput: document.getElementById('passwordInput'),
  unlockButton: document.getElementById('unlockButton'),
  unlockStatus: document.getElementById('unlockStatus'),
  appPanel: document.getElementById('appPanel'),
  lockButton: document.getElementById('lockButton'),
  searchInput: document.getElementById('searchInput'),
  dailyButton: document.getElementById('dailyButton'),
  cumulativeButton: document.getElementById('cumulativeButton'),
  dayButton: document.getElementById('dayButton'),
  monthButton: document.getElementById('monthButton'),
  chatFileInput: document.getElementById('chatFileInput'),
  tickerValue: document.getElementById('tickerValue'),
  tickerQuery: document.getElementById('tickerQuery'),
  tickerDate: document.getElementById('tickerDate'),
  changePill: document.getElementById('changePill'),
  changeDates: document.getElementById('changeDates'),
  changeDelta: document.getElementById('changeDelta'),
  placeholder: document.getElementById('placeholder'),
  chartCanvas: document.getElementById('chartCanvas'),
  statsGrid: document.getElementById('statsGrid'),
  statTotal: document.getElementById('statTotal'),
  statKeyword: document.getElementById('statKeyword'),
  statPeak: document.getElementById('statPeak'),
  statPeakCount: document.getElementById('statPeakCount'),
  statActive: document.getElementById('statActive'),
  statAverage: document.getElementById('statAverage'),
};

const stockPlugin = {
  id: 'stockPlugin',
  afterDraw(chart) {
    const area = chart.chartArea;
    if (!area) return;

    const { ctx, scales } = chart;
    const xs = scales.x;
    const ys = scales.y;
    const values = currentValues();

    const drawMarker = (index, color) => {
      if (index < 0 || index >= state.labels.length) return;
      const x = xs.getPixelForValue(index);
      const y = ys.getPixelForValue(values[index]);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x, area.top);
      ctx.lineTo(x, area.bottom);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    };

    if (state.selectedA && state.selectedB) {
      const left = Math.min(state.selectedA.index, state.selectedB.index);
      const right = Math.max(state.selectedA.index, state.selectedB.index);
      const x1 = xs.getPixelForValue(left);
      const x2 = xs.getPixelForValue(right);
      ctx.save();
      ctx.fillStyle = 'rgba(17, 109, 110, 0.09)';
      ctx.fillRect(x1, area.top, x2 - x1, area.bottom - area.top);
      ctx.restore();
      drawMarker(state.selectedA.index, '#b05a4a');
      drawMarker(state.selectedB.index, '#116d6e');
    } else if (state.selectedA) {
      drawMarker(state.selectedA.index, '#b05a4a');
    }

    if (state.hoverIndex >= 0) {
      const x = xs.getPixelForValue(state.hoverIndex);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x, area.top);
      ctx.lineTo(x, area.bottom);
      ctx.strokeStyle = 'rgba(23, 32, 42, 0.18)';
      ctx.stroke();
      ctx.restore();
    }
  },
};

els.unlockForm.addEventListener('submit', event => {
  event.preventDefault();
  unlockWithPassword();
});

els.lockButton.addEventListener('click', lockApp);
els.dailyButton.addEventListener('click', () => setDataset('daily'));
els.cumulativeButton.addEventListener('click', () => setDataset('cumulative'));
els.dayButton.addEventListener('click', () => setMode('day'));
els.monthButton.addEventListener('click', () => setMode('month'));

els.searchInput.addEventListener('input', () => {
  clearTimeout(state.searchTimer);
  state.searchTimer = setTimeout(() => {
    clearSelection();
    runSearch();
  }, 160);
});

els.chatFileInput.addEventListener('change', async event => {
  const [file] = event.target.files;
  if (!file) return;

  try {
    setBusy(true, 'Dosya okunuyor');
    const raw = await file.text();
    loadChat(raw);
    openApp();
    showPlaceholder('kelime ara');
  } catch {
    els.metaLine.textContent = 'Dosya okunamadi';
  } finally {
    event.target.value = '';
    setBusy(false);
  }
});

async function unlockWithPassword() {
  const password = els.passwordInput.value;
  if (!password) {
    els.unlockStatus.textContent = 'Sifre gerekli';
    return;
  }

  try {
    setBusy(true, 'Sifreli veri aciliyor');
    const encrypted = await fetchEncryptedChat();
    const raw = await decryptChat(encrypted, password);
    loadChat(raw);
    els.passwordInput.value = '';
    els.unlockStatus.textContent = '';
    openApp();
    showPlaceholder('kelime ara');
  } catch {
    els.unlockStatus.textContent = 'Sifre hatali veya veri acilamadi';
  } finally {
    setBusy(false);
  }
}

async function fetchEncryptedChat() {
  const response = await fetch(`${ENCRYPTED_CHAT_URL}?v=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('ENCRYPTED_CHAT_NOT_FOUND');
  return response.json();
}

async function decryptChat(payload, password) {
  const salt = base64ToBytes(payload.salt);
  const iv = base64ToBytes(payload.iv);
  const encrypted = base64ToBytes(payload.data);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: payload.iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted);
  return new TextDecoder().decode(decrypted);
}

function loadChat(raw) {
  const messages = parseChat(raw);
  if (!messages.length) throw new Error('NO_MESSAGES');
  state.messages = messages;
  state.meta = buildMeta(messages);
  els.searchInput.disabled = false;
  els.searchInput.focus();
  setMetaLine();
}

function openApp() {
  els.unlockPanel.hidden = true;
  els.appPanel.hidden = false;
  els.lockButton.hidden = false;
}

function lockApp() {
  state.messages = [];
  state.meta = null;
  els.searchInput.value = '';
  clearSelection();
  showPlaceholder('kilitli');
  if (state.chart) {
    state.chart.destroy();
    state.chart = null;
  }
  els.searchInput.disabled = true;
  els.statsGrid.hidden = true;
  els.appPanel.hidden = true;
  els.lockButton.hidden = true;
  els.unlockPanel.hidden = false;
  els.metaLine.textContent = 'Sifreli veri bekleniyor';
  els.passwordInput.focus();
}

function parseChat(raw) {
  const messages = [];
  let current = null;

  for (const line of raw.split(/\r?\n/)) {
    const parsed = parseChatLine(line);
    if (parsed) {
      if (current) messages.push(current);
      current = parsed;
    } else if (current && line.trim()) {
      current.text += ` ${line.trim()}`;
    }
  }

  if (current) messages.push(current);
  return messages;
}

function parseChatLine(line) {
  let match = line.match(/^\[(\d{1,2})\.(\d{1,2})\.(\d{4}),\s[\d:.]+\]\s.+?:\s(.*)/);
  if (match) return { date: `${pad2(match[1])}.${pad2(match[2])}.${match[3]}`, text: match[4] };

  match = line.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4}),\s.+?\s-\s.+?:\s(.*)/);
  if (match) return { date: `${pad2(match[1])}.${pad2(match[2])}.${normalizeYear(match[3])}`, text: match[4] };

  return null;
}

function buildMeta(messages) {
  const sorted = messages.map(message => message.date).sort((a, b) => dateToObject(a) - dateToObject(b));
  return {
    count: messages.length,
    firstDate: sorted[0],
    lastDate: sorted[sorted.length - 1],
  };
}

function setDataset(dataset) {
  state.dataset = dataset;
  els.dailyButton.classList.toggle('active', dataset === 'daily');
  els.cumulativeButton.classList.toggle('active', dataset === 'cumulative');
  clearSelection();
  if (state.labels.length) renderCurrentView();
}

function setMode(mode) {
  state.mode = mode;
  els.dayButton.classList.toggle('active', mode === 'day');
  els.monthButton.classList.toggle('active', mode === 'month');
  clearSelection();
  runSearch();
}

function runSearch() {
  const query = els.searchInput.value.trim();
  const seq = ++state.searchSeq;

  if (!state.messages.length) {
    showPlaceholder('once chat ac');
    return;
  }

  if (!query) {
    showPlaceholder('kelime ara');
    return;
  }

  const result = searchChat(query, state.mode);
  if (seq !== state.searchSeq) return;

  if (!result.found) {
    showPlaceholder(`"${query}" bulunamadi`);
    return;
  }

  state.labels = result.labels;
  state.values = result.values;
  let total = 0;
  state.cumulativeValues = state.values.map(value => {
    total += value;
    return total;
  });

  renderCurrentView(result.query);
  updateStats(result.query, result.stats);
}

function searchChat(query, mode) {
  const normalizedQuery = normalizeSearchText(query);
  const counts = new Map();
  let total = 0;

  for (const message of state.messages) {
    const text = normalizeSearchText(message.text);
    let count = 0;
    let index = 0;

    while ((index = text.indexOf(normalizedQuery, index)) !== -1) {
      count += 1;
      index += normalizedQuery.length;
    }

    if (!count) continue;
    total += count;
    const key = mode === 'day' ? dayKey(message.date) : monthKey(message.date);
    counts.set(key, (counts.get(key) || 0) + count);
  }

  if (!total) {
    return { query, mode, found: false, labels: [], values: [], stats: null };
  }

  const keys = buildPeriodKeys(mode);
  const labels = keys.map(key => labelForKey(key, mode));
  const values = keys.map(key => counts.get(key) || 0);
  const maxValue = Math.max(...values);
  const maxIndex = values.indexOf(maxValue);
  const activeCount = values.filter(value => value > 0).length;

  return {
    query,
    mode,
    found: true,
    labels,
    values,
    stats: {
      total,
      peakLabel: labels[maxIndex],
      peakCount: maxValue,
      activeCount,
      averageActive: activeCount ? total / activeCount : 0,
    },
  };
}

function buildPeriodKeys(mode) {
  const start = dateToObject(state.meta.firstDate);
  const end = dateToObject(state.meta.lastDate);
  const keys = [];

  if (mode === 'day') {
    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    while (cursor <= last) {
      keys.push(formatDayKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return keys;
  }

  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= last) {
    keys.push(formatMonthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return keys;
}

function renderCurrentView(query = els.searchInput.value.trim()) {
  const values = currentValues();
  const lastIndex = values.length - 1;
  els.tickerQuery.textContent = `"${query}" (${state.dataset === 'daily' ? 'gunluk' : 'kumulatif'})`;
  els.tickerValue.textContent = values[lastIndex].toLocaleString('tr-TR');
  els.tickerDate.textContent = state.labels[lastIndex];
  renderChart(state.labels, values);
}

function renderChart(labels, values) {
  els.placeholder.style.display = 'none';
  els.chartCanvas.hidden = false;

  if (state.chart) state.chart.destroy();

  const isDaily = state.dataset === 'daily';
  const lineColor = isDaily ? '#b05a4a' : '#116d6e';

  state.chart = new Chart(els.chartCanvas, {
    type: 'line',
    plugins: [stockPlugin],
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: lineColor,
        backgroundColor: context => {
          const area = context.chart.chartArea;
          if (!area) return 'transparent';
          const gradient = context.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
          gradient.addColorStop(0, isDaily ? 'rgba(176, 90, 74, 0.2)' : 'rgba(17, 109, 110, 0.2)');
          gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
          return gradient;
        },
        pointBackgroundColor: lineColor,
        pointBorderColor: '#fff',
        pointBorderWidth: 1.5,
        pointRadius: values.length > 90 ? 0 : 3,
        pointHoverRadius: 6,
        borderWidth: 3,
        fill: true,
        tension: 0.34,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 260 },
      interaction: { mode: 'index', intersect: false },
      onHover: (event, _elements, chart) => {
        if (!event.native) return;
        const points = chart.getElementsAtEventForMode(event.native, 'index', { intersect: false }, false);
        if (!points.length) return;
        const index = points[0].index;
        state.hoverIndex = index;
        els.tickerValue.textContent = values[index].toLocaleString('tr-TR');
        els.tickerDate.textContent = labels[index];
        chart.update('none');
      },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
      },
      scales: {
        x: {
          grid: { color: 'rgba(23, 32, 42, 0.07)', drawTicks: false },
          ticks: {
            color: '#667085',
            maxTicksLimit: state.mode === 'day' ? 9 : 16,
            maxRotation: 0,
            padding: 10,
          },
          border: { color: 'rgba(23, 32, 42, 0.14)' },
        },
        y: {
          position: 'right',
          grid: { color: 'rgba(23, 32, 42, 0.07)', drawTicks: false },
          ticks: { color: '#667085', precision: 0, padding: 10 },
          border: { color: 'rgba(23, 32, 42, 0.14)' },
        },
      },
    },
  });

  els.chartCanvas.onclick = event => {
    if (!state.chart) return;
    const points = state.chart.getElementsAtEventForMode(event, 'index', { intersect: false }, false);
    if (points.length) applySelection(points[0].index);
  };

  els.chartCanvas.onmouseleave = () => {
    state.hoverIndex = -1;
    if (state.chart) state.chart.update('none');
  };
}

function applySelection(index) {
  const values = currentValues();
  if (!state.selectedA) {
    state.selectedA = { index };
  } else if (!state.selectedB && index !== state.selectedA.index) {
    state.selectedB = { index };
    const a = state.selectedA.index < state.selectedB.index ? state.selectedA : state.selectedB;
    const b = state.selectedA.index < state.selectedB.index ? state.selectedB : state.selectedA;
    const delta = values[b.index] - values[a.index];
    const percent = values[a.index] > 0 ? ((delta / values[a.index]) * 100).toFixed(1) : 'sonsuz';
    const sign = delta >= 0 ? '+' : '';
    els.changeDates.textContent = `${state.labels[a.index]} -> ${state.labels[b.index]}`;
    els.changeDelta.textContent = `${sign}${delta} (${sign}${percent}%)`;
    els.changeDelta.className = delta >= 0 ? 'pos' : 'neg';
    els.changePill.classList.add('visible');
  } else {
    state.selectedA = { index };
    state.selectedB = null;
    els.changePill.classList.remove('visible');
  }

  if (state.chart) state.chart.update('none');
}

function clearSelection() {
  state.selectedA = null;
  state.selectedB = null;
  els.changePill.classList.remove('visible');
  if (state.chart) state.chart.update('none');
}

function showPlaceholder(text) {
  state.labels = [];
  state.values = [];
  state.cumulativeValues = [];
  state.hoverIndex = -1;
  els.placeholder.textContent = text;
  els.placeholder.style.display = 'grid';
  els.chartCanvas.hidden = true;
  els.statsGrid.hidden = true;
  els.tickerValue.textContent = '-';
  els.tickerQuery.textContent = '-';
  els.tickerDate.textContent = text;
  els.changePill.classList.remove('visible');
  if (state.chart) {
    state.chart.destroy();
    state.chart = null;
  }
}

function updateStats(query, stats) {
  els.statTotal.textContent = stats.total.toLocaleString('tr-TR');
  els.statKeyword.textContent = `"${query}"`;
  els.statPeak.textContent = stats.peakLabel;
  els.statPeakCount.textContent = `${stats.peakCount} kez`;
  els.statActive.textContent = stats.activeCount.toLocaleString('tr-TR');
  els.statAverage.textContent = stats.averageActive.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
  els.statsGrid.hidden = false;
}

function setMetaLine() {
  els.metaLine.textContent = `${state.meta.count.toLocaleString('tr-TR')} mesaj | ${state.meta.firstDate} - ${state.meta.lastDate}`;
}

function setBusy(busy, label = '') {
  els.unlockButton.disabled = busy;
  els.unlockStatus.textContent = label;
}

function currentValues() {
  return state.dataset === 'daily' ? state.values : state.cumulativeValues;
}

function labelForKey(key, mode) {
  if (mode === 'day') {
    const [year, month, day] = key.split('-');
    return `${day}.${month}.${year}`;
  }

  const [year, month] = key.split('-');
  const months = ['Ocak', 'Subat', 'Mart', 'Nisan', 'Mayis', 'Haziran', 'Temmuz', 'Agustos', 'Eylul', 'Ekim', 'Kasim', 'Aralik'];
  return `${months[Number(month) - 1]} ${year}`;
}

function dayKey(date) {
  const [day, month, year] = date.split('.');
  return `${year}-${month}-${day}`;
}

function monthKey(date) {
  const [, month, year] = date.split('.');
  return `${year}-${month}`;
}

function dateToObject(date) {
  const [day, month, year] = date.split('.').map(Number);
  return new Date(year, month - 1, day);
}

function formatDayKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatMonthKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

function normalizeSearchText(value) {
  return value.toLocaleLowerCase('tr-TR');
}

function normalizeYear(year) {
  return year.length === 2 ? `20${year}` : year;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
