var SB_URL = 'https://djvzoqpgvxcezsxqlvuf.supabase.co';
var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqdnpvcXBndnhjZXpzeHFsdnVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3Nzk3MjYsImV4cCI6MjA5MTM1NTcyNn0._54P3DYTinP4t5yKjUX3tkGsVKEJLjA4APggq_F8VF4';
var PASSWORD = 'palante2022';

async function sbFetch(method, table, body, query) {
  var url = SB_URL + '/rest/v1/' + table + (query || '');
  var headers = {
    'apikey': SB_KEY,
    'Authorization': 'Bearer ' + SB_KEY,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
  if (method === 'POST') headers['Prefer'] = 'resolution=merge-duplicates';
  var opts = { method: method, headers: headers };
  if (body) opts.body = JSON.stringify(body);
  try {
    var res = await fetch(url, opts);
    if (!res.ok) { console.error('Supabase error:', res.status, table, query); return method === 'GET' ? [] : false; }
    if (method === 'GET') return await res.json();
    return true;
  } catch(e) { console.error('Fetch error:', e); return method === 'GET' ? [] : false; }
}

function tourToRow(t) {
  var vnet = (t.vendorNet && t.vendorNet > 0) ? t.vendorNet : Math.round(((t.gross||0) - (t.comm||0) - (t.fhFlat||0)) * 100) / 100;
  return { id:t.id, date:t.date, product:t.product||'Miami Wow Tour', type:t.type, guide:t.guide, channel:t.channel,
    adults:t.adults||0, children:t.children||0, infants:t.infants||0, pax:t.pax||0,
    gross:t.gross||0, comm:t.comm||0, fh_flat:t.fhFlat||0, fh_proc:t.fhProc||0, vendor_net:vnet,
    guide_pay:t.guidePay||0, drinks:t.drinks||0, other_exp:t.otherExp||0, profit:t.profit||0,
    notes:t.notes||'', paid_date:t.paidDate||null, paid_amount:t.paidAmount||null };
}
function rowToTour(r) {
  var vn = parseFloat(r.vendor_net);
  if (!(vn > 0)) vn = Math.round((parseFloat(r.gross||0) - parseFloat(r.comm||0) - parseFloat(r.fh_flat||0)) * 100) / 100;
  return { id:r.id, date:r.date, product:r.product||'Miami Wow Tour', type:r.type, guide:r.guide, channel:r.channel,
    adults:r.adults, children:r.children, infants:r.infants, pax:r.pax,
    gross:parseFloat(r.gross), comm:parseFloat(r.comm), fhFlat:parseFloat(r.fh_flat), fhProc:parseFloat(r.fh_proc),
    vendorNet:vn, guidePay:parseFloat(r.guide_pay), drinks:parseFloat(r.drinks), otherExp:parseFloat(r.other_exp),
    profit:parseFloat(r.profit), notes:r.notes, paidDate:r.paid_date, paidAmount:r.paid_amount?parseFloat(r.paid_amount):null };
}
function vpToRow(p) { return {id:p.id,channel:p.channel,date:p.date,amount:p.amount,notes:p.notes||''}; }
function rowToVP(r) { return {id:r.id,channel:r.channel,date:r.date,amount:parseFloat(r.amount),notes:r.notes}; }
function expToRow(e) { return {id:e.id,date:e.date,amount:e.amount,description:e.desc,paid_by:e.paidby}; }
function rowToExp(r) { return {id:r.id,date:r.date,amount:parseFloat(r.amount),desc:r.description,paidby:r.paid_by}; }

var TOURS = {
  'Miami Wow Tour': {adultPrice:62, childPrice:47, hasPrivate:true, privatePrice:500},
  'Little Havana After Dark': {adultPrice:72, childPrice:72, hasPrivate:false, privatePrice:0}
};
var CHANNELS = {
  Fareharbor:{rate:0.029,label:'Fareharbor',badge:'b-teal'},
  TripAdvisor:{rate:0.32,label:'TripAdvisor',badge:'b-blue'},
  Airbnb:{rate:0.20,label:'Airbnb',badge:'b-coral'},
  GYG:{rate:0.25,label:'GetYourGuide',badge:'b-amber'},
  Civitatis:{rate:0.25,label:'Civitatis',badge:'b-purple'}
};
var MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var FULLMONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
var DRINK=1.00, FH_PROC=0.02, FH_FLAT=0.30;
var tours=[], vendorPayments=[], expenses=[], filterMonth='all', modalTourId=null, editTourId=null;

function doLogin() {
  var val = document.getElementById('pw-input').value;
  if (val === PASSWORD) {
    document.getElementById('login-screen').style.display='none';
    localStorage.setItem('mwt-auth','1');
    loadAll();
  } else {
    document.getElementById('pw-error').style.display='block';
    document.getElementById('pw-input').value='';
  }
}
function logout() {
  localStorage.removeItem('mwt-auth');
  document.getElementById('pw-input').value='';
  document.getElementById('pw-error').style.display='none';
  document.getElementById('login-screen').style.display='flex';
}

function calcTourData(adults, children, infants, guide, channel, type, otherExp, product) {
  var tour = TOURS[product] || TOURS['Miami Wow Tour'];
  var gross = type === 'private' ? tour.privatePrice : (adults * tour.adultPrice + children * tour.childPrice);
  var pax = adults + children + infants;
  var comm = Math.round(gross * CHANNELS[channel].rate * 100) / 100;
  var fhFlat = channel === 'Fareharbor' ? FH_FLAT : 0;
  var vendorNet = Math.round((gross - comm - fhFlat) * 100) / 100;
  var fhProc = Math.round(gross * FH_PROC * 100) / 100;
  var guidePay;
  if (type === 'private') { guidePay = 80; }
  else if (guide === 'Noel') { guidePay = pax > 3 ? 100 : 75; }
  else { guidePay = pax > 3 ? 75 : 60; }
  var drinks = product === 'Miami Wow Tour' ? Math.round(pax * DRINK * 100) / 100 : 0;
  var exp = parseFloat(otherExp) || 0;
  var profit = Math.round((gross - comm - fhFlat - fhProc - guidePay - drinks - exp) * 100) / 100;
  return {gross:gross, comm:comm, fhFlat:fhFlat, fhProc:fhProc, vendorNet:vendorNet, guidePay:guidePay, drinks:drinks, otherExp:exp, profit:profit, pax:pax};
}

function calcTour() {
  var adults=parseInt(document.getElementById('f-adults').value)||0;
  var children=parseInt(document.getElementById('f-children').value)||0;
  var infants=parseInt(document.getElementById('f-infants').value)||0;
  var guide=document.getElementById('f-guide').value;
  var channel=document.getElementById('f-channel').value;
  var type=document.getElementById('f-type').value;
  var exp=parseFloat(document.getElementById('f-expenses').value)||0;
  var product=document.getElementById('f-product').value;
  var tour=TOURS[product]||TOURS['Miami Wow Tour'];
  document.getElementById('f-adults-label').textContent='Adults ($'+tour.adultPrice+')';
  document.getElementById('f-children-label').textContent='Children 7-12 ($'+tour.childPrice+')';
  var d=calcTourData(adults,children,infants,guide,channel,type,exp,product);
  document.getElementById('c-gross').textContent='$'+d.gross.toFixed(2);
  document.getElementById('c-comm').textContent='-$'+d.comm.toFixed(2)+' ('+Math.round(CHANNELS[channel].rate*100)+'%)';
  document.getElementById('c-fhproc').textContent='-$'+d.fhProc.toFixed(2);
  document.getElementById('c-fhflat-row').style.display=channel==='Fareharbor'?'flex':'none';
  document.getElementById('c-fhproc-row').style.display=channel==='Fareharbor'?'none':'flex';
  document.getElementById('c-guide').textContent='-$'+d.guidePay.toFixed(2);
  document.getElementById('c-drinks-row').style.display=product==='Miami Wow Tour'?'flex':'none';
  document.getElementById('c-drinks').textContent='-$'+d.drinks.toFixed(2)+' ('+d.pax+' x $1)';
  document.getElementById('c-exp').textContent=exp>0?'-$'+exp.toFixed(2):'$0.00';
  var pel=document.getElementById('c-profit');
  pel.textContent=(d.profit>=0?'$':'-$')+Math.abs(d.profit).toFixed(2);
  pel.style.color=d.profit>=0?'var(--teal)':'var(--red)';
}

function logTour() {
  var date=document.getElementById('f-date').value;
  if (!date){toast('Please select a date.',true);return;}
  var adults=parseInt(document.getElementById('f-adults').value)||0;
  var children=parseInt(document.getElementById('f-children').value)||0;
  var infants=parseInt(document.getElementById('f-infants').value)||0;
  if (adults+children+infants===0){toast('Please enter at least 1 guest.',true);return;}
  var guide=document.getElementById('f-guide').value;
  var channel=document.getElementById('f-channel').value;
  var type=document.getElementById('f-type').value;
  var exp=parseFloat(document.getElementById('f-expenses').value)||0;
  var notes=document.getElementById('f-notes').value;
  var product=document.getElementById('f-product').value;
  var d=calcTourData(adults,children,infants,guide,channel,type,exp,product);
  var t={id:Date.now(),date:date,adults:adults,children:children,infants:infants,guide:guide,channel:channel,type:type,otherExp:exp,notes:notes,product:product,gross:d.gross,comm:d.comm,fhProc:d.fhProc,fhFlat:d.fhFlat,vendorNet:d.vendorNet,guidePay:d.guidePay,drinks:d.drinks,profit:d.profit,pax:d.pax};
  tours.push(t); saveTours(); saveTour(t);
  toast('Tour saved!'); clearForm(); showView('dashboard');
}

function clearForm() {
  var today=new Date().toISOString().split('T')[0];
  document.getElementById('f-date').value=today;
  document.getElementById('f-product').value='Miami Wow Tour';
  document.getElementById('f-adults').value=0;
  document.getElementById('f-children').value=0;
  document.getElementById('f-infants').value=0;
  document.getElementById('f-expenses').value=0;
  document.getElementById('f-notes').value='';
  document.getElementById('f-type').value='regular';
  calcTour();
}

function deleteTour(id) {
  if (!confirm('Delete this tour? This cannot be undone.')) return;
  tours=tours.filter(function(t){return t.id!==id;});
  saveTours(); deleteTourDB(id);
  renderTours(); renderDashboard(); renderGuides();
  toast('Tour deleted.');
}

async function saveTour(t){await sbFetch('POST','tours',tourToRow(t),'?on_conflict=id');}
async function deleteTourDB(id){await sbFetch('DELETE','tours',null,'?id=eq.'+id);}
async function saveVPRecord(p){await sbFetch('POST','vendor_payments',vpToRow(p),'?on_conflict=id');}
async function deleteVPDB(id){await sbFetch('DELETE','vendor_payments',null,'?id=eq.'+id);}
async function saveExpRecord(e){await sbFetch('POST','expenses',expToRow(e),'?on_conflict=id');}
async function deleteExpDB(id){await sbFetch('DELETE','expenses',null,'?id=eq.'+id);}
function saveTours(){try{localStorage.setItem('mwt-tours-2026',JSON.stringify(tours));}catch(e){}}
function saveVP(){try{localStorage.setItem('mwt-vp-2026',JSON.stringify(vendorPayments));}catch(e){}}
function saveExp(){try{localStorage.setItem('mwt-exp-2026',JSON.stringify(expenses));}catch(e){}}

function showLoading(msg){var el=document.getElementById('loading-overlay');var ml=document.getElementById('loading-msg');if(el)el.style.display='flex';if(ml)ml.textContent=msg||'Loading...';}
function hideLoading(){var el=document.getElementById('loading-overlay');if(el)el.style.display='none';}

async function loadAll() {
  showLoading('Loading your data...');
  var today=new Date().toISOString().split('T')[0];
  document.getElementById('f-date').value=today;
  document.getElementById('vp-date').value=today;
  document.getElementById('exp-date').value=today;
  try {
    var tRows=await sbFetch('GET','tours',null,'?order=date.asc&limit=10000');
    if (Array.isArray(tRows)&&tRows.length>0){tours=tRows.map(rowToTour);saveTours();}
    else{var raw=localStorage.getItem('mwt-tours-2026');tours=raw?JSON.parse(raw):[];}
  } catch(e){var raw=localStorage.getItem('mwt-tours-2026');tours=raw?JSON.parse(raw):[];}
  try {
    var vpRows=await sbFetch('GET','vendor_payments',null,'?order=date.asc&limit=10000');
    vendorPayments=Array.isArray(vpRows)?vpRows.map(rowToVP):[];saveVP();
  } catch(e){var vraw=localStorage.getItem('mwt-vp-2026');vendorPayments=vraw?JSON.parse(vraw):[];}
  try {
    var eRows=await sbFetch('GET','expenses',null,'?order=date.asc&limit=10000');
    expenses=Array.isArray(eRows)?eRows.map(rowToExp):[];saveExp();
  } catch(e){var eraw=localStorage.getItem('mwt-exp-2026');expenses=eraw?JSON.parse(eraw):[];}
  hideLoading(); renderDashboard(); renderTours(); renderGuides();
}

function getPax(t){return t.pax||t.totalPax||0;}
function fmt(d){var p=d.split('-');return MONTHS[parseInt(p[1])-1]+' '+parseInt(p[2])+', '+p[0];}
function fmtM(d){return new Date(d+'T00:00:00').getMonth();}
function ch(channel){return CHANNELS[channel]||{label:channel,badge:'b-gray'};}
function badge(channel){return '<span class="badge '+ch(channel).badge+'">'+ch(channel).label+'</span>';}
function typeBadge(type){return type==='private'?'<span class="badge b-dark">Private</span>':'Regular';}
function toast(msg,isErr){var t=document.getElementById('toast');t.textContent=msg;t.style.background=isErr?'var(--red)':'var(--teal)';t.style.display='block';setTimeout(function(){t.style.display='none';},3000);}

function showView(v) {
  var views=['dashboard','log','tours','guides','payreport','payments','expenses','reconcile'];
  for (var i=0;i!==views.length;i++) {
    var el=document.getElementById('view-'+views[i]);if(el)el.classList.remove('active');
    var btn=document.querySelectorAll('.nav-btn')[i];if(btn)btn.classList.remove('active');
  }
  var active=document.getElementById('view-'+v);if(active)active.classList.add('active');
  var idx=views.indexOf(v);if(idx>=0){var ab=document.querySelectorAll('.nav-btn')[idx];if(ab)ab.classList.add('active');}
  if(v==='dashboard')renderDashboard();
  if(v==='log')calcTour();
  if(v==='tours')renderTours();
  if(v==='guides')renderGuides();
  if(v==='payreport')renderPayReport();
  if(v==='payments')renderPayments();
  if(v==='expenses')renderExpenses();
  if(v==='reconcile')renderReconcile();
}

function filteredTours(){if(filterMonth==='all')return tours;return tours.filter(function(t){return fmtM(t.date)===parseInt(filterMonth);});}

function renderDashboard() {
  var m=document.getElementById('dash-month').value;
  var data=m==='all'?tours:tours.filter(function(t){return fmtM(t.date)===parseInt(m);});
  var gross=0,profit=0,guests=0;
  data.forEach(function(t){
    gross+=t.gross;
    profit+=Math.round((t.gross-t.comm-(t.fhFlat||0)-(t.fhProc||0)-t.guidePay-(t.drinks||0)-(t.otherExp||0))*100)/100;
    guests+=getPax(t);
  });
  var expF=m==='all'?expenses:expenses.filter(function(e){return fmtM(e.date)===parseInt(m);});
  profit=Math.round((profit-expF.reduce(function(s,e){return s+e.amount;},0))*100)/100;
  document.getElementById('d-tours').textContent=data.length;
  document.getElementById('d-guests').textContent=guests;
  document.getElementById('d-gross').textContent='$'+gross.toFixed(2);
  var pel=document.getElementById('d-profit');
  pel.textContent=(profit>=0?'$':'-$')+Math.abs(profit).toFixed(2);
  pel.className='metric-value '+(profit>=0?'green':'red');
  var paid=data.filter(function(t){return t.paidDate;});
  var unpaid=data.filter(function(t){return !t.paidDate;});
  var received=paid.reduce(function(s,t){return s+(t.paidAmount||0);},0);
  var outstanding=unpaid.reduce(function(s,t){var net=t.vendorNet>0?t.vendorNet:Math.round((t.gross-t.comm-(t.fhFlat||0))*100)/100;return s+net;},0);
  var vpf=m==='all'?vendorPayments:vendorPayments.filter(function(p){return fmtM(p.date)===parseInt(m);});
  document.getElementById('d-received').textContent='$'+received.toFixed(2);
  document.getElementById('d-outstanding').textContent='$'+outstanding.toFixed(2);
  document.getElementById('d-unpaid').textContent=unpaid.length;
  document.getElementById('d-venpay').textContent=vpf.length;
  var chs={};
  data.forEach(function(t){if(!chs[t.channel])chs[t.channel]={net:0,count:0};chs[t.channel].net+=t.gross-t.comm;chs[t.channel].count++;});
  var cgHtml='';
  Object.keys(CHANNELS).forEach(function(c){var v=chs[c];cgHtml+='<div class="ch-card"><div class="ch-name">'+CHANNELS[c].label+'</div><div class="ch-val">'+(v?'$'+v.net.toFixed(2):'&mdash;')+'</div><div class="ch-count">'+(v?v.count+' tour'+(v.count!==1?'s':''):'No tours')+'</div></div>';});
  document.getElementById('channel-grid').innerHTML=cgHtml;
  var last5=data.slice().sort(function(a,b){return new Date(b.date)-new Date(a.date);}).slice(0,5);
  if(last5.length===0){document.getElementById('recent-table').innerHTML='<div class="empty">No tours yet.</div>';renderAttendanceChart();return;}
  var rHtml='<table><thead><tr><th>Date</th><th>Guide</th><th>Type</th><th>Guests</th><th>Channel</th><th>Gross</th><th>Profit</th></tr></thead><tbody>';
  last5.forEach(function(t){var tp=Math.round((t.gross-t.comm-(t.fhFlat||0)-(t.fhProc||0)-t.guidePay-(t.drinks||0)-(t.otherExp||0))*100)/100;rHtml+='<tr><td>'+fmt(t.date)+'</td><td style="font-weight:600;">'+t.guide+'</td><td>'+typeBadge(t.type)+'</td><td>'+getPax(t)+'</td><td>'+badge(t.channel)+'</td><td class="mono">$'+t.gross.toFixed(2)+'</td><td class="'+(tp>=0?'pos':'neg')+'">$'+tp.toFixed(2)+'</td></tr>';});
  rHtml+='</tbody></table>';
  document.getElementById('recent-table').innerHTML=rHtml;
  renderAttendanceChart();
}

function renderAttendanceChart() {
  var canvas = document.getElementById('attendance-chart');
  if (!canvas) return;
  // Use the parent container width for reliable sizing
  var parent = canvas.parentElement;
  var W = (parent ? parent.clientWidth - 40 : 0) || 600;
  var H = 220;
  canvas.width  = W;
  canvas.height = H;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  var ctx = canvas.getContext('2d');

  var monthPax   = new Array(12).fill(0);
  var monthTours = new Array(12).fill(0);
  tours.forEach(function(t) {
    var mo = new Date(t.date + 'T00:00:00').getMonth();
    monthPax[mo]   += getPax(t);
    monthTours[mo] += 1;
  });
  var maxPax = Math.max.apply(null, monthPax) || 1;

  var padL = 44, padR = 12, padT = 18, padB = 24;
  var chartW = W - padL - padR;
  var chartH = H - padT - padB;
  var gap  = Math.floor(chartW / 12);
  var barW = Math.max(8, Math.floor(gap * 0.6));

  ctx.clearRect(0, 0, W, H);

  // Y-axis grid lines + guest count labels on left
  var labelColor = 'rgba(0,0,0,0.50)';
  var gridColor  = 'rgba(0,0,0,0.08)';
  ctx.font = '10px DM Sans,system-ui,sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (var gi = 0; gi <= 4; gi++) {
    var yVal = Math.round(maxPax * gi / 4);
    var yPos = padT + chartH - Math.round(chartH * gi / 4);
    ctx.strokeStyle = gi === 0 ? 'rgba(0,0,0,0.15)' : gridColor;
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.moveTo(padL, yPos);
    ctx.lineTo(W - padR, yPos);
    ctx.stroke();
    if (gi > 0) { ctx.fillStyle = labelColor; ctx.fillText(yVal, padL - 6, yPos); }
  }

  var currentMonth = new Date().getMonth();
  var barColor  = '#4dd9a8';
  var barActive = '#7ee8c8';
  var zeroColor = 'rgba(0,0,0,0.08)';

  for (var mi = 0; mi < 12; mi++) {
    var bx = padL + mi * gap + Math.floor((gap - barW) / 2);
    var barH_px, fc;
    if (monthPax[mi] === 0) {
      barH_px = 2; fc = zeroColor;
    } else {
      barH_px = Math.max(4, Math.round(chartH * monthPax[mi] / maxPax));
      fc = (mi === currentMonth) ? barActive : barColor;
    }
    var yTop = padT + chartH - barH_px;
    var r = Math.min(4, Math.floor(barW / 2), Math.floor(barH_px / 2));
    ctx.fillStyle = fc;
    ctx.beginPath();
    ctx.moveTo(bx+r,yTop); ctx.lineTo(bx+barW-r,yTop);
    ctx.quadraticCurveTo(bx+barW,yTop,bx+barW,yTop+r);
    ctx.lineTo(bx+barW,padT+chartH); ctx.lineTo(bx,padT+chartH);
    ctx.lineTo(bx,yTop+r); ctx.quadraticCurveTo(bx,yTop,bx+r,yTop);
    ctx.closePath(); ctx.fill();
    // Guest count above bar
    if (monthPax[mi] > 0) {
      ctx.fillStyle = (mi===currentMonth) ? barActive : labelColor;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.font = '9px DM Sans,system-ui,sans-serif';
      ctx.fillText(monthPax[mi], bx + barW/2, yTop - 2);
    }
    // 3-letter month name below bar
    ctx.fillStyle = (mi===currentMonth) ? barActive : labelColor;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = (mi===currentMonth) ? 'bold 10px DM Sans,system-ui,sans-serif' : '10px DM Sans,system-ui,sans-serif';
    ctx.fillText(MONTHS[mi], bx + barW/2, padT + chartH + 5);
  }

  canvas._bars = monthPax.map(function(pax,mi) {
    return {x:padL+mi*gap+Math.floor((gap-barW)/2),w:barW,pax:pax,tours:monthTours[mi],label:MONTHS[mi]};
  });
}
(function(){
  var tip=null;
  function ensureTip(){if(tip)return;tip=document.createElement('div');tip.style.cssText='position:fixed;background:rgba(10,20,35,0.95);color:#e8f0fe;padding:8px 14px;border-radius:8px;font-size:12px;line-height:1.6;pointer-events:none;display:none;z-index:9999;font-family:DM Sans,system-ui,sans-serif;border:1px solid rgba(77,217,168,0.25);';document.body.appendChild(tip);}
  function attach(){
    var canvas=document.getElementById('attendance-chart');
    if(!canvas||canvas._tipAttached)return;
    canvas._tipAttached=true;ensureTip();
    canvas.addEventListener('mousemove',function(e){
      if(!canvas._bars)return;
      var rect=canvas.getBoundingClientRect(),scaleX=canvas.width/rect.width,px=(e.clientX-rect.left)*scaleX,found=null;
      canvas._bars.forEach(function(b){if(px>=b.x&&px<=b.x+b.w)found=b;});
      if(found&&found.pax>0){tip.innerHTML='<strong style="color:#4dd9a8;">'+found.label+' 2026</strong><br>'+found.pax+' guests &nbsp;&bull;&nbsp; '+found.tours+' tour'+(found.tours!==1?'s':'');tip.style.display='block';tip.style.left=(e.clientX+14)+'px';tip.style.top=(e.clientY-12)+'px';}
      else{tip.style.display='none';}
    });
    canvas.addEventListener('mouseleave',function(){if(tip)tip.style.display='none';});
  }
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',function(){setTimeout(attach,500);});}else{setTimeout(attach,500);}
  var _orig=window.hideLoading;window.hideLoading=function(){if(_orig)_orig();setTimeout(attach,200);};
})();

