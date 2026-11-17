const C='(function(){var g=document.querySelector(".arGrid");var rows=g?g.querySelectorAll(".goalsGridRow:not(.arMacroRow)").length:-1;var m=[...document.querySelectorAll(".arRail .goalsRowMarker")].map(x=>x.textContent||".").join(",");var c=[...document.querySelectorAll(".arCrumb,.arCrumbNow")].map(x=>x.textContent).join(">");return "rows="+rows+" crumbs="+c+" marks="+m})()';
const row=(r)=>[".arHoleBadge",".arSummary",".arCard"].map(k=>".goalsGridRow[data-rank=\'"+r+"\'] "+k).join(",");
const TAP=(sel,dy)=>'(function(){var r=document.querySelector("'+sel+'").getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2+'+(dy||0)+']})()';
const steps=[
 {js:'document.querySelector(".tabBtn[data-tab=goals]").click()',wait:1500},
 {js:'(document.getElementById("aiNoticeAck")||{click(){}}).click();(document.getElementById("marketingInviteNo")||{click(){}}).click();document.querySelector("#goalsPage1Switch .periodBtn[data-view=activities]").click()',wait:2500},
 {js:'"OPEN "+'+C},
 {tap:TAP(row('202600'),30),wait:2200},
 {js:'"BLOC-2026-30 "+'+C},
 {js:'document.querySelectorAll(".arCrumb")[0].click()',wait:1500},
 {tap:TAP(row('203100'),30),wait:2200},
 {js:'"BLOC-2031-35 "+'+C},
 {js:'document.querySelectorAll(".arCrumb")[0].click()',wait:1500},
 {tap:TAP(row('204600'),30),wait:2200},
 {js:'"BLOC-2046-50 "+'+C},
 {js:'document.querySelectorAll(".arCrumb")[0].click()',wait:1500},
 {tap:TAP(row('202600'),30),wait:2200},
 {tap:TAP(row('202600'),30),wait:2200},
 {js:'"ANNEE-2026 "+'+C},
 {js:'document.querySelectorAll(".arCrumb")[1].click()',wait:1800},
 {js:'"CRUMB-RETOUR-POLE "+'+C},
 {js:'document.querySelector(".tabBtn[data-tab=chrono]").click()',wait:1200},
 {js:'document.querySelector(".tabBtn[data-tab=goals]").click()',wait:2200},
 {js:'"RETOUR-BARRE "+'+C}
];
require('fs').writeFileSync(process.argv[2],JSON.stringify(steps));
