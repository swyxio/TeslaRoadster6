import type { LandmarkModel, LandmarkParts } from './landmark-model-types';

/** Original, compressed silhouettes. Every piece stays within the shared
 * collision envelope, and the renderer batches these parts with other landmarks. */
export function buildPeninsulaSouthLandmark(p:LandmarkModel, part:LandmarkParts):boolean {
  const {w,d,h}=p, {box,cyl,roof,dome}=part;
  const cream=0xe1d9c5, stone=0xc7bda8, red=0xab6255, dark=0x405c60;
  const glass=0x86aeb0, green=0x598471, gold=0xd9b571, blue=0x3976a3, silver=0xb9c5c3;

  switch(p.id){
    case 'sanchez-adobe':
      // White adobe and the distinctive upper wooden veranda.
      box(0,h*.32,0,w*.78,h*.64,d*.64,cream);
      roof(0,h*.76,0,w*.90,h*.24,d*.76,stone);
      box(0,h*.41,d*.35,w*.88,h*.04,d*.15,dark);
      box(0,h*.58,d*.415,w*.88,h*.035,d*.04,dark);
      for(const x of [-.36,-.18,0,.18,.36])box(w*x,h*.30,d*.415,w*.035,h*.60,d*.035,dark);
      for(const x of [-.25,0,.25])box(w*x,h*.26,d*.325,w*.10,h*.16,.02,glass);
      return true;

    case 'pigeon-point':
      // The white coastal lighthouse and neighboring keeper's building.
      cyl(w*.12,h*.40,0,w*.29,h*.80,d*.29,cream);
      cyl(w*.12,h*.82,0,w*.35,h*.08,d*.35,dark);
      cyl(w*.12,h*.89,0,w*.25,h*.08,d*.25,glass);
      roof(w*.12,h*.96,0,w*.32,h*.08,d*.32,dark);
      box(-w*.31,h*.12,0,w*.30,h*.24,d*.36,cream);
      roof(-w*.31,h*.29,0,w*.34,h*.10,d*.40,red);
      return true;

    case 'woodside-store':
      // Timber-sided general store with a covered front porch and signs.
      box(0,h*.31,0,w*.78,h*.62,d*.64,dark);
      roof(0,h*.72,0,w*.87,h*.20,d*.72,stone);
      box(0,h*.14,d*.35,w*.86,h*.04,d*.16,stone);
      box(0,h*.56,d*.35,w*.84,h*.06,d*.16,dark);
      for(const x of [-.36,-.12,.12,.36])box(w*x,h*.30,d*.41,w*.035,h*.42,d*.035,stone);
      box(0,h*.47,d*.33,w*.44,h*.08,.02,gold);
      return true;

    case 'lucy-evans-baylands':
      // The interpretive center raised on piles above the marsh, with boardwalk.
      for(const x of [-.30,.30])for(const z of [-.25,.25])box(w*x,h*.13,d*z,w*.04,h*.26,d*.04,dark);
      box(0,h*.42,-d*.08,w*.74,h*.34,d*.55,cream);
      box(0,h*.61,-d*.08,w*.80,h*.06,d*.62,dark);
      for(const x of [-.24,0,.24])box(w*x,h*.45,d*.205,w*.15,h*.18,.02,glass);
      box(0,h*.24,d*.31,w*.28,h*.04,d*.36,stone);
      for(const x of [-.13,.13])box(w*x,h*.31,d*.31,w*.025,h*.12,d*.36,dark);
      return true;

    case 'palo-alto-junior-museum':
      // A playful red entrance tunnel, brightly colored sign, and low museum.
      box(0,h*.25,-d*.06,w*.82,h*.50,d*.65,cream);
      box(0,h*.52,-d*.06,w*.85,h*.04,d*.68,stone);
      for(const x of [-.15,.15])box(w*x,h*.24,d*.34,w*.07,h*.48,d*.16,red);
      roof(0,h*.53,d*.34,w*.42,h*.14,d*.18,red);
      for(let i=0;i<5;i++)box((i-2)*w*.12,h*.44,d*.275,w*.09,h*.13,.02,[red,gold,blue,green,red][i]);
      return true;

    case 'sunnyvale-heritage':
      // Two-story white replica of the Murphy home with stacked verandas.
      box(0,h*.34,0,w*.78,h*.68,d*.62,cream);
      roof(0,h*.76,0,w*.86,h*.16,d*.72,stone);
      for(const y of [.30,.61])box(0,h*y,d*.35,w*.86,h*.04,d*.16,cream);
      for(const x of [-.36,-.18,0,.18,.36])box(w*x,h*.32,d*.42,w*.025,h*.64,d*.025,cream);
      for(const x of [-.25,0,.25])for(const y of [.18,.49])box(w*x,h*y,d*.315,w*.10,h*.12,.02,green);
      return true;

    case 'intel-museum':
      // Intel's modern glass entry and blue horizontal museum sign.
      box(0,h*.30,0,w*.86,h*.60,d*.72,glass);
      for(const y of [.20,.40])box(0,h*y,d*.365,w*.86,h*.035,.02,cream);
      for(const x of [-.30,-.10,.10,.30])box(w*x,h*.30,d*.365,w*.025,h*.60,.02,cream);
      box(0,h*.66,0,w*.90,h*.10,d*.76,cream);
      box(0,h*.59,d*.39,w*.50,h*.12,.02,blue);
      return true;

    case 'mission-santa-clara':
      // White mission church, red tile roof, paired towers, and front cross.
      box(0,h*.29,0,w*.80,h*.58,d*.70,cream);
      roof(0,h*.65,-d*.04,w*.83,h*.16,d*.72,red);
      for(const side of [-1,1]){
        box(side*w*.32,h*.43,d*.23,w*.20,h*.80,d*.20,cream);
        box(side*w*.32,h*.57,d*.335,w*.08,h*.15,.02,dark);
        roof(side*w*.32,h*.86,d*.23,w*.24,h*.12,d*.24,red);
      }
      box(0,h*.43,d*.36,w*.045,h*.20,.02,dark);
      box(0,h*.46,d*.37,w*.14,h*.03,.02,dark);
      return true;

    case 'de-saisset':
      // Low stucco museum with a tiled portico, glass doors, and broad steps.
      box(0,h*.24,-d*.04,w*.84,h*.48,d*.66,cream);
      box(0,h*.08,d*.35,w*.65,h*.08,d*.18,stone);
      box(0,h*.24,d*.305,w*.28,h*.27,.02,glass);
      for(const side of [-1,1])box(side*w*.21,h*.27,d*.35,w*.04,h*.44,d*.04,stone);
      roof(0,h*.52,d*.32,w*.52,h*.14,d*.24,red);
      return true;

    case 'triton-art':
      // Low modern galleries with a raised glass skylight over the entry.
      box(0,h*.21,0,w*.88,h*.42,d*.70,stone);
      box(0,h*.28,d*.355,w*.35,h*.27,.02,glass);
      box(0,h*.45,0,w*.90,h*.06,d*.74,cream);
      box(0,h*.53,d*.10,w*.29,h*.12,d*.29,glass);
      roof(0,h*.63,d*.10,w*.36,h*.10,d*.36,cream);
      for(const side of [-1,1]){
        cyl(side*w*.37,h*.19,d*.37,w*.035,h*.38,d*.035,stone);
        dome(side*w*.37,h*.38,d*.37,w*.14,h*.12,d*.14,green);
      }
      return true;

    case 'harris-lass':
      // White Italianate farmhouse, green shutters and columned porch.
      box(0,h*.34,-d*.03,w*.75,h*.68,d*.60,cream);
      roof(0,h*.76,-d*.03,w*.82,h*.16,d*.68,stone);
      box(0,h*.31,d*.31,w*.82,h*.05,d*.14,cream);
      for(const x of [-.35,-.12,.12,.35])box(w*x,h*.18,d*.37,w*.035,h*.36,d*.035,cream);
      for(const x of [-.25,0,.25])for(const y of [.18,.48])box(w*x,h*y,d*.28,w*.10,h*.15,.02,green);
      return true;

    case 'ainsley-house':
      // English Tudor half-timbering and a steep, textured-looking roof.
      box(0,h*.30,0,w*.80,h*.60,d*.66,cream);
      roof(0,h*.78,0,w*.89,h*.36,d*.78,dark);
      for(const x of [-.31,0,.31])box(w*x,h*.30,d*.335,w*.035,h*.58,.02,dark);
      for(const y of [.19,.39,.58])box(0,h*y,d*.34,w*.80,h*.035,.02,dark);
      for(const x of [-.16,.16])box(w*x,h*.32,d*.35,w*.10,h*.16,.02,green);
      box(w*.27,h*.76,-d*.15,w*.10,h*.35,d*.10,red);
      return true;

    case 'hakone-gardens':
      // Timber Mon gate beside a pond and bridge, set among garden trees.
      box(-w*.08,h*.06,0,w*.72,h*.12,d*.67,green);
      box(-w*.08,h*.13,d*.10,w*.42,h*.025,d*.34,glass);
      for(const side of [-1,1])box(side*w*.22,h*.42,-d*.18,w*.06,h*.74,d*.06,dark);
      box(0,h*.72,-d*.18,w*.51,h*.07,d*.08,dark);
      roof(0,h*.81,-d*.18,w*.65,h*.13,d*.22,stone);
      box(-w*.08,h*.20,d*.10,w*.40,h*.04,d*.08,red);
      for(const side of [-1,1])box(-w*.08,h*.25,d*(.10+side*.07),w*.40,h*.05,d*.025,red);
      cyl(w*.37,h*.18,d*.30,w*.04,h*.36,d*.04,stone);
      dome(w*.37,h*.36,d*.30,w*.15,h*.14,d*.15,green);
      return true;

    case 'montalvo-arts':
      // Villa Montalvo's pale Mediterranean facade and red tiled roof.
      box(0,h*.31,-d*.03,w*.84,h*.62,d*.62,cream);
      roof(0,h*.70,-d*.03,w*.90,h*.17,d*.70,red);
      box(0,h*.08,d*.34,w*.90,h*.10,d*.22,stone);
      for(const x of [-.32,-.16,0,.16,.32]){
        box(w*x,h*.24,d*.30,w*.08,h*.24,.02,dark);
        box(w*x,h*.23,d*.35,w*.025,h*.30,d*.025,cream);
      }
      box(0,h*.43,d*.35,w*.86,h*.04,d*.08,stone);
      return true;

    case 'forbes-mill':
      // Stone annex with a green awning and small barred windows.
      box(0,h*.32,0,w*.82,h*.64,d*.70,stone);
      roof(0,h*.73,0,w*.88,h*.18,d*.76,dark);
      box(0,h*.30,d*.36,w*.32,h*.05,d*.12,green);
      for(const x of [-.28,-.14,.14,.28]){
        box(w*x,h*.42,d*.355,w*.08,h*.16,.02,dark);
        box(w*x,h*.42,d*.37,w*.012,h*.16,.02,silver);
      }
      return true;

    case 'mcenery-center':
      // White convention hall, glazed entry, and red/black facade mural.
      box(0,h*.30,0,w*.88,h*.60,d*.70,cream);
      box(-w*.16,h*.26,d*.355,w*.42,h*.28,.02,glass);
      box(w*.23,h*.39,d*.36,w*.23,h*.22,.02,red);
      box(w*.23,h*.39,d*.375,w*.055,h*.22,.02,dark);
      box(-w*.16,h*.45,d*.39,w*.48,h*.04,d*.16,silver);
      for(const x of [-.35,-.25,-.15])cyl(w*x,h*.49,d*.44,w*.012,h*.55,d*.012,stone);
      return true;

    case 'quilts-textiles':
      // Museum facade with a small colorful patchwork quilt at its entrance.
      box(0,h*.29,0,w*.84,h*.58,d*.70,cream);
      box(0,h*.60,0,w*.88,h*.04,d*.74,stone);
      box(-w*.24,h*.20,d*.355,w*.16,h*.28,.02,glass);
      for(let row=0;row<3;row++)for(let col=0;col<4;col++)
        box(w*(.01+col*.085),h*(.19+row*.09),d*.36,w*.075,h*.075,.02,[red,blue,gold,green][(row+col)%4]);
      return true;

    case 'japanese-american-museum':
      // The San Jose museum's peaked roof, timber frame and round windows.
      box(0,h*.30,0,w*.80,h*.60,d*.64,cream);
      roof(0,h*.74,0,w*.89,h*.28,d*.75,dark);
      for(const side of [-1,1]){
        box(side*w*.30,h*.30,d*.325,w*.04,h*.58,.02,dark);
        cyl(side*w*.21,h*.36,d*.34,w*.10,h*.10,.03,glass);
      }
      box(0,h*.26,d*.34,w*.18,h*.30,.02,dark);
      box(0,h*.53,d*.34,w*.80,h*.04,.02,dark);
      return true;

    case 'mexican-heritage-plaza':
      // Terracotta entrance tower, tile roofs and central courtyard.
      box(0,h*.17,0,w*.85,h*.34,d*.73,cream);
      box(0,h*.35,0,w*.90,h*.04,d*.78,red);
      box(-w*.28,h*.43,d*.12,w*.25,h*.80,d*.30,red);
      box(-w*.28,h*.58,d*.275,w*.11,h*.18,.02,dark);
      roof(-w*.28,h*.86,d*.12,w*.30,h*.12,d*.34,red);
      box(w*.12,h*.19,d*.38,w*.35,h*.15,.02,glass);
      return true;

    case 'santana-row':
      // A compact row of Mediterranean shopfronts and palms.
      for(let i=0;i<3;i++){
        const x=(i-1)*w*.27, buildingH=h*(.48+i*.08);
        box(x,buildingH/2,0,w*.25,buildingH,d*.64,[red,cream,stone][i]);
        roof(x,buildingH+h*.07,0,w*.27,h*.14,d*.70,red);
        box(x,buildingH*.52,d*.325,w*.13,buildingH*.24,.02,glass);
      }
      for(const side of [-1,1]){
        cyl(side*w*.42,h*.16,d*.37,w*.025,h*.32,d*.025,stone);
        dome(side*w*.42,h*.32,d*.37,w*.14,h*.09,d*.14,green);
      }
      return true;

    case 'emma-prusch':
      // The park's large red agricultural barn with white doors.
      box(-w*.06,h*.28,0,w*.70,h*.56,d*.66,red);
      roof(-w*.06,h*.65,0,w*.76,h*.18,d*.72,dark);
      box(-w*.06,h*.18,d*.335,w*.24,h*.30,.02,cream);
      box(-w*.06,h*.18,d*.35,w*.025,h*.30,.02,red);
      box(-w*.06,h*.29,d*.35,w*.24,h*.025,.02,red);
      cyl(w*.37,h*.27,-d*.06,w*.18,h*.54,d*.18,silver);
      dome(w*.37,h*.54,-d*.06,w*.18,h*.08,d*.18,stone);
      return true;

    case 'new-almaden':
      // Casa Grande, the historic mine manager's house and mining museum.
      box(0,h*.33,-d*.04,w*.82,h*.66,d*.62,cream);
      roof(0,h*.73,-d*.04,w*.88,h*.14,d*.70,stone);
      for(const y of [.27,.57])box(0,h*y,d*.29,w*.85,h*.04,d*.12,stone);
      for(const x of [-.35,-.18,0,.18,.35])box(w*x,h*.30,d*.35,w*.035,h*.60,d*.035,cream);
      for(const x of [-.24,0,.24])for(const y of [.16,.46])box(w*x,h*y,d*.28,w*.09,h*.13,.02,green);
      return true;

    case 'great-america':
      // The amusement park's Drop Tower, with its raised ring of seats.
      cyl(0,h*.045,0,w*.62,h*.09,d*.62,stone);
      box(0,h*.5,0,w*.14,h*.82,d*.14,blue);
      cyl(0,h*.33,0,w*.46,h*.10,d*.46,red);
      for(const side of [-1,1]){
        box(side*w*.15,h*.33,0,w*.07,h*.12,d*.33,gold);
        box(0,h*.33,side*d*.15,w*.33,h*.12,d*.07,gold);
      }
      cyl(0,h*.91,0,w*.27,h*.08,d*.27,cream);
      cyl(0,h*.97,0,w*.18,h*.05,d*.18,red);
      return true;

    case 'our-lady-of-peace':
      // A silver figure with a flowing gown and welcoming outstretched arms.
      cyl(0,h*.065,0,w*.82,h*.13,d*.82,green);
      cyl(0,h*.16,0,w*.48,h*.08,d*.48,stone);
      roof(0,h*.46,0,w*.35,h*.52,d*.32,silver);
      cyl(0,h*.765,0,w*.15,h*.18,d*.15,silver);
      box(0,h*.63,0,w*.66,h*.08,d*.12,silver);
      for(const side of [-1,1])cyl(side*w*.34,h*.625,0,w*.08,h*.12,d*.09,silver);
      return true;

    case 'slac-accelerator':
      // Long accelerator gallery and its neighboring laboratory service hall.
      box(0,h*.17,-d*.17,w*.88,h*.24,d*.25,stone);
      box(0,h*.30,-d*.17,w*.88,h*.025,d*.27,silver);
      box(-w*.19,h*.18,d*.20,w*.43,h*.36,d*.38,cream);
      box(-w*.19,h*.37,d*.20,w*.45,h*.04,d*.40,dark);
      for(const x of [-.36,-.18,0,.18,.36])box(w*x,h*.36,-d*.17,w*.045,h*.11,d*.29,blue);
      for(const x of [-.30,-.18,-.06])box(w*x,h*.20,d*.395,w*.08,h*.14,.02,glass);
      return true;

    case 'lick-observatory':
      // The main building links the large Great Refractor dome and smaller dome.
      box(0,h*.20,0,w*.82,h*.40,d*.46,cream);
      for(const x of [-.26,0,.26])box(w*x,h*.22,d*.235,w*.10,h*.16,.02,dark);
      cyl(-w*.25,h*.42,0,w*.42,h*.12,d*.62,stone);
      dome(-w*.25,h*.48,0,w*.42,h*.29,d*.62,cream);
      cyl(w*.28,h*.37,0,w*.25,h*.12,d*.38,stone);
      dome(w*.28,h*.43,0,w*.25,h*.19,d*.38,cream);
      box(-w*.25,h*.64,d*.28,w*.06,h*.23,d*.025,dark);
      return true;

    case 'electric-light-tower':
      // Four tapering lattice legs, cross braces and a cluster of electric lamps.
      for(let level=0;level<4;level++){
        const span=.35-level*.065, y=h*(.10+level*.18);
        for(const sx of [-1,1])for(const sz of [-1,1])
          box(sx*w*span,y,sz*d*span,w*.055,h*.20,d*.055,dark);
        for(const side of [-1,1]){
          box(0,h*(.19+level*.18),side*d*span,w*(span*2+.055),h*.025,d*.055,silver);
          box(side*w*span,h*(.19+level*.18),0,w*.055,h*.025,d*(span*2+.055),silver);
        }
      }
      cyl(0,h*.81,0,w*.18,h*.13,d*.18,dark);
      cyl(0,h*.895,0,w*.35,h*.04,d*.35,silver);
      for(const sx of [-1,1])for(const sz of [-1,1])
        cyl(sx*w*.12,h*.92,sz*d*.12,w*.08,h*.05,d*.08,gold);
      cyl(0,h*.96,0,w*.06,h*.08,d*.06,dark);
      return true;

    case 'san-jose-airport':
      // Terminal B's glazed facade and broad, curved metal roof.
      box(0,h*.24,0,w*.86,h*.48,d*.64,glass);
      for(const x of [-.36,-.18,0,.18,.36])
        box(w*x,h*.24,d*.33,w*.04,h*.48,d*.035,cream);
      dome(0,h*.48,0,w*.9,h*.18,d*.75,silver);
      box(0,h*.12,d*.36,w*.70,h*.04,d*.07,stone);
      // Small terminal wing, leaving a clear silhouette against the roof.
      box(-w*.31,h*.11,-d*.36,w*.26,h*.22,d*.22,cream);
      return true;

    case 'paypal-park':
      // Soccer pitch, steep blue seats and a floating canopy around three sides.
      box(0,h*.04,0,w*.86,h*.08,d*.80,green);
      for(const side of [-1,1]){
        box(side*w*.39,h*.24,0,w*.12,h*.40,d*.86,blue);
        box(0,h*.24,side*d*.39,w*.72,h*.40,d*.12,blue);
        box(side*w*.41,h*.63,0,w*.08,h*.62,d*.08,cream);
        box(side*w*.39,h*.92,0,w*.16,h*.05,d*.91,silver);
      }
      box(0,h*.92,-d*.39,w*.79,h*.05,d*.16,silver);
      box(0,h*.09,0,w*.56,h*.015,d*.012,cream);
      cyl(0,h*.09,0,w*.16,h*.02,d*.16,cream);
      return true;

    case 'de-anza-planetarium':
      box(0,h*.18,0,w*.82,h*.36,d*.70,stone);
      cyl(0,h*.40,0,w*.64,h*.08,d*.64,cream);
      dome(0,h*.44,0,w*.64,h*.42,d*.64,cream);
      box(0,h*.19,d*.36,w*.38,h*.20,d*.02,glass);
      return true;

    case 'san-jose-gurdwara':
      // The white facade and prominent golden central dome.
      box(0,h*.29,0,w*.86,h*.58,d*.75,cream);
      for(const x of [-.30,-.15,0,.15,.30])box(w*x,h*.26,d*.38,w*.07,h*.25,.02,dark);
      cyl(0,h*.61,0,w*.39,h*.10,d*.39,stone);
      dome(0,h*.66,0,w*.39,h*.26,d*.39,gold);
      cyl(0,h*.94,0,w*.035,h*.08,d*.035,gold);
      for(const side of [-1,1]){
        cyl(side*w*.33,h*.63,0,w*.13,h*.10,d*.13,cream);
        dome(side*w*.33,h*.68,0,w*.13,h*.11,d*.13,gold);
      }
      return true;

    case 'stanford-theatre':
      box(0,h*.29,0,w*.84,h*.58,d*.74,stone);
      box(0,h*.33,d*.385,w*.69,h*.16,d*.05,gold);
      box(0,h*.57,d*.30,w*.18,h*.70,d*.10,red);
      for(const y of [.35,.47,.59,.71,.83])box(0,h*y,d*.355,w*.11,h*.04,.02,gold);
      return true;

    case 'excite-ballpark':
      // Open baseball park with red stands and an infield diamond.
      box(0,h*.035,0,w*.86,h*.07,d*.84,green);
      box(0,h*.08,d*.10,w*.38,h*.03,d*.38,stone);
      for(const side of [-1,1]){
        box(side*w*.39,h*.18,0,w*.12,h*.28,d*.86,red);
        box(side*w*.37,h*.45,-d*.30,w*.04,h*.55,d*.04,cream);
      }
      box(0,h*.18,-d*.39,w*.78,h*.28,d*.12,red);
      box(0,h*.71,-d*.30,w*.78,h*.04,d*.05,cream);
      return true;

    default:
      return false;
  }
}
