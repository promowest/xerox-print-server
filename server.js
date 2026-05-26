const express = require('express');
const multer = require('multer');
const cors = require('cors');
const net = require('net');

const app = express();
app.use(cors());
const upload = multer({ storage: multer.memoryStorage() });

const PRINTER_HOST = process.env.PRINTER_HOST;
const PRINTER_PORT = 9100;

function buildMinimalPDF() {
  const content = 'BT /F1 16 Tf 50 750 Td (Test print - Xerox B230) Tj 0 -30 Td (Conexiunea functioneaza!) Tj ET';
  const contentLength = content.length;
  const pdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length ${contentLength}>>
stream
${content}
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
xref
0 6
0000000000 65535 f 
trailer<</Size 6/Root 1 0 R>>
startxref
0
%%EOF`;
  return Buffer.from(pdf);
}

function sendToPrinter(buffer, res) {
  const client = new net.Socket();
  client.connect(PRINTER_PORT, PRINTER_HOST, () => {
    console.log('Conectat la imprimantă, trimit...');
    const flushed = client.write(buffer);
    if (flushed) {
      client.end();
    } else {
      client.once('drain', () => { client.end(); });
    }
  });
  client.on('close', () => {
    console.log('Trimis cu succes');
    res.json({ success: true });
  });
  client.on('error', (err) => {
    console.error('Eroare:', err.message);
    res.status(500).json({ error: err.message });
  });
}

app.get('/', (req, res) => res.json({ status: 'Print server online' }));

app.get('/test-print', (req, res) => {
  console.log('Test print solicitat...');
  const pdf = buildMinimalPDF();
  console.log('PDF generat, size:', pdf.length, 'bytes');
  sendToPrinter(pdf, res);
});

app.post('/print', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Niciun fisier primit' });
  console.log('Fisier primit:', req.file.size, 'bytes');
  console.log('Primii bytes:', req.file.buffer.slice(0, 8).toString('hex'));
  sendToPrinter(req.file.buffer, res);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Print server running on port ${PORT}`));
