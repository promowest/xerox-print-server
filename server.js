const express = require('express');
const cors = require('cors');
const net = require('net');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PRINTER_HOST = process.env.PRINTER_HOST;
const PRINTER_PORT = 9100;

function sanitize(str) {
  if (!str) return '';
  return str
    .replace(/[șş]/g, 's').replace(/[Șş]/g, 'S')
    .replace(/[țţ]/g, 't').replace(/[Țţ]/g, 'T')
    .replace(/[ă]/g, 'a').replace(/[Ă]/g, 'A')
    .replace(/[â]/g, 'a').replace(/[Â]/g, 'A')
    .replace(/[î]/g, 'i').replace(/[Î]/g, 'I');
}

function pos(x, y) {
  return `\x1b*p${Math.round(x)}X\x1b*p${Math.round(y)}Y`;
}

const BOLD_ON  = '\x1b(s3B';
const BOLD_OFF = '\x1b(s0B';

function fs(pts) { return `\x1b(s${pts}V`; }

function drawLabel(label, x, y) {
  let p = '';
  const lh = 22;
  let yy = y;

  p += pos(x+2, yy) + fs(6) + BOLD_ON + sanitize(label.companyName) + BOLD_OFF; yy += lh;
  p += pos(x+2, yy) + fs(5.5) + 'tel: ' + sanitize(label.phone); yy += lh - 2;
  p += pos(x+2, yy) + fs(5.5) + '- Produs distribuit gratuit -'; yy += lh;

  const name = sanitize(label.productName || '');
  const words = name.split(' ');
  let line1 = '', line2 = '';
  for (const w of words) {
    if ((line1 + ' ' + w).trim().length <= 28) line1 = (line1 + ' ' + w).trim();
    else line2 = (line2 + ' ' + w).trim();
  }
  p += pos(x+2, yy) + fs(6.5) + BOLD_ON + line1 + BOLD_OFF; yy += lh;
  if (line2) { p += pos(x+2, yy) + BOLD_ON + line2 + BOLD_OFF; yy += lh; }

  p += pos(x+2, yy) + fs(5) + 'Alergeni: ' + sanitize(label.allergens); yy += lh - 2;
  p += pos(x+2, yy) + fs(5) + BOLD_ON + 'Data de productie: ' + sanitize(label.productionDate) + BOLD_OFF; yy += lh - 2;
  p += pos(x+2, yy) + fs(5) + 'Valabilitate: ' + sanitize(label.validity); yy += lh - 2;
  p += pos(x+2, yy) + fs(5) + `Val. nutritionale: ${sanitize(label.weight)} / ${sanitize(label.calories)} cal`;
  return p;
}

function generatePCL(labels, copies) {
  const COLS = 4, DPI = 300;
  const PAGE_W = Math.round(8.27 * DPI);
  const PAGE_H = Math.
