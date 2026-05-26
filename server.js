const express = require('express');
const cors = require('cors');
const net = require('net');
const PDFDocument = require('pdfkit');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PRINTER_HOST = process.env.PRINTER_HOST;
const PRINTER_PORT = parseInt(process.env.PRINTER_PORT) || 9100;

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

function generatePDF(labels, copies, callback) {
  const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true });
  const buffers = [];
  doc.on('data', chunk => buffers.push(chunk));
  doc.on('end', () => callback(Buffer.concat(buffers)));

  const COLS = 4;
  const PAGE_W = 595.28, PAGE_H = 841.89;
  const LABEL_W = PAGE_W / COLS;
  const LABEL_H = 120;
  const LABELS_PER_PAGE = COLS * Math.floor(PAGE_H / LABEL_H);

  const all = [];
  for (const l of labels)
    for (let c = 0; c < (copies || 1); c++) all.push(l);

  all.forEach((label, i) => {
    const posOnPage = i % LABELS_PER_PAGE;
    if (i > 0 && posOnPage === 0) doc.addPage();

    const col = posOnPage % COLS;
    const row = Math.floor(posOnPage / COLS);
    const x = col * LABEL_W + 4;
    const y = row * LABEL_H + 4;
    const w = LABEL_W - 8;

    // Border
    doc.rect(col * LABEL_W + 1, row * LABEL_H + 1, LABEL_W - 2, LABEL_H - 2).stroke();

    // Company name
    doc.fontSize(7).font('Helvetica-Bold')
       .text(label.companyName || '', x, y, { width: w, align: 'center' });

    // Phone
    doc.fontSize(6).font('Helvetica')
       .text('tel: ' + (label.phone || ''), x, y + 12, { width: w, align: 'center' });

    // Produs distribuit gratuit
    doc.fontSize(6).font('Helvetica-Oblique')
       .text('- Produs distribuit gratuit -', x, y + 22, { width: w, align: 'center' });

    // Product name
    doc.fontSize(7.5).font('Helvetica-Bold')
       .text(label.productName || '', x, y + 33, { width: w, align: 'center' });

    // Allergens
    doc.fontSize(5.5).font('Helvetica')
       .text('Alergeni: ' + (label.allergens || ''), x, y + 60, { width: w, align: 'center' });

    // Production date
    doc.fontSize(6).font('Helvetica-Bold')
       .text('Data de productie: ' + (label.productionDate || ''), x, y + 70, { width: w, align: 'center' });

    // Validity
    doc.fontSize(5.5).font('Helvetica')
       .text('Valabilitate: ' + (label.validity || ''), x, y + 81, { width: w, align: 'center' });

    // Nutritional values
    doc.fontSize(5.5).font('Helvetica')
       .text(`Val. nutritionale: ${label.weight || ''} / ${label.calories || ''} cal`, x, y + 91, { width: w, align: 'center' });
  });

  doc.end();
}

app.get('/', (req, res) => res.json({ status: 'Print server online' }));

app.get('/test-print', (req, res) => {
  const testLabels = [{
    companyName: 'SC FLAVOURS BY CATALIN JERNOIU SRL',
    phone: '(0724) 969 870',
    productName: 'TEST PRODUS',
    allergens: 'Lactate',
    productionDate: '26 MAI 2026, ora 07:00',
    validity: '10 ore de la preparare',
    weight: '250gr',
    calories: '480'
  }];
  generatePDF(testLabels, 4, (buffer) => {
    console.log('PDF generat:', buffer.length, 'bytes');
    sendToPrinter(buffer, res);
  });
});

app.post('/print-labels', (req, res) => {
  const { labels, copies } = req.body;
  if (!labels?.length) return res.status(400).json({ error: 'No labels' });
  console.log(`${labels.length} etichete x ${copies} copii`);
  generatePDF(labels, copies, (buffer) => {
    console.log('PDF generat:', buffer.length, 'bytes');
    sendToPrinter(buffer, res);
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Print server running on port ${PORT}`));
