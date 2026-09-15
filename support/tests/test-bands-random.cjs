#!/usr/bin/env node
// Seeded integration/property tests using the real renderer and real UI controls.
// Example: DAYSCHEDULE_SEEDS=100 DAYSCHEDULE_BROWSERS=chromium,webkit node support/tests/test-bands-random.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const engines = require(process.env.DAYSCHEDULE_PLAYWRIGHT_MODULE || 'playwright');
const {specimen,random} = require('./fixtures/bands-random.cjs');
const root = path.resolve(__dirname,'../..');
const output = path.resolve(process.env.DAYSCHEDULE_STRESS_OUTPUT || path.join(root,'output/playwright/monte-carlo'));
const total = Number(process.env.DAYSCHEDULE_SEEDS || 100), start = Number(process.env.DAYSCHEDULE_START_SEED || 1);
const results = {seeds:{start,total},engines:[],failures:[],pdfs:[]};
const server = http.createServer((request,response) => {
  const file = path.resolve(root,'.'+new URL(request.url,'http://localhost').pathname);
  if (!file.startsWith(root+path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404);response.end();return; }
  response.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css'})[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store'});
  fs.createReadStream(file).pipe(response);
});
const save = () => fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));

// This oracle deliberately does not call model(), eventsOverlap(), or the name
// parser. It derives expected references from numeric intervals and generation.
function audit({expected}) {
  const fail = message => { throw new Error(message); };
  const equal = (actual,wanted,label) => {if(JSON.stringify(actual)!==JSON.stringify(wanted))fail(label+': '+JSON.stringify(actual)+' != '+JSON.stringify(wanted));};
  const compact = value => value.replace(/\s+/g,'');
  const minutes = value => Number(value.slice(0,2))*60+Number(value.slice(2));
  const sheet = document.querySelector('#scheduleContainer .band-sheet');
  if (!sheet) fail('Missing Bands sheet');
  const day = Store.getDays().find(item => item.id === Store.getActiveDay());
  const groups = Store.getGroups();
  const primary = event => event.isMainEvent || event.isBreak || groups.find(group => group.id === event.groupId)?.scope === 'main';
  const ordered = events => events.slice().sort((a,b) => minutes(a.startTime)-minutes(b.startTime));
  const mains = ordered(day.events.filter(primary)), concurrent = ordered(day.events.filter(event => !primary(event)));
  const articles = [...sheet.querySelectorAll('article[data-event-id]')];
  equal(articles.map(node=>node.dataset.eventId).sort(),day.events.map(event=>event.id).sort(),'exactly one record per event');
  equal([...sheet.querySelectorAll('.attendance-area article')].map(node=>node.dataset.eventId),concurrent.map(event=>event.id),'chronological columns');
  equal([...sheet.querySelectorAll('.main-list>article')].map(node=>node.dataset.eventId),mains.map(event=>event.id),'main chronology');
  for (const event of day.events) {
    const article = articles.find(node=>node.dataset.eventId===event.id), text=compact(article.textContent);
    for(const field of ['title','description','location','poc'])if(event[field]&&!text.includes(compact(event[field])))fail(event.id+' missing '+field);
    if(!text.includes(event.startTime+'-'+event.endTime))fail(event.id+' missing time');
    if(expected?.[event.id]) {
      const names=expected[event.id];
      equal([...article.querySelectorAll('[data-person]')].map(node=>node.dataset.person),names.entries,event.id+' roster');
      if(names.mode==='text' && names.raw) equal(article.querySelector('.attendee-free-text')?.textContent,names.raw,event.id+' literal attendees');
    }
    for(const activity of event.flightActivities||[])for(const field of ['flight','title','description','location','poc'])if(activity[field]&&!text.includes(compact(activity[field])))fail(activity.id+' missing '+field);
    if(primary(event)) {
      const overlapping=concurrent.filter(other=>minutes(event.startTime)<minutes(other.endTime)&&minutes(other.startTime)<minutes(event.endTime));
      equal([...article.querySelectorAll('.start-ref')].map(node=>[node.dataset.refEvent,Number(node.textContent)]),overlapping.map(other=>[other.id,concurrent.indexOf(other)+1]),event.id+' overlap references');
    } else equal(Number(article.querySelector('header .start-ref').textContent),concurrent.indexOf(event)+1,event.id+' heading number');
  }
  for(const note of day.notes) {const node=sheet.querySelector('[data-note-id="'+note.id+'"]');for(const field of ['category','text'])if(note[field]&&!compact(node?.textContent||'').includes(compact(note[field])))fail('Missing note '+note.id);}
  if(sheet.querySelector('img:not(.logo-slot img),script,iframe'))fail('Unescaped input became markup');
  const fit=sheet.dataset.fit==='true', box=sheet.getBoundingClientRect();
  if(fit) {
    if(Math.abs(box.width*.75-612)>.1||Math.abs(box.height*.75-792)>.1)fail('Paper geometry');
    const area=sheet.querySelector('.reminder-area').getBoundingClientRect(),body=sheet.querySelector('.sheet-body').getBoundingClientRect();
    if(body.bottom+4/.75>area.top+.2)fail('Content crosses notes clearance');
    const panel=sheet.querySelector('.reminder-panel').getBoundingClientRect();
    if(sheet.querySelector('.reminders').getBoundingClientRect().bottom>panel.bottom+.2)fail('Notes clipped');
    for(const node of articles.concat([...sheet.querySelectorAll('.page-header,.page-footer,.reminder-panel')])) {
      const rect=node.getBoundingClientRect();
      if(rect.left<box.left+48-1||rect.right>box.right-48+1||rect.top<box.top+48-1||rect.bottom>box.bottom-48+1)fail('Outside print margins: '+node.className);
    }
    // Look below container geometry: an overflowing time or unbroken name may
    // collide with another field while the outer article still appears to fit.
    for(const article of articles) {
      const rect=article.getBoundingClientRect(),walker=document.createTreeWalker(article,NodeFilter.SHOW_TEXT);
      let node;
      while((node=walker.nextNode()))if(node.textContent.trim()) {
        const range=document.createRange();range.selectNodeContents(node);
        for(const ink of range.getClientRects())if(ink.width>0&&(ink.left<rect.left-2||ink.right>rect.right+2))fail('Text escapes event '+article.dataset.eventId+': '+node.textContent.slice(0,50));
      }
    }
    for(const [selector,floor] of [['.description,.event-meta,.detail-field,.flight-activity,.flight-poc,.reminder',9],['.main-event h3',11.5],['.small-event .person-label strong',10.5],['.large-event .person-label strong',9.5]])for(const node of sheet.querySelectorAll(selector))if(parseFloat(getComputedStyle(node).fontSize)*.75<floor-.02)fail('Font below floor: '+selector);
  } else if(!document.querySelector('.band-fit-notice')?.textContent.trim())fail('Missing overflow warning');
  return {day:day.id,events:day.events.length,names:sheet.querySelectorAll('[data-person]').length,fit,columns:Number(sheet.dataset.columns),scale:Number(sheet.dataset.textScale),density:sheet.dataset.density};
}

