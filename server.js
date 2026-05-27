const express = require('express');
const cors = require('cors');
const multer = require('multer');

const app = express();
app.use(cors());
const upload = multer({ storage: multer.memoryStorage() });

const PRINTER_HOST = process.env.PRINTER_HOST;

function sendIPP(buffer, mimeType, res) {
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
  hdr.writeUInt8(2, 0);
  hdr.writeUInt8(0, 1);
  hdr.writeUInt16BE(0x0002, 2);
  hdr.writeInt32BE(1, 4);

  const attrs = Buffer.concat([
    writeAttr(0x47, 'attributes-charset', 'utf-8'),
    writeAttr(0x48, 'attributes-natural-language', 'en'),
    writeAttr(0x45, 'printer-uri', printerUri),
    writeAttr(0x42, 'requesting-user-name', 'LovableApp'),
    writeAttr(0x42, 'job-name', 'PrintJob'),
    writeAttr(0x49, 'document-format', mimeType),
  ]);

  const ippBody = Buffer.concat([hdr, Buffer.from([0x01]), attrs, Buffer.from([0x03]), buffer]);

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
      console.log('IPP status:', '0x' + ippStatus.toString(16));
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

app.get('/', (req, res) => res.json({ status: 'Print server online' }));

app.post('/print', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Niciun fisier primit' });
  const mimeType = req.file.mimetype || 'image/jpeg';
  console.log('Fisier primit:', req.file.size, 'bytes, tip:', mimeType);
  sendIPP(req.file.buffer, mimeType, res);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Print server running on port ${PORT}`));