function renderTours(){
  var usedMonths=[];
  tours.forEach(function(t){var m=fmtM(t.date);if(usedMonths.indexOf(m)===-1)usedMonths.push(m);});
  usedMonths.sort(function(a,b){return a-b;});
  var mfHtml='<button class="mbtn '+(filterMonth==='all'?'active':'')+' " onclick="setFilter(\'all\')">All</button>';
  usedMonths.forEach(function(m){mfHtml+='<button class="mbtn '+(filterMonth==m?'active':'')+' " onclick="setFilter('+m+')">'+FULLMONTHS[m]+'</button>';});
  document.getElementById('month-filters').innerHTML=mfHtml;
  var data=filteredTours().slice().sort(function(a,b){return new Date(b.date)-new Date(a.date);});
  if(data.length===0){document.getElementById('tours-table').innerHTML='<div class="empty">No tours found.</div>';return;}
  var html='<table><thead><tr><th>Date</th><th>Tour</th><th>Type</th><th>Guide</th><th>Adults</th><th>Kids</th><th>U7</th><th>Channel</th><th>Gross</th><th>Comm</th><th>FH</th><th>Guide pay</th><th>Drinks</th><th>Other</th><th>Profit</th><th>Notes</th><th></th></tr></thead><tbody>';
  data.forEach(function(t){
    var product=t.product||'Miami Wow Tour';
    var pb=product==='Little Havana After Dark'?'<span class="badge b-purple" style="font-size:10px;">LH After Dark</span>':'<span class="badge b-teal" style="font-size:10px;">MWT</span>';
    var tp=Math.round((t.gross-t.comm-(t.fhFlat||0)-(t.fhProc||0)-t.guidePay-(t.drinks||0)-(t.otherExp||0))*100)/100;
    html+='<tr><td style="white-space:nowrap;">'+fmt(t.date)+'</td><td>'+pb+'</td><td>'+typeBadge(t.type)+'</td><td style="font-weight:600;">'+t.guide+'</td><td>'+t.adults+'</td><td>'+t.children+'</td><td>'+t.infants+'</td><td>'+badge(t.channel)+'</td><td class="mono">$'+t.gross.toFixed(2)+'</td><td class="mono" style="color:var(--red);">-$'+t.comm.toFixed(2)+'</td><td class="mono" style="color:var(--red);">-$'+(t.fhProc||0).toFixed(2)+'</td><td class="mono" style="color:var(--red);">-$'+t.guidePay.toFixed(2)+'</td><td class="mono" style="color:var(--amber);">'+((t.drinks||0)>0?'-$'+(t.drinks||0).toFixed(2):'&mdash;')+'</td><td class="mono" style="color:var(--red);">'+(t.otherExp>0?'-$'+t.otherExp.toFixed(2):'&mdash;')+'</td><td class="'+(tp>=0?'pos':'neg')+'">$'+tp.toFixed(2)+'</td><td style="color:var(--text3);font-size:12px;">'+(t.notes||'&mdash;')+'</td><td style="white-space:nowrap;"><button class="btn-secondary btn-sm" onclick="openEditModal('+t.id+')" style="margin-right:4px;">Edit</button><button class="btn-danger" onclick="deleteTour('+t.id+')">Delete</button></td></tr>';
  });
  html+='</tbody></table>';
  document.getElementById('tours-table').innerHTML=html;
}

