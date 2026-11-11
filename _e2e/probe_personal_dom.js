const puppeteer=require('puppeteer-core'),fs=require('fs'),path=require('path');
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const CRED=JSON.parse(fs.readFileSync(path.join(__dirname,'..','dist-linux','runtime','auto_login.json'),'utf8'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--proxy-server=direct://','--proxy-bypass-list=*'],defaultViewport:{width:1700,height:1000}});
 const p=await b.newPage();
 await p.goto('https://daye-nav.app.workbuddy.host/?sharecode=TBMY3RYXH3',{waitUntil:'networkidle2',timeout:150000});
 await sleep(2500);
 if(/login/.test(p.url())){const i=await p.$$('input');await i[0].type(CRED.username||'');await i[1].type(CRED.password||'');await p.keyboard.press('Enter');await sleep(7000);}
 await p.mouse.click(1640,43); await sleep(1200);
 await p.evaluate(()=>{const e=[...document.querySelectorAll('*')].find(x=>x.children.length===0&&(x.innerText||'').trim()==='系统应用');if(e)e.click();});
 await sleep(1500);
 await p.evaluate(()=>{const e=[...document.querySelectorAll('*')].find(x=>x.children.length===0&&(x.innerText||'').trim()==='个性化设置');if(e)e.click();});
 await sleep(2500);
 const r=await p.evaluate(()=>{
  const sw=[...document.querySelectorAll('.n-switch')];
  const first=sw[0];
  const chain=[];let e=first;
  for(let k=0;k<5&&e;k++,e=e.parentElement) chain.push({tag:e.tagName,cls:String(e.className).slice(0,180),html:e.outerHTML.slice(0,500)});
  const dlg=document.querySelector('.n-drawer,.n-modal,.n-card');
  return {switchCount:sw.length, chain, dlgCls:dlg?String(dlg.className):null,
    heads:[...document.querySelectorAll('*')].filter(x=>x.children.length===0&&(x.innerText||'').trim()==='LOGO').slice(0,1).map(x=>x.parentElement.parentElement.outerHTML.slice(0,800))};
 });
 console.log(JSON.stringify(r,null,1).slice(0,9000));
 await b.close();
})();
