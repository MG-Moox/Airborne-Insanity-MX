// layout.js - hand-traced layout of the Airborne Insanity MX map (assets/map.jpg).
// All positions are in map-image pixels (1312 x 1199, north = up). terrain.js converts them to metres.

export const IMG_W = 1312, IMG_H = 1199;
export const S = 1.6;                 // metres per image pixel
export const SPAWN_PX = [960, 1010];  // spawn: east side of the festival, facing north

// white dashed border of the playable area (clockwise from the west side of the peak)
export const BORDER = [
  [25, 130], [45, 250], [40, 310], [80, 360], [85, 500], [85, 600], [75, 690], [120, 740], [170, 870], [200, 930],
  [250, 958], [300, 968], [340, 990], [385, 1005], [430, 1040], [475, 1090], [520, 1130], [600, 1150], [700, 1152],
  [800, 1152], [900, 1156], [1000, 1145], [1045, 1130], [1100, 1100], [1190, 1020], [1225, 950], [1240, 880],
  [1280, 780], [1312, 740], [1312, 640], [1260, 600], [1180, 545], [1085, 510], [1000, 430], [950, 370], [910, 320],
  [860, 305], [760, 250], [650, 200], [540, 150], [450, 120], [370, 105], [300, 70], [250, 20], [225, 5], [180, 40], [100, 100],
];

// elevation anchors [px, py, metres]; terrain is a smooth kernel regression through these
export const ANCHORS = [
  // the peak and its flanks
  [220, 35, 540], [120, 110, 440], [300, 110, 480], [400, 110, 390], [520, 140, 305], [650, 200, 255], [760, 255, 215], [860, 305, 185],
  [190, 200, 410], [300, 230, 385], [420, 230, 315], [540, 260, 272], [660, 310, 228], [780, 360, 192], [900, 380, 150],
  [60, 330, 310], [200, 340, 335], [350, 345, 292],
  // forest trails and the middle shelf
  [80, 500, 215], [170, 470, 265], [290, 470, 238], [400, 430, 205], [520, 400, 178], [660, 430, 150], [780, 440, 124], [950, 470, 100], [1060, 500, 86],
  // jump zone, cliffs, river valley
  [120, 560, 195], [100, 700, 112], [180, 770, 82], [330, 560, 152], [300, 680, 92], [420, 640, 96], [480, 740, 52], [600, 640, 78], [700, 560, 92],
  [570, 540, 106], [850, 520, 72], [640, 780, 38], [760, 760, 33], [880, 700, 38],
  // MX basin
  [1000, 700, 30], [1100, 700, 28], [1200, 740, 26], [1250, 650, 46], [1150, 560, 72], [1290, 570, 72],
  // festival basin
  [250, 800, 62], [150, 850, 46], [300, 880, 26], [450, 880, 15], [600, 860, 9], [750, 860, 7],
  [830, 930, 4], [1000, 950, 4], [1150, 950, 5], [950, 1050, 3], [700, 1060, 3], [430, 1000, 6], [250, 930, 21], [1100, 1060, 4], [1230, 900, 8],
];
export const ANCHOR_SIGMA_PX = 70;

// central river: flows west along y~700 then south to the lake. [px,py]
export const RIVER = [
  [790, 495], [820, 525], [835, 570], [830, 610], [800, 650], [740, 680], [680, 700], [600, 712], [530, 705], [470, 720],
  [420, 760], [400, 820], [420, 880], [450, 930], [480, 990], [520, 1040],
];
// short creek under the waterfall
export const CREEK = [[355, 338], [350, 365], [346, 400], [352, 430], [385, 452]];

export const LAKE = { cx: 590, cy: 1085, rx: 118, ry: 64, level: 1.0 };

// MX race track (closed loop)
export const TRACK = [
  [985, 640], [1060, 615], [1140, 625], [1200, 650], [1225, 685], [1190, 705], [1130, 690], [1090, 700], [1130, 730],
  [1190, 745], [1240, 760], [1225, 790], [1150, 800], [1060, 795], [985, 785], [930, 770], [915, 740], [950, 715],
  [1010, 705], [1050, 680], [1000, 665],
];
// jumps on the track: [t (0..1 along the loop), height, ramp length scale]
export const TRACK_JUMPS = [[0.06, 2.0], [0.17, 2.4], [0.33, 1.8], [0.52, 2.6], [0.68, 2.2], [0.85, 2.0]];

