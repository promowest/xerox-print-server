const express = require('express');
const multer = require('multer');
const cors = require('cors');
const net = require('net');

const app = express();
app.use(cors());
const upload = multer({ storage: multer.memoryStorage() });

const PRINTER_HOST = process.env.PRINTER_HOST;
const PRINTER_PORT = 9100;

app.get('/', (req, res) => res.json({ status: 'Print server online' }));

app.post('/print', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Niciun fisier primit' });

  console.log('Fisier primit:', req.file.originalname);
  console.log('Size:', req.file.size, 'bytes');
  console.log('Mimetype:', req.file.mimetype);
  console.log('Primii bytes (hex):', req.file.buffer.slice(0, 8).toString('hex'));

  const client = new net.Socket();

  client.connect(PRINTER_PORT, PRINTER_HOST, () => {
    console.log('Conectat la imprimantă, trimit PDF...');
    client.write(req.file.buffer);
    client.end();
  });

  client.on('close', () => {
    console.log('PDF trimis cu succes');
    res.json({ success: true });
  });

  client.on('error', (err) => {
    console.error('Eroare conexiune:', err.message);
    res.status(500).json({ error: err.message });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Print server running on port ${PORT}`));