function setFilter(m){filterMonth=m;renderTours();}

function renderGuides(){
  var g={};
  tours.forEach(function(t){if(!g[t.guide])g[t.guide]={tours:0,guests:0,pay:0,gross:0,net:0,profit:0};g[t.guide].tours++;g[t.guide].guests+=getPax(t);g[t.guide].pay+=t.guidePay;g[t.guide].gross+=t.gross;g[t.guide].net+=(t.gross-t.comm);g[t.guide].profit+=t.profit;});
  if(Object.keys(g).length===0){document.getElementById('guides-table').innerHTML='<div class="empty">No tours yet.</div>';return;}
  var html='<table><thead><tr><th>Guide</th><th>Tours</th><th>Guests</th><th>Avg pax</th><th>Total pay</th><th>Gross rev</th><th>Net rev</th><th>Profit</th></tr></thead><tbody>';
  var entries=Object.keys(g).map(function(k){return[k,g[k]];});
  entries.sort(function(a,b){return b[1].tours-a[1].tours;});
  entries.forEach(function(e){var name=e[0],v=e[1];html+='<tr><td style="font-weight:600;">'+name+'</td><td>'+v.tours+'</td><td>'+v.guests+'</td><td>'+(v.guests/v.tours).toFixed(1)+'</td><td class="mono">$'+v.pay.toFixed(2)+'</td><td class="mono">$'+v.gross.toFixed(2)+'</td><td class="mono">$'+v.net.toFixed(2)+'</td><td class="'+(v.profit>=0?'pos':'neg')+'">$'+v.profit.toFixed(2)+'</td></tr>';});
  html+='</tbody></table>';
  document.getElementById('guides-table').innerHTML=html;
}

