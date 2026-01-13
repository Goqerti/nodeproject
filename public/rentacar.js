// public/rentacar.js
async function api(url, opts={}){
  const res = await fetch('/api'+url, { headers: opts.headers || {}, method: opts.method||'GET', body: opts.body || null });
  if(!res.ok){ const e = await res.json().catch(()=>({message:res.statusText})); throw new Error(e.message||'Xəta'); }
  return res.json();
}

function row(html){ const tr=document.createElement('tr'); tr.innerHTML=html; return tr; }

// Cars
const carForm = document.getElementById('carForm');
const carsTbody = document.querySelector('#carsTable tbody');

async function loadCars(){
  const cars = await api('/rentacar/cars');
  carsTbody.innerHTML='';
  cars.forEach(c => {
    const mm = [c.brand,c.model].filter(Boolean).join(' ');
    carsTbody.appendChild(row(`<td>${c.plate}</td><td>${mm}</td><td>${c.year||''}</td><td>${c.color||''}</td><td>${c.notes||''}</td>
    <td><button data-del="${c.id}">Sil</button></td>`));
  });
}
carForm?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const fd = new FormData(carForm);
  const body = JSON.stringify(Object.fromEntries(fd.entries()));
  await fetch('/api/rentacar/cars',{method:'POST', headers:{'Content-Type':'application/json'}, body});
  carForm.reset();
  loadCars().catch(console.error);
});
carsTbody?.addEventListener('click', async (e)=>{
  const id = e.target?.dataset?.del;
  if(id && confirm('Silinsin?')){
    await fetch('/api/rentacar/cars/'+id,{method:'DELETE'});
    loadCars().catch(console.error);
  }
});

// Reservations
const resForm = document.getElementById('resForm');
const resTbody = document.querySelector('#resTable tbody');
const search = document.getElementById('search');
document.getElementById('refresh')?.addEventListener('click',()=>loadReservations());

async function loadReservations(){
  const q = (search?.value||'').trim();
  const list = await api('/rentacar/reservations'+(q?`?q=${encodeURIComponent(q)}`:''));
  resTbody.innerHTML='';
  list.forEach(r => {
    const badge = (s)=>{
      const map={
        "Götürülüb":"badge warning",
        "İstifadədədir":"badge info",
        "Qaytarılıb":"badge success",
        "Brondadır":"badge",
        "Ləğv edilib":"badge danger",
        "Qaytarılmayıb":"badge danger"
      };
      return `<span class="${map[s]||'badge'}">${s}</span>`;
    };
    const idLink = r.idImagePath? `<a href="${r.idImagePath}" target="_blank">Bax</a>` : '';
    resTbody.appendChild(row(`<td>${r.customerName}</td><td>${r.phone}</td><td>${r.carPlate}</td>
    <td>${r.pickupDate?.slice(0,10)||''}</td><td>${r.returnDate?.slice(0,10)||''}</td><td>${r.days||''}</td>
    <td>
      <select data-status="${r.id}">
        ${["Götürülüb","İstifadədədir","Qaytarılıb","Brondadır","Ləğv edilib","Qaytarılmayıb"].map(s=>`<option ${r.status===s?'selected':''}>${s}</option>`).join('')}
      </select>
    </td>
    <td>${idLink}</td>
    <td><button data-del="${r.id}">Sil</button></td>`));
  });
}
resForm?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const fd = new FormData(resForm);
  await fetch('/api/rentacar/reservations',{method:'POST', body: fd});
  resForm.reset();
  loadReservations().catch(console.error);
});
resTbody?.addEventListener('change', async (e)=>{
  const id = e.target?.dataset?.status;
  if(id){
    const body = JSON.stringify({ status: e.target.value });
    await fetch('/api/rentacar/reservations/'+id,{method:'PUT', headers:{'Content-Type':'application/json'}, body});
  }
});
resTbody?.addEventListener('click', async (e)=>{
  const id = e.target?.dataset?.del;
  if(id && confirm('Silinsin?')){
    await fetch('/api/rentacar/reservations/'+id,{method:'DELETE'});
    loadReservations().catch(console.error);
  }
});

// init
loadCars().catch(console.error);
loadReservations().catch(console.error);
