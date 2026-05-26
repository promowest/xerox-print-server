const express = require('express');
const cors = require('cors');
const net = require('net');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PRINTER_HOST = process.env.PRINTER_HOST;
const PRINTER_PORT = parseInt(process.env.PRINTER_PORT) || 9100;

function sanitize(str) {
  if (!str) return '';
  return str
    .replace(/[șş]/g, 's').replace(/[Șş]/g, 'S')
    .replace(/[țţ]/g, 't').replace(/[Țţ]/g, 'T')
    .replace(/[ă]/g, 'a').replace(/[Ă]/g, 'A')
    .replace(/[â]/g, 'a').replace(/[Â]/g, 'A')
    .replace(/[î]/g, 'i').replace(/[Î]/g, 'I');
}

function col(text, width) {
  const t = sanitize(String(text || '')).substring(0, width);
  return t.padEnd(width);
}

function generatePCL(labels, copies) {
  const COLS = 4;
  const CW = 23; // chars per column
  const SEP = 1; // separator
  const TOTAL = COLS * (CW + SEP); // ~96 chars

  const all = [];
  for (const l of labels)
    for (let c = 0; c < (copies || 1); c++) all.push(l);

  let pcl = '\x1bE';        // reset
  pcl += '\x1b&l26A';       // A4
  pcl += '\x1b&l0O';        // portrait
  pcl += '\x1b(0U';         // US ASCII
  pcl += '\x1b(s0P';        // fixed pitch
  pcl += '\x1b(s8V';        // 8pt font
  pcl += '\x1b&k12H';       // 12 CPI
  pcl += '\x1b&l6D';        // 6 LPI
  pcl += '\x1b&a0R\x1b&a0C'; // cursor home

  for (let i = 0; i < all.length; i += COLS) {
    const group = [];
    for (let c = 0; c < COLS; c++) group.push(all[i + c] || null);

    const sep = group.map(() => '-'.repeat(CW).padEnd(CW + SEP)).join('');
    pcl += sep + '\r\n';

    const lines = [
      g => col(g.companyName, CW),
      g => col('T:' + (g.phone || ''), CW),
      g => col('-Produs dist.gratuit-', CW),
      g => col(g.productName, CW),
      g => col('Alerg:' + (g.allergens || ''), CW),
      g => col('Data:' + (g.productionDate || ''), CW),
      g => col('Valid:' + (g.validity || ''), CW),
      g => col((g.weight || '') + '/' + (g.calories || '') + 'cal', CW),
    ];

    for (const lineFunc of lines) {
      const row = group.map(g => g ? lineFunc(g).padEnd(CW + SEP) : ' '.repeat(CW + SEP)).join('');
      pcl += row.trimEnd() + '\r\n';
    }
  }

  pcl += '\f\x1bE';
  return Buffer.from(pcl, 'latin1');
}

function sendToPrinter(buffer, res) {
  const client = new net.Socket();
  let responded = false;
  client.connect(PRINTER_PORT, PRINTER_HOST, () => {
    console.log('Conectat, trimit', buffer.length, 'bytes...');
    const ok = client.write(buffer);
    if (ok) client.end();
    else client.once('drain', () => client.end());
  });
  client.on('close', () => {
    if (!responded) { responded = true; console.log('OK'); res.json({ success: true }); }
  });
  client.on('error', (err) => {
    if (!responded) { responded = true; console.error(err.message); res.status(500).json({ error: err.message }); }
  });
}

app.get('/', (req, res) => res.json({ status: 'Print server online' }));

app.get('/test-print', (req, res) => {
  const labels = [{
    companyName: 'SC FLAVOURS BY CATALIN JERNOIU SRL',
    phone: '(0724) 969 870',
    productName: 'COTLET DE PORC LA GRATAR',
    allergens: 'Lactate',
    productionDate: '26 MAI 2026 07:00',
    validity: '10 ore preparare',
    weight: '250gr',
    calories: '480'
  }];
  sendToPrinter(generatePCL(labels, 4), res);
});

app.post('/print-labels', (req, res) => {
  const { labels, copies } = req.body;
  if (!labels?.length) return res.status(400).json({ error: 'No labels' });
  console.log(`${labels.length} etichete x ${copies} copii`);
  sendToPrinter(generatePCL(labels, copies), res);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Print server running on port ${PORT}`));
