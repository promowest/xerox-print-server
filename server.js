const express = require('express');
const cors = require('cors');
const net = require('net');
const PDFDocument = require('pdfkit');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PRINTER_HOST = process.env.PRINTER_HOST;
const PRINTER_PORT = 631;

function sendIPP(pdfBuffer, res) {
  const printerUri = `ipp://${PRINTER_HOST}:631/ipp/print`;

  const writeAttr = (tag, name, value) => {
    const n = Buffer.from(name, 'utf8');
    const v = Buffer.from(value, 'utf8');
    const b = Buffer.allocUnsafe(1 + 2 + n.length + 2 + v.length);
    let o = 0;
    b.writeUInt8(tag, o++);
    b.writeUInt16BE(n.length, o); o += 2;
    n.copy(b, o); o += n.length;
    b.writeUInt16BE(v.length, o); o += 2;
    v.copy(b, o);
    return b;
  };

  const hdr = Buffer.alloc(8);
  hdr.writeUInt8(2, 0); // IPP/2.0
  hdr.writeUInt8(0, 1);
  hdr.writeUInt16BE(0x0002, 2);
  hdr.writeInt32BE(1, 4);

  const attrs = Buffer.concat([
    writeAttr(0x47, 'attributes-charset', 'utf-8'),
    writeAttr(0x48, 'attributes-natural-language', 'en'),
    writeAttr(0x45, 'printer-uri', printerUri),
    writeAttr(0x42, 'requesting-user-name', 'LovableApp'),
    writeAttr(0x42, 'job-name', 'PrintJob'),
    writeAttr(0x49, 'document-format', 'application/pdf'),
  ]);

  const ippBody = Buffer.concat([hdr, Buffer.from([0x01]), attrs, Buffer.from([0x03]), pdfBuffer]);

  const http = require('http');
  const options = {
    hostname: PRINTER_HOST,
    port: 631,
    path: '/ipp/print',
    method: 'POST',
    headers: {
      'Content-Type': 'application/ipp',
      'Content-Length': ippBody.length,
    }
  };

  let responded = false;
  const request = http.request(options, (response) => {
    const chunks = [];
    response.on('data', c => chunks.push(c));
    response.on('end', () => {
      const body = Buffer.concat(chunks);
      const ippStatus = body.readUInt16BE(2);
      console.log('IPP HTTP status:', response.statusCode);
      console.log('IPP status code:', '0x' + ippStatus.toString(16));
      if (!responded) {
        responded = true;
        if (ippStatus === 0x0000) {
          res.json({ success: true });
        } else {
          res.status(500).json({ error: 'IPP error: 0x' + ippStatus.toString(16) });
        }
      }
    });
  });

  request.on('error', (err) => {
    console.error('IPP error:', err.message);
    if (!responded) { responded = true; res.status(500).json({ error: err.message }); }
  });

  request.write(ippBody);
  request.end();
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

    doc.rect(col * LABEL_W + 1, row * LABEL_H + 1, LABEL_W - 2, LABEL_H - 2).stroke();
    doc.fontSize(7).font('Helvetica-Bold').text(label.companyName || '', x, y, { width: w, align: 'center' });
    doc.fontSize(6).font('Helvetica').text('tel: ' + (label.phone || ''), x, y + 12, { width: w, align: 'center' });
    doc.fontSize(6).font('Helvetica-Oblique').text('- Produs distribuit gratuit -', x, y + 22, { width: w, align: 'center' });
    doc.fontSize(7.5).font('Helvetica-Bold').text(label.productName || '', x, y + 33, { width: w, align: 'center' });
    doc.fontSize(5.5).font('Helvetica').text('Alergeni: ' + (label.allergens || ''), x, y + 62, { width: w, align: 'center' });
    doc.fontSize(6).font('Helvetica-Bold').text('Data de productie: ' + (label.productionDate || ''), x, y + 72, { width: w, align: 'center' });
    doc.fontSize(5.5).font('Helvetica').text('Valabilitate: ' + (label.validity || ''), x, y + 83, { width: w, align: 'center' });
    doc.fontSize(5.5).font('Helvetica').text(`Val. nutritionale: ${label.weight || ''} / ${label.calories || ''} cal`, x, y + 93, { width: w, align: 'center' });
  });

  doc.end();
}

app.get('/', (req, res) => res.json({ status: 'Print server online' }));

app.get('/test-print', (req, res) => {
  const labels = [{
    companyName: 'SC FLAVOURS BY CATALIN JERNOIU SRL',
    phone: '(0724) 969 870',
    productName: 'COTLET DE PORC LA GRATAR',
    allergens: 'Lactate',
    productionDate: '26 MAI 2026, ora 07:00',
    validity: '10 ore de la preparare',
    weight: '250gr',
    calories: '480'
  }];
  generatePDF(labels, 4, (buffer) => {
    console.log('PDF generat:', buffer.length, 'bytes');
    sendIPP(buffer, res);
  });
});

app.post('/print-labels', (req, res) => {
  const { labels, copies } = req.body;
  if (!labels?.length) return res.status(400).json({ error: 'No labels' });
  console.log(`${labels.length} etichete x ${copies} copii`);
  generatePDF(labels, copies, (buffer) => {
    console.log('PDF generat:', buffer.length, 'bytes');
    sendIPP(buffer, res);
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Print server running on port ${PORT}`));
