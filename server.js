const express = require('express');
const multer = require('multer');
const cors = require('cors');
const http = require('http');
const { URL } = require('url');

const app = express();
app.use(cors());
const upload = multer({ storage: multer.memoryStorage() });

const PRINTER_URL = process.env.PRINTER_URL;

function buildIPPRequest(printerUri, pdfBuffer) {
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
  hdr.writeUInt8(1, 0);
  hdr.writeUInt8(1, 1);
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

  return Buffer.concat([hdr, Buffer.from([0x01]), attrs, Buffer.from([0x03]), pdfBuffer]);
}

app.get('/', (req, res) => res.json({ status: 'Print server online' }));

app.post('/print', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Niciun fisier primit' });

  const parsed = new URL(PRINTER_URL);
  const ippBody = buildIPPRequest(PRINTER_URL, req.file.buffer);

  const options = {
    hostname: parsed.hostname,
    port: parseInt(parsed.port) || 631,
    path: parsed.pathname || '/ipp/print',
    method: 'POST',
    headers: {
      'Content-Type': 'application/ipp',
      'Content-Length': ippBody.length,
    }
  };

  const request = http.request(options, (response) => {
    const chunks = [];
    response.on('data', c => chunks.push(c));
    response.on('end', () => {
      console.log('IPP status:', response.statusCode);
      res.json({ success: true, statusCode: response.statusCode });
    });
  });

  request.on('error', (err) => {
    console.error('IPP error:', err);
    res.status(500).json({ error: err.message });
  });

  request.write(ippBody);
  request.end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Print server running on port ${PORT}`));