async function randomCases(browser,origin,name,result) {
  const context=await browser.newContext({viewport:{width:1440,height:1100}}),page=await context.newPage();
  page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/app/index.html');await page.evaluate(()=>appReady);
  const pdfProfiles=new Set();
  try {
    for(let seed=start;seed<start+total;seed++) {
      const data=specimen(seed),began=Date.now();
      try {
        await page.evaluate(workbook=>{clearScheduleWorkbookTarget();loadParsedScheduleData(parseScheduleWorkbookContent(JSON.stringify(workbook)));hideLibrary();},data.workbook);
        const days=await page.evaluate(()=>Store.getDays().map(day=>day.id));
        for(const dayId of days) {
          await page.evaluate(id=>{Store.setActiveDay(id);renderActiveDay();},dayId);
          const first=await page.evaluate(audit,{expected:data.expected});
          const repeated=await page.evaluate(()=>{const sheet=document.querySelector('#scheduleContainer .band-sheet');BandLayout.fit(sheet);return {fit:sheet.dataset.fit==='true',columns:Number(sheet.dataset.columns),scale:Number(sheet.dataset.textScale)};});
          assert.deepEqual(repeated,{fit:first.fit,columns:first.columns,scale:first.scale},'Refitting must be stable');
          result.days.push({seed,profile:data.profile,...first});
          if(name==='chromium' && first.fit && !pdfProfiles.has(data.profile) && data.profile!=='empty') {
            const file=name+'-seed-'+seed+'-'+dayId+'.pdf';
            await page.screenshot({path:path.join(output,file.replace('.pdf','.png')),fullPage:true});
            await page.evaluate(id=>{window.print=()=>window.dispatchEvent(new Event('beforeprint'));return printSchedule({dayIds:[id]});},dayId);
            await page.pdf({path:path.join(output,file),preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});
            await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
            results.pdfs.push({file,seed,day:data.workbook.schedules[0].current.days.find(day=>day.id===dayId),expected:data.expected,title:data.workbook.schedules[0].current.title});
            pdfProfiles.add(data.profile);
          }
        }
        const roundtrip=await page.evaluate(()=>{
          const before=JSON.stringify(Store.getPersistedState()),snapshot=getScheduleWorkbookSnapshot();
          loadParsedScheduleData(parseScheduleWorkbookContent(JSON.stringify(snapshot)));hideLibrary();
          return before===JSON.stringify(Store.getPersistedState());
        });
        assert(roundtrip,'Workbook round trip changed content');
        if(seed%10===0) {
          const check=await page.evaluate(async()=>{let calls=0;window.print=()=>calls++;const expected=measurePrintPlan({}).every(day=>day.fits);await printSchedule({});window.dispatchEvent(new Event('afterprint'));return {calls,expected};});
          assert.equal(check.calls,check.expected?1:0,'Print must block exactly the days that cannot fit');
        }
        assert.equal(errors.length,0,errors.join('\n'));
        result.timings.push(Date.now()-began);
      } catch(error) {
        const prefix=name+'-failure-'+seed;
        fs.writeFileSync(path.join(output,prefix+'.json'),JSON.stringify(data,null,2));
        await page.screenshot({path:path.join(output,prefix+'.png'),fullPage:true}).catch(()=>{});
        results.failures.push({engine:name,seed,error:error.stack});
        console.error(name,'FAIL seed',seed,error.message);save();
        if(results.failures.length>=6)throw new Error('Failure limit reached; replay recorded seeds before continuing.');
      }
      if((seed-start+1)%10===0){console.log(name,'random seeds',seed-start+1,'/',total);save();}
    }
  } finally {await context.close();}
}