function renderPayReport(){var m=document.getElementById('pr-month').value;var sg=document.getElementById('pr-guide').value;var data=tours.filter(function(t){return(m==='all'||fmtM(t.date)===parseInt(m))&&(sg==='all'||t.guide===sg);}).sort(function(a,b){return new Date(b.date)-new Date(a.date);});var totPay=data.reduce(function(s,t){return s+t.guidePay;},0);var totDrinks=data.reduce(function(s,t){return s+(t.drinks||0);},0);var totOther=data.reduce(function(s,t){return s+(t.otherExp||0);},0);document.getElementById('pr-summary').innerHTML='<div class="metric"><div class="metric-label">Tours worked</div><div class="metric-value">'+data.length+'</div></div><div class="metric"><div class="metric-label">Total tour pay</div><div class="metric-value green">$'+totPay.toFixed(2)+'</div></div><div class="metric"><div class="metric-label">Total reimbursements</div><div class="metric-value amber">$'+(totDrinks+totOther).toFixed(2)+'</div></div>';if(data.length===0){document.getElementById('pr-content').innerHTML='<div class="card"><div class="empty">No tours found.</div></div>';return;}var byGuide={};data.forEach(function(t){if(!byGuide[t.guide])byGuide[t.guide]=[];byGuide[t.guide].push(t);});var html='';Object.keys(byGuide).sort().forEach(function(guide){var gt=byGuide[guide];var gPay=gt.reduce(function(s,t){return s+t.guidePay;},0);var gDrinks=gt.reduce(function(s,t){return s+(t.drinks||0);},0);var gOther=gt.reduce(function(s,t){return s+(t.otherExp||0);},0);var gReimb=gDrinks+gOther,gTotal=gPay+gReimb;var period=m==='all'?'Full year 2026':FULLMONTHS[parseInt(m)];html+='<div class="card" style="margin-bottom:1.25rem;"><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1rem;flex-wrap:wrap;gap:12px;"><div><div style="font-size:18px;font-weight:600;">'+guide+'</div><div style="font-size:12px;color:var(--text3);">'+gt.length+' tour'+(gt.length!==1?'s':'')+' &bull; '+period+'</div></div><div style="display:flex;gap:20px;text-align:right;flex-wrap:wrap;"><div><div style="font-size:11px;color:var(--text3);text-transform:uppercase;font-weight:600;">Tour pay</div><div style="font-size:18px;font-weight:600;font-family:DM Mono,monospace;color:var(--teal);">$'+gPay.toFixed(2)+'</div></div><div><div style="font-size:11px;color:var(--text3);text-transform:uppercase;font-weight:600;">Drinks</div><div style="font-size:18px;font-weight:600;font-family:DM Mono,monospace;color:var(--amber);">$'+gDrinks.toFixed(2)+'</div></div><div><div style="font-size:11px;color:var(--text3);text-transform:uppercase;font-weight:600;">Other reimb.</div><div style="font-size:18px;font-weight:600;font-family:DM Mono,monospace;color:var(--amber);">$'+gOther.toFixed(2)+'</div></div><div><div style="font-size:11px;color:var(--text3);text-transform:uppercase;font-weight:600;">Total owed</div><div style="font-size:18px;font-weight:600;font-family:DM Mono,monospace;">$'+gTotal.toFixed(2)+'</div></div></div></div>';html+='<div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Channel</th><th>Guests</th><th>Tour pay</th><th>Drinks</th><th>Other</th><th>Total</th><th>Notes</th></tr></thead><tbody>';gt.forEach(function(t){var dr=t.drinks||0,oe=t.otherExp||0,tot=t.guidePay+dr+oe;html+='<tr><td style="white-space:nowrap;">'+fmt(t.date)+'</td><td>'+typeBadge(t.type)+'</td><td>'+badge(t.channel)+'</td><td>'+getPax(t)+' pax</td><td class="mono pos">$'+t.guidePay.toFixed(2)+'</td><td class="mono" style="color:var(--amber);">$'+dr.toFixed(2)+'</td><td class="mono" style="color:var(--amber);">'+(oe>0?'$'+oe.toFixed(2):'&mdash;')+'</td><td class="mono" style="font-weight:600;">$'+tot.toFixed(2)+'</td><td style="color:var(--text3);font-size:12px;">'+(t.notes||'&mdash;')+'</td></tr>';});html+='</tbody><tfoot><tr><td colspan="4" style="padding:12px;font-weight:600;">Total</td><td class="mono pos" style="padding:12px;font-weight:600;">$'+gPay.toFixed(2)+'</td><td class="mono" style="color:var(--amber);padding:12px;font-weight:600;">$'+gDrinks.toFixed(2)+'</td><td class="mono" style="color:var(--amber);padding:12px;font-weight:600;">$'+gOther.toFixed(2)+'</td><td class="mono" style="font-weight:700;padding:12px;font-size:14px;">$'+gTotal.toFixed(2)+'</td><td></td></tr></tfoot></table></div>';html+='<div style="margin-top:1rem;padding:12px 16px;background:var(--bg);border-radius:var(--rs);border:1px solid var(--border);display:flex;gap:24px;flex-wrap:wrap;"><div style="font-size:12px;color:var(--text2);"><strong>For 1099:</strong> Tour pay = <span class="mono" style="color:var(--teal);font-weight:600;">$'+gPay.toFixed(2)+'</span></div><div style="font-size:12px;color:var(--text2);"><strong>Reimbursements</strong> (not taxable) = <span class="mono" style="color:var(--amber);font-weight:600;">$'+gReimb.toFixed(2)+'</span></div></div></div>';});document.getElementById('pr-content').innerHTML=html;}

