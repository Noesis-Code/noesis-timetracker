const M='(function(){var a=document.querySelector(".arGridArea");var ar=a.getBoundingClientRect();var mk=[...document.querySelectorAll(".arRail .goalsRowMarker")].map(m=>{var r=m.getBoundingClientRect();return (m.textContent||".")+(m.classList.contains("goalsRowMarker--current")?"*":"")+"@"+Math.round(r.top)+(r.top>=ar.top&&r.bottom<=ar.bottom?"v":"x")}).join(" ");return "scrollTop="+Math.round(a.scrollTop)+" area="+Math.round(ar.top)+"-"+Math.round(ar.bottom)+" "+mk})()';
const row=(r)=>[".arHoleBadge",".arSummary",".arCard"].map(k=>".goalsGridRow[data-rank=\'"+r+"\'] "+k).join(",");
const TAP=(sel,dy)=>'(function(){var r=document.querySelector("'+sel+'").getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2+'+(dy||0)+']})()';
const steps=[
 {js:'document.querySelector(".tabBtn[data-tab=goals]").click()',wait:1500},
 {js:'(document.getElementById("aiNoticeAck")||{click(){}}).click();(document.getElementById("marketingInviteNo")||{click(){}}).click();document.querySelector("#goalsPage1Switch .periodBtn[data-view=activities]").click()',wait:2500},
 {tap:TAP(row('202600'),30),wait:2200},
 {tap:TAP(row('202600'),30),wait:2500,shot:'periodes'},
 {js:'"PERIODES "+'+M},
 {tap:TAP(row('202612'),0),wait:2500,shot:'semaines'},
 {js:'"SEMAINES "+'+M},
 {js:'document.querySelector(".arZoomRow .cmpClose").click()',wait:2000,shot:'retour'},
 {js:'"RETOUR "+'+M}
];
require('fs').writeFileSync(process.argv[2],JSON.stringify(steps));
