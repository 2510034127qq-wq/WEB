import './ui/styles.css';
import * as THREE from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {Workshop} from './render/workshop';
import {Physics} from './physics/world';
import {Sound} from './render/sound';
import {active,advance,addMark,clamp,dip,glazeMean,lightKiln,loadKiln,newPiece,newState,nextTask,openClay,placeAt,prepare,shape,smooth,STAGES,STATIONS,stretch,trim,validateSave,type GameState,type Mark,type Piece,type StationId,type Vec3} from './simulation/model';
import {download,restore,save} from './simulation/storage';

const $=<T extends HTMLElement=HTMLElement>(q:string)=>document.querySelector<T>(q)!;
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const root=$('#app');
root.innerHTML=`<div id="world" aria-label="三维工坊"></div><div id="vignette"></div>
<div id="hud" class="hidden"><div class="topbar"><div class="brand"><div class="seal">窑<br>火</div><div><strong>窑火</strong><small>JINGDEZHEN · 1743</small></div></div><nav class="topnav"><button data-act="map">工坊图 <small>M</small></button><button data-act="journal">手艺札记 <small>J</small></button><button data-act="collection">藏器</button><button data-act="settings">设置</button></nav></div><div class="objective"><div class="eyebrow" id="day">第一日 · 入窑之前</div><div class="objective-title" id="objective"></div><button data-act="guide">循着工序，去下一处 ↗</button></div><div class="crosshair"></div><div id="prompt" class="hidden"></div><div id="caption"></div><div class="bottom-left" id="control-hint">W A S D 行走 · 鼠标 看向 · E 操作 · Q 放下 · Esc 松开视角</div><div class="bottom-right" id="save-status">本地工坊 · 自动存档</div></div>
<div id="intro" class="intro"><div class="intro-content"><div class="eyebrow">景德镇 · 清代民间工坊</div><h1>窑火</h1><div class="tagline">一抔泥，一器一生。</div><p>从水土相和，到掌中成形。<br>让你的指痕与笔意，留在一窑青花里。</p><button id="start" class="primary" disabled>正在开启工坊</button><div id="loading" class="small-note" style="margin-top:18px">整理坯房与工具…</div><div class="loading-line"></div></div><div class="edition">一器一生 / THE LIFE OF PORCELAIN &nbsp; — &nbsp; v0.1</div><div class="intro-aside">真实三维 · 自由制瓷<br>建议桌面 Chrome · 戴上耳机</div></div>
<aside id="work" class="work-panel hidden"></aside><div id="toolbar" class="work-toolbar hidden"></div><div id="modal-root"></div><div id="toast" role="status" aria-live="polite"></div><input type="file" id="import" accept="application/json,.json" hidden/>`;

