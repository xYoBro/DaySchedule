const DEFAULT_GROUPS = [
  { id: 'grp_all',     name: 'All Personnel', scope: 'main',    color: '#2558a8' },
  { id: 'grp_flight',  name: 'By Flight',     scope: 'main',    color: '#b06a10' },
  { id: 'grp_snco',    name: 'All SNCOs',     scope: 'limited', color: '#4a5568' },
  { id: 'grp_chiefs',  name: 'Flight Chiefs', scope: 'limited', color: '#4a5568' },
];

const DEFAULT_COLOR_PALETTE = [
  '#2558a8', '#b06a10', '#4a5568', '#6b3fa0',
  '#1a7a40', '#c23616', '#2d98da', '#6D214F',
];

const TIME_INCREMENT = 15;

const LAYOUT_TARGETS = {
  band: {
    mainPadV:    [10, 4],
    mainPadH:    [16, 8],
    supPadV:     [8, 3],
    supPadH:     [14, 6],
    titleFs:     [13.5, 10],
    descFs:      [9, 7],
    metaFs:      [8, 6.5],
    tagFs:       [7, 5.5],
    timeStartFs: [14, 10],
    timeEndFs:   [9, 7],
    timeDurFs:   [7, 5.5],
  },
  notes: {
    fs:        [7.5, 6],
    lineH:     [1.5, 1.3],
  },
  conc: {
    titleFs: [10, 8],
    timeFs:  [8.5, 7],
    detailFs:[7.5, 6],
  },
};
