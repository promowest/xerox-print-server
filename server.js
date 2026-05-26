const express = require('express');
const cors = require('cors');
const net = require('net');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PRINTER_HOST = process.env.PRINTER_HOST;
const PRINTER_PORT = parseInt(process.env.PRINTER_PORT) || 9100;

function sanitize(str) {
  if (!str) return '';
  return str
    .replace(/[șş]/g, 's').replace(/[Șş]/g, 'S')
    .replace(/[țţ]/g, 't').replace(/[Țţ]/g, 'T')
    .replace(/[ă]/g, 'a').replace(/[Ă]/g, 'A')
    .replace(/[â]/g, 'a').replace(/[Â]/g, 'A')
    .replace(/[î]/g, 'i').replace(/[Î]/g, 'I');
}

function p(x, y) { return `\x1b*p${Math.round(x)}X\x1b*p${Math.round(y)}Y`; }
function fs(pts) { return `\x1b(s${pts}V`; }
const B1 = '\x1b(s3B', B0 = '\x1b(s0B';

function drawLabel(label, x, y) {
  let t = '', yy = y, lh = 22;
  t += p(x+2,yy)+fs(6)+B1+sanitize(label.companyName)+B0; yy+=lh;
  t += p(x+2,yy)+fs(5.5)+'tel: '+sanitize(label.phone); yy+=lh-2;
  t += p(x+2,yy)+fs(5.5)+'- Produs distribuit gratuit -'; yy+=lh;
  const name = sanitize(label.productName||'');
  const words = name.split(' ');
  let l1='', l2='';
  for (const w of words) {
    if ((l1+' '+w).trim().length<=28) l1=(l1+' '+w).trim();
    else l2=(l2+' '+w).trim();
  }
  t += p(x+2,yy)+fs(6.5)+B1+l1+B0; yy+=lh;
  if (l2) { t += p(x+2,yy)+B1+l2+B0; yy+=lh; }
  t += p(x+2,yy)+fs(5)+'Alergeni: '+sanitize(label.allergens); yy+=lh-2;
  t += p(x+2,yy)+fs(5)+B1+'Data de productie: '+sanitize(label.productionDate)+B0; yy+=lh-2;
  t += p(x+2,yy)+fs(5)+'Valabilitate: '+sanitize(label.validity); yy+=lh-2;
  t += p(x+2,yy)+fs(5)+`Val. nutritionale: ${sanitize(label.weight)} / ${sanitize(label.calories)} cal`;
  return t;
}

function generatePCL(labels, copies) {
  const COLS=4, DPI=300;
  const PW=Math.round(8.27*DPI), PH=Math.round(11.69*DPI);
  const MX=20, MY=20;
  const CW