let state:GameState=newState(),game:Workshop,physics:Physics;const sound=new Sound();let started=false,modal='',paused=true,yaw=0,pitch=0,focus:StationId|null=null,form:'bowl'|'vase'='bowl';
let dragging=false,lastX=0,lastY=0,ring=24,tool:Mark['kind']='brush',brushSize=0.014,ink=0.75,water=0.65,depth=1,pressure=0.5,spin=0,hold='',holdTimer=0,nav:Vec3[]=[],lastTime=0,elapsed=0,uiTimer=0,saveTimer=0,lastStage='',saved=true,toastTimer=0,remap:string|null=null;
const keys=new Set<string>();let shapeUndo:{radius:number[];thickness:number[];height:number}[]=[];let frames:number[]=[];
function toast(message:string){$('#toast').textContent=message;clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>$('#toast').textContent='',4300);}
function dirty(){saved=false;game?.sync();}
async function persist(){if(!started)return;try{await save(state);saved=true;$('#save-status').textContent='已保存于此浏览器';}catch(e){$('#save-status').textContent='存档失败 · 请导出备份';toast('无法写入本地存档，请在设置中导出备份。');}}
function leave(){focus=null;game.focus=null;$('#work').classList.add('hidden');$('#toolbar').classList.add('hidden');spin=0;hold='';dragging=false;keys.clear();pitch=0;dirty();}
function nearest(){return STATIONS.map(s=>({s,d:Math.hypot(s.approach[0]-state.player[0],s.approach[2]-state.player[2])})).sort((a,b)=>a.d-b.d)[0];}
function release(){if(document.pointerLockElement)document.exitPointerLock();keys.clear();dragging=false;hold='';}
async function lock(){if(!focus&&!modal&&started){sound.start();try{await game.renderer.domElement.requestPointerLock();}catch{toast('可按住鼠标右键转动视角；WASD 仍可行走。');}}}
function go(station:StationId){leave();closeModal();const target=STATIONS.find(s=>s.id===station)!;const start=[...state.player] as Vec3;
  // All guided paths use the clear central lanes, with the same collision controller.
  const safeZ=clamp(start[2],-3.5,3.0);nav=[[clamp(start[0],-5.5,5.3),1.65,safeZ],[clamp(start[0],-4.4,4.0),1.65,1],[clamp(target.approach[0],-4.4,4.0),1.65,1],[target.approach[0],1.65,target.approach[2]]];
  toast(`前往${target.name} · 按任意移动键可接管`);
}
function interact(){if(modal||!started)return;if(focus){leave();void lock();return;}
  const ground=state.pieces.find(p=>p.location==='ground'&&Math.hypot(p.position[0]-state.player[0],p.position[2]-state.player[2])<1.7);
  if(ground&&!state.held){state.activeId=ground.id;takePiece();return;}
  const prop=game.nearbyProp();if(prop&&!state.held){state.held=prop;sound.tap();toast(`已拿起${{brush:'毛笔',knife:'利坯刀',sagger:'匣钵',bamboo:'竹杖'}[prop]} · Q 放在指向的平面`);dirty();return;}
  const n=nearest();if(n.d>2.2){toast('走近工作台，再按 E。');return;}enter(n.s.id);
}
function enter(id:StationId){
  let p=active(state);if(state.held&&p&&state.held===p.id){try{placeAt(p,id);state.held=null;sound.tap();}catch(e){toast((e as Error).message);return;}}
  if(state.held&&state.held!==p?.id){toast('请先按 Q 把工具放回平面，再操作工作台。');return;}
  const here=state.pieces.filter(p=>p.location===id&&p.stage!=='packed');if(here.length&&(!p||p.location!==id)){state.activeId=here[0].id;p=here[0];}
  nav=[];focus=id;game.focus=id;game.rotation=0;release();paused=false;renderWork();dirty();
}
function takePiece(){const p=active(state);if(!p)return;if(state.held&&state.held!==p.id){toast('双手已持有工具，请先放下。');return;}if(p.stage==='loaded'){toast('匣钵已装窑，烧成并冷却后再取出。');return;}p.location='held';state.held=p.id;leave();sound.tap('wood');toast('双手托稳坯板 · 到下一工作台按 E 放下');dirty();}
function drop(){if(!state.held)return;const point=game.placement();if(!point){toast('看向近处的桌面或地面，再按 Q 放下。');return;}const p=state.pieces.find(p=>p.id===state.held);if(p){p.location='ground';p.position=point;}else state.props[state.held]=point;state.held=null;dirty();sound.tap();}
function range(id:string,title:string,min:number,max:number,step:number,value:number){return `<label for="${id}">${title}<span class="value" id="${id}-value">${value}</span></label><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}">`;}
const button=(act:string,label:string,cls='')=>`<button class="${cls}" data-act="${act}">${label}</button>`;
function renderWork(){if(!focus)return;const s=STATIONS.find(s=>s.id===focus)!;const p=active(state);const here=p?.location===focus;let body='';let bar='';
  if(focus==='supply'){body=`<p>瓷石与高岭土，已由原料行淘练成块。领取后，到淘练台调水、揉练。</p><h3>这一回，想制什么器？</h3><div class="row">${button('form-bowl','碗 · 开敞舒展',form==='bowl'?'selected':'')}${button('form-vase','瓶 · 收口有致',form==='vase'?'selected':'')}</div><div class="tip">样式只作目标。器形由你的双手塑造，开始之后不会替换成预制作品。</div><div class="stack" style="margin-top:20px">${button('new','取泥，开工 →','primary')}</div>`;}
  else if(!here&&focus!=='kiln'&&focus!=='rack'){body=`<p>案上尚无待加工的作品。</p><div class="tip">${esc(nextTask(p).text)}。托起坯板后，走近这里按 E 放下。</div>${button('guide','循工序前往')}`;}
  else if(focus==='clay'&&p){body=`<p>筛去粗粒，翻扑揉练。按住下方按钮，双手会持续排出泥中气隙。</p>${range('water','调水 · 泥料含水',0.35,0.85,0.01,water)}<div class="meter"><i id="prep-meter" style="width:${p.preparation*100}%"></i></div><div class="stat-row"><span>淘练程度</span><span id="prep-status">${Math.round(p.preparation*100)}%</span></div><button class="primary" data-hold="prepare" style="width:100%;margin-top:12px">按住 · 淘洗揉练</button><div class="tip">省时操作保留淘洗、调水与练泥的顺序。真实原料处理通常由专门作坊完成。</div>`;}
  else if(focus==='wheel'&&p){if(['prepared','thrown'].includes(p.stage)){body=`<p>${p.opened?'在坯壁上按住鼠标左右拖动，改变触点附近的半径。高低不同，器形也不同。':'先起轮、定中心，再开孔。之后用双手塑出自己的轮廓。'}</p>${!p.opened?button('open','竹杖起轮 · 定中心开孔','primary'):''}${range('height','提拉高度 / m',0.09,0.44,0.005,p.height)}${range('pressure','手部压力',0.1,1,0.05,pressure)}<div class="stat-row"><span>最薄器壁</span><span id="thickness">${(Math.min(...p.thickness)*1000).toFixed(1)} mm</span></div><div class="tip">轻推为展，内收为敛。过薄的器壁更容易在火中开裂。</div>`;bar=`${button('undo-shape','撤回一次')}${button('smooth','抹平细痕')}${button('spin','转轮 / 停轮')}<span>拖动坯壁 · 鼠标滚轮旋看</span>`;}
    else if(['leather','trimmed'].includes(p.stage)){body=`<p>半干坯可以旋削。先点选器身高度，再按住刀具按钮利坯；底部同时修出圈足。</p><div class="meter"><i id="trim-meter" style="width:${p.trimmed*100}%"></i></div>${range('trim-ring','落刀高度',0,47,1,ring)}<button class="primary" data-hold="trim" style="width:100%;margin-top:14px">按住 · 旋削利坯</button><div class="tip">利坯会减薄真实器壁。留一点厚度，让器物经得住窑火。</div>`;}else body='<p>湿坯要先阴干，半干后才可利坯。</p>';}
  else if(focus==='rack'){const items=state.pieces.filter(p=>p.location==='rack');body=`<p>让坯体在阴凉通风处慢慢失水。湿坯候至半干；釉坯则须充分干燥。</p>${items.length?items.map(q=>`<div class="stat-row"><span>${esc(q.name)}</span><span>${STAGES[q.stage]}</span></div>`).join(''):'<div class="tip">架子上还没有你的坯体。</div>'}<div id="dry-status" class="stat-row"></div><button data-hold="wait" class="primary" style="width:100%;margin-top:16px">按住 · 候一夜</button><div class="tip">时光加速时仍可看到含水率变化。也可以离开，在院里走走。</div>`;}
  else if(focus==='paint'&&p){body=`<p>青料研匀，笔尖落在三维坯体上。按住可画线，纹样工具点一下即留下笔意。</p><div class="row">${button('tool-brush','细笔',tool==='brush'?'selected':'')}${button('tool-leaf','竹叶',tool==='leaf'?'selected':'')}${button('tool-flower','团花',tool==='flower'?'selected':'')}</div><div class="row" style="margin-top:8px">${button('tool-wave','水纹',tool==='wave'?'selected':'')}${button('tool-band','弦纹',tool==='band'?'selected':'')}</div>${range('brush-size','笔锋大小',0.005,0.06,0.001,brushSize)}${range('ink','青料浓淡',0.15,1,0.05,ink)}<div class="tip">烧前青料呈灰黑色，入窑后才显青蓝。滚轮旋转器物，画到背面。</div>`;bar=`${button('undo-paint','撤回一笔')}${button('rotate-left','↶ 转向左')}${button('rotate-right','转向右 ↷')}<span>在器身落笔</span>`;}
  else if(focus==='glaze'&&p){body=`<p>调匀透明釉浆，缓缓浸入。时间越久，釉层越厚；浸得太浅，口沿会漏釉。</p>${range('depth','浸釉深度',0.1,1,0.05,depth)}<div class="stat-row"><span>釉层厚度 · 模拟值</span><span id="glaze-thick">${glazeMean(p).toFixed(2)}</span></div><div class="meter"><i id="glaze-meter" style="width:${Math.min(100,glazeMean(p)/1.4*100)}%"></i></div><div class="stack"><button class="primary" data-hold="dip">按住 · 蘸釉</button>${button('clean-foot',p.footClean?'✓ 底足已擦净':'湿布擦净底足')}${button('wash-glaze','洗去釉层重施')}</div><div class="tip">厚度约 0.5–0.9 为辅助范围，并非历史配方数据。避免积釉，勿忘清足。</div>`;}
  else if(focus==='kiln'){const k=state.kiln;body=`<p>匣钵护器，柴火成瓷。装好干坯再封窑，冷却后才可开窑。</p>`;
    if(here&&p?.stage==='dry')body+=`<label for="kiln-pos">选择窑位</label><select id="kiln-pos"><option value="middle">中窑 · 火力较匀</option><option value="front">前窑 · 火力偏强</option><option value="back">后窑 · 火力偏弱</option></select><div class="stack" style="margin-top:14px">${button('load','装入匣钵','primary')}</div>`;
    body+=`<div class="stat-row"><span>火候</span><span id="kiln-temp"></span></div><div class="stat-row"><span>柴量</span><span id="kiln-fuel"></span></div><svg class="curve" viewBox="0 0 260 90"><polyline id="curve" points=""/></svg><div class="row">${button('light','封窑起火','primary')}${button('fuel','添一抱柴')}</div>${range('draft','风道开度',0.05,1,0.05,k.draft)}<label>师傅扶火 <input id="assist-kiln" type="checkbox" ${k.assisted?'checked':''}></label><div class="row">${button('cool','止火冷却')}<button data-hold="wait">按住 · 候火</button></div><div class="tip">扶火会代为添柴和调风。取消后需自己维持火候；过早止火会欠烧。温度为游戏辅助估算。</div>`;}
  else if(focus==='display'&&p){body=`<input class="rename" id="piece-name" value="${esc(p.name)}" maxlength="60" aria-label="作品名称"><div class="stat-row"><span>成器品第</span><span class="value">${p.score>=85?'上品':p.score>=60?'良品':'留作习器'} · ${p.score}</span></div><div class="report">${p.defects.length?`<ul>${p.defects.map(d=>`<li>${esc(d)}</li>`).join('')}</ul>`:'釉光含蓄，器壁匀净。此器经住了窑火。'}<p>烧成收缩 ${Math.round((1-p.shrink)*100)}% · ${p.marks.length} 处笔触</p></div><div class="stack">${p.stage==='fired'?button('pack','包纸 · 束草 · 入藏','primary'):button('collection','查看藏器','primary')}${button('export-glb','导出这件瓷器 · GLB')}${button('photo','留影 · PNG')}</div>`;bar=`${button('rotate-left','↶ 转向左')}${button('rotate-right','转向右 ↷')}<span>滚轮 · 对光旋看</span>`;}
  $('#work').innerHTML=`<div class="work-heading"><div><div class="eyebrow">${s.subtitle}</div><h2>${s.name}</h2></div><span class="number">${s.number}</span></div>${body}<div class="work-footer">${here&&p&&p.stage!=='loaded'&&p.stage!=='packed'?button('take','托起坯板'):''}${button('leave','起身离开')}</div>`;
  $('#work').classList.remove('hidden');$('#toolbar').innerHTML=bar;$('#toolbar').classList.toggle('hidden',!bar);$('#prompt').classList.add('hidden');
}
function closeModal(){modal='';$('#modal-root').innerHTML='';paused=false;keys.clear();if(focus)renderWork();}
function openModal(kind:string){release();modal=kind;paused=kind==='settings';let title='',content='';
  if(kind==='map'){title='一院，八处手艺';const order=['clay','wheel','paint','rack','center','glaze','supply','display','kiln'];content=`<p>循工序慢慢走，或点一处工作区自动引路。引路沿着院中通道行走，可随时用 WASD 接管。</p><div class="map-grid">${order.map(id=>{const s=STATIONS.find(s=>s.id===id);return s?`<button data-act="go-${s.id}"><small>${s.number} · ${s.subtitle}</small><strong>${s.name} ↗</strong></button>`:'<div class="map-center">天光入院</div>';}).join('')}</div><p class="small-note">北为坯房，南接原料房与公共窑棚。多个历史作业空间在此压缩为连通院落。</p>`;}
  if(kind==='journal'){title='手艺札记';content=`<div class="eyebrow">水土 · 双手 · 窑火</div><p>这里取意于清代景德镇民间制瓷。真实产业分工精细：原料行、坯房、画作与窑场，并非一位匠人、一间屋子包办。这个院落将它们连在一起，让你亲历一件青花的生命。</p><div class="note-grid"><section><h3>一 · 从泥到坯</h3><p>瓷石、高岭土经过破碎、淘洗、沉降与脱水，再配泥陈腐。本作领取的是已预处理的泥块；你仍须调水、揉练排气。轮车靠竹杖起动，双手塑形。</p></section><section><h3>二 · 干湿之间</h3><p>湿坯柔软，不能立即利坯。放到阴干架候至半干，才用刀旋削。不能用强晒或窑火代替恰当干燥。</p></section><section><h3>三 · 釉下青花</h3><p>青料研细后画在坯上，再施透明釉并高温烧成。青花主线无需强行插入素烧，也不必都做第二次彩烧。</p></section><section><h3>四 · 窑中有性</h3><p>匣钵减少窑灰与火焰污染。窑位、温度历程、坯壁与釉层共同影响结果。烧窑与冷却跨日，游戏用时间推进压缩等待。</p></section></div><h3>把手艺留在器物上</h3><p>拉坯：先开孔，在器壁左右拖动；滚轮旋看。修坯：选落刀高度，按住旋削。画坯：直接在三维表面落笔。施釉：按住浸釉，控制深度与时间。持物走到工作台，按 E 放下；看向近处平面按 Q，可自由放置。</p><h3>考证与边界</h3><p>工序参考唐英《陶冶图说》及故宫资料，场景为合成工坊。泥体、烧成参数和缺陷是可解释的游戏近似，未经真实配方试验校准；桌面双手采用动作约束，不是独立六自由度输入。</p><p><a href="https://www.dpm.org.cn/Uploads/File/2020/04/22/u5e9ffd0d381f6.pdf" target="_blank" rel="noopener">故宫博物院 · 唐英与《陶冶图说》</a> &nbsp; / &nbsp; <a href="https://whc.unesco.org/en/list/1765/" target="_blank" rel="noopener">景德镇手工瓷业遗产资料</a></p>`;}
  if(kind==='settings'){title='工坊设置';const set=state.settings;content=`<div class="settings-grid"><div><label>环境声音 <input id="sound" type="checkbox" ${set.sound?'checked':''}></label><label>音量 <input id="volume" type="range" min="0" max="1" step="0.05" value="${set.volume}"></label><label>画面质量 <select id="quality"><option value="high" ${set.quality==='high'?'selected':''}>高 · 细节与阴影</option><option value="low" ${set.quality==='low'?'selected':''}>轻 · 降低像素成本</option></select></label><label>视角灵敏度 <input id="sensitivity" type="range" min="0.2" max="3" step="0.1" value="${set.sensitivity}"></label><label>行走晃动 <input id="bob" type="checkbox" ${set.bob?'checked':''}></label><label>工艺字幕 <input id="subtitles" type="checkbox" ${set.subtitles?'checked':''}></label></div><div><label>默认师傅扶火 <input id="assist" type="checkbox" ${set.assist?'checked':''}></label>${Object.entries(set.bindings).map(([k,v])=>`<label>${{forward:'向前',back:'向后',left:'向左',right:'向右',interact:'操作',drop:'放下',journal:'札记',map:'工坊图'}[k]} <button data-act="bind-${k}" class="small">${esc(v.replace('Key',''))}</button></label>`).join('')}</div></div><h3>把作品带走</h3><p>工坊和作品自动保存在此浏览器的 IndexedDB。清除浏览器数据会清除本地存档。可导出完整备份，在其他浏览器中导入。</p><div class="row">${button('backup','导出工坊备份')}${button('import','导入备份')}${button('save','立即保存')}</div><p class="small-note">打开设置时工艺时间暂停。桌面键鼠优先；窄屏可查看与引路，完整自由操作建议使用键盘鼠标。</p>`;}
  if(kind==='collection'){title='藏器 · 每一器都有来路';const items=state.pieces.filter(p=>['packed','fired'].includes(p.stage));content=items.length?`<div class="collection">${items.map(p=>{const outline=p.radius.map((r,i)=>`${100+r*270},${130-i/47*110}`).join(' ');const inside=[...p.radius].reverse().map((r,i)=>`${100-r*270},${20+i/47*110}`).join(' ');return `<article><svg class="silhouette" viewBox="0 0 200 150"><defs><linearGradient id="g-${p.id}"><stop stop-color="#9baea6"/><stop offset=".4" stop-color="#e1e9df"/><stop offset="1" stop-color="#708a81"/></linearGradient></defs><polygon points="${outline} ${inside}" fill="url(#g-${p.id})"/></svg><div class="grade">${p.score>=85?'上品':p.score>=60?'良品':'习器'} · ${p.score} / 100</div><h3>${esc(p.name)}</h3><p>${p.marks.length} 笔 · ${p.defects.length?p.defects.length+' 项窑变记录':'釉净器正'}</p>${button('view-'+p.id,'对光看器 ↗')}${button('record-'+p.id,'工艺记录','small')}</article>`;}).join('')}</div>`:'<p>还没有出窑的作品。第一团泥已经在原料房等你。</p>';}
  $('#modal-root').innerHTML=`<div class="modal-wrap"><section class="modal" role="dialog" aria-modal="true" aria-label="${title}"><div class="modal-head"><h2>${title}</h2>${button('close-modal','关闭 ×')}</div>${content}</section></div>`;$('#modal-root button')?.focus();
}
async function exportGlb(){const p=active(state);if(!p)return;const ceramic=game.ceramics.get(p.id)!;const object=ceramic.clone();object.position.set(0,0,0);object.rotation.set(0,0,0);object.userData={title:p.name,history:p.history,defects:p.defects,units:'metres',source:'Yaohuo v0.1'};const output=await new GLTFExporter().parseAsync(object,{binary:true});download(new Blob([output as ArrayBuffer],{type:'model/gltf-binary'}),`窑火-${p.name}.glb`);toast('已导出包含器形、青花贴图与工艺记录的 GLB。');}
function capture(){game.renderer.domElement.toBlob(blob=>{if(blob)download(blob,`窑火-${active(state)?.name||'工坊'}.png`);});toast('已保存当前三维画面。');}