async function uiCases(browser,origin,name,result) {
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  await context.addInitScript(()=>{window.showSaveFilePicker=undefined;window.showOpenFilePicker=undefined;});
  const page=await context.newPage(),errors=[],rng=random(0xA1C2026);
  page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
  const operations=[];
  try {
    await page.goto(origin+'/app/index.html');await page.evaluate(()=>appReady);
    await page.locator('#libraryNewName').fill('Synthetic randomized UI');await page.locator('#libraryNewBtn').click();
    await page.locator('#addDayBtn').click();await page.locator('#addDayBtn').click();
    for(let i=0;i<32;i++) {
      await page.locator('.day-tab').nth(i%2).click();await page.locator('#addEventBtn').click();
      await page.locator('#insp-evt-title').fill('UI'+i+' '+['Briefing','Long training and coordination activity','Workshop'][i%3]);
      await page.locator('#insp-evt-group').selectOption({index:i%3?1:0});
      await page.locator('#insp-evt-attendees').fill(i===7?Array.from({length:40},(_,j)=>'Surname'+j).join('; '):'Doe; Smith; Chan');
      await page.locator('.attendee-preview>summary').click();
      await page.locator('#insp-attendee-format').selectOption('suggested');
      await page.locator('#insp-evt-loc').fill('Room '+i);await page.locator('#insp-evt-poc').fill('MSgt Test'+i);
      operations.push('add '+i);
    }
    assert.equal(await page.evaluate(()=>Store.getDays().reduce((n,day)=>n+day.events.length,0)),32);
    await page.waitForTimeout(820);
    for(let i=0;i<64;i++) {
      const dayIndex=Math.floor(rng()*2);await page.locator('.day-tab').nth(dayIndex).click();
      const events=await page.evaluate(()=>Store.getEvents(Store.getActiveDay()).map(event=>({id:event.id,title:event.title})));
      const event=events[Math.floor(rng()*events.length)];
      await page.locator('#scheduleContainer article[data-event-id="'+event.id+'"]').press('Enter');
      if(i%8===0) {
        const before=await page.evaluate(()=>JSON.stringify(Store.getDays()));
        await page.locator('#insp-evt-delete').click();await page.locator('#insp-evt-delete').click();
        assert.equal(await page.evaluate(id=>Store.getEvents(Store.getActiveDay()).some(event=>event.id===id),event.id),false);
        await page.locator('#addEventBtn').focus();await page.keyboard.press('ControlOrMeta+z');
        const restored=await page.evaluate(id=>Store.getDays().some(day=>day.events.some(event=>event.id===id)),event.id);
        assert(restored,'Undo did not restore deleted event');operations.push('delete + undo '+event.id);
        assert.equal(await page.evaluate(()=>JSON.stringify(Store.getDays())),before,'Undo changed unrelated event data');
        await page.locator('#addEventBtn').focus();await page.keyboard.press('ControlOrMeta+Shift+z');
        assert.equal(await page.evaluate(id=>Store.getEvents(Store.getActiveDay()).some(event=>event.id===id),event.id),false,'Redo did not delete the event again');
        await page.locator('#addEventBtn').focus();await page.keyboard.press('ControlOrMeta+z');
        assert.equal(await page.evaluate(()=>JSON.stringify(Store.getDays())),before,'Second undo changed unrelated event data');
      } else {
        const field=['title','desc','loc','poc'][i%4],value='Edit'+i+' '+['Room 203','Equipment review','MSgt Doe','Safety & readiness'][i%4];
        await page.locator('#insp-evt-'+field).fill(value);
        await page.locator('#insp-evt-attendees').focus();
        assert.equal(await page.evaluate(({id,field})=>Store.getEvents(Store.getActiveDay()).find(event=>event.id===id)[{desc:'description',loc:'location'}[field]||field],{id:event.id,field}),value);
        operations.push('edit '+event.id+' '+field);
      }
      if(i%16===0) {
        await page.locator('#customizeBtn').click();await page.locator('[data-settings-tab="basics"]').click();
        await page.locator('#settings-band-logo').setChecked(i%32===0);await page.locator('#settings-band-notes').selectOption(i%32===0?'90':'108');
        await page.locator('#settings-done').click();
        await page.setViewportSize({width:390,height:844});
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Editor chrome overflows phone viewport');
        await page.locator('#scheduleContainer article[data-event-id="'+event.id+'"]').press('Enter');
        await page.locator('#insp-evt-loc').fill('Mobile room '+i);
        assert.equal(await page.evaluate(id=>Store.getEvents(Store.getActiveDay()).find(event=>event.id===id).location,event.id),'Mobile room '+i);
        await page.screenshot({path:path.join(output,name+'-ui-mobile-'+i+'.png')});
        await page.setViewportSize({width:1440,height:1000});
      }
      // Respect the app's documented undo burst boundary, rather than treating
      // one keystroke as one transaction or changing production debounce timing.
      await page.waitForTimeout(820);
    }
    const before=await page.evaluate(()=>JSON.stringify(Store.getDays()));
    const ready=page.waitForEvent('download');await page.locator('#overflowBtn').click();await page.locator('#saveScheduleFileBtn').click();
    const saved=await (await ready).path();
    await page.locator('#tbBack').click();const chooser=page.waitForEvent('filechooser');await page.locator('#libraryImportBtn').click();await(await chooser).setFiles(saved);
    await page.waitForFunction(()=>!document.getElementById('libraryView').classList.contains('active'));
    assert.equal(await page.evaluate(()=>JSON.stringify(Store.getDays())),before,'UI download/reopen lost data');
    assert.deepEqual(errors,[]);
    await page.screenshot({path:path.join(output,name+'-ui-final.png'),fullPage:true});
    result.ui={operations,downloadReopen:true,pageErrors:errors};
    console.log(name,'UI stress passed:',operations.length,'add/edit/delete sequences');
  } catch(error) {
    results.failures.push({engine:name,ui:true,operations,error:error.stack});
    await page.screenshot({path:path.join(output,name+'-ui-failure.png'),fullPage:true}).catch(()=>{});
    console.error(name,'UI FAIL',error.message);
  } finally {await context.close();save();}
}

