const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const SUPPLIER = 'https://zakkacell.com';

function normalize(text = '') {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function roundUp10(value) { return Math.ceil((value - 1e-9) / 10) * 10; }
function money(value) { return Number(value.toFixed(2)); }
function calculate(pieceCost, serviceType) {
  const markup = serviceType === 'glass' ? 0.10 : 1.20;
  const supplierFee = pieceCost * 0.03;
  const base = pieceCost + (pieceCost * markup) + 60 + supplierFee;
  const cardTotal = roundUp10(base);
  const cashTotal = roundUp10(base * 0.90);
  return { cardTotal: money(cardTotal), installment10x: money(cardTotal / 10), cashTotal: money(cashTotal) };
}
function isOriginalScreen(product) {
  const name = normalize(product.name || '');
  const cats = normalize((product.categories || []).map(c => c.name || c).join(' '));
  const hay = `${name} ${cats}`;
  const isScreen = /\b(FRONTAL|TELA|DISPLAY)\b/.test(hay);
  const isOriginal = /\bORIGINAL\b/.test(hay) || /\bFRONTAL NACIONAL\b/.test(hay);
  const excluded = /\b(INCELL|OLED|PREMIUM|AAA|PARALEL|COMPATIVEL|SIMILAR)\b/.test(hay);
  return isScreen && isOriginal && !excluded;
}
function modelTokens(model) {
  const stop = new Set(['SAMSUNG','APPLE','IPHONE','MOTOROLA','MOTO','XIAOMI','REDMI','POCO','REALME','LG','ASUS','INFINIX','GALAXY','CELULAR','TELEFONE']);
  return normalize(model).split(' ').filter(t => t && !stop.has(t));
}
function matchesModel(productName, model) {
  const name = normalize(productName);
  const tokens = modelTokens(model);
  return tokens.length > 0 && tokens.every(t => name.includes(t));
}
function parseStorePrice(product) {
  const p = product?.prices;
  if (!p || p.price == null) return null;
  const minor = Number(p.currency_minor_unit ?? 2);
  const raw = Number(p.price);
  return Number.isFinite(raw) ? raw / Math.pow(10, minor) : null;
}
async function fetchText(url, accept) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ServiceCalculator/1.0)', 'Accept': accept },
    signal: AbortSignal.timeout(12000)
  });
  if (!res.ok) throw new Error(`Fornecedor respondeu HTTP ${res.status}`);
  return res.text();
}
async function searchViaWoo(model) {
  const url = `${SUPPLIER}/wp-json/wc/store/v1/products?search=${encodeURIComponent(model)}&per_page=100`;
  const text = await fetchText(url, 'application/json,text/plain,*/*');
  const data = JSON.parse(text);
  if (!Array.isArray(data)) return [];
  return data.map(p => ({
    id: p.id, name: p.name, url: p.permalink, categories: p.categories || [],
    price: parseStorePrice(p), inStock: p.is_in_stock !== false
  })).filter(p => p.price && p.price > 0);
}
function decodeHtml(s='') {
  return s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#039;/g,"'").replace(/&nbsp;/g,' ')
    .replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
}
function parseMoneyBR(text='') {
  const m = text.match(/R\$\s*([0-9.]+(?:,[0-9]{2})?)/i);
  if (!m) return null;
  const value = Number(m[1].replace(/\./g,'').replace(',','.'));
  return Number.isFinite(value) ? value : null;
}
async function searchViaHtml(model) {
  const html = await fetchText(`${SUPPLIER}/?s=${encodeURIComponent(model)}&post_type=product`, 'text/html,application/xhtml+xml');
  const chunks = html.split(/<li[^>]+class=["'][^"']*product[^"']*["'][^>]*>/i).slice(1);
  const items = [];
  for (const chunk of chunks) {
    const block = chunk.split('</li>')[0];
    const titleMatch = block.match(/class=["'][^"']*woocommerce-loop-product__title[^"']*["'][^>]*>([\s\S]*?)<\//i) || block.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i);
    const linkMatch = block.match(/<a[^>]+href=["']([^"']+)["'][^>]*>/i);
    const priceMatch = block.match(/class=["'][^"']*price[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|div)>/i);
    const name = titleMatch ? decodeHtml(titleMatch[1]) : '';
    const href = linkMatch ? decodeHtml(linkMatch[1]) : '';
    const price = priceMatch ? parseMoneyBR(decodeHtml(priceMatch[1])) : null;
    if (name && href && price) items.push({ name, url: href, categories: [], price, inStock: true });
  }
  return items;
}
async function searchSupplier(model) {
  try {
    const woo = await searchViaWoo(model);
    if (woo.length) return { source: 'woocommerce', products: woo };
  } catch (err) { console.warn('Woo API indisponível:', err.message); }
  return { source: 'html', products: await searchViaHtml(model) };
}
function classifyVariant(name) {
  const n = normalize(name);
  if (/\bCOM ARO\b/.test(n)) return 'Original com aro';
  if (/\bSEM ARO\b/.test(n)) return 'Original sem aro';
  return 'Original';
}
function json(res, status, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': data.length, 'Cache-Control': 'no-store' });
  res.end(data);
}
function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return ({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'}[ext] || 'application/octet-stream');
}
function serveStatic(reqPath, res) {
  let rel = reqPath === '/' ? 'index.html' : reqPath.replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': contentType(file), 'Content-Length': data.length });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/health') return json(res, 200, { ok: true });
  if (url.pathname === '/api/search') {
    const model = String(url.searchParams.get('model') || '').trim();
    const serviceType = url.searchParams.get('service') === 'glass' ? 'glass' : 'screen';
    if (model.length < 2) return json(res, 400, { error: 'Digite um modelo válido.' });
    try {
      const { source, products } = await searchSupplier(model);
      const eligible = products.filter(p => p.inStock !== false).filter(p => matchesModel(p.name, model)).filter(isOriginalScreen)
        .sort((a,b) => a.price - b.price).slice(0,8);
      if (!eligible.length) return json(res, 200, { model, serviceType, available:false, message:'Consultar o Técnico', detail:'Não encontramos tela original disponível para este modelo no fornecedor.' });
      const results = eligible.map(p => {
        const calc = calculate(p.price, serviceType);
        return { variant: classifyVariant(p.name), productName: p.name, ...calc };
      });
      return json(res, 200, { model, serviceType, available:true, updatedAt:new Date().toISOString(), source, results });
    } catch (err) {
      console.error(err);
      return json(res, 502, { error:'Não foi possível consultar o fornecedor agora.', message:'Consultar o Técnico' });
    }
  }
  serveStatic(url.pathname, res);
});

server.listen(PORT, () => console.log(`Calculadora disponível em http://localhost:${PORT}`));
