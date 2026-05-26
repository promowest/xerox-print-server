const express = require('express');
const multer = require('multer');
const cors = require('cors');
const net = require('net');

const app = express();
app.use(cors());
const upload = multer({ storage: multer.memoryStorage() });

const PRINTER_HOST = process.env.PRINTER_HOST;
const PRINTER_PORT = 9100;

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
  console.log('Test PCL print...');
  const pcl = Buffer.from(
    '\x1bE' +
    'Test Print - Xerox B230\r\n' +
    'Conexiunea functioneaza!\r\n' +
    '\f' +
    '\x1bE',
    'binary'
  );
  console.log('PCL size:', pcl.length, 'bytes');
  sendToPrinter(pcl, res);
});

app.post('/print', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Niciun fisier primit' });
  console.log('Fisier primit:', req.file.size, 'bytes');
  sendToPrinter(req.file.buffer, res);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Print server running on port ${PORT}`));
