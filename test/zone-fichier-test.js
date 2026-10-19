// Chemin d'extraction de la zone libre IA (image -> bloc image, texte -> texte), sans appel IA.
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NOESIS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'zf-'));
const assert = require('assert');
const d = require('../server/lib/documenttasks');
(async () => {
  const img = await d.textFromFile({ fileName: 'a.jpg', mimeType: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,' + Buffer.from('abc').toString('base64') }, { images: true });
  assert.strictEqual(img.image.media_type, 'image/jpeg');
  const txt = await d.textFromFile({ fileName: 'b.txt', mimeType: 'text/plain', dataUrl: 'data:text/plain;base64,' + Buffer.from('Faire X').toString('base64') }, { images: true });
  assert.strictEqual(txt.text.trim(), 'Faire X');
  const p = require('../server/lib/aicache').messageParams({ model: 'm', maxTokens: 5, system: 's', variable: 'v', images: [img.image] });
  assert.ok(p.messages[0].content.some((c) => c.type === 'image'));
  console.log('ok');
})().catch((e) => { console.error(e); process.exit(1); });
