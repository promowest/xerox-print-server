const express = require('express');
const cors = require('cors');
const multer = require('multer');
const http = require('http');

const app = express();
app.use(cors());
const upload = multer({ storage: multer.memoryStorage() });

const PRINTER_HOST = process.env.PRINTER_HOST;
const PRINTER_PORT = parseInt(process.env.PRINTER_PORT) || 631;

function setJPEGDPI(buffer, dpi) {
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 &&
      buffer[2] === 0xFF && buffer[3] === 0xE0) {
    const modified = Buffer.from(buffer);
    modified[11] = 1;
    modified[12] = (dpi >> 8) & 0xFF;
    modified[13] = dpi & 0xFF;
    modified[14] = (dpi >> 8) & 0xFF;
    modified[15] = dpi & 0xFF;
    return modified;
  }
  return buffer;
}

function writeIntAttr(name, value) {
  const n = Buffer.from(name, 'utf8');
  const b = Buffer.allocUnsafe(1 + 2 + n.length + 2 + 4);
  let o = 0;
  b.writeUInt8(0x21, o++);
  b.writeUInt16BE(n.length, o); o += 2;
  n.copy(b, o); o += n.length;
  b.writeUInt16BE(4, o); o += 2;
  b.writeInt32BE(value, o);
  return b;
}

function writeAttr(tag, name, value) {
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
}

function ippRequest(operationId, attributes, callback) {
  const hdr = Buffer.alloc(8);
  hdr.writeUInt8(2, 0);
  hdr.writeUInt8(0, 1);
  hdr.writeUInt16BE(operationId, 2);
  hdr.writeInt32BE(1, 4);

  const ippBody = Buffer.concat([
    hdr,
    Buffer.from([0x01]),
    ...attributes,
    Buffer.from([0x03])
  ]);

  const options = {
    hostname: PRINTER_HOST,
    port: PRINTER_PORT,
    path: '/ipp/print',
    method: 'POST',
    headers: {
      'Content-Type': 'application/ipp',
      'Content-Length': ippBody.length,
    }
  };

  const req = http.request(options, (response) => {
    const chunks = [];
    response.on('data', c => chunks.push(c));
    response.on('end', () => callback(null, Buffer.concat(chunks)));
  });
  req.on('error', (err) => callback(err));
  req.write(ippBody);
  req.end();
}

function parseIPPResponse(body) {
  const result = {};
  let offset = 8;

  while (offset < body.length) {
    const tag = body[offset];
    if (tag === 0x03) break;
    if (tag <= 0x0F) { offset++; continue; }

    offset++;
    const nameLen = body.readUInt16BE(offset); offset += 2;
    const name = body.slice(offset, offset + nameLen).toString('utf8'); offset += nameLen;
    const valueLen = body.readUInt16BE(offset); offset += 2;
    const value = body.slice(offset, offset + valueLen); offset += valueLen;

    if (name) {
      if (tag === 0x21 || tag === 0x23) {
        result[name] = value.readInt32BE(0);
      } else {
        result[name] = value.toString('utf8');
      }
    }
  }
  return result;
}

function sendIPP(buffer, mimeType, copies, callback) {
  const printerUri = `ipp://${PRINTER_HOST}:${PRINTER_PORT}/ipp/print`;

  const attrs = [
    writeAttr(0x47, 'attributes-charset', 'utf-8'),
    writeAttr(0x48, 'attributes-natural-language', 'en'),
    writeAttr(0x45, 'printer-uri', printerUri),
    writeAttr(0x42, 'requesting-user-name', 'LovableApp'),
    writeAttr(0x42, 'job-name', 'PrintJob'),
    writeAttr(0x49, 'document-format', 'image/urf'),
    writeIntAttr('copies', copies || 1),
  ];

  const hdr = Buffer.alloc(8);
  hdr.writeUInt8(2, 0);
  hdr.writeUInt8(0, 1);
  hdr.writeUInt16BE(0x0002, 2);
  hdr.writeInt32BE(1, 4);

  const ippBody = Buffer.concat([hdr, Buffer.from([0x01]), ...attrs, Buffer.from([0x03]), buffer]);

  const options = {
    hostname: PRINTER_HOST,
    port: PRINTER_PORT,
    path: '/ipp/print',
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
      const body = Buffer.concat(chunks);
      const ippStatus = body.readUInt16BE(2);
      const ippStatusHex = '0x' + ippStatus.toString(16);
      console.log('IPP status:', ippStatusHex, '| Copii:', copies);
      callback(null, ippStatus, ippStatusHex);
    });
  });

  request.on('error', (err) => {
    console.error('IPP error:', err.message);
    callback(err);
  });

  request.write(ippBody);
  request.end();
}

