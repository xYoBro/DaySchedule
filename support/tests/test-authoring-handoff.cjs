#!/usr/bin/env node
// Real authoring and handoff journey with synthetic content, isolated storage,
// download-mode file dialogs and app-prepared PDFs. No operational data.
const assert = require('node:assert/strict'), fs = require('node:fs'), http = require('node:http'), path = require('node:path');
const engines = require(process.env.DAYSCHEDULE_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..'), out = path.join(root, process.env.DAYSCHEDULE_HANDOFF_OUTPUT || 'output/playwright/authoring-handoff');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': ({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store' });
  fs.createReadStream(file).pipe(res);
});
const surnames = 'Morgan Bell Chen Patel Brooks Reed Ellis Hayes Rivera Foster Parker Bennett Bailey Fletcher Emerson Lawson Adams Allen Baker Campbell Collins Cooper Davis Edwards Evans Garcia Gray Green Hall Harris Hill Howard Hughes Jackson James Johnson Kelly King Lee Lewis'.split(' ');
(async () => {
  fs.mkdirSync(out, {recursive:true}); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const results = [];
  for (const name of (process.env.DAYSCHEDULE_BROWSERS || 'chromium,webkit').split(',')) {
    const browser = await engines[name].launch({headless:true});
    const context = await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
    await context.addInitScript(() => { window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined; });
    await context.tracing.start({screenshots:true,snapshots:true});
    const page = await context.newPage(); page.setDefaultTimeout(12000); const errors = [], checks = [];
    page.on('pageerror', e => errors.push(e.message));
    const shot = async suffix => page.screenshot({path:path.join(out, name+'-'+suffix+'.png'),fullPage:true,animations:'disabled'});
    const fill = async (id,value) => { await page.locator(id).fill(value); await page.locator(id).press('Tab'); };
    const times = async (start,end) => { await page.locator('#insp-evt-start').fill(start); await page.locator('#insp-evt-end').fill(end); await page.locator('#insp-evt-title').focus(); };
    const add = async (title,start,end) => { await page.locator('#addEventBtn').click(); await fill('#insp-evt-title',title); await times(start,end); };
    const save = async filename => { const pending=page.waitForEvent('download');await page.locator('#editorManualExportBtn').click();const download=await pending;await download.saveAs(path.join(out,name+'-'+filename));return path.join(out,name+'-'+filename); };
    try {
      await page.goto('http://127.0.0.1:'+server.address().port+'/'+(process.env.DAYSCHEDULE_TEST_DIST ? 'dist/DaySchedule.html' : 'app/index.html'));
      await page.locator('#libraryNewName').fill('October Readiness Weekend');await page.locator('#libraryNewBtn').click();await shot('empty');
      await page.locator('#addFirstDayBtn').click();await fill('.insp-day-date','2026-10-03');
      await add('Roll Call','0800','0830');await fill('#insp-evt-loc','Squadron');await fill('#insp-evt-poc','MSgt Doe');await fill('#insp-evt-desc','Bring your training record.');await page.locator('#insp-evt-emphasis').check();
      await page.locator('#insp-evt-start').fill('0905');await page.locator('#insp-evt-start').press('Tab');assert.equal(await page.locator('#insp-evt-start').inputValue(),'0905');await fill('#insp-evt-end','0937');
      assert((await page.locator('.main-event').first().innerText()).includes('0905-0937'));
      await page.locator('#insp-evt-end').fill('0830');await page.locator('#insp-evt-end').press('Shift+Tab');assert.equal(await page.locator('#insp-evt-end').inputValue(),'0830');await fill('#insp-evt-start','0800');
      await page.locator('#insp-evt-title').focus();assert((await page.locator('.main-event').first().innerText()).includes('0800-0830'));
      await shot('main-editor');checks.push('paired times in both directions with exact minutes');
      await page.locator('#insp-manage-audiences').click();assert(await page.locator('#settings-panel-audiences').isVisible());await page.locator('#settings-done').click();assert(await page.locator('#insp-evt-title').isVisible());
      await add('Lunch','1100','1200');await page.locator('#insp-evt-break').check();await page.locator('#insp-evt-emphasis').check();
      await add('Training by flight','1200','1600');await page.locator('.flight-editor > summary').click();
      for(const [i,flight,title] of [[0,'Alpha','Network practicals'],[1,'Bravo','Mission rehearsal']]) {
        await page.locator('#insp-add-flight').click();await fill('#flight-'+i+'-flight',flight);await fill('#flight-'+i+'-title',title);await fill('#flight-'+i+'-location','Training room '+(i+1));await fill('#flight-'+i+'-poc','MSgt Chan');
        if(i===1) await fill('#flight-1-endTime','1400');
      }
      await add('Records review','1230','1330');await page.locator('#insp-placement-concurrent').check();await page.locator('#insp-evt-group').selectOption('');await fill('#insp-evt-attendees','Chan; Bell');await page.locator('#insp-attendee-format').selectOption('suggested');await fill('#insp-evt-loc','Readiness office');
      await add('Equipment issue','1300','1400');await page.locator('#insp-placement-concurrent').check();await page.locator('#insp-evt-group').selectOption('');await fill('#insp-evt-attendees','Chan; Doe');await page.locator('#insp-attendee-format').selectOption('suggested');
      assert((await page.locator('#insp-assignment-review').innerText()).includes('confirm identity'));await page.locator('[data-review-event]').first().click();assert.equal(await page.locator('#insp-evt-title').inputValue(),'Records review');checks.push('live linked named-assignment review');
      await add('CTF event','1200','1600');await page.locator('#insp-placement-concurrent').check();await page.locator('#insp-evt-group').selectOption('');await fill('#insp-evt-attendees',surnames.join('; '));await page.locator('#insp-attendee-format').selectOption('suggested');await page.locator('#insp-evt-emphasis').check();await fill('#insp-evt-loc','Operations lab');await fill('#insp-evt-poc','TSgt Lane');await fill('#insp-evt-desc','Bring assigned equipment.');assert((await page.locator('#insp-attendee-preview').innerText()).includes('40 entries'));await shot('concurrent-editor');
      await add('SNCO meeting','1500','1530');await page.locator('#insp-placement-concurrent').check();await page.locator('#insp-evt-group').selectOption({label:'All SNCOs'});
      for (let i=1;i<=6;i++){await page.locator('#addNoteBtn').click();await fill('#insp-note-text','Reminder '+i+': update your readiness information.');}
      await page.locator('#customizeBtn').click();await page.locator('[data-settings-tab="basics"]').click();await page.locator('#settings-band-logo').uncheck();await page.locator('#settings-done').click();
      await page.locator('#daySettingsBtn').click();assert(await page.locator('.insp-day-date').evaluate(node => node === document.activeElement));
      for(const skin of ['cards','grid','phases','bands']){await page.locator('#viewSelect').selectOption(skin);assert(await page.locator('#scheduleContainer.skin-'+skin).count());}
      await page.locator('#printBtn').click();assert.equal(await page.locator('#printAudience').inputValue(),'');await page.locator('#printAudience').selectOption({label:'Group handout: All Personnel'});
      assert((await page.locator('#printReviewSummary').innerText()).includes('6 event(s)'));assert((await page.locator('#printOmissions').innerText()).includes('SNCO meeting'));
      await page.locator('#printIncludeNamed').uncheck();assert((await page.locator('#printOmissions').innerText()).includes('CTF event'));assert((await page.locator('#printReviewIssues').innerText()).includes('matching attendee entries'));await shot('print-exclusions');await page.locator('#printIncludeNamed').check();
      await page.locator('#printAudience').selectOption('');assert(await page.locator('#printReviewConfirm').isEnabled());
      await page.evaluate(()=>{window.print=()=>window.dispatchEvent(new Event('beforeprint'));});await page.locator('#printReviewConfirm').click();await page.locator('#printContainer .print-page').waitFor({state:'attached'});
      assert.equal(await page.locator('#printContainer .attendance-area [data-person]').count(),44);
      if(name==='chromium') await page.pdf({path:path.join(out,'full-schedule.pdf'),preferCSSPageSize:true,printBackground:true});
      await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));checks.push('all 40 roster names, other assignments, flights and reminders in prepared print');
      await page.locator('#overflowBtn').click();await page.locator('#versionsMenuBtn').click();await page.locator('#versionSaveBtn').click();await page.locator('#versionNameInput').fill('Ready for handoff');await page.locator('#versionSaveConfirm').click();await page.locator('#versionSaveBtn').waitFor();await page.keyboard.press('Escape');
      await page.locator('#addDayBtn').click();await page.locator('#workbookSwitchBtn').click();await page.locator('#workbookNewName').fill('November Readiness Weekend');await page.locator('.workbook-duplicate-options summary').click();await page.locator('#workbookFirstDate').fill('2026-11-07');await page.locator('#workbookDuplicateBtn').click();await page.locator('#workbookConfirmDuplicate').click();
      const saved=await save('complete.schedule');const workbook=JSON.parse(fs.readFileSync(saved,'utf8'));assert.equal(workbook.schedules.length,2);assert.equal(workbook.schedules[1].current.days.length,2);assert(workbook.schedules[0].versions.some(version=>version.name==='Ready for handoff'));
      await page.locator('#tbBack').click();const chooser=page.waitForEvent('filechooser');await page.locator('#libraryImportBtn').click();await(await chooser).setFiles(saved);await page.locator('#libraryView').waitFor({state:'hidden'});assert.equal(await page.locator('#saveIndicator').innerText(),'Opened');assert.equal(await page.locator('#workbookSwitchLabel').innerText(),'2 schedules');await shot('reopened');
      await page.locator('#customizeBtn').click();await page.locator('[data-settings-tab="advanced"]').click();assert(!(await page.locator('#settings-save-file').isVisible()));await shot('files');await page.locator('.legacy-export summary').click();const legacyDownload=page.waitForEvent('download');await page.locator('#settings-save-file').click();const legacy=await legacyDownload;await legacy.saveAs(path.join(out,name+'-legacy.js'));assert((await page.locator('#toast').innerText()).includes('current schedule only'));await page.locator('#settings-done').click();assert.equal(await page.locator('#saveIndicator').innerText(),'Opened');
      await page.waitForTimeout(900); // Separate the next user edit from the existing undo burst.
      await page.locator('#tbTitle').fill('Changed title');await page.locator('#tbTitle').press('Tab');await page.locator('#overflowBtn').click();await page.locator('#undoBtn').click();assert.equal(await page.locator('#tbTitle').inputValue(),'November Readiness Weekend');await page.locator('#overflowBtn').click();await page.locator('#redoBtn').click();assert.equal(await page.locator('#tbTitle').inputValue(),'Changed title');checks.push('complete two-schedule handoff, legacy separation, opened state and visible Undo/Redo');
      await page.setViewportSize({width:390,height:844});await page.locator('#addEventBtn').click();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert(await page.locator('.toolbar button').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).every(n=>n.getBoundingClientRect().width>=44&&n.getBoundingClientRect().height>=44)));await shot('mobile-event');
      await page.locator('#customizeBtn').focus();await page.locator('#customizeBtn').press('Enter');await page.locator('[data-settings-tab="basics"]').click();await shot('mobile-settings');await page.keyboard.press('Escape');assert(await page.locator('#customizeBtn').evaluate(node => node === document.activeElement));
      const mobileChromeHeight = await page.locator('.app-body').evaluate(node=>node.getBoundingClientRect().top);
      await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>applyEditorTheme('dark'));await page.locator('.main-event').first().click();await shot('dark-editor');
      const saveContrast = await page.locator('#editorManualExportBtn').evaluate(node => {
        const style = getComputedStyle(node);
        const luminance = color => color.match(/[\d.]+/g).slice(0,3).map(Number).map(v => v/255).map(v => v<=.04045 ? v/12.92 : ((v+.055)/1.055)**2.4).reduce((sum,v,i) => sum+v*[.2126,.7152,.0722][i],0);
        const values = [luminance(style.color),luminance(style.backgroundColor)].sort((a,b)=>b-a);
        return (values[0]+.05)/(values[1]+.05);
      });
      assert(saveContrast>=4.5, 'dark Save text must meet normal-text contrast');
      checks.push('saved version preserved in complete workbook; keyboard modal return; mobile controls at least 44px');
      assert.deepEqual(errors,[]);results.push({browser:name,version:browser.version(),checks,mobileChromeHeight,darkSaveContrast:saveContrast,pageErrors:errors});console.log(name,'authoring/handoff passed');
    } catch(error) { await shot('failure');results.push({browser:name,error:error.stack,pageErrors:errors});throw error; }
    finally{fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));await context.tracing.stop({path:path.join(out,name+'-trace.zip')});await context.close();await browser.close();}
  }
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