function exportPayCSV(){var m=document.getElementById('pr-month').value,sg=document.getElementById('pr-guide').value;var data=tours.filter(function(t){return(m==='all'||fmtM(t.date)===parseInt(m))&&(sg==='all'||t.guide===sg);}).sort(function(a,b){return new Date(a.date)-new Date(b.date);});var rows=[['Guide','Date','Type','Channel','Guests','Tour Pay','Drinks','Other','Total Reimb','Total Owed','Notes']];data.forEach(function(t){var dr=t.drinks||0,oe=t.otherExp||0;rows.push([t.guide,t.date,t.type,ch(t.channel).label,getPax(t),t.guidePay.toFixed(2),dr.toFixed(2),oe.toFixed(2),(dr+oe).toFixed(2),(t.guidePay+dr+oe).toFixed(2),t.notes||'']);});downloadCSV(rows,'MWT_PayReport.csv');}

function openPayModal(id){var t=tours.find(function(t){return t.id===id;});if(!t)return;modalTourId=id;var vn=t.vendorNet>0?t.vendorNet:Math.round((t.gross-t.comm-(t.fhFlat||0))*100)/100;document.getElementById('modal-label').textContent=fmt(t.date)+' — '+ch(t.channel).label+' — Expected: $'+vn.toFixed(2);document.getElementById('modal-date').value=new Date().toISOString().split('T')[0];document.getElementById('modal-amount').value=vn.toFixed(2);document.getElementById('pay-modal-bg').style.display='flex';}
function closeModal(){document.getElementById('pay-modal-bg').style.display='none';modalTourId=null;}
function savePayment(){if(!modalTourId)return;var date=document.getElementById('modal-date').value;var amount=parseFloat(document.getElementById('modal-amount').value)||0;if(!date){toast('Please enter a date.',true);return;}var t=tours.find(function(t){return t.id===modalTourId;});if(t){t.paidDate=date;t.paidAmount=amount;}saveTours();if(t)saveTour(t);closeModal();renderPayments();renderDashboard();toast('Payment recorded!');}
function unmarkPaid(id){if(!confirm('Remove payment record?'))return;var t=tours.find(function(t){return t.id===id;});if(t){delete t.paidDate;delete t.paidAmount;}saveTours();if(t)saveTour(t);renderPayments();renderDashboard();toast('Payment removed.');}
function logVendorPayment(){var channel=document.getElementById('vp-channel').value;var date=document.getElementById('vp-date').value;var amount=parseFloat(document.getElementById('vp-amount').value)||0;var notes=document.getElementById('vp-notes').value;if(!date){toast('Please enter a date.',true);return;}if(!(amount>0)){toast('Please enter an amount.',true);return;}var p={id:Date.now(),channel:channel,date:date,amount:amount,notes:notes};vendorPayments.push(p);saveVP();saveVPRecord(p);document.getElementById('vp-amount').value='';document.getElementById('vp-notes').value='';renderPayments();renderDashboard();toast('Vendor payment saved!');}
function deleteVP(id){if(!confirm('Delete this vendor payment?'))return;vendorPayments=vendorPayments.filter(function(p){return p.id!==id;});saveVP();deleteVPDB(id);renderPayments();renderDashboard();toast('Deleted.');}

