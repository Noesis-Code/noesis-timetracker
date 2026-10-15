// Usage : node scripts/hash-offer1-code.js <code>
// Affiche le sha256 hex du code, à placer dans OFFER1_FREE_CODE_HASHES (virgules pour plusieurs).
const code = process.argv[2];
if (!code) { console.error('Usage : node scripts/hash-offer1-code.js <code>'); process.exit(1); }
console.log(require('crypto').createHash('sha256').update(code.trim(), 'utf8').digest('hex'));
