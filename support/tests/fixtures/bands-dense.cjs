// Synthetic schedules only. Short field markers make PDF fidelity checks
// independent of line wrapping, shared titles, and continuation references.
const groups = [
  { id: 'all', name: 'All personnel', scope: 'main', color: '#2458a6' },
  { id: 'alpha', name: 'Alpha', scope: 'limited', color: '#176948' },
  { id: 'bravo', name: 'Bravo', scope: 'limited', color: '#965116' },
  { id: 'charlie', name: 'Charlie', scope: 'limited', color: '#744696' },
  { id: 'delta', name: 'Maintenance', scope: 'limited', color: '#247d9d' },
];

const aligned = [
  ['0730', '0800', 'Check-in and accountability', 'all'],
  ['0800', '0820', 'Opening formation', 'all'],
  ['0820', '0845', 'Safety and movement brief', 'all'],
  ['0845', '1200', 'Morning training rotations', 'all'],
  ['0845', '0945', 'Equipment inspection', 'alpha'],
  ['0845', '0945', 'Navigation practical', 'bravo'],
  ['0845', '0945', 'Communications refresher', 'charlie'],
  ['0945', '1045', 'Navigation practical', 'alpha'],
  ['0945', '1045', 'Communications refresher', 'bravo'],
  ['0945', '1045', 'Equipment inspection', 'charlie'],
  ['1045', '1200', 'Communications refresher', 'alpha'],
  ['1045', '1200', 'Equipment inspection', 'bravo'],
  ['1045', '1200', 'Navigation practical', 'charlie'],
  ['1200', '1245', 'Lunch and reset', 'all', { isBreak: true }],
  ['1245', '1500', 'Afternoon exercise', 'all'],
  ['1245', '1400', 'Team exercise preparation', 'alpha'],
  ['1245', '1500', 'Communications support', 'bravo'],
  ['1330', '1500', 'Practical assessment', 'charlie'],
  ['1500', '1530', 'Debrief and dismissal', 'all'],
];

const staggered = [
  ['0700', '0715', 'Formation', 'all'],
  ['0730', '1130', 'Operations training block', 'all'],
  ['0900', '1230', 'Readiness processing block', 'all'],
  ['1200', '1245', 'Lunch', 'bravo', { isBreak: true }],
  ['1300', '1630', 'Proficiency training block', 'all'],
  ['1600', '1630', 'End-of-day brief', '', { isMainEvent: true }],
  ['0645', '0745', 'Range setup and checks', 'alpha'],
  ['0805', '0955', 'Weapons qualification', 'charlie', { isMainEvent: true }],
  ['0820', '1110', 'Medical appointments', 'bravo'],
  ['0915', '1205', 'Communications checkout', 'delta'],
  ['1000', '1330', 'Vehicle inspection', 'alpha'],
  ['1105', '1140', 'Equipment turn-in', 'delta'],
  ['1145', '1240', 'Transport coordination', 'charlie'],
  ['1235', '1320', 'Shift handover', 'alpha'],
  ['1305', '1435', 'Records review', 'bravo'],
  ['1340', '1405', 'Safety observation', 'charlie'],
  ['1415', '1540', 'Driver certification', 'delta'],
  ['1510', '1610', 'Supply accountability', 'alpha'],
  ['1630', '1700', 'Close-down inventory', 'delta'],
];

function time(minutes) {
  return String(Math.floor(minutes / 60)).padStart(2, '0') + String(minutes % 60).padStart(2, '0');
}

function makeFixture(name) {
  let rows;
  if (name === 'aligned19') rows = aligned;
  else if (name === 'staggered19') rows = staggered;
  else if (name === 'oversized1') rows = [['0730', '1700', 'Extended exercise instructions', 'all']];
  else if (name === 'crowded48') {
    rows = [
      ['0800', '1200', 'Morning operations', 'all'],
      ['1200', '1230', 'Lunch', 'all', { isBreak: true }],
      ['1230', '1630', 'Afternoon operations', 'all'],
      ['1630', '1700', 'Debrief', 'all'],
    ];
    ['alpha', 'bravo', 'charlie', 'delta'].forEach((groupId, groupIndex) => {
      for (let i = 0; i < 11; i++) {
        const start = 480 + i * 40 + groupIndex * 5;
        rows.push([time(start), time(start + 80), 'Practical station ' + (i + 1), groupId]);
      }
    });
  } else throw new Error('Unknown fixture: ' + name);

  const events = rows.map(([startTime, endTime, title, groupId, extra], index) => {
    const suffix = String(index + 1).padStart(2, '0') + 'Q';
    return {
      id: 'event' + suffix,
      title: 'T' + suffix + ' ' + title,
      startTime, endTime, groupId,
      location: 'L' + suffix + ' ' + ['Assembly hall', 'Training room', 'Workshop', 'Field station'][index % 4],
      poc: 'P' + suffix + ' Team lead ' + (index + 1),
      description: 'D' + suffix + ' Bring equipment and complete the checklist before leaving.' +
        (name === 'staggered19' ? ' Confirm completion with the team lead; allow travel time between stations.' : ''),
      attendees: name === 'aligned19' ? '' : 'A' + suffix + ' Alex Carter, Morgan Reed, Casey Brooks',
      isBreak: false,
      isMainEvent: false,
      ...extra,
    };
  });
  if (name === 'oversized1') {
    // Every word is unique so missing/reordered text can be detected across
    // legitimate repeated page headings and event continuation labels.
    events[0].description = 'D01Q ' + Array.from({ length: 200 }, (_, index) =>
      'Confirm' + String(index + 1).padStart(3, '0') + 'equipment').join(' ');
  }
  return {
    title: 'Bands regression ' + name,
    groups: JSON.parse(JSON.stringify(groups)),
    days: [{
      id: name + '-day', date: '2026-09-19', label: 'Training day',
      startTime: '0630', endTime: '1730', events,
      notes: [
        { id: 'note1', category: 'Coordination', text: 'N01Q Arrive ready to begin. Report timing conflicts to the day lead.' },
        { id: 'note2', category: 'Movement', text: 'N02Q Allow travel time and use the assigned safety equipment.' },
      ],
    }],
    // A local valid image exercises asynchronous print logo decoding.
    logo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8WQAAAAASUVORK5CYII=',
    footer: { contact: 'F01Q Training and readiness office', poc: 'F02Q Day lead', updated: '' },
  };
}

function expectedEvents(fixture, audienceId) {
  if (!audienceId) return fixture.days[0].events;
  const sharedGroups = new Set(fixture.groups.filter(group => group.scope === 'main').map(group => group.id));
  return fixture.days[0].events.filter(event => event.isBreak || event.groupId === audienceId ||
    sharedGroups.has(event.groupId) || (!event.groupId && event.isMainEvent));
}

module.exports = { makeFixture, expectedEvents };
