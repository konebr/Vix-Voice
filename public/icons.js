/* Biblioteca vetorial interna: ícones consistentes, leves e sem dependências externas. */
(()=>{
const paths={
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  compass:'<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2.1 4.9-4.9 2.1 2.1-4.9z"/>',
  users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  diamond:'<path d="m12 3 7 9-7 9-7-9z"/><path d="m5 12 7-3 7 3-7 3z"/>',
  hash:'<path d="M10 3 8 21M16 3l-2 18M4 9h17M3 15h17"/>',
  volume:'<path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M18 5a9 9 0 0 1 0 14"/>',
  mic:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/>',
  'mic-off':'<path d="m2 2 20 20M9 9v1a3 3 0 0 0 5.1 2.1M15 7V5a3 3 0 0 0-5.7-1.3M17 16.9A7 7 0 0 0 19 10M5 10a7 7 0 0 0 11 5.7M12 17v5M8 22h8"/>',
  headphones:'<path d="M4 14v-2a8 8 0 0 1 16 0v2M18 19h1a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-1zM6 19H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h1z"/>',
  'volume-off':'<path d="m2 2 20 20M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 1.2 5.1M18 5a9 9 0 0 1 1.8 12.5"/>',
  video:'<rect x="3" y="5" width="14" height="14" rx="2"/><path d="m17 10 4-2v8l-4-2z"/>',
  'video-off':'<path d="m2 2 20 20M10.7 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2M17 10l4-2v8l-2.2-1.1"/>',
  monitor:'<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4M8 10l4-4 4 4M12 6v7"/>',
  'monitor-off':'<path d="m2 2 20 20M8 21h8M12 17v4M4 4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h13M10 3h10a2 2 0 0 1 2 2v11"/>',
  'phone-off':'<path d="M10.7 13.3a16 16 0 0 0 3 2l1.8-1.8a2 2 0 0 1 2-.5l3 1a2 2 0 0 1 1.5 2v3a2 2 0 0 1-2 2A18 18 0 0 1 3 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 1.5l1 3a2 2 0 0 1-.5 2L8.7 10.3M2 2l20 20"/>',
  phone:'<path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 3.1 5.2 2 2 0 0 1 5.1 3h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L9 11a16 16 0 0 0 4 4l1.3-1.3a2 2 0 0 1 2.1-.5c1 .3 1.9.6 2.9.7a2 2 0 0 1 1.7 2z"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z"/>',
  bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M13.7 21h-3.4"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  send:'<path d="m22 2-7 20-4-9-9-4zM22 2 11 13"/>',
  chevron:'<path d="m6 9 6 6 6-6"/>',
  more:'<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/>'
};
window.vixIcon=(name,size=18)=>`<svg class="vix-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.diamond}</svg>`;
function place(node,name){if(!node||node.dataset.vixIconReady===name&&node.querySelector('svg'))return;node.dataset.vixIconReady=name;node.innerHTML=vixIcon(name)}
function hydrate(root=document){
 const all=(selector)=>[...(root.matches?.(selector)?[root]:[]),...root.querySelectorAll?.(selector)||[]];
 all('.room-kind-icon').forEach(node=>place(node,node.closest('[data-room-type="voice"]')?'volume':'hash'));
 all('.channel .hash,.header>.hash,.welcome-icon').forEach(node=>place(node,'hash'));all('.channel .speaker').forEach(node=>place(node,'volume'));
 [['#add-channel','plus'],['#add-voice-channel','plus'],['.server.add','plus'],['.server-title button','chevron'],['#mute','mic'],['#leave','settings'],['#send','send'],['.room-settings-button','more']].forEach(([selector,name])=>all(selector).forEach(node=>place(node,name)));
 const headerIcons=['bell','users','search'];all('.header-actions').forEach(group=>[...group.children].forEach((node,index)=>place(node,headerIcons[index]||'more')));
 const community={events:['calendar','Eventos'],browse:['compass','Conferir canais'],members:['users','Membros'],boost:['diamond','Impulsos de servidor']};all('#community-tools button').forEach(node=>{const item=community[node.dataset.community];if(!item||node.dataset.vixIconReady)return;node.dataset.vixIconReady=item[0];node.innerHTML=`${vixIcon(item[0])}<span>${item[1]}</span>`});
 all('.call-action-icon').forEach(node=>{const action=node.closest('button'),label=action?.getAttribute('aria-label')||'',active=action?.classList.contains('is-active'),name=label.includes('microfone')?(active?'mic':'mic-off'):label.includes('áudio')?(active?'headphones':'volume-off'):label.includes('Câmera')?(active?'video':'video-off'):label.includes('tela')?(active?'monitor-off':'monitor'):'phone-off';place(node,name)});
 all('#private-callbar>span').forEach(node=>place(node,'phone'));all('.private-call').forEach(node=>{if(node.querySelector('svg'))return;node.innerHTML=`${vixIcon('phone',16)}<span>Chamar</span>`});
}
hydrate();new MutationObserver(records=>records.forEach(record=>{if(record.target?.nodeType===1)hydrate(record.target);record.addedNodes.forEach(node=>node.nodeType===1&&hydrate(node))})).observe(document.body,{childList:true,subtree:true});
})();
