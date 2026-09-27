/* Ícones vetoriais consistentes para as configurações pessoais. */
(()=>{
  const root=document.querySelector('.user-settings-modern');if(!root)return;
  const paths={account:['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z','M4.5 21a7.5 7.5 0 0 1 15 0'],profile:['M12 3.5 14.1 8l4.4.6-3.2 3.1.8 4.4-4.1-2.2-4.1 2.2.8-4.4-3.2-3.1 4.4-.6L12 3.5Z'],privacy:['M12 3 4.5 6.5v5.2c0 4.7 3.2 7.7 7.5 9.3 4.3-1.6 7.5-4.6 7.5-9.3V6.5L12 3Z','M9.5 12.2 11.2 14l3.6-4'],notifications:['M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z','M10 21h4'],voice:['M12 15a3.5 3.5 0 0 0 3.5-3.5v-5a3.5 3.5 0 1 0-7 0v5A3.5 3.5 0 0 0 12 15Z','M5.5 11a6.5 6.5 0 0 0 13 0','M12 17.5V21','M9 21h6'],appearance:['M12 3a9 9 0 1 0 0 18c1.2 0 2-1 1.5-2-.7-1.4.3-3 1.9-3H18a3 3 0 0 0 3-3c0-5.5-4-10-9-10Z','M7.5 10h.01','M10 6.5h.01','M6.5 14h.01'],search:['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z','m20 20-4-4'],logout:['M10 5H5v14h5','m14 16 4-4-4-4','M18 12H9']};
  function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');for(const d of paths[name]||[]){const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',d);svg.append(path)}return svg}
  for(const button of root.querySelectorAll('#settings-nav button[data-view]')){const box=button.querySelector(':scope > span');if(box){box.replaceChildren(icon(button.dataset.view));box.classList.add('settings-nav-icon')}}
  const search=root.querySelector('.settings-search-wrap > span');if(search){search.replaceChildren(icon('search'));search.classList.add('settings-search-icon')}
  const logout=root.querySelector('#settings-logout > span');if(logout){logout.replaceChildren(icon('logout'));logout.classList.add('settings-logout-icon')}
})();
