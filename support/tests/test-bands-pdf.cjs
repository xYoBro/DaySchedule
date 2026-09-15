#!/usr/bin/env node
// Optional release automation for environments permitting Playwright. The CUA
// review + freeze-band-proof.cjs + verify-band-proof.py path covers this session.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {chromium}=require(process.env.DAYSCHEDULE_PLAYWRIGHT_MODULE || 'playwright');
const fixture=require('./fixtures/bands-approved.json');
const root=path.resolve(__dirname,'../..'), output=path.join(root,'output/playwright/bands-release');
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css'};
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
});
const compact=text=>text.replace(/\s/g,'');
async function main(){
  fs.mkdirSync(output,{recursive:true});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true}), results=[];
  try{
    for(const sample of ['main','normal','stress','forty']){
      const page=await browser.newPage({viewport:{width:1440,height:1100}});
      await page.goto('http://127.0.0.1:'+server.address().port+'/app/index.html');
      await page.evaluate(()=>appReady);
      const state=await page.evaluate(async({fixture,sample})=>{
        fixture.activeScheduleId=sample;loadParsedScheduleData(parseScheduleWorkbookContent(JSON.stringify(fixture)));hideLibrary();
        const before=JSON.stringify(Store.getPersistedState());
        window.print=()=>window.dispatchEvent(new Event('beforeprint'));
        await printSchedule({});
        const sheets=Array.from(document.querySelectorAll('#printContainer .band-sheet'));
        return {before,after:JSON.stringify(Store.getPersistedState()),sheets:sheets.map(sheet=>({fit:sheet.dataset.fit,columns:Number(sheet.dataset.columns),
          ids:Array.from(sheet.querySelectorAll('article[data-event-id]'),node=>node.dataset.eventId),
          names:Array.from(sheet.querySelectorAll('[data-person]'),node=>node.dataset.person),
          details:Array.from(sheet.querySelectorAll('.description,.event-meta,.detail-field,.flight-poc,.reminder'),node=>parseFloat(getComputedStyle(node).fontSize)*.75)}))};
      },{fixture,sample});
      assert.equal(state.before,state.after);assert.equal(state.sheets.length,2);
      state.sheets.forEach(sheet=>{assert.equal(sheet.fit,'true');assert.equal(new Set(sheet.ids).size,sheet.ids.length);assert(sheet.columns<=(sample==='stress'?3:2));assert(sheet.details.every(size=>size>=8.99));});
      const file=path.join(output,sample+'.pdf');
      await page.pdf({path:file,preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});
      const text=compact(execFileSync('pdftotext',[file,'-'],{encoding:'utf8'}));
      const info=execFileSync('pdfinfo',[file],{encoding:'utf8'});
      assert.equal(Number(info.match(/^Pages:\s+(\d+)/m)[1]),2);assert(/612 x 792/.test(info));
      fixture.schedules.find(item=>item.id===sample).current.days.forEach(day=>day.events.forEach(event=>{
        ['title','description','location','poc'].forEach(key=>{if(event[key])assert(text.includes(compact(event[key])),sample+': '+key);});
      }));
      state.sheets.flatMap(sheet=>sheet.names).forEach(name=>assert(text.includes(compact(name)),name));
      results.push({sample,pages:2,pass:true});
      await page.close();
    }
    const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port+'/app/index.html');await page.evaluate(()=>appReady);
    const overflow=await page.evaluate(async fixture=>{
      loadParsedScheduleData(parseScheduleWorkbookContent(JSON.stringify(fixture)));hideLibrary();
      const day=Store.getDays()[0];day.events[0].description='Complete instruction sentinel. '.repeat(3000);renderActiveDay();
      let calls=0;window.print=()=>calls++;await printSchedule({});
      const blocked=calls===0;window.dispatchEvent(new Event('beforeprint'));
      return {blocked,failed:!!document.querySelector('#printContainer .band-sheet[data-fit="false"]')};
    },fixture);
    assert(overflow.blocked&&overflow.failed);results.push({overflow:'blocks partial output',pass:true});
    await page.close();
  }finally{fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));await browser.close();}
  console.log('PASS: eight Letter pages and explicit overflow guard.');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