root.addEventListener('click',async e=>{const b=(e.target as HTMLElement).closest<HTMLElement>('[data-act]');if(!b)return;const act=b.dataset.act!;sound.start();const p=active(state);try{
  if(['map','journal','collection','settings'].includes(act)){openModal(act);return;}
  if(act.startsWith('go-')){go(act.slice(3) as StationId);return;}
  if(act.startsWith('tool-')){tool=act.slice(5) as Mark['kind'];renderWork();return;}
  if(act.startsWith('bind-')){remap=act.slice(5);b.textContent='按一个键…';return;}
  if(act.startsWith('view-')){state.activeId=act.slice(5);go('display');return;}
  if(act.startsWith('record-')){const q=state.pieces.find(p=>p.id===act.slice(7))!;toast(q.history.join(' → '));return;}
  switch(act){case 'close-modal':closeModal();break;case 'leave':leave();void lock();break;case 'guide':go(nextTask(p).station);break;case 'take':takePiece();break;
    case 'form-bowl':form='bowl';renderWork();break;case 'form-vase':form='vase';renderWork();break;
    case 'new':if(state.pieces.length>=100)throw new Error('工坊已达 100 件容量，请先导出备份。');{const q=newPiece(form,state.pieces.length+1);state.pieces.push(q);state.activeId=q.id;takePiece();toast('领取原泥 · 下一处：淘练台');}break;
    case 'open':if(p){openClay(p);spin=0.75;sound.tap();renderWork();}break;
    case 'smooth':if(p)smooth(p);break;case 'undo-shape':if(p&&shapeUndo.length)Object.assign(p,shapeUndo.pop());break;case 'spin':spin=spin?0:0.75;break;
    case 'undo-paint':if(p){let count=0;do{p.marks.pop();count++;}while(p.marks.length&&!p.marks[p.marks.length-1].end&&count<1000);}break;
    case 'rotate-left':game.rotation-=Math.PI/6;break;case 'rotate-right':game.rotation+=Math.PI/6;break;
    case 'clean-foot':if(p&&p.stage==='glazed'){p.footClean=true;p.history.push('湿布擦净底足接触面。');renderWork();toast('底足已净，放回阴干架候干。');}else toast('先施釉，再擦底足。');break;
    case 'wash-glaze':if(p){p.glaze.fill(0);p.footClean=false;p.stage=p.marks.length?'painted':'trimmed';renderWork();}break;
    case 'load':if(p){loadKiln(state,p);renderWork();toast('干坯已装入匣钵。');}break;
    case 'light':lightKiln(state);toast('窑门封定，起火。等火候足，再自然冷却。');renderWork();break;
    case 'fuel':if(state.kiln.phase==='firing'){state.kiln.fuel=clamp(state.kiln.fuel+0.3,0,1);sound.tap();}else toast('起火后再添柴。');break;
    case 'cool':if(state.kiln.phase==='firing'){state.kiln.phase='cooling';toast('已止火。窑器自然冷却后才可取出。');}break;
    case 'pack':if(p?.stage==='fired'){p.stage='packed';p.history.push('验看分等，包纸束草，收入成器堂。');renderWork();toast('此器已入藏。你的指痕与笔意，都留在了这窑青花里。');}break;
    case 'export-glb':await exportGlb();break;case 'photo':capture();break;
    case 'backup':download(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),'窑火-工坊备份.json');break;
    case 'import':$('#import').click();break;case 'save':await persist();toast('工坊已保存。');break;
  }dirty();}catch(err){toast((err as Error).message);}
});
root.addEventListener('input',e=>{const t=e.target as HTMLInputElement;const p=active(state);const value=Number(t.value);const label=$('#'+t.id+'-value');if(label)label.textContent=t.value;
  if(t.id==='water'){water=value;if(p?.stage==='prepared')p.moisture=value;}
  if(t.id==='height'&&p)stretch(p,value);if(t.id==='pressure')pressure=value;if(t.id==='trim-ring')ring=value;if(t.id==='brush-size')brushSize=value;if(t.id==='ink')ink=value;if(t.id==='depth')depth=value;if(t.id==='draft')state.kiln.draft=value;
  if(t.id==='kiln-pos'&&p)p.kilnPosition=t.value as Piece['kilnPosition'];if(t.id==='assist-kiln')state.kiln.assisted=t.checked;
  if(['sound','bob','subtitles','assist'].includes(t.id))(state.settings as unknown as Record<string,unknown>)[t.id]=t.checked;
  if(['volume','sensitivity'].includes(t.id))(state.settings as unknown as Record<string,unknown>)[t.id]=value;
  if(t.id==='quality'){state.settings.quality=t.value as 'high'|'low';game.setQuality();}
  if(t.id==='piece-name'&&p)p.name=t.value||'无名器';dirty();
});
$('#import').addEventListener('change',async e=>{const f=(e.target as HTMLInputElement).files?.[0];if(!f)return;try{if(f.size>15e6)throw new Error('存档太大，上限为 15 MB。');const incoming=validateSave(JSON.parse(await f.text()));download(new Blob([JSON.stringify(state)],{type:'application/json'}),'窑火-导入前备份.json');state=incoming;game.state=state;game.sync();yaw=state.yaw;physics.body.setTranslation({x:state.player[0],y:0.85,z:state.player[2]},true);leave();closeModal();await persist();toast('备份已恢复，原工坊已自动导出备份。');}catch(err){toast('导入失败：'+(err as Error).message);}(e.target as HTMLInputElement).value='';});

