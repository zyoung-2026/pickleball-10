(()=>{
'use strict';
const cfg=window.PICKLEBALL_CONFIG||{};
const valid=/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(cfg.SUPABASE_URL||'')&&cfg.SUPABASE_ANON_KEY&&!cfg.SUPABASE_ANON_KEY.includes('YOUR_');
const banner=document.getElementById('syncBanner');
const say=(text,kind='info')=>{banner.textContent=text;banner.style.background=kind==='error'?'#ffe8e5':kind==='ok'?'#dff5e9':'#fff1d5';banner.style.color=kind==='error'?'#96392e':kind==='ok'?'#136747':'#805017'};
if(!valid){say('⚠ 서버 설정 전: 이 화면의 기록은 이 기기에만 저장됩니다. config.js에 Supabase 주소와 공개용 키를 설정하세요.','error');return}
const base=cfg.SUPABASE_URL.replace(/\/$/,'')+'/rest/v1/pickleball_cells';
const event=String(cfg.EVENT_ID||'pickleball-10-main');
const headers={'apikey':cfg.SUPABASE_ANON_KEY,'Authorization':'Bearer '+cfg.SUPABASE_ANON_KEY};
const cellId=(kind,i,t)=>event+'__'+kind+'_'+i+(t===undefined?'':'_'+t);
const ids=[];
for(let i=0;i<10;i++)ids.push(cellId('name',i));
for(let i=0;i<20;i++)for(let t=0;t<2;t++)ids.push(cellId('score',i,t));
const idset=new Set(ids);
const val=(id)=>{
 const k=id.substring((event+'__').length);
 if(k.startsWith('name_')) return state.names[Number(k.slice(5))]||'';
 const m=/^score_(\d+)_(\d+)$/.exec(k);if(!m)return '';
 const v=state.scores[+m[1]][+m[2]];return v===null?'':String(v);
};
const previous=new Map();const pending=new Map();let loading=true, writing=false, retry=null, readBusy=false;
const oldPersist=persist;
function persistChanged(){oldPersist();if(loading)return;
 for(const id of ids){const v=val(id);if(previous.get(id)!==v){previous.set(id,v);pending.set(id,v)}}
 if(pending.size){say('⏳ 입력 내용 서버 저장 중…');clearTimeout(retry);retry=setTimeout(flush,600)}
}
persist=persistChanged;
async function request(url,options={}){
 const response=await fetch(url,{...options,headers:{...headers,...options.headers},cache:'no-store'});
 if(!response.ok)throw Error('HTTP '+response.status+': '+(await response.text()).slice(0,160));
 return response.status===204?null:response.json();
}
function applyCloud(rows){
 const m=new Map(rows.filter(r=>idset.has(r.id)).map(r=>[r.id,r.value??'']));
 for(const id of ids){const remote=String(m.get(id)??'');if(pending.has(id))continue;
 previous.set(id,remote);
 const k=id.substring((event+'__').length);
 if(k.startsWith('name_'))state.names[Number(k.slice(5))]=remote;
 else{const a=/^score_(\d+)_(\d+)$/.exec(k);if(a)state.scores[+a[1]][+a[2]]=remote===''?null:Number(remote)}
 }
 oldPersist();
 // 현재 점수 칸을 편집하는 도중에는 화면 재그리기로 입력을 끊지 않습니다.
 const active=document.activeElement;
 if(active && (active.matches('.score input')||active.matches('[data-name]')))return;
 const tab=document.querySelector('.tab.active')?.dataset.tab||'play';
 if(tab==='play')showPlay();else if(tab==='people')showPeople();else if(tab==='ranking')showRank();else showAll();
 updateStats();
}
async function fetchCloud(){
 if(readBusy)return;readBusy=true;
 try{
  const rows=await request(base+'?select=id,value&id=in.('+ids.map(encodeURIComponent).join(',')+')');
  applyCloud(rows);loading=false;
  if(pending.size){say('⏳ 미저장 변경사항 다시 저장 중…');flush()}
  else say('✅ 공용 데이터 연결됨 · 30초마다 자동 새로고침 · 입력하면 서버 저장','ok');
 }catch(e){loading=false;console.error('Supabase 읽기 실패',e);say('❌ 공용 서버 연결 실패: '+e.message+' · SQL/주소/API 키/RLS 설정을 확인하세요.','error')}
 finally{readBusy=false}
}
async function flush(){
 if(writing||!pending.size||loading)return;
 writing=true;
 const batch=[...pending].map(([id,value])=>({id,value}));
 try{
  await request(base+'?on_conflict=id',{method:'POST',headers:{'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(batch)});
  for(const {id,value} of batch){if(pending.get(id)===value)pending.delete(id)}
  if(pending.size)say('⏳ 추가 변경사항 저장 중…');else say('✅ 서버에 저장 완료 · 다른 휴대전화에는 30초 이내 반영','ok');
 }catch(e){console.error('Supabase 저장 실패',e);say('❌ 서버 저장 실패: '+e.message+' · 인터넷과 Supabase 권한을 확인하세요.','error')}
 finally{writing=false;if(pending.size){clearTimeout(retry);retry=setTimeout(flush,4500)}}
}
// 등록 직후 기존 기기 로컬 자료는 자동 업로드하지 않음: 클라우드 자료 덮어쓰기 방지.
fetchCloud();setInterval(fetchCloud,30000);
window.addEventListener('online',()=>{fetchCloud();flush()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)fetchCloud()});
})();
