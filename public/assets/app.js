'use strict';
const $ = id => document.getElementById(id);
let isZh = true;
const preference = new URLSearchParams(location.search).get('lang') || localStorage.getItem('rge-studio.language') || 'zh-CN';
isZh = preference !== 'en';
let translations = {};
function t(text, params = {}) { let value = (isZh && translations[text]) || text; for (const [key, item] of Object.entries(params)) value = value.split('{'+key+'}').join(String(item)); return value; }
function errorText(text) { const parts = String(text).split(': '); return parts.length === 2 ? t(parts[0]) + (isZh ? '：' : ': ') + t(parts[1]) : t(text); }
const KEY = 'rge-studio.workspace.v1';
let schemas, state, currentId = null, currentCode = '', valid = false, requestVersion = 0, timer, toastTimer;
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const clone = value => JSON.parse(JSON.stringify(value));
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const project = () => state.projects.find(p => p.id === state.activeProject);
const entry = () => project().entries.find(e => e.id === currentId);
function toast(message) { $('toast').textContent = errorText(message); $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 4500); }
async function api(path, data, form = false) {
  const response = await fetch(path, data === undefined ? {} : {method:'POST', headers:form ? {} : {'Content-Type':'application/json'}, body:form ? data : JSON.stringify(data)});
  const result = await response.json();
  if (!response.ok) throw new Error(errorText(result.error || 'Request failed. Please try again.'));
  return result;
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
  catch { toast(t('Browser storage is full or unavailable. Export a backup now to keep your changes.')); return false; }
}
function download(name, contents, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([contents], {type}));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const filename = name => (name || 'commands').replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0,80);
async function copy(text) {
  if (!text) return toast(t('There are no commands to copy.'));
  try { await navigator.clipboard.writeText(text); toast(t('Copied to clipboard.')); }
  catch { toast(t('Clipboard unavailable. Use Export .txt or select the command text.')); }
}
function showView(view) {
  for (const key of ['builder','library','guide']) $(key+'-view').hidden = key !== view;
  document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $('breadcrumb').textContent = {builder:t('Command builder'), library:t('Command library'), guide:t('Field guide')}[view];
  if (view === 'library') renderLibrary();
}
function draftValues() {
  const values = {};
  for (const field of schemas[$('command-kind').value].fields) values[field.key] = $('field-'+field.key).value;
  return values;
}
function snapshotDraft() {
  if (!schemas || !project()) return;
  project().draft = {id:currentId, title:$('command-title').value, notes:$('command-notes').value, kind:$('command-kind').value, values:draftValues()};
  if (persist()) $('draft-status').textContent = t('Draft saved locally');
}
function renderFields(kind, values) {
  const spec = schemas[kind];
  let html = '', position = [], rotation = [];
  const fieldHTML = field => {
    const id = 'field-'+field.key;
    const value = values?.[field.key] ?? field.default;
    let input;
    if (field.kind === 'boolean') input = `<select id="${id}"><option value="true" ${value==='true'?'selected':''}>true</option><option value="false" ${value==='false'?'selected':''}>false</option></select>`;
    else if (field.key === 'raw') input = `<textarea id="${id}" rows="5" maxlength="10000">${escapeHTML(value)}</textarea>`;
    else input = `<input id="${id}" value="${escapeHTML(value)}" ${field.kind !== 'text' ? 'inputmode="decimal"' : ''} ${field.choices.length ? `list="choices-${field.key}"` : ''} autocomplete="off" maxlength="256">`;
    if (kind === 'explosion' && ['value1','value2'].includes(field.key)) input += `<input class="value-slider" type="range" id="slider-${field.key}" data-slider="${field.key}" min="${Math.min(0,Number(value)||0)}" max="${Math.max(500,Number(value)||0)}" step="any" value="${escapeHTML(value)}" aria-label="${escapeHTML(t(field.label))} ${t('slider')}">`;
    if (field.choices.length) input += `<datalist id="choices-${field.key}">${field.choices.map(c => `<option value="${escapeHTML(c)}">`).join('')}</datalist>`;
    return `<div class="field"><label for="${id}">${escapeHTML(t(kind === 'explosion' && field.key === 'value1' ? 'Power / damage' : field.label))}</label>${input}${field.hint ? `<p class="field-hint">${escapeHTML(t(field.hint))}</p>` : ''}</div>`;
  };
  for (const field of spec.fields) {
    if (['x','y','z'].includes(field.key)) position.push(fieldHTML(field));
    else if (['rx','ry','rz'].includes(field.key)) rotation.push(fieldHTML(field));
    else {
      if (position.length) { html += `<div class="group-label">${t('POSITION')}</div><div class="field-group">${position.join('')}</div>`; position = []; }
      if (rotation.length) { html += `<div class="group-label">${t('ROTATION')}</div><div class="field-group">${rotation.join('')}</div>`; rotation = []; }
      html += fieldHTML(field);
    }
  }
  if (position.length) html += `<div class="group-label">${t('POSITION')}</div><div class="field-group">${position.join('')}</div>`;
  if (rotation.length) html += `<div class="group-label">${t('ROTATION')}</div><div class="field-group">${rotation.join('')}</div>`;
  $('dynamic-fields').innerHTML = html;
  $('kind-description').textContent = t(spec.description);
  $('coordinate-tools').hidden = !spec.fields.some(f => f.key === 'x');
  $('coordinates').value = '';
}
function loadDraft(draft) {
  currentId = draft?.id || null;
  const kind = schemas[draft?.kind] ? draft.kind : 'tween';
  $('command-kind').value = kind;
  $('command-title').value = draft?.title || '';
  $('command-notes').value = draft?.notes || '';
  renderFields(kind, draft?.values);
  $('editing-state').textContent = currentId ? t('EDITING SAVED') : t('NEW DRAFT');
  $('save-command').textContent = currentId ? t('Update command') : t('Save command');
  $('draft-status').textContent = t('Draft saved locally');
  refreshPreview(); renderSequence();
}
async function refreshPreview() {
  clearTimeout(timer);
  const version = ++requestVersion;
  valid = false; updateButtons();
  const kind = $('command-kind').value, values = draftValues();
  $('validation').textContent = t('Checking command…');
  try {
    const result = await api('/api/generate', {kind, values});
    if (version !== requestVersion) return false;
    currentCode = result.code; valid = true;
    $('code-preview').value = result.code;
    $('validation').textContent = kind === 'raw' ? t('△ Custom command · game syntax not validated') : t('✓ Supported structure · ready to copy');
    $('validation').className = kind === 'raw' ? 'error' : '';
  } catch(error) {
    if (version !== requestVersion) return false;
    currentCode = ''; $('code-preview').value = '';
    $('validation').textContent = errorText(error.message); $('validation').className = 'error';
  }
  updateButtons(); drawMap(); return valid;
}
function updateButtons() { for (const id of ['copy-code','download-code','save-command','save-copy']) $(id).disabled = !valid; }
function onInput() {
  snapshotDraft(); valid = false; requestVersion++; updateButtons(); drawMap();
  clearTimeout(timer); timer = setTimeout(refreshPreview, 200);
}
function renderProjects() {
  $('projects').innerHTML = state.projects.map(p => `<button class="project-button ${p.id===state.activeProject?'active':''}" data-project="${escapeHTML(p.id)}">${escapeHTML(p.name)}</button>`).join('');
  $('project-title').textContent = project().name;
  $('scratchpad').value = project().scratchpad || '';
  $('project-stats').textContent = t('{count} saved commands',{count:project().entries.length});
  $('library-count').textContent = state.projects.reduce((n,p) => n+p.entries.length,0);
}
function renderSequence() {
  const items = project().entries;
  $('sequence-count').textContent = t('{count} commands',{count:items.length});
  $('sequence-list').innerHTML = items.length ? items.map((e,i) => `<div class="sequence-row ${e.id===currentId?'selected':''}"><span class="row-number">${String(i+1).padStart(2,'0')}</span><button class="row-main" data-edit="${e.id}"><strong>${escapeHTML(e.title)}</strong><code>${escapeHTML(e.code)}</code></button><div class="row-actions"><button data-action="up" data-id="${e.id}" aria-label="${escapeHTML(t('Move {name} up',{name:e.title}))}" ${i===0?'disabled':''}>↑</button><button data-action="down" data-id="${e.id}" aria-label="${escapeHTML(t('Move {name} down',{name:e.title}))}" ${i===items.length-1?'disabled':''}>↓</button><button data-action="duplicate" data-id="${e.id}" aria-label="${escapeHTML(t('Duplicate {name}',{name:e.title}))}">⧉</button><button data-action="history" data-id="${e.id}" aria-label="${escapeHTML(t('History for {name}',{name:e.title}))}">↶</button><button data-action="delete" data-id="${e.id}" aria-label="${escapeHTML(t('Delete {name}',{name:e.title}))}">×</button></div></div>`).join('') : '<div class="empty">' + t('Your sequence starts here. Save a command or paste a few from RGE.') + '</div>';
  renderProjects();
}
function editEntry(item) { loadDraft(item); snapshotDraft(); showView('builder'); }
async function saveCommand(asCopy = false) {
  if (!await refreshPreview()) return;
  const previous = asCopy ? null : entry();
  const history = previous ? [...(previous.history || []), {title:previous.title, notes:previous.notes, code:previous.code, at:previous.updatedAt}].slice(-30) : [];
  const next = {id:previous?.id || uid(), title:$('command-title').value.trim() || t(schemas[$('command-kind').value].name),
    kind:$('command-kind').value, values:draftValues(), code:currentCode, notes:$('command-notes').value,
    createdAt:previous?.createdAt || now(), updatedAt:now(), history,
    source:previous?.source || '', formula:previous?.formula || null, original:previous?.original || null};
  if (previous) project().entries[project().entries.indexOf(previous)] = next;
  else project().entries.push(next);
  currentId = next.id; loadDraft(next); snapshotDraft(); renderSequence(); drawMap();
  toast(previous ? t('Command updated. Previous version kept in history.') : t('Command saved to your project.'));
}
function drawMap() {
  const values = draftValues();
  const coords = v => v && ['x','y','z'].every(k => v[k] !== '' && v[k] !== undefined && Number.isFinite(Number(v[k]))) ? {x:Number(v.x),z:Number(v.z)} : null;
  const points = project().entries.map(e => ({...coords(e.values),id:e.id})).filter(p => Number.isFinite(p.x));
  const current = valid ? coords(values) : null;
  const all = current ? [...points, current] : points;
  const radius = current && $('command-kind').value === 'explosion' ? Math.abs(Number(values.value2)) : 0;
  if (radius && Number.isFinite(radius)) all.push({x:current.x-radius,z:current.z-radius},{x:current.x+radius,z:current.z+radius});
  if (!all.length) { $('map-points').innerHTML = '<text x="160" y="107">' + t('No position in this command') + '</text>'; $('position-readout').textContent = t('Position preview appears for commands with X / Y / Z.'); return; }
  const xs = all.map(p=>p.x), zs=all.map(p=>p.z), minX=Math.min(...xs), maxX=Math.max(...xs), minZ=Math.min(...zs), maxZ=Math.max(...zs);
  const scale = Math.min(400/Math.max(maxX-minX,20),130/Math.max(maxZ-minZ,20));
  const xy = p => [250+(p.x-(minX+maxX)/2)*scale,105+(p.z-(minZ+maxZ)/2)*scale];
  let html = points.map(p=>{const [x,y]=xy(p); return `<circle cx="${x}" cy="${y}" r="4" fill="#71817a"/>`;}).join('');
  if(current && radius){const [x,y]=xy(current);html += `<circle data-explosion-radius="${radius}" cx="${x}" cy="${y}" r="${radius*scale}" fill="#d6fa76" fill-opacity=".08" stroke="#d6fa76" stroke-dasharray="4 4"/>`;}
  if(current){const [x,y]=xy(current);html += `<circle cx="${x}" cy="${y}" r="13" fill="none" stroke="#d6fa76" opacity=".35"/><circle cx="${x}" cy="${y}" r="5" fill="#d6fa76"/><path d="M ${x} ${y-20} v-7 M ${x} ${y+20} v7 M ${x-20} ${y} h-7 M ${x+20} ${y} h7" stroke="#d6fa76"/>`;}
  html += '<text x="468" y="195">X →</text><text x="12" y="22">Z ↓</text>';
  $('map-points').innerHTML = html;
  $('position-readout').textContent = current ? `X ${values.x}  /  Y ${values.y}  /  Z ${values.z}` : t('{count} saved positions',{count:points.length});
}
function renderLibrary() {
  const query = $('search').value.toLowerCase(), kind = $('filter-kind').value;
  const all = state.projects.flatMap(p=>p.entries.map(e=>({...e,projectId:p.id,projectName:p.name})));
  const filtered = all.filter(e=>(!kind||e.kind===kind)&&`${e.title} ${e.code} ${e.notes} ${e.source} ${e.projectName}`.toLowerCase().includes(query));
  $('library-results').innerHTML = filtered.length ? filtered.map(e=>`<article class="panel library-card"><div class="card-top"><span class="pill">${escapeHTML(t(schemas[e.kind]?.name || 'Custom'))}</span><span class="tiny">${escapeHTML(e.projectName)}</span></div><h2>${escapeHTML(e.title)}</h2><pre>${escapeHTML(e.code)}</pre><p>${escapeHTML(e.notes || t('No notes yet.'))}</p>${e.source?`<div class="source">${t('SOURCE')} ${escapeHTML(e.source)}</div>`:''}<div class="inline"><button class="button" data-library-edit="${e.id}" data-owner="${e.projectId}">${t('Open command')}</button><button class="text-button" data-library-use="${e.id}" data-owner="${e.projectId}">${t('Use in active project ↗')}</button></div></article>`).join('') : '<div class="panel empty">' + t('No matching commands. Import your workbook to build your library.') + '</div>';
}
function commandLines() { return project().entries.map(e=>e.code).join('\n'); }
function buildEntry(parsed, i = 0) {
  return {id:uid(), title:parsed.title || `${t(schemas[parsed.kind].name)} ${i+1}`, notes:parsed.notes || parsed.warning || '', source:parsed.source || '', formula:parsed.formula || null, original:parsed.original || null,
    kind:parsed.kind, values:parsed.values, code:parsed.code, createdAt:now(), updatedAt:now(), history:[]};
}
function newProject(name, entries = []) {
  snapshotDraft();
  const p = {id:uid(), name:name.slice(0,160), entries, draft:null};
  state.projects.push(p); state.activeProject=p.id; loadDraft(entries[0] || null); snapshotDraft(); renderProjects(); showView('builder');
}
async function importText(text) {
  const owner = project();
  const result = await api('/api/parse',{code:text});
  const imported = result.entries.map(buildEntry);
  owner.entries.push(...imported); persist(); renderSequence(); drawMap();
  toast(t('Imported {count} commands{warning}.',{count:imported.length,warning:imported.some(e=>e.kind==='raw')?t(' · custom commands need review'):''}));
}
function normalizeImportedEntry(item, parsed) {
  if (!item || typeof item.code !== 'string' || item.code.length>10000 || /[\r\n\x00]/.test(item.code)) throw new Error(t('Backup contains an invalid command.'));
  const result = buildEntry({...parsed, title:String(item.title || '').slice(0,160), notes:String(item.notes || '').slice(0,4000), source:String(item.source || '').slice(0,300), formula:typeof item.formula==='string'?item.formula:null, original:typeof item.original==='string'?item.original:null});
  result.createdAt = typeof item.createdAt === 'string' ? item.createdAt : now();
  result.updatedAt = typeof item.updatedAt === 'string' ? item.updatedAt : now();
  result.history = Array.isArray(item.history) ? item.history.filter(h=>h&&typeof h.code==='string'&&h.code.length<=10000&&!/[\r\n\x00]/.test(h.code)).slice(-30).map(h=>({title:String(h.title||'').slice(0,160),notes:String(h.notes||'').slice(0,4000),code:h.code,at:String(h.at||now())})) : [];
  return result;
}
async function importFile(file) {
  if (!file) return;
  if (file.size > 5*1024*1024) throw new Error(t('Choose a file smaller than 5 MB.'));
  if (/\.xlsx$/i.test(file.name)) {
    const body = new FormData(); body.append('file',file);
    const result = await api('/api/import-workbook',body,true);
    if (!result.entries.length) throw new Error(t('No supported command candidates found in the workbook.'));
    newProject(file.name.replace(/\.xlsx$/i,''),result.entries.map(buildEntry));
    toast(t('Imported {count} commands. {raw} need review.{missing}',{count:result.entries.length,raw:result.entries.filter(e=>e.kind==='raw').length,missing:result.missingFormulaResults.length?t(' {count} formulas had no saved result.',{count:result.missingFormulaResults.length}):''}));
  } else if (/\.json$/i.test(file.name)) {
    const data = JSON.parse(await file.text());
    if (data.format!=='rge-studio' || data.version!==1 || !Array.isArray(data.projects) || !data.projects.length || data.projects.length>100) throw new Error(t('This is not a supported RGE Studio backup.'));
    if (data.projects.some(p=>!p||typeof p.name!=='string'||!Array.isArray(p.entries)) || data.projects.reduce((n,p)=>n+p.entries.length,0)>2000) throw new Error(t('Backup must contain valid projects and at most 2,000 commands.'));
    // Validate before committing so a bad file never partially overwrites the workspace.
    const imported=[];
    for(const p of data.projects){
      if(p.entries.some(e=>!e||typeof e.code!=='string'||!e.code.trim()||e.code.length>10000||/[\r\n\x00]/.test(e.code)))throw new Error(t('Backup contains an invalid command.'));
      const parsed=p.entries.length?(await api('/api/parse',{code:p.entries.map(e=>e.code).join('\n')})).entries:[];
      const entries=p.entries.map((e,i)=>normalizeImportedEntry(e,parsed[i]));
      let draft=null;
      if(p.draft && schemas[p.draft.kind] && p.draft.values && typeof p.draft.values==='object'){
        const values={};for(const f of schemas[p.draft.kind].fields)values[f.key]=String(p.draft.values[f.key]??'').slice(0,f.key==='raw'?10000:256);
        const i=p.entries.findIndex(e=>e.id===p.draft.id);
        draft={id:i>=0?entries[i].id:null,kind:p.draft.kind,values,title:String(p.draft.title||'').slice(0,160),notes:String(p.draft.notes||'').slice(0,4000)};
      }
      imported.push({id:uid(),name:p.name.slice(0,160),entries,draft,scratchpad:String(p.scratchpad||'').slice(0,20000)});
    }
    snapshotDraft(); state.projects.push(...imported); state.activeProject=imported[0].id; loadDraft(imported[0].draft||imported[0].entries[0]||null); snapshotDraft(); renderProjects(); showView('builder'); toast(t('Restored {count} projects. Existing projects kept.',{count:imported.length}));
  } else if (/\.txt$/i.test(file.name)) await importText(await file.text());
  else throw new Error(t('Choose an .xlsx, .json, or .txt file.'));
}
function showCommandHistory(item) {
  $('history-list').innerHTML = item.history?.length ? [...item.history].reverse().map((h,i)=>`<div class="history-item"><small>${escapeHTML(new Date(h.at).toLocaleString(isZh?'zh-CN':'en'))}</small><h3>${escapeHTML(h.title)}</h3><pre>${escapeHTML(h.code)}</pre><button class="button" data-restore="${item.history.length-1-i}" data-id="${item.id}">${t('Restore this version')}</button></div>`).join('') : '<p class="muted">' + t('No previous versions yet. Updating a saved command records its previous version here.') + '</p>';
  $('history-dialog').showModal();
}
function historyReplace(url) { window.history.replaceState(null, '', url); }
function wire() {
  $('language-select').onchange=()=>{
    snapshotDraft(); const view=document.querySelector('[data-view].active').dataset.view;
    const language=$('language-select').value; isZh=language!=='en';
    try { localStorage.setItem('rge-studio.language',language); } catch {}
    const url=new URL(location.href);url.searchParams.set('lang',language);historyReplace(url);
    translateInterface(); loadDraft(project().draft); renderProjects(); renderLibrary(); showView(view);
  };
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>showView(b.dataset.view));
  $('command-form').addEventListener('input',e=>{
    if(e.target.dataset.slider) $('field-'+e.target.dataset.slider).value=String(Math.round(Number(e.target.value)*100)/100);
    if(['field-value1','field-value2'].includes(e.target.id)) {
      const slider=$('slider-'+e.target.id.slice(6)), value=Number(e.target.value);
      if(slider && Number.isFinite(value)){slider.min=Math.min(0,value);slider.max=Math.max(500,value);slider.value=value;}
    }
    if(e.target.id!=='command-kind')onInput();
  });
  $('scratchpad').oninput=()=>{project().scratchpad=$('scratchpad').value;persist();};
  $('code-preview').oninput=()=>{
    clearTimeout(timer); const version=++requestVersion;
    valid=false;currentCode='';updateButtons();drawMap();
    $('validation').textContent=t('Checking command…');
    timer=setTimeout(()=>parseLivePreview(version),200);
  };
  $('command-form').onsubmit=e=>{e.preventDefault(); saveCommand().catch(e=>toast(e.message));};
  $('save-copy').onclick=()=>saveCommand(true).catch(e=>toast(e.message));
  $('command-kind').onchange=()=>{renderFields($('command-kind').value); onInput();};
  $('new-command').onclick=()=>{loadDraft(null); snapshotDraft(); $('command-title').focus();};
  $('copy-code').onclick=()=>copy(currentCode);
  $('download-code').onclick=()=>download(filename($('command-title').value)+'.txt',currentCode+'\n');
  $('copy-sequence').onclick=()=>copy(commandLines());
  $('export-sequence').onclick=()=>commandLines()?download(filename(project().name)+'.txt',commandLines()+'\n'):toast(t('Save a command first.'));
  $('backup').onclick=()=>{snapshotDraft(); download('rge-studio-backup.json',JSON.stringify({format:'rge-studio',version:1,exportedAt:now(),projects:state.projects},null,2),'application/json');};
  $('apply-coordinates').onclick=()=>{
    const tokens=$('coordinates').value.trim().split(/[\s,]+/);
    const keys=tokens.length===6?['x','y','z','rx','ry','rz']:['x','y','z'];
    if (![3,6].includes(tokens.length)||tokens.some(t=>!t||!Number.isFinite(Number(t)))||keys.some(k=>!$('field-'+k))) return toast(t('Paste 3 position values, or 6 values for a command that supports rotation.'));
    keys.forEach((k,i)=>$('field-'+k).value=tokens[i]); onInput(); toast(t('Coordinates applied without rounding.'));
  };
  $('projects').onclick=e=>{const b=e.target.closest('[data-project]');if(!b)return;snapshotDraft();state.activeProject=b.dataset.project;persist();loadDraft(project().draft||project().entries[0]||null);renderProjects();};
  $('new-project').onclick=()=>{const name=prompt(t('Name your new project'));if(name?.trim())newProject(name.trim());};
  $('rename-project').onclick=()=>{const name=prompt(t('Project name'),project().name);if(name?.trim()){project().name=name.trim().slice(0,160);persist();renderProjects();}};
  $('delete-project').onclick=()=>{if(!confirm(t('Delete “{name}” and its commands? Export a backup first if you want to keep them.',{name:project().name})))return;state.projects=state.projects.filter(p=>p.id!==state.activeProject);if(!state.projects.length)state.projects=[{id:uid(),name:t('Untitled project'),entries:[],draft:null}];state.activeProject=state.projects[0].id;loadDraft(project().draft||project().entries[0]||null);persist();renderProjects();};
  $('sequence-list').onclick=e=>{
    const edit=e.target.closest('[data-edit]');if(edit){editEntry(project().entries.find(i=>i.id===edit.dataset.edit));return;}
    const b=e.target.closest('[data-action]');if(!b)return;
    const items=project().entries,i=items.findIndex(e=>e.id===b.dataset.id),item=items[i];
    if(b.dataset.action==='history')return showCommandHistory(item);
    if(b.dataset.action==='up'&&i>0)[items[i-1],items[i]]=[items[i],items[i-1]];
    if(b.dataset.action==='down'&&i<items.length-1)[items[i+1],items[i]]=[items[i],items[i+1]];
    if(b.dataset.action==='duplicate')items.splice(i+1,0,{...clone(item),id:uid(),title:item.title+t(' (copy)'),history:[],createdAt:now(),updatedAt:now()});
    if(b.dataset.action==='delete'){if(!confirm(t('Delete “{name}”?',{name:item.title})))return;items.splice(i,1);if(currentId===item.id){loadDraft(null);snapshotDraft();}}
    persist();renderSequence();drawMap();
  };
  $('search').oninput=renderLibrary;$('filter-kind').onchange=renderLibrary;
  $('library-results').onclick=e=>{
    const b=e.target.closest('[data-library-edit],[data-library-use]');if(!b)return;
    const owner=state.projects.find(p=>p.id===b.dataset.owner),item=owner.entries.find(e=>e.id===(b.dataset.libraryEdit||b.dataset.libraryUse));
    if(b.dataset.libraryEdit){snapshotDraft();state.activeProject=owner.id;editEntry(item);renderProjects();}
    else{const copy={...clone(item),id:uid(),title:item.title+t(' (copy)'),history:[],createdAt:now(),updatedAt:now()};project().entries.push(copy);editEntry(copy);renderProjects();toast(t('Added a copy to the active project.'));}
  };
  for(const id of ['import-file','library-import'])$(id).onclick=()=>$('file-input').click();
  $('file-input').onchange=async()=>{const file=$('file-input').files[0];$('file-input').value='';document.body.classList.add('busy');try{await importFile(file);}catch(e){toast(e.message);}finally{document.body.classList.remove('busy');}};
  $('paste-text').onkeydown=async e=>{
    if(e.key!=='Enter'||e.shiftKey||e.isComposing)return;
    e.preventDefault();const input=$('paste-text');if(input.readOnly||!input.value.trim())return;
    input.readOnly=true;
    try{await importText(input.value);input.value='';}catch(error){toast(error.message);}finally{input.readOnly=false;}
  };
  $('history-list').onclick=async e=>{const b=e.target.closest('[data-restore]');if(!b)return;const item=project().entries.find(i=>i.id===b.dataset.id),old=item.history[Number(b.dataset.restore)];try{const result=await api('/api/parse',{code:old.code});item.history.push({title:item.title,notes:item.notes,code:item.code,at:item.updatedAt});item.history=item.history.slice(-30);Object.assign(item,result.entries[0],{title:old.title,notes:old.notes,updatedAt:now()});$('history-dialog').close();editEntry(item);toast(t('Previous version restored.'));}catch(e){toast(e.message);}};
  window.addEventListener('storage', e=>{if(e.key===KEY)toast(t('Workspace changed in another tab. Reload before editing here to avoid overwriting it.'));});
}
function translateInterface() {
  // Support the previous cached HTML shell during an upgrade. This runs before
  // saved user content is rendered, and only marks known static interface text.
  if (!document.querySelector('[data-i18n]')) {
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    for(const node of nodes){
      if(node.parentElement.closest('script,style,textarea,input,code,pre'))continue;
      const key=node.textContent.trim();if(!translations[key])continue;
      const span=document.createElement('span');span.dataset.i18n=key;span.textContent=key;node.replaceWith(span);
    }
    document.title=t('RGE Studio · BRM5 command workspace');
    for(const attr of ['aria-label','placeholder'])document.querySelectorAll('['+attr+']').forEach(el=>{const key=el.getAttribute(attr);if(translations[key])el.setAttribute('data-i18n-'+attr,key);});
  }
  if (!$('language-select')) {
    const select=document.createElement('select');select.id='language-select';select.setAttribute('aria-label','界面语言 / Interface language');
    select.innerHTML='<option value="zh-CN">简体中文</option><option value="en">English</option>';
    document.querySelector('.top-actions').prepend(select);
  }
  document.documentElement.lang=isZh?'zh-CN':'en';
  document.title=t('RGE Studio · BRM5 command workspace');
  document.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=t(el.dataset.i18n));
  for(const attr of ['aria-label','placeholder'])document.querySelectorAll('[data-i18n-'+attr+']').forEach(el=>el.setAttribute(attr,t(el.getAttribute('data-i18n-'+attr))));
  $('language-select').value=isZh?'zh-CN':'en';
    $('command-kind').innerHTML=Object.entries(schemas).map(([k,s])=>`<option value="${k}">${escapeHTML(t(s.name))}</option>`).join('');
    $('filter-kind').innerHTML='<option value="">'+t('All command types')+'</option>'+ Object.entries(schemas).map(([k,s])=>`<option value="${k}">${escapeHTML(t(s.name))}</option>`).join('');
    $('schema-guide').innerHTML='<h2>' + t('Command layouts') + '</h2>'+Object.entries(schemas).filter(([k])=>k!=='raw').map(([k,s])=>`<p><strong>${escapeHTML(t(s.name))}</strong><br><code>${escapeHTML(s.prefix+' '+s.fields.map(f=>`[${t(f.label)}]`).join(' '))}</code></p>`).join('');
}