async function main() {
  fs.mkdirSync(output,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  if(process.argv.includes('--pdf-only')) {
    Object.assign(results,JSON.parse(fs.readFileSync(path.join(output,'results.json'),'utf8')));
    const browser=await engines.chromium.launch({headless:true,timeout:30000});
    try {
      const page=await browser.newPage({viewport:{width:1440,height:1100}});
      await page.goto(origin+'/app/index.html');await page.evaluate(()=>appReady);
      for(const proof of results.pdfs) {
        const data=specimen(proof.seed);
        await page.evaluate(async({workbook,day})=>{
          clearScheduleWorkbookTarget();loadParsedScheduleData(parseScheduleWorkbookContent(JSON.stringify(workbook)));hideLibrary();
          window.print=()=>window.dispatchEvent(new Event('beforeprint'));await printSchedule({dayIds:[day]});
        },{workbook:data.workbook,day:proof.day.id});
        await page.pdf({path:path.join(output,proof.file),preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});
        await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
      }
      console.log('Regenerated',results.pdfs.length,'PDF proofs from current source.');
    } finally {await browser.close();}
    return;
  }
  for(const name of (process.env.DAYSCHEDULE_BROWSERS||'chromium,webkit').split(',')) {
    const browser=await engines[name].launch({headless:true,timeout:30000});
    const result={name,version:browser.version(),days:[],timings:[]};results.engines.push(result);
    try {
      if(!process.argv.includes('--ui-only'))await randomCases(browser,origin,name,result);
      if(!process.argv.includes('--layout-only'))await uiCases(browser,origin,name,result);
    } finally {await browser.close();save();}
  }
  if(results.failures.length)process.exitCode=1;
  console.log('Finished:',results.engines.reduce((sum,engine)=>sum+engine.days.length,0),'random day renders;',results.failures.length,'failures.');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{save();server.close();});
