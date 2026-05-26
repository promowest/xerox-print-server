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

function p(x, y) {
  // Convertim din dots (300dpi) în decipoints (1/720 inch)
  const xDp = Math.round(x * 720 / 300);
  const yDp = Math.round(y * 720 / 300);
  return `\x1b&a${xDp}H\x1b&a${yDp}V`;
}
function fs(pts) { return `\x1b(s${pts}V`; }
const B1 = '\x1b(s3B', B0 = '\x1b(s0B';

function drawLabel(label, x, y) {
  let t = '', yy = y, lh = 22;
  t += p(x+2,yy)+fs(6)+B1+sanitize(label.companyName)+B0; yy+=lh;
  t += p(x+2,yy)+fs(5.5)+'tel: '+sanitize(label.phone); yy+=lh-2;
  t += p(x+2,yy)+fs(5.5)+'- Produs distribuit gratuit -'; yy+=lh;
  const name = sanitize(label.productName||'');
  const words = name.split(' ');
  let l1='', l2='';
  for (const w of words) {
    if ((l1+' '+w).trim().length<=28) l1=(l1+' '+w).trim();
    else l2=(l2+' '+w).trim();
  }
  t += p(x+2,yy)+fs(6.5)+B1+l1+B0; yy+=lh;
  if (l2) { t += p(x+2,yy)+B1+l2+B0; yy+=lh; }
  t += p(x+2,yy)+fs(5)+'Alergeni: '+sanitize(label.allergens); yy+=lh-2;
  t += p(x+2,yy)+fs(5)+B1+'Data de productie: '+sanitize(label.productionDate)+B0; yy+=lh-2;
  t += p(x+2,yy)+fs(5)+'Valabilitate: '+sanitize(label.validity); yy+=lh-2;
  t += p(x+2,yy)+fs(5)+`Val. nutritionale: ${sanitize(label.weight)} / ${sanitize(label.calories)} cal`;
  return t;
}

function generatePCL(labels, copies) {
  const COLS=4, DPI=300;
  const PW=Math.round(8.27*DPI), PH=Math.round(11.69*DPI);
  const MX=20, MY=20;
  const CW=Math.floor((PW-2*MX)/COLS);
  const LH=190;
  const RPP=Math.floor((PH-2*MY)/LH);
  const PPP=COLS*RPP;
  const all=[];
  for (const l of labels) for (let c=0;c<(copies||1);c++) all.push(l);
  let pcl='\x1bE\x1b&l26A\x1b&l0O\x1b(0U';
  for (let i=0;i<all.length;i++) {
    if (i>0 && i%PPP===0) pcl+='\f';
    const pp=i%PPP;
    const col=pp%COLS, row=Math.floor(pp/COLS);
    pcl+=drawLabel(all[i], MX+col*CW, MY+row*LH);
  }
  pcl+='\f\x1bE';
  return Buffer.from(pcl,'binary');
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
    if (!responded) {
      responded = true;
      console.log('Trimis cu succes');
      res.json({ success: true });
    }
  });
  client.on('error', (err) => {
    if (!responded) {
      responded = true;
      console.error('Eroare:', err.message);
      res.status(500).json({ error: err.message });
    }
  });
}

app.get('/', (req, res) => res.json({ status: 'Print server online' }));

app.get('/test-print', (req, res) => {
  const pcl = Buffer.from('\x1bETest Print OK\r\n\f\x1bE', 'binary');
  sendToPrinter(pcl, res);
});

app.post('/print-labels', (req, res) => {
  const { labels, copies } = req.body;
  if (!labels?.length) return res.status(400).json({ error: 'No labels' });
  console.log(`${labels.length} etichete x ${copies} copii`);
  sendToPrinter(generatePCL(labels, copies), res);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Print server running on port ${PORT}`));
