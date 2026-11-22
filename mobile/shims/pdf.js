// Tiny PDF writer: each page is one JPEG image. Used for "Print" and "Save as PDF" on Android, where there is no print dialog.
// Captures the element marked .print-target (set by outputSheet() in renderer.js) with html2canvas.
import { Buffer } from 'buffer';

const A4 = { w: 595.28, h: 841.89 };

function build(pages, landscape) {
  const PW = landscape ? A4.h : A4.w, PH = landscape ? A4.w : A4.h;
  const parts = [], offs = []; let len = 0;
  const push = b => { const buf = typeof b === 'string' ? Buffer.from(b, 'latin1') : b; parts.push(buf); len += buf.length; };
  const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n`); push(body); push('\nendobj\n'); };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const n = pages.length, kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`);
  pages.forEach((pg, i) => {
    const pn = 3 + i * 3, cn = pn + 1, im = pn + 2;
    const r = Math.min(PW / pg.w, PH / pg.h), w = pg.w * r, h = pg.h * r, x = (PW - w) / 2, y = PH - h;
    obj(pn, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW.toFixed(2)} ${PH.toFixed(2)}] /Resources << /XObject << /Im0 ${im} 0 R >> >> /Contents ${cn} 0 R >>`);
    const c = `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q`;
    obj(cn, `<< /Length ${c.length} >>\nstream\n${c}\nendstream`);
    offs[im] = len; push(`${im} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pg.w} /Height ${pg.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.jpeg.length} >>\nstream\n`);
    push(pg.jpeg); push('\nendstream\nendobj\n');
  });
  const total = 3 + n * 3, xref = len;
  push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let k = 1; k < total; k++) push(String(offs[k]).padStart(10, '0') + ' 00000 n \n');
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return Buffer.concat(parts);
}

const jpegOf = canvas => new Promise((res, rej) => canvas.toBlob(async b => (b ? res(Buffer.from(await b.arrayBuffer())) : rej(new Error('Could not render the page.'))), 'image/jpeg', 0.92));

/** Slices a tall canvas into A4-shaped pages. */
async function slices(canvas, landscape) {
  const ratio = landscape ? A4.w / A4.h : A4.h / A4.w, ph = Math.floor(canvas.width * ratio), out = [];
  for (let y = 0; y < canvas.height; y += ph) {
    const h = Math.min(ph, canvas.height - y), c = document.createElement('canvas');
    c.width = canvas.width; c.height = ph;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
    out.push({ w: c.width, h: c.height, jpeg: await jpegOf(c) });
  }
  return out;
}

export async function printTargetToPdf(landscape) {
  const target = document.querySelector('.print-target');
  if (!target) throw new Error('There is nothing to print.');
  const shot = el => window.html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
  const pageEls = [...target.querySelectorAll('.class-page')];
  const pages = [];
  if (pageEls.length) for (const el of pageEls) { const c = await shot(el); pages.push({ w: c.width, h: c.height, jpeg: await jpegOf(c) }); }
  else pages.push(...await slices(await shot(target), landscape));
  return build(pages, landscape);
}
