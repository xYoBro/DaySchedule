// Deterministic synthetic data. Keep expected attendee entries independently of
// the application's parser so a parsing regression cannot bless its own output.
const base = require('./bands-approved.json');
function random(seed) {
  let state = seed >>> 0;
  return () => { state += 0x6D2B79F5; let x = state; x = Math.imul(x ^ x >>> 15, x | 1); x ^= x + Math.imul(x ^ x >>> 7, x | 61); return ((x ^ x >>> 14) >>> 0) / 4294967296; };
}
const hhmm = value => String(Math.floor(value / 60)).padStart(2, '0') + String(value % 60).padStart(2, '0');
function specimen(seed) {
  const rng = random(seed), int = (min, max) => min + Math.floor(rng() * (max - min + 1));
  const pick = values => values[int(0, values.length - 1)];
  const profile = ['empty','main','typical','roster40','crowded','long','overload','boundaries'][seed % 8];
  const workbook = structuredClone(base), schedule = workbook.schedules[0];
  workbook.schedules = [schedule]; workbook.activeScheduleId = schedule.id;
  const current = schedule.current;
  current.title = 'Synthetic stress ' + seed + (profile === 'long' ? ' — Professional Development and Readiness Coordination Workshop' : '');
  current.footer = {contact: seed % 3 ? '' : 'Synthetic data • seeded test only', poc: 'MSgt Test', updated: ''};
  schedule.theme = {skin:'bands', palette:pick(['classic','airforce','forest','teal','plum','mono','copper']), bands:{showLogo:rng() > .3, notesHeight:pick([90,90,90,108,144])}};
  current.theme = structuredClone(schedule.theme);
  const expected = {};
  const names = ['Morgan','Bell','Chen','Patel','Brooks','Reed','Ellis','Hayes','Rivera','Van Dyke','De la Cruz','O’Neill','García','Nguyễn','Smith-Jones','Bell'];
  const word = () => pick(['training','coordination','equipment','briefing','review','readiness','team','exercise']);
  const prose = count => Array.from({length:count}, word).join(' ');
  const days = [0,1].map(dayIndex => {
    const id = 'random-day-' + dayIndex, events = [], notes = [];
    let mains = profile === 'empty' ? 0 : profile === 'overload' ? 16 : int(3,8);
    let extras = ['empty','main'].includes(profile) ? 0 : profile === 'crowded' ? int(15,25) : profile === 'overload' ? 35 : int(3,12);
    if (profile === 'boundaries') { mains = 3; extras = 7; }
    const add = (index, main) => {
      const eid = 'S' + seed + 'D' + dayIndex + 'E' + index;
      let start = main ? 420 + Math.floor(index * 540 / mains) : int(390,960);
      let end = Math.min(1080, start + pick([15,30,45,60,90,180,240]));
      if (profile === 'boundaries') {
        const pair = (main ? [[480,540],[570,630],[720,960]] : [[420,480],[480,510],[540,570],[525,735],[630,720],[960,990],[480,960]])[main ? index : index - mains];
        [start,end] = pair;
      }
      const event = {id:eid,title:eid + ' ' + prose(profile === 'long' ? int(8,18) : int(1,4)),startTime:hhmm(start),endTime:hhmm(end),
        groupId:main ? 'all' : 'group1',isMainEvent:false,isBreak:main && index === 2,emphasized:rng() < .25,
        description:rng() < .35 ? '' : eid + ' instructions ' + prose(profile === 'overload' ? 40 : profile === 'long' ? 20 : int(2,9)),
        location:rng() < .3 ? '' : eid + ' room ' + prose(profile === 'long' ? 12 : int(0,2)),
        poc:rng() < .4 ? '' : 'MSgt Contact' + index,attendees:'',attendeeFormat:'text'};
      // Mix legacy inference with explicit choices that contradict old flags.
      // Keep intended section counts independent of that classification rule.
      if ((seed + index) % 2 === 0) {
        event.placement = main ? 'main' : 'concurrent';
        event.groupId = main ? 'group1' : 'all';
        event.isMainEvent = !main;
      }
      const count = !main ? profile === 'roster40' && index === mains ? 40 : profile === 'overload' && index === mains ? 200 : pick([0,1,2,3,8,15]) : 0;
      const mode = count === 40 ? 'suggested' : pick(['text','suggested','lines','spaces']);
      const list = Array.from({length:count}, (_, i) => mode === 'spaces' ? pick(['Doe','Smith','Chan','Bell']) : (rng() < .15 ? 'Alex ' : '') + names[i % names.length]);
      event.attendeeFormat = mode;
      event.attendees = list.join(mode === 'lines' ? '\n' : mode === 'spaces' ? ' ' : '; ');
      expected[eid] = {raw:event.attendees,entries:mode === 'text' ? [] : list,mode};
      if (main && index === mains - 1 && seed % 3 === 0) {
        event.flightActivities = ['Alpha','Bravo','Charlie'].flatMap((flight, f) => {
          const split = dayIndex === 1 && end - start >= 30;
          const middle = Math.floor((start + end) / 2);
          return (split ? [[start,middle],[middle,end]] : [[start,end]]).map(([a,b], i) => ({id:eid+'F'+f+'A'+i,flight,
            title:eid+'F'+f+'A'+i+' practice',startTime:hhmm(a),endTime:hhmm(b),location:'Flight room '+f,poc:i ? 'TSgt Second' : 'SSgt First',description:i ? 'Return equipment.' : ''}));
        });
      }
      // Literal markup and uninterrupted tokens probe escaping and wrapping.
      if (seed % 13 === 0 && index === 0) event.description += ' <img src=x onerror=alert(1)> & "literal"';
      if (seed % 17 === 0 && index === mains) event.location += ' X'.trim() + 'W'.repeat(95);
      events.push(event);
    };
    for (let i = 0; i < mains; i++) add(i, true);
    for (let i = 0; i < extras; i++) add(mains + i, false);
    // Deliberately unsorted input, including equal-start events.
    for (let i = events.length - 1; i > 0; i--) { const j = int(0,i); [events[i],events[j]] = [events[j],events[i]]; }
    for (let i = 0, n = profile === 'empty' ? 0 : profile === 'overload' ? 10 : int(0,6); i < n; i++) notes.push({id:'D'+dayIndex+'N'+i,category:'Reminder '+i,text:'NoteS'+seed+'D'+dayIndex+'N'+i+' '+prose(profile === 'overload' ? 45 : int(2,12))});
    return {id,date:'2026-09-' + (12 + dayIndex),label:dayIndex ? 'Sunday' : 'Saturday',startTime:'0600',endTime:'1800',events,notes};
  });
  current.days = days; current.activeDay = days[0].id;
  return {seed,profile,workbook,expected};
}
module.exports = {random,specimen};
