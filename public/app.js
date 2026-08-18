const serviceButtons = [...document.querySelectorAll('.service-btn')];
const input = document.querySelector('#model');
const searchBtn = document.querySelector('#searchBtn');
const statusBox = document.querySelector('#status');
const resultsBox = document.querySelector('#results');
const template = document.querySelector('#resultTemplate');

let service = 'screen';

function brl(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function setStatus(type, html) {
  statusBox.className = `status ${type || ''}`.trim();
  statusBox.innerHTML = html;
}

function clearStatus() {
  statusBox.className = 'status hidden';
  statusBox.innerHTML = '';
}

serviceButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    serviceButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    service = btn.dataset.service;
    resultsBox.innerHTML = '';
    clearStatus();
    input.focus();
  });
});

async function search() {
  const model = input.value.trim();
  if (model.length < 2) {
    setStatus('error', '<strong>Digite o modelo</strong>Ex.: A55, S24, iPhone 13');
    return;
  }

  searchBtn.disabled = true;
  searchBtn.textContent = 'Buscando...';
  resultsBox.innerHTML = '';
  setStatus('loading', '<strong>Consultando...</strong>Buscando tela original disponível.');

  try {
    const res = await fetch(`/api/search?model=${encodeURIComponent(model)}&service=${service}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Falha na consulta');

    if (!data.available) {
      setStatus('unavailable', `<strong>Consultar o Técnico</strong>${data.detail || 'Modelo não disponível.'}`);
      return;
    }

    clearStatus();
    data.results.forEach(item => {
      const node = template.content.cloneNode(true);
      node.querySelector('.badge').textContent = item.variant;
      node.querySelector('.product').textContent = item.productName;
      node.querySelector('.card-total').textContent = brl(item.cardTotal);
      node.querySelector('.installment').textContent = `10x de ${brl(item.installment10x)}`;
      node.querySelector('.cash-total').textContent = brl(item.cashTotal);
      resultsBox.appendChild(node);
    });
  } catch (err) {
    setStatus('error', '<strong>Consultar o Técnico</strong>Não foi possível atualizar o preço do fornecedor agora.');
  } finally {
    searchBtn.disabled = false;
    searchBtn.textContent = 'Pesquisar';
  }
}

searchBtn.addEventListener('click', search);
input.addEventListener('keydown', e => {
  if (e.key === 'Enter') search();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
