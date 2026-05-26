const express = require('express');
const ipp = require('ipp');
const multer = require('multer');
const cors = require('cors');

const app = express();
app.use(cors());

const upload = multer({ storage: multer.memoryStorage() });

const PRINTER_URL = process.env.PRINTER_URL;

app.get('/', (req, res) => {
  res.json({ status: 'Print server online' });
});

app.post('/print', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Niciun fisier primit' });
  }

  const printer = ipp.Printer(PRINTER_URL);

  const msg = {
    "operation-attributes-tag": {
      "requesting-user-name": "LovableApp",
      "job-name": "PrintJob",
      "document-format": "application/pdf"
    },
    data: req.file.buffer
  };

  printer.execute("Print-Job", msg, (err, response) => {
    if (err) {
      console.error('IPP error:', err);
      return res.status(500).json({ error: err.message });
    }
    console.log('Print response:', JSON.stringify(response));
    res.json({ success: true, jobId: response?.["job-attributes-tag"]?.["job-id"] });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Print server running on port ${PORT}`));
