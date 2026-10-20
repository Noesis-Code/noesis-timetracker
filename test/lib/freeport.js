// Port éphémère libre (demandé au système, port 0) pour les tests qui lancent un serveur dans un processus enfant.
const { execFileSync } = require('child_process');
module.exports = function freePortSync() {
  return Number(execFileSync(process.execPath, ['-e', "const s=require('net').createServer().listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close();})"]).toString().trim());
};