// jump kickers / tables. heading is compass degrees (0 = north, 90 = east). [px, py, heading, height, tableLength]
export const JUMPS = [
  // jump zone
  [520, 530, 90, 3.0, 0], [600, 520, 170, 2.4, 6], [585, 560, 270, 2.8, 0], [640, 590, 90, 2.2, 5], [560, 590, 45, 2.0, 0],
  [620, 500, 180, 3.2, 0], [500, 575, 135, 2.0, 4], [680, 560, 90, 3.4, 0], [650, 625, 0, 2.6, 8],
  // festival practice area
  [1090, 858, 0, 2.4, 0], [760, 815, 0, 2.2, 0], [905, 835, 20, 2.0, 5],
  // cliff line "risk it" kickers
  [195, 505, 270, 4.6, 0], [215, 600, 280, 4.0, 0],
];
// big freeride kickers on the peak: [px, py, H]; heading is chosen automatically (downhill)
export const PEAK_JUMPS = [[265, 175, 4.2], [335, 270, 3.8], [420, 215, 4.4], [240, 255, 4.0], [480, 330, 3.6]];

// wooden bridges across the river: [px, py, heading deg, length m]
export const BRIDGES = [[772, 588, 90, 26], [341, 424, 0, 22]];
// lake dock: from the shore out onto the water [px0,py0,px1,py1]
export const DOCK = [708, 1088, 636, 1118];

export const ZONES = [
  { id: 'lake', name: 'THE LAKE', sub: 'Chill + splash', c: [590, 1085], r: 120 },
  { id: 'mx', name: 'MX TRACK', sub: 'Laps + racing', c: [1075, 715], r: 190 },
  { id: 'jump', name: 'JUMP ZONE', sub: 'Tables + whips', c: [580, 545], r: 120 },
  { id: 'river', name: 'RIVER CROSSING', sub: 'Natural section', c: [840, 545], r: 105 },
  { id: 'cliff', name: 'CLIFF LINE', sub: 'Risk it', c: [150, 610], r: 130 },
  { id: 'peak', name: 'THE PEAK', sub: 'Big jumps + freeride', c: [240, 130], r: 230 },
  { id: 'forest', name: 'FOREST TRAILS', sub: 'Tech + flow', c: [460, 300], r: 190 },
  { id: 'festival', name: 'FESTIVAL', sub: 'Rest + vibes', c: [850, 950], r: 260 },
];
// fast travel spots (key 1-8): [zone id, px, py, heading deg]
export const TELEPORTS = [
  ['FESTIVAL', 960, 1010, 0], ['MX TRACK', 995, 655, 90], ['JUMP ZONE', 540, 560, 90], ['RIVER CROSSING', 790, 560, 90],
  ['FOREST TRAILS', 552, 294, 180], ['CLIFF LINE', 163, 468, 270], ['THE PEAK', 336, 211, 180], ['THE LAKE', 700, 1050, 270],
];

// ---- festival props (px positions, sizes in metres) -----------------------
export const STAGE = { p: [830, 905], heading: 0 };
export const WHEEL = { p: [1030, 915], r: 15 };
// houses/shops: [px, py, w, d, h, heading deg, roof colour index]
export const BUILDINGS = [
  [412, 985, 13, 10, 7, 20, 0], [455, 962, 12, 9, 6, 5, 1], [505, 945, 12, 9, 6.5, 0, 2], [548, 930, 14, 10, 7, 10, 1],
  [578, 946, 10, 8, 6, 0, 0], [522, 976, 16, 10, 7, 340, 2], [447, 1003, 10, 8, 5.5, 20, 1], [488, 995, 11, 9, 6, 350, 0],
  [690, 880, 14, 9, 6, 0, 3], [872, 880, 12, 9, 6, 0, 1], [625, 905, 10, 8, 5, 10, 2],
  [1090, 990, 24, 14, 9, 0, 4], [1135, 980, 20, 12, 8, 0, 4], [1182, 912, 10, 8, 5, 0, 0],
  [738, 1000, 8, 5, 3.2, 0, 3], [770, 1035, 8, 5, 3.2, 0, 5], [660, 985, 12, 8, 5, 0, 3],
];
export const TENTS = [
  [680, 940, 0], [720, 968, 1], [905, 945, 2], [860, 990, 3], [985, 960, 1], [1000, 990, 0], [1175, 940, 2], [1160, 965, 3], [1195, 928, 1],
];
export const CONTAINERS = [[1010, 1025], [1030, 1030], [1050, 1038], [1070, 1043], [1040, 1050], [1000, 1048]];
export const START_GATE = { p: [1005, 650], heading: 90 };
export const TOWER = { p: [486, 520] };           // red/white billboard tower at the jump zone
export const CABIN = { p: [292, 150] };            // mountain hut on the peak
export const WATERFALL = { top: [355, 332], bottom: [350, 372] };