// ─── Endpoints ───────────────────────────────────────────

app.get('/', (req, res) => res.json({
  status: 'Print server online',
  printer_host: PRINTER_HOST,
  printer_port: PRINTER_PORT
}));

app.get('/printer-info', (req, res) => {
  const printerUri = `ipp://${PRINTER_HOST}:${PRINTER_PORT}/ipp/print`;
  const attrs = [
    writeAttr(0x47, 'attributes-charset', 'utf-8'),
    writeAttr(0x48, 'attributes-natural-language', 'en'),
    writeAttr(0x45, 'printer-uri', printerUri),
    writeAttr(0x44, 'requested-attributes', 'document-format-supported'),
  ];
  ippRequest(0x000B, attrs, (err, body) => {
    if (err) return res.status(500).json({ error: err.message });
    const parsed = parseIPPResponse(body);
    res.json({ formats: parsed, hex: body.toString('hex').substring(0, 300) });
  });
});

app.get('/printer-status', (req, res) => {
  const printerUri = `ipp://${PRINTER_HOST}:${PRINTER_PORT}/ipp/print`;

  const attrs = [
    writeAttr(0x47, 'attributes-charset', 'utf-8'),
    writeAttr(0x48, 'attributes-natural-language', 'en'),
    writeAttr(0x45, 'printer-uri', printerUri),
    writeAttr(0x44, 'requested-attributes', 'all'),
  ];

  ippRequest(0x000B, attrs, (err, body) => {
    if (err) return res.status(500).json({ error: err.message, online: false });

    const parsed = parseIPPResponse(body);
    const stateMap = { 3: 'idle', 4: 'printing', 5: 'stopped' };

    res.json({
      online: true,
      state: stateMap[parsed['printer-state']] || 'unknown',
      stateMessage: parsed['printer-state-message'] || '',
      tonerLevel: parsed['marker-levels'] !== undefined ? parsed['marker-levels'] : null,
      markerName: parsed['marker-names'] || 'Toner',
      queuedJobs: parsed['queued-job-count'] || 0,
      mediaReady: parsed['media-ready'] || 'unknown',
      raw: parsed,
    });
  });
});

app.post('/print', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Niciun fisier primit' });

  const mimeType = req.file.mimetype || 'image/jpeg';
  const copies = parseInt(req.body.copies) || 1;
  console.log('Fisier primit:', req.file.size, 'bytes | Copii:', copies);

  const buffer = mimeType === 'image/jpeg'
    ? setJPEGDPI(req.file.buffer, 300)
    : req.file.buffer;

  // Opțiunea B — așteptăm confirmarea IPP înainte să răspundem
  sendIPP(buffer, mimeType, copies, (err, ippStatus, ippStatusHex) => {
    if (err) {
      return res.status(500).json({
        success: false,
        error: err.message
      });
    }

    if (ippStatus === 0x0000) {
      res.json({
        success: true,
        confirmed: true,
        copies,
        ippStatus: ippStatusHex,
        message: `Job acceptat de imprimantă — ${copies} ${copies === 1 ? 'copie' : 'copii'}`
      });
    } else {
      res.status(500).json({
        success: false,
        confirmed: false,
        ippStatus: ippStatusHex,
        error: `Imprimanta a returnat eroare IPP: ${ippStatusHex}`
      });
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Print server running on port ${PORT}`));
