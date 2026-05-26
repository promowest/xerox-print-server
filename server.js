const express = require('express');
const cors = require('cors');
const net = require('net');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PRINTER_HOST = process.env.PRINTER_HOST;
const PRINTER_PORT = 9100;

function sanitize(str) {
  if (!str) return '';
  return str
    .replace(/[șş]/g, 's').replace(/[Șş]/g, 'S')
    .replace(/[țţ]/g, 't').replace(/[Țţ]/g, 'T')
    .replace(/[ă]/g, 'a').replace(/[Ă]/g, 'A')
    .replace(/[â]/g, 'a').replace(/[Â]/g, 'A')
    .replace(/[î]/g, 'i').replace(/[Î]/g, 'I');
}

function pos(x, y) {
  return `\x1b*p${Math.round(x)}X\x1b*p${Math.round(y)}Y`;
}

const BOLD_ON  = '\x1b(s3B';
const BOLD_OFF = '\x1b(s0B';

function fs(pts) { return `\x1b(s${pts}V`; }

function drawLabel(label, x, y) {
  let p = '';
  const lh = 22;
  let yy = y;

  p += pos(x+2, yy) + fs(6) + BOLD_ON + sanitize(label.companyName) + BOLD_OFF; yy += lh;
  p += pos(x+2, yy) + fs(5.5) + 'tel: ' + sanitize(label.phone); yy += lh - 2;
  p += pos(x+2, yy) + fs(5.5) + '- Produs distribuit gratuit -'; yy += lh;

  const name = sanitize(label.productName || '');
  const words = name.split(' ');
  let line1 = '', line2 = '';
  for (const w of words) {
    if ((line1 + ' ' + w).trim().length <= 28) line1 = (line1 + ' ' + w).trim();
    else line2 = (line2 + ' ' + w).trim();
  }
  p += pos(x+2, yy) + fs(6.5) + BOLD_ON + line1 + BOLD_OFF; yy += lh;
  if (line2) { p += pos(x+2, yy) + BOLD_ON + line2 + BOLD_OFF; yy += lh; }

  p += pos(x+2, yy) + fs(5) + 'Alergeni: ' + sanitize(label.allergens); yy += lh - 2;
  p += pos(x+2, yy) + fs(5) + BOLD_ON + 'Data de productie: ' + sanitize(label.productionDate) + BOLD_OFF; yy += lh - 2;
  p += pos(x+2, yy) + fs(5) + 'Valabilitate: ' + sanitize(label.validity); yy += lh - 2;
  p += pos(x+2, yy) + fs(5) + `Val. nutritionale: ${sanitize(label.weight)} / ${sanitize(label.calories)} cal`;
  return p;
}

function generatePCL(labels, copies) {
  const COLS = 4, DPI = 300;
  const PAGE_W = Math.round(8.27 * DPI);
  const PAGE_H = Math.round(11.69 * DPI);
  const MARGIN_X = 20, MARGIN_Y = 20;
  const COL_W = Math.floor((PAGE_W - 2 * MARGIN_X) / COLS);
  const LABEL_H = 190;
  const ROWS_PER_PAGE = Math.floor((PAGE_H - 2 * MARGIN_Y) / LABEL_H);
  const PER_PAGE = COLS * ROWS_PER_PAGE;

  const all = [];
  for (const l of labels)
    for (let c = 0; c < (copies || 1); c++) all.push(l);

  let pcl = '\x1bE\x1b&l26A\x1b&l0O\x1b(0U';

  for (let i = 0; i < all.length; i++) {
    if (i > 0 && i % PER_PAGE === 0) pcl += '\f';
    const pos_on_page = i % PER_PAGE;
    const col = pos_on_page % COLS;
    const row = Math.floor(pos_on_page / COLS);
    const x = MARGIN_X + col * COL_W;
    const y = MARGIN_Y + row * LABEL_H;
    pcl += drawLabel(all[i], x, y);
  }

  pcl += '\f\x1bE';
  return Buffer.from(pcl, 'binary');
}

function sendToPrinter(buffer, res) {
  const client = new net.Socket();
  client.connect(PRINTER_PORT, PRINTER_HOST, () => {
    console.log('Conectat, trimit', buffer.length, 'bytes...');
    const ok = client.write(buffer);
    if (ok) client.end();
    else client.once('drain', () => client.end());
  });
  client.on('close', () => { console.log('OK'); res.json({ success: true }); });
  client.on('error', (err) => { console.error(err.message); res.status(500).json({ error: err.message }); });
}

app.get('/', (req, res) => res.json({ status: 'Print server online' }));

app.get('/test-print', (req, res) => {
  sendToPrinter(Buffer.from('\x1bETest Print OK\r\n\f\x1bE', 'binary'), res);
});

app.post('/print-labels', (req, res) => {
  const { labels, copies } = req.body;
  if (!labels?.length) return res.status(400).json({ error: 'No labels' });
  console.log(`${labels.length} etichete x ${copies} copii`);
  sendToPrinter(generatePCL(labels, copies), res);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Print server running on port ${PORT}`));