function renderPayments(){var m=document.getElementById('pay-mf').value;var tourData=(m==='all'?tours:tours.filter(function(t){return fmtM(t.date)===parseInt(m);})).sort(function(a,b){return new Date(b.date)-new Date(a.date);});var paidC=tourData.filter(function(t){return t.paidDate;}).length;var unpaidC=tourData.filter(function(t){return !t.paidDate;}).length;document.getElementById('tour-pay-summary').innerHTML='<span style="color:var(--teal);font-weight:600;">'+paidC+' paid</span> &nbsp;&bull;&nbsp; <span style="color:var(--amber);font-weight:600;">'+unpaidC+' pending</span>';var totalGross=tourData.reduce(function(s,t){return s+t.gross;},0);var totalNet=tourData.reduce(function(s,t){var net=t.vendorNet>0?t.vendorNet:Math.round((t.gross-t.comm-(t.fhFlat||0))*100)/100;return s+net;},0);var totalReceived=tourData.filter(function(t){return t.paidDate;}).reduce(function(s,t){return s+(t.paidAmount||0);},0);var totalPending=tourData.filter(function(t){return !t.paidDate;}).reduce(function(s,t){var net=t.vendorNet>0?t.vendorNet:Math.round((t.gross-t.comm-(t.fhFlat||0))*100)/100;return s+net;},0);if(tourData.length===0){document.getElementById('tour-pay-table').innerHTML='<div class="empty">No tours.</div>';}else{var html='<table><thead><tr><th>Date</th><th>Tour</th><th>Channel</th><th>Gross</th><th>Expected net</th><th>Status</th><th>Paid date</th><th>Received</th><th></th></tr></thead><tbody>';tourData.forEach(function(t){var paid=!!t.paidDate;var netExp=t.vendorNet>0?t.vendorNet:Math.round((t.gross-t.comm-(t.fhFlat||0))*100)/100;var product=t.product||'Miami Wow Tour';var pb=product==='Little Havana After Dark'?'<span class="badge b-purple" style="font-size:10px;">LH</span>':'<span class="badge b-teal" style="font-size:10px;">MWT</span>';html+='<tr><td style="white-space:nowrap;font-size:12px;">'+fmt(t.date)+'</td><td>'+pb+'</td><td>'+badge(t.channel)+'</td><td class="mono" style="font-size:12px;">$'+t.gross.toFixed(2)+'</td><td class="mono pos" style="font-size:12px;font-weight:600;">$'+netExp.toFixed(2)+'</td><td>'+(paid?'<span class="badge b-green">Paid</span>':'<span class="badge b-yellow">Pending</span>')+'</td><td style="font-size:12px;color:var(--text2);">'+(paid?fmt(t.paidDate):'&mdash;')+'</td><td class="mono" style="font-size:12px;color:'+(paid?'var(--teal)':'var(--text3)')+';">'+(paid?'$'+(t.paidAmount||0).toFixed(2):'&mdash;')+'</td><td>'+(paid?'<button class="btn-danger" onclick="unmarkPaid('+t.id+')">Undo</button>':'<button class="btn-secondary btn-sm" onclick="openPayModal('+t.id+')">Mark paid</button>')+'</td></tr>';});html+='</tbody><tfoot><tr><td colspan="3" style="padding:10px 12px;font-weight:600;font-size:12px;">Total</td><td class="mono" style="padding:10px 12px;font-size:12px;font-weight:600;">$'+totalGross.toFixed(2)+'</td><td class="mono pos" style="padding:10px 12px;font-size:12px;font-weight:600;">$'+totalNet.toFixed(2)+'</td><td colspan="2" style="padding:10px 12px;font-size:12px;color:var(--text2);">'+paidC+' of '+tourData.length+' paid</td><td class="mono pos" style="padding:10px 12px;font-size:12px;font-weight:600;">$'+totalReceived.toFixed(2)+'</td><td></td></tr><tr><td colspan="3" style="padding:6px 12px;font-size:12px;color:var(--amber);font-weight:600;">Pending (net)</td><td colspan="5" style="padding:6px 12px;font-size:12px;font-weight:600;" class="mono">$'+totalPending.toFixed(2)+'</td><td></td></tr></tfoot></table>';document.getElementById('tour-pay-table').innerHTML=html;}var vpData=(m==='all'?vendorPayments:vendorPayments.filter(function(p){return fmtM(p.date)===parseInt(m);})).sort(function(a,b){return new Date(b.date)-new Date(a.date);});if(vpData.length===0){document.getElementById('vendor-pay-table').innerHTML='<div style="font-size:13px;color:var(--text3);padding:8px 0;">No vendor payments logged yet.</div>';}else{var vhtml='<table><thead><tr><th>Date</th><th>Vendor</th><th>Amount</th><th>Notes</th><th></th></tr></thead><tbody>';vpData.forEach(function(p){vhtml+='<tr><td style="white-space:nowrap;font-size:12px;">'+fmt(p.date)+'</td><td>'+badge(p.channel)+'</td><td class="mono pos" style="font-size:12px;">$'+p.amount.toFixed(2)+'</td><td style="font-size:12px;color:var(--text2);">'+(p.notes||'&mdash;')+'</td><td><button class="btn-danger" onclick="deleteVP('+p.id+')">Delete</button></td></tr>';});vhtml+='</tbody></table>';document.getElementById('vendor-pay-table').innerHTML=vhtml;}}

function addExpense(){var date=document.getElementById('exp-date').value;var amount=parseFloat(document.getElementById('exp-amount').value)||0;var desc=document.getElementById('exp-desc').value.trim();var paidby=document.getElementById('exp-paidby').value;if(!date){toast('Please select a date.',true);return;}if(!(amount>0)){toast('Please enter an amount.',true);return;}if(!desc){toast('Please enter a description.',true);return;}var e={id:Date.now(),date:date,amount:amount,desc:desc,paidby:paidby};expenses.push(e);saveExp();saveExpRecord(e);document.getElementById('exp-amount').value='';document.getElementById('exp-desc').value='';renderExpenses();toast('Expense added!');}
function deleteExpense(id){if(!confirm('Delete this expense?'))return;expenses=expenses.filter(function(e){return e.id!==id;});saveExp();deleteExpDB(id);renderExpenses();toast('Deleted.');}
function renderExpenses(){var m=document.getElementById('exp-mf').value;var filtered=m==='all'?expenses:expenses.filter(function(e){return fmtM(e.date)===parseInt(m);});var sorted=filtered.slice().sort(function(a,b){return new Date(b.date)-new Date(a.date);});var totalAll=expenses.reduce(function(s,e){return s+e.amount;},0);var totalFiltered=filtered.reduce(function(s,e){return s+e.amount;},0);document.getElementById('exp-total').textContent='$'+totalAll.toFixed(2);document.getElementById('exp-period').textContent='$'+totalFiltered.toFixed(2);document.getElementById('exp-count').textContent=filtered.length;if(sorted.length===0){document.getElementById('expenses-table').innerHTML='<div class="empty">No expenses logged yet.</div>';return;}var running=0;var withRunning=sorted.slice().reverse().map(function(e){running+=e.amount;return{e:e,r:running};}).reverse();var html='<table><thead><tr><th>Date</th><th>Description</th><th>Paid by</th><th style="text-align:right;">Amount</th><th style="text-align:right;">Running total</th><th></th></tr></thead><tbody>';withRunning.forEach(function(item){var e=item.e,r=item.r;html+='<tr><td style="white-space:nowrap;font-size:13px;">'+fmt(e.date)+'</td><td style="font-size:13px;">'+e.desc+'</td><td><span class="badge b-gray" style="font-size:11px;">'+e.paidby+'</span></td><td class="mono neg" style="text-align:right;">$'+e.amount.toFixed(2)+'</td><td class="mono" style="text-align:right;color:var(--text2);font-size:12px;">$'+r.toFixed(2)+'</td><td><button class="btn-danger" onclick="deleteExpense('+e.id+')">Delete</button></td></tr>';});html+='</tbody><tfoot><tr><td colspan="3" style="padding:12px;font-weight:600;">'+(m==='all'?'Year total':'Period total')+'</td><td class="mono neg" style="text-align:right;padding:12px;font-weight:700;font-size:14px;">$'+totalFiltered.toFixed(2)+'</td><td colspan="2"></td></tr></tfoot></table>';document.getElementById('expenses-table').innerHTML=html;}
function exportExpCSV(){var m=document.getElementById('exp-mf').value;var filtered=m==='all'?expenses:expenses.filter(function(e){return fmtM(e.date)===parseInt(m);});var sorted=filtered.slice().sort(function(a,b){return new Date(a.date)-new Date(b.date);});var rows=[['Date','Description','Paid By','Amount']];sorted.forEach(function(e){rows.push([e.date,e.desc,e.paidby,e.amount.toFixed(2)]);});rows.push(['','','TOTAL',filtered.reduce(function(s,e){return s+e.amount;},0).toFixed(2)]);downloadCSV(rows,'MWT_Expenses_2026.csv');}

