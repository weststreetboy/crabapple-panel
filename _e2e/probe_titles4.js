const puppeteer = require('puppeteer-core');
const fs=require('fs'),path=require('path');
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const CRED=JSON.parse(fs.readFileSync(path.join(__dirname,'..','dist-linux','runtime','auto_login.json'),'utf8'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--proxy-server=direct://','--proxy-bypass-list=*'],defaultViewport:{width:1700,height:1000}});
 const p=await b.newPage();
 await p.goto('https://daye-nav.app.workbuddy.host/?sharecode=TBMY3RYXH3',{waitUntil:'networkidle2',timeout:150000});
 await sleep(2500);
 if(/login/.test(p.url())){const i=await p.$$('input');await i[0].type(CRED.username||'');await i[1].type(CRED.password||'');await p.keyboard.press('Enter');await sleep(7000);}
 const r=await p.evaluate(()=>{
   const cls=(e)=>String(e.className||'');
   const titles=[...document.querySelectorAll('.item-card-title')].map(e=>({t:(e.textContent||'').trim(),cls:cls(e),parent:cls(e.parentElement),visible:e.getBoundingClientRect().width>0, rect:[Math.round(e.getBoundingClientRect().x),Math.round(e.getBoundingClientRect().y)]}));
   const groups=[...document.querySelectorAll('.item-card-group-title-title')].map(e=>({t:(e.textContent||'').trim(),visible:e.getBoundingClientRect().width>0}));
   const fonts=[...document.querySelectorAll('.font-semibold')].slice(0,14).map(e=>({t:(e.textContent||'').trim().slice(0,30),parent:cls(e.parentElement),g:cls(e.parentElement&&e.parentElement.parentElement)}));
   return {titles,groups,fonts};
 });
 console.log(JSON.stringify(r,null,1).slice(0,12000));
 await b.close();
})();
