// Vérification navigateur (Chrome + CDP) : mesure le décalage de la page entre Tâches et Objectifs (zones de sécurité iPhone émulées). Usage : node scripts/verif-arbre-decalage.js steps.json puis SAFE=1 node scripts/verif-navigateur-cdp.js <port> <idUtilisateur> <préfixe> 390 844 @steps.json (serveur local + dev-seed requis)
const M='(function(){var q=function(s){var e=document.querySelector(s);if(!e)return null;var r=e.getBoundingClientRect();return [Math.round(r.top*10)/10,Math.round(r.bottom*10)/10]};var v=window.visualViewport;return JSON.stringify({topbar:q(".topbar"),avatar:q("#whoami"),sw:q("#goalsPage1Switch"),pill:q("#tabbarPill"),ih:innerHeight,vvh:v&&v.height,vvTop:v&&v.offsetTop,st:document.documentElement.scrollTop,sy:scrollY,cls:document.documentElement.className})})()';
const steps=[
 {js:'document.querySelector(".tabBtn[data-tab=goals]").click()',wait:1500},
 {js:'(document.getElementById("aiNoticeAck")||{click(){}}).click();(document.getElementById("marketingInviteNo")||{click(){}}).click();document.querySelector("#goalsPage1Switch .periodBtn[data-view=today]").click()',wait:2000,shot:'taches'},
 {js:M},
 {js:'window.scrollTo(0,150);'+M},
 {js:'document.querySelector("#goalsPage1Switch .periodBtn[data-view=activities]").click()',wait:2500,shot:'objectifs'},
 {js:M},
 {js:'document.querySelector("#goalsPage1Switch .periodBtn[data-view=today]").click()',wait:2000},
 {js:M}];
require('fs').writeFileSync(process.argv[2],JSON.stringify(steps));