function downloadCSV(rows,filename){var csv=rows.map(function(r){return r.map(function(v){return '"'+String(v).replace(/"/g,'""')+'"';}).join(',');}).join('\n');var a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);a.download=filename;a.click();}
function exportCSV(){var rows=[['Date','Type','Guide','Adults','Kids','U7','Pax','Channel','Gross','Comm','FH Proc','FH Flat','Guide Pay','Drinks','Other','Profit','Notes']];filteredTours().sort(function(a,b){return new Date(a.date)-new Date(b.date);}).forEach(function(t){rows.push([t.date,t.type,t.guide,t.adults,t.children,t.infants,getPax(t),ch(t.channel).label,t.gross.toFixed(2),t.comm.toFixed(2),(t.fhProc||0).toFixed(2),(t.fhFlat||0).toFixed(2),t.guidePay.toFixed(2),(t.drinks||0).toFixed(2),(t.otherExp||0).toFixed(2),t.profit.toFixed(2),t.notes||'']);});downloadCSV(rows,'MWT_Tours_2026.csv');}
function exportBackup(){var data={version:1,exported:new Date().toISOString(),tours:tours,vendorPayments:vendorPayments,expenses:expenses};var a=document.createElement('a');a.href='data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(data,null,2));var d=new Date();a.download='MWT_Backup_'+d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+'.json';a.click();toast('Backup exported!');}
function importBackup(event){var file=event.target.files[0];if(!file)return;var reader=new FileReader();reader.onload=function(e){try{var data=JSON.parse(e.target.result);if(!data.tours){toast('Invalid backup file.',true);return;}if(!confirm('Replace ALL current data with backup?')){document.getElementById('import-file').value='';return;}tours=data.tours||[];vendorPayments=data.vendorPayments||[];expenses=data.expenses||[];saveTours();saveVP();saveExp();renderDashboard();renderTours();renderGuides();toast('Backup imported! '+tours.length+' tours loaded.');}catch(err){toast('Error reading file.',true);}document.getElementById('import-file').value='';};reader.readAsText(file);}

function renderReconcile(){var m=document.getElementById('rec-month').value;var paidTours=tours.filter(function(t){if(!t.paidDate)return false;if(m==='all')return true;return fmtM(t.paidDate)===parseInt(m);}).sort(function(a,b){return new Date(b.paidDate)-new Date(a.paidDate);});var totalDeposits=paidTours.reduce(function(s,t){return s+(t.paidAmount||0);},0);var totalExpected=paidTours.reduce(function(s,t){return s+(t.vendorNet>0?t.vendorNet:Math.round((t.gross-t.comm-(t.fhFlat||0))*100)/100);},0);var totalGross=paidTours.reduce(function(s,t){return s+t.gross;},0);var diff=Math.round((totalDeposits-totalExpected)*100)/100;document.getElementById('rec-summary-cards').innerHTML='<div class="metric"><div class="metric-label">Deposits recorded</div><div class="metric-value">'+paidTours.length+'</div></div><div class="metric"><div class="metric-label">Total gross sales</div><div class="metric-value">$'+totalGross.toFixed(2)+'</div></div><div class="metric"><div class="metric-label">Expected deposits</div><div class="metric-value green">$'+totalExpected.toFixed(2)+'</div></div><div class="metric"><div class="metric-label">Actual received</div><div class="metric-value '+(Math.abs(diff)===0?'green':'amber')+'">$'+totalDeposits.toFixed(2)+'</div></div>';if(paidTours.length===0){document.getElementById('rec-vendor-summary').innerHTML='<div class="empty">No paid tours found.</div>';document.getElementById('rec-detail').innerHTML='<div class="empty">No paid tours found.</div>';return;}var byVendor={};paidTours.forEach(function(t){var v=ch(t.channel).label;if(!byVendor[v])byVendor[v]={tours:0,gross:0,expected:0,received:0};var net=t.vendorNet>0?t.vendorNet:Math.round((t.gross-t.comm-(t.fhFlat||0))*100)/100;byVendor[v].tours++;byVendor[v].gross+=t.gross;byVendor[v].expected+=net;byVendor[v].received+=(t.paidAmount||0);});var vsHtml='<table><thead><tr><th>Vendor</th><th>Tours paid</th><th>Gross sales</th><th>Expected deposit</th><th>Actual received</th><th>Difference</th></tr></thead><tbody>';var grandGross=0,grandExp=0,grandRec=0;Object.keys(byVendor).sort().forEach(function(v){var d=byVendor[v],vdiff=Math.round((d.received-d.expected)*100)/100;grandGross+=d.gross;grandExp+=d.expected;grandRec+=d.received;vsHtml+='<tr><td style="font-weight:600;">'+v+'</td><td>'+d.tours+'</td><td class="mono">$'+d.gross.toFixed(2)+'</td><td class="mono pos">$'+d.expected.toFixed(2)+'</td><td class="mono">$'+d.received.toFixed(2)+'</td><td class="mono '+(Math.round(Math.abs(vdiff)*100)===0?'pos':'neg')+'">'+(vdiff>=0?'+':'')+vdiff.toFixed(2)+'</td></tr>';});var grandDiff=Math.round((grandRec-grandExp)*100)/100;vsHtml+='</tbody><tfoot><tr><td style="padding:12px;font-weight:600;">Total</td><td style="padding:12px;font-weight:600;">'+paidTours.length+'</td><td class="mono" style="padding:12px;font-weight:600;">$'+grandGross.toFixed(2)+'</td><td class="mono pos" style="padding:12px;font-weight:600;">$'+grandExp.toFixed(2)+'</td><td class="mono" style="padding:12px;font-weight:600;">$'+grandRec.toFixed(2)+'</td><td class="mono '+(Math.round(Math.abs(grandDiff)*100)===0?'pos':'neg')+'" style="padding:12px;font-weight:700;font-size:14px;">'+(grandDiff>=0?'+':'')+grandDiff.toFixed(2)+'</td></tr></tfoot></table>';document.getElementById('rec-vendor-summary').innerHTML=vsHtml;var detHtml='<table><thead><tr><th>Paid date</th><th>Tour date</th><th>Tour</th><th>Vendor</th><th>Guide</th><th>Guests</th><th>Gross</th><th>Comm</th><th>Expected</th><th>Received</th><th>Diff</th></tr></thead><tbody>';paidTours.forEach(function(t){var net=t.vendorNet>0?t.vendorNet:Math.round((t.gross-t.comm-(t.fhFlat||0))*100)/100;var rec=t.paidAmount||0,tdiff=Math.round((rec-net)*100)/100;var product=t.product||'Miami Wow Tour';var pb=product==='Little Havana After Dark'?'<span class="badge b-purple" style="font-size:10px;">LH</span>':'<span class="badge b-teal" style="font-size:10px;">MWT</span>';detHtml+='<tr><td style="white-space:nowrap;font-weight:600;">'+fmt(t.paidDate)+'</td><td style="white-space:nowrap;color:var(--text2);">'+fmt(t.date)+'</td><td>'+pb+'</td><td>'+badge(t.channel)+'</td><td>'+t.guide+'</td><td>'+getPax(t)+'</td><td class="mono">$'+t.gross.toFixed(2)+'</td><td class="mono" style="color:var(--red);">-$'+t.comm.toFixed(2)+'</td><td class="mono pos" style="font-weight:600;">$'+net.toFixed(2)+'</td><td class="mono">$'+rec.toFixed(2)+'</td><td class="mono '+(Math.round(Math.abs(tdiff)*100)===0?'pos':'neg')+'">'+(tdiff>=0?'+':'')+tdiff.toFixed(2)+'</td></tr>';});detHtml+='</tbody></table>';document.getElementById('rec-detail').innerHTML=detHtml;}
function exportReconcileCSV(){var m=document.getElementById('rec-month').value;var paidTours=tours.filter(function(t){if(!t.paidDate)return false;if(m==='all')return true;return fmtM(t.paidDate)===parseInt(m);}).sort(function(a,b){return new Date(a.paidDate)-new Date(b.paidDate);});var rows=[['Paid Date','Tour Date','Product','Vendor','Guide','Guests','Gross','Commission','FH Flat','Expected Deposit','Received','Difference']];paidTours.forEach(function(t){var net=t.vendorNet>0?t.vendorNet:Math.round((t.gross-t.comm-(t.fhFlat||0))*100)/100;var rec=t.paidAmount||0,tdiff=Math.round((rec-net)*100)/100;rows.push([t.paidDate,t.date,t.product||'Miami Wow Tour',ch(t.channel).label,t.guide,getPax(t),t.gross.toFixed(2),t.comm.toFixed(2),(t.fhFlat||0).toFixed(2),net.toFixed(2),rec.toFixed(2),(tdiff>=0?'+':'')+tdiff.toFixed(2)]);});downloadCSV(rows,'MWT_BankReconciliation_2026.csv');}

function openEditModal(id){var t=tours.find(function(t){return t.id===id;});if(!t)return;editTourId=id;var product=t.product||'Miami Wow Tour';document.getElementById('em-product').value=product;document.getElementById('em-date').value=t.date;document.getElementById('em-type').value=t.type||'regular';document.getElementById('em-guide').value=t.guide;document.getElementById('em-adults').value=t.adults||0;document.getElementById('em-children').value=t.children||0;document.getElementById('em-infants').value=t.infants||0;document.getElementById('em-channel').value=t.channel;document.getElementById('em-expenses').value=t.otherExp||0;document.getElementById('em-notes').value=t.notes||'';var pax=(t.adults||0)+(t.children||0)+(t.infants||0)||getPax(t);var autoGP=t.type==='private'?80:(t.guide==='Noel'?(pax>3?100:75):(pax>3?75:60));document.getElementById('em-guidepay').value=(t.guidePay!==undefined&&Math.abs(t.guidePay-autoGP)>0.01)?t.guidePay.toFixed(2):'';var tour=TOURS[product]||TOURS['Miami Wow Tour'];document.getElementById('em-adults-label').textContent='Adults ($'+tour.adultPrice+')';document.getElementById('em-children-label').textContent='Children ($'+tour.childPrice+')';document.getElementById('edit-modal-bg').style.display='flex';setTimeout(function(){previewEdit();},50);}
function previewEdit(){var product=document.getElementById('em-product').value;var adults=parseInt(document.getElementById('em-adults').value,10)||0;var children=parseInt(document.getElementById('em-children').value,10)||0;var infants=parseInt(document.getElementById('em-infants').value,10)||0;var guide=document.getElementById('em-guide').value;var channel=document.getElementById('em-channel').value;var type=document.getElementById('em-type').value;var exp=parseFloat(document.getElementById('em-expenses').value)||0;var tour=TOURS[product]||TOURS['Miami Wow Tour'];document.getElementById('em-adults-label').textContent='Adults ($'+tour.adultPrice+')';document.getElementById('em-children-label').textContent='Children ($'+tour.childPrice+')';var d=calcTourData(adults,children,infants,guide,channel,type,exp,product);document.getElementById('em-gross').textContent='$'+d.gross.toFixed(2);document.getElementById('em-comm').textContent='-$'+d.comm.toFixed(2)+' ('+Math.round(CHANNELS[channel].rate*100)+'%)';var fhflatRow=document.getElementById('em-fhflat-row');if(fhflatRow)fhflatRow.style.display=channel==='Fareharbor'?'flex':'none';var fhprocRow=document.getElementById('em-fhproc-row');if(fhprocRow)fhprocRow.style.display='flex';document.getElementById('em-fhproc').textContent='-$'+d.fhProc.toFixed(2);var gpOverride=parseFloat(document.getElementById('em-guidepay').value);var gpDisplay=(!isNaN(gpOverride)&&gpOverride>=0)?gpOverride:d.guidePay;document.getElementById('em-guide-pay').textContent='-$'+gpDisplay.toFixed(2)+((!isNaN(gpOverride)&&gpOverride>=0)?' (override)':' (auto)');var drinksRow=document.getElementById('em-drinks-row');if(drinksRow)drinksRow.style.display=product==='Miami Wow Tour'?'flex':'none';document.getElementById('em-drinks').textContent='-$'+d.drinks.toFixed(2);document.getElementById('em-exp').textContent=exp>0?'-$'+exp.toFixed(2):'$0.00';var pp=Math.round((d.gross-d.comm-(d.fhFlat||0)-(d.fhProc||0)-gpDisplay-(d.drinks||0)-exp)*100)/100;var pel=document.getElementById('em-profit');pel.textContent=(pp>=0?'$':'-$')+Math.abs(pp).toFixed(2);pel.style.color=pp>=0?'var(--teal)':'var(--red)';}
function saveEdit(){if(!editTourId)return;var t=tours.find(function(t){return t.id===editTourId;});if(!t)return;var product=document.getElementById('em-product').value;var adults=parseInt(document.getElementById('em-adults').value,10)||0;var children=parseInt(document.getElementById('em-children').value,10)||0;var infants=parseInt(document.getElementById('em-infants').value,10)||0;var guide=document.getElementById('em-guide').value;var channel=document.getElementById('em-channel').value;var type=document.getElementById('em-type').value;var exp=parseFloat(document.getElementById('em-expenses').value)||0;var notes=document.getElementById('em-notes').value;var date=document.getElementById('em-date').value;if(!date){toast('Please enter a date.',true);return;}var d=calcTourData(adults,children,infants,guide,channel,type,exp,product);var gpOverride=parseFloat(document.getElementById('em-guidepay').value);var finalGuidePay=(!isNaN(gpOverride)&&gpOverride>=0)?Math.round(gpOverride*100)/100:d.guidePay;var finalProfit=Math.round((d.gross-d.comm-(d.fhFlat||0)-(d.fhProc||0)-finalGuidePay-(d.drinks||0)-exp)*100)/100;t.product=product;t.date=date;t.type=type;t.guide=guide;t.adults=adults;t.children=children;t.infants=infants;t.pax=adults+children+infants;t.channel=channel;t.otherExp=exp;t.notes=notes;t.gross=d.gross;t.comm=d.comm;t.fhFlat=d.fhFlat;t.fhProc=d.fhProc;t.vendorNet=Math.round((d.gross-d.comm-(d.fhFlat||0))*100)/100;t.guidePay=finalGuidePay;t.drinks=d.drinks;t.profit=finalProfit;saveTours();saveTour(t);closeEditModal();renderTours();renderDashboard();renderGuides();toast('Tour updated!');}
function closeEditModal(){document.getElementById('edit-modal-bg').style.display='none';editTourId=null;}

if(localStorage.getItem('mwt-auth')==='1'){loadAll();}
else{document.getElementById('login-screen').style.display='flex';}