async function parseLivePreview(version) {
  const code=$('code-preview').value;
  try {
    if(!code.trim() || /[\r\n]/.test(code.trim()))throw new Error(t('Enter one complete command.'));
    const result=await api('/api/parse',{code});
    if(version!==requestVersion)return;
    const parsed=result.entries[0];
    if(!parsed || parsed.kind==='raw')throw new Error(t('Unrecognized or incomplete command. Fields and chart update when the structure is valid.'));
    $('command-kind').value=parsed.kind;renderFields(parsed.kind,parsed.values);
    currentCode=parsed.code;valid=true;snapshotDraft();
    $('validation').textContent=t('✓ Fields and chart updated');$('validation').className='';
  } catch(error) {
    if(version!==requestVersion)return;
    valid=false;currentCode='';$('validation').textContent=error.message;$('validation').className='error';
  }
  updateButtons();drawMap();
}
function prepareEditorUI() {
  $('paste-open')?.remove();$('paste-dialog')?.remove();
  if(!$('inline-import'))document.querySelector('.project-strip').insertAdjacentHTML('afterend',"<section id=\"inline-import\" class=\"panel inline-import\"><label for=\"paste-text\" data-i18n=\"Import command text\">Import command text</label><textarea id=\"paste-text\" rows=\"2\" maxlength=\"200000\" placeholder=\"Paste commands here \u00b7 Enter to import \u00b7 Shift+Enter for a new line\" data-i18n-placeholder=\"Paste commands here \u00b7 Enter to import \u00b7 Shift+Enter for a new line\" aria-describedby=\"import-help\"></textarea><p id=\"import-help\" class=\"field-hint\" data-i18n=\"One command per line. Press Enter to add them to this project.\">One command per line. Press Enter to add them to this project.</p></section>");
  if(!$('scratch-panel'))document.querySelector('.right-column').insertAdjacentHTML('beforeend',"<section id=\"scratch-panel\" class=\"panel scratch-panel\"><label for=\"scratchpad\" data-i18n=\"Scratchpad\">Scratchpad</label><textarea id=\"scratchpad\" rows=\"3\" maxlength=\"20000\" placeholder=\"Keep coordinates, snippets or notes here\u2026\" data-i18n-placeholder=\"Keep coordinates, snippets or notes here\u2026\"></textarea><p class=\"field-hint\" data-i18n=\"Saved with this project. Not included in command exports.\">Saved with this project. Not included in command exports.</p></section>");
  if($('code-preview').tagName!=='TEXTAREA')$('code-preview').outerHTML="<textarea id=\"code-preview\" rows=\"4\" spellcheck=\"false\" maxlength=\"10000\" aria-label=\"Editable command\" data-i18n-aria-label=\"Editable command\" aria-describedby=\"validation live-help\"></textarea><p id=\"live-help\" class=\"field-hint live-help\" data-i18n=\"Edit this command to update the fields and chart. Save to update the sequence.\">Edit this command to update the fields and chart. Save to update the sequence.</p>";
}

async function init() {
  try {
    translations=await (await fetch('/assets/zh-CN.json')).json();
    schemas=await api('/api/schema');
    translateInterface();prepareEditorUI();translateInterface();
    const saved=localStorage.getItem(KEY);
    if(saved){state=JSON.parse(saved);if(state.version!==1||!Array.isArray(state.projects)||!state.projects.length||!state.projects.some(p=>p.id===state.activeProject))throw new Error(t('Saved workspace cannot be read. Your browser data has not been overwritten.'));}
    else {
      const id=uid();state={version:1,activeProject:id,projects:[{id,name:t('Default project'),entries:[],draft:null}]};persist();
    }
    wire();renderProjects();loadDraft(project().draft||project().entries[0]||null);
  } catch(error) { $('load-error').textContent=t('Could not open the workspace: {error} Restart the server or reload the page. Existing browser data has been kept.',{error:errorText(error.message)}); $('load-error').hidden=false; }
}
init();