let rightDrag=false;
root.addEventListener('pointerdown',e=>{const h=(e.target as HTMLElement).closest<HTMLElement>('[data-hold]');if(h){hold=h.dataset.hold!;holdTimer=0;h.setPointerCapture(e.pointerId);e.preventDefault();}});
window.addEventListener('pointerup',()=>{hold='';rightDrag=false;if(dragging){const p=active(state);if(p&&focus==='paint'&&p.marks.length)p.marks[p.marks.length-1].end=true;dirty();}dragging=false;});
window.addEventListener('pointercancel',()=>{hold='';dragging=false;rightDrag=false;});
function markAt(x:number,y:number,first=false){const p=active(state);if(!p)return;const hit=game.hitPiece(x,y);if(!hit?.uv)return;ring=Math.round(hit.uv.y*47);game.workMotion=ring/47;if(focus==='paint'&&(first||tool==='brush')){addMark(p,{u:hit.uv.x,v:hit.uv.y,size:brushSize,ink,kind:tool,end:tool!=='brush'});dirty();}}
window.addEventListener('mousemove',e=>{if(!started||modal)return;
  if((document.pointerLockElement||rightDrag)&&!focus){yaw-=e.movementX*0.002*state.settings.sensitivity;pitch=clamp(pitch-e.movementY*0.002*state.settings.sensitivity,-1.2,1.2);state.yaw=yaw;}
  if(dragging&&focus){const p=active(state);if(p&&focus==='wheel'&&p.opened){shape(p,ring,(e.clientX-lastX)*0.00045,pressure);dirty();}if(focus==='paint')markAt(e.clientX,e.clientY);lastX=e.clientX;lastY=e.clientY;}
});
window.addEventListener('keydown',e=>{
  if(remap){e.preventDefault();if(e.code==='Escape'){remap=null;openModal('settings');return;}if(['KeyW','KeyA','KeyS','KeyD','KeyE','KeyQ','KeyJ','KeyM'].includes(e.code)||e.code.startsWith('Key')){const conflict=Object.entries(state.settings.bindings).find(([k,v])=>v===e.code&&k!==remap);if(conflict){toast('此键已用于另一项操作，请换一个键。');return;}state.settings.bindings[remap]=e.code;remap=null;openModal('settings');dirty();}return;}
  if((e.target as HTMLElement).matches('input,select,textarea'))return;
  if(e.code==='Escape'){if(modal)closeModal();else if(focus)leave();else if(!document.pointerLockElement&&started)openModal('settings');return;}
  if(modal){if(e.code==='Tab'){const all=[...document.querySelectorAll<HTMLElement>('.modal button,.modal input,.modal select,.modal a')];const first=all[0],last=all[all.length-1];if(e.shiftKey&&document.activeElement===first){last.focus();e.preventDefault();}else if(!e.shiftKey&&document.activeElement===last){first.focus();e.preventDefault();}}return;}
  if(!started)return;const bind=state.settings.bindings;if(Object.values(bind).includes(e.code)||['ShiftLeft','ControlLeft','Space'].includes(e.code))e.preventDefault();if(e.repeat)return;
  keys.add(e.code);if([bind.forward,bind.back,bind.left,bind.right].includes(e.code))nav=[];
  if(e.code===bind.interact)interact();if(e.code===bind.drop)drop();if(e.code===bind.journal)openModal('journal');if(e.code===bind.map)openModal('map');
});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();hold='';dragging=false;rightDrag=false;});document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();hold='';void persist();}});
window.addEventListener('pagehide',()=>void persist());
function updateUI(){const p=active(state),task=nextTask(p);$('#objective').textContent=task.text;$('#day').textContent=`第 ${state.day} 日 · ${p?STAGES[p.stage]:'初入工坊'}`;$('#caption').textContent=state.settings.subtitles&&focus?STATIONS.find(s=>s.id===focus)!.subtitle:'';$('#control-hint').textContent=focus?'Esc 起身 · 滚轮 旋看 · 工序与器物自动保存':`${state.settings.bindings.forward.replace('Key','')}${state.settings.bindings.left.replace('Key','')}${state.settings.bindings.back.replace('Key','')}${state.settings.bindings.right.replace('Key','')} 行走 · 鼠标 看向 · ${state.settings.bindings.interact.replace('Key','')} 操作 · ${state.settings.bindings.drop.replace('Key','')} 放下${state.held?' · 正在手持'+(state.held===p?.id?'坯板':'工具'):''}`;
  if(!focus&&!modal){const n=nearest();$('#prompt').classList.toggle('hidden',n.d>2.2);$('#prompt').innerHTML=`<kbd>${state.settings.bindings.interact.replace('Key','')}</kbd>${state.held?'放下并操作':'走近 · 操作'} ${n.s.name}`;}else $('#prompt').classList.add('hidden');
  if(p&&focus){const set=(id:string,value:string)=>{const el=$(id);if(el)el.textContent=value;};set('#prep-status',p.stage==='prepared'?'泥已练匀':Math.round(p.preparation*100)+'%');const a=$('#prep-meter');if(a)a.style.width=p.preparation*100+'%';const b=$('#trim-meter');if(b)b.style.width=p.trimmed*100+'%';set('#glaze-thick',glazeMean(p).toFixed(2));const g=$('#glaze-meter');if(g)g.style.width=Math.min(100,glazeMean(p)/1.4*100)+'%';set('#thickness',(Math.min(...p.thickness)*1000).toFixed(1)+' mm');set('#dry-status',p.location==='rack'?`含水 ${Math.round(p.moisture*100)}% · ${STAGES[p.stage]}`:'');}
  if(focus==='kiln'){const k=state.kiln;$('#kiln-temp').textContent=`${k.phase==='idle'?'窑静':k.phase==='cooling'?'自然冷却':'火起'} · ${Math.round(k.temperature)} ℃`;$('#kiln-fuel').textContent=Math.round(k.fuel*100)+'%';$('#curve').setAttribute('points',k.curve.map(([t,temp])=>`${t/Math.max(40,k.elapsed)*260},${87-temp/1450*85}`).join(' '));}
}
function tick(ms:number){const frameMs=lastTime?ms-lastTime:16.67;const dt=Math.min(0.05,frameMs/1000);lastTime=ms;elapsed+=dt;
  if(started){if(!document.hidden&&!paused){const p=active(state);advance(state,dt,hold==='wait'?8:1);if(hold){holdTimer+=dt;if(p){if(hold==='prepare'){prepare(p,dt*1.5,water);game.workMotion=0.3+Math.sin(elapsed*5)*0.3;}if(hold==='trim'){trim(p,dt,ring);game.rotation+=dt*2;game.workMotion=ring/47;}if(hold==='dip'){dip(p,dt,depth);game.workMotion=0.6;}}if(holdTimer>0.22){dirty();holdTimer=0;sound.tap(hold==='prepare'?'clay':'brush');}}
    if(p){const stage=p.id+p.stage;if(stage!==lastStage){if(lastStage){dirty();if(focus)renderWork();}lastStage=stage;}}
  }
  let moving=false;if(!focus&&!modal&&!paused){let x=0,z=0;const b=state.settings.bindings;if(nav.length){const t=nav[0],dx=t[0]-state.player[0],dz=t[2]-state.player[2],dist=Math.hypot(dx,dz);if(dist<0.12)nav.shift();else{x=dx/dist;z=dz/dist;yaw=Math.atan2(-x,-z);pitch=-0.06;}}
    else{const forward=Number(keys.has(b.forward))-Number(keys.has(b.back)),right=Number(keys.has(b.right))-Number(keys.has(b.left));x=-Math.sin(yaw)*forward+Math.cos(yaw)*right;z=-Math.cos(yaw)*forward-Math.sin(yaw)*right;const l=Math.hypot(x,z);if(l){x/=l;z/=l;}}
    const speed=(keys.has('ShiftLeft')?3.5:2.1)*(keys.has('ControlLeft')?0.45:1);moving=!!(x||z);const old=[...state.player];state.player=physics.move(x*dt*speed,z*dt*speed,dt);if(keys.has('ControlLeft'))state.player[1]-=0.48;
    if(moving&&Math.floor(elapsed*2.5)!==Math.floor((elapsed-dt)*2.5)){sound.tap('step');if(state.held&&keys.has('ShiftLeft')){const p=active(state);if(p?.stage==='thrown'&&Math.hypot(old[0]-state.player[0],old[2]-state.player[2])<0.01){p.stress+=0.02;toast('坯板撞到了障碍，请托稳慢行。');}}}
    if(nav.length===0&&moving)state.yaw=yaw;
  }
  game.pose(dt,yaw,pitch,moving,elapsed);game.rotation+=spin*dt;
  sound.update(state.kiln.phase==='firing'?state.kiln.fuel/(1+Math.hypot(state.player[0]-6,state.player[2]-4)*0.25):0,state.settings.volume,state.settings.sound);
  uiTimer+=dt;saveTimer+=dt;if(uiTimer>0.18){updateUI();uiTimer=0;game.sync();}if(saveTimer>4){void persist();saveTimer=0;}
  if(!document.hidden)frames.push(frameMs);if(frames.length>600)frames.shift();
  }else{game.camera.position.set(-2+Math.sin(elapsed*0.025)*0.5,1.85,3.15);game.camera.lookAt(0.6,1.15,-4.5);}
  game.update(dt,elapsed);requestAnimationFrame(tick);
}
async function boot(){try{try{const loaded=await restore();if(loaded){state=loaded;$('#start').textContent='回到工坊 →';}}catch{toast('旧存档无法读取，可在设置里导入备份。');}
  yaw=state.yaw;game=new Workshop($('#world'),state);physics=new Physics();await Promise.all([game.load(label=>$('#loading').textContent='正在准备 · '+label),physics.init(state.player)]);
  const canvas=game.renderer.domElement;canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.addEventListener('pointerdown',e=>{if(!started||modal)return;if(e.button===2){rightDrag=true;return;}if(!focus){void lock();return;}if(e.button===0){const p=active(state),hit=game.hitPiece(e.clientX,e.clientY);if(hit&&p?.location===focus){dragging=true;lastX=e.clientX;lastY=e.clientY;ring=Math.round((hit.uv?.y||0.5)*47);game.workMotion=ring/47;if(focus==='wheel'&&p.opened)shapeUndo.push({radius:[...p.radius],thickness:[...p.thickness],height:p.height});if(shapeUndo.length>30)shapeUndo.shift();markAt(e.clientX,e.clientY,true);canvas.setPointerCapture(e.pointerId);}}});
  canvas.addEventListener('wheel',e=>{if(focus&&!modal){e.preventDefault();game.rotation+=e.deltaY*0.003;}},{passive:false});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();paused=true;void persist();$('#modal-root').innerHTML='<div class="context-error"><h2>画面暂时中断</h2><p>工坊已尝试保存。浏览器恢复图形环境后会重新载入。</p><button onclick="location.reload()">重新打开工坊</button></div>';});canvas.addEventListener('webglcontextrestored',()=>location.reload());
  $('#start').textContent=state.pieces.length?'回到工坊 →':'推门，入工坊 →';($('#start') as HTMLButtonElement).disabled=false;$('#loading').textContent='WASD 行走 · E 操作 · 按住右键可转动视角';$('.loading-line').classList.add('hidden');
  $('#start').addEventListener('click',()=>{started=true;paused=false;$('#intro').classList.add('hidden');$('#hud').classList.remove('hidden');sound.start();updateUI();toast(state.pieces.length?'工坊与你的作品，仍在这里。':'先到左侧原料房取泥。也可打开「工坊图」引路。');void persist();});
  // Read-only diagnostics: no stage changes or hidden gameplay completion hooks.
  Object.defineProperty(window,'__YAOHUO__',{value:{snapshot:()=>structuredClone(state),stats:()=>({fps:1000/(frames.reduce((a,b)=>a+b,0)/Math.max(1,frames.length)),...game.getStats()}),view:()=>({focus,modal,nav:nav.length,camera:game.camera.position.toArray()})},writable:false});
  requestAnimationFrame(tick);
}catch(err){$('#loading').textContent='工坊加载失败：'+(err as Error).message;$('#start').textContent='刷新重试';($('#start') as HTMLButtonElement).disabled=false;$('#start').onclick=()=>location.reload();console.error(err);}}
void boot();
