/** Fleet identities and arcade tuning. SI units. See docs/FLEET_RESEARCH.md for provenance. */
export const VEHICLE_IDS = [
  'roadster-original', 'roadster', 'model-s', 'model-3', 'model-x', 'model-y', 'model-y-l',
  'cybertruck', 'cybercab', 'tesla-semi', 'robovan',
  'waymo-prius', 'waymo-lexus', 'waymo-firefly', 'waymo-pacifica', 'waymo-ipace',
  'waymo-ojai', 'waymo-ioniq5', 'waymo-peterbilt', 'waymo-cascadia',
  'cruise-rp1', 'cruise-leaf', 'cruise-bolt', 'cruise-origin', 'zoox', 'zoox-highlander',
] as const;
export type VehicleId = typeof VEHICLE_IDS[number];
export interface VehicleSpec {
  id: VehicleId;
  name: string;
  brand: 'Tesla' | 'Waymo' | 'Cruise' | 'Zoox';
  status: string;
  length: number; width: number; height: number; wheelbase: number; massKg: number;
  /** Arcade tuning, NOT manufacturer performance claims. m/s, m/s², radians, m/s². */
  maxSpeed: number; acceleration: number; steerAngle: number; brakeDecel: number;
  fourWheelSteering: boolean;
  airThrusters: boolean;
  shape: 'roadster' | 'sedan' | 'suv' | 'pickup' | 'van' | 'pod' | 'semi' | 'bus';
  color: number;
  sensorRig: 'none' | 'roof' | 'corners';
  sourceUrls: string[];
  estimates: string[];
}
const TESLA_DIM = 'https://www.tesla.com/ownersmanual/';
const HISTORY = 'https://blog.waymo.com/about/';
const TRUCKS = 'https://waymo.com/blog/2021/12/designed-to-deliver/';
const CRUISE = 'https://investor.gm.com/static-files/994e9842-0787-4aa5-ab72-4b49bdbe5a9e';
const EST = 'Dimensions, wheelbase and equipped mass are game estimates; source establishes platform/design only.';
const TUNE = 'Speed, acceleration, steering angle and braking are arcade tuning, not real specifications.';
type Entry = Omit<VehicleSpec, 'id' | 'maxSpeed' | 'acceleration' | 'steerAngle' | 'brakeDecel' | 'fourWheelSteering' | 'airThrusters' | 'sensorRig' | 'estimates'> & Partial<Pick<VehicleSpec, 'fourWheelSteering' | 'airThrusters' | 'sensorRig' | 'estimates'>>;
function car(id: VehicleId, data: Entry, handling: [number, number, number, number]): VehicleSpec {
  return { id, fourWheelSteering: false, airThrusters: false, sensorRig: 'none', ...data,
    maxSpeed: handling[0], acceleration: handling[1], steerAngle: handling[2], brakeDecel: handling[3],
    estimates: [TUNE, ...(data.estimates ?? [EST])],
  };
}
export const VEHICLES: Record<VehicleId, VehicleSpec> = {
  'roadster-original': car('roadster-original', { name: 'Roadster · Original', brand: 'Tesla', status: 'historical production', shape: 'roadster', color: 0xf3ad35, length: 3.946, width: 1.72, height: 1.127, wheelbase: 2.351, massKg: 1235, sourceUrls: ['https://service.tesla.com/docs/Public/Roadster/ServiceManual/en-us/GUID-4E037ADB-D0F4-48A0-9261-1083193D4C1B.html'], estimates: ['Body width estimated; official 1.851 m width includes mirrors. Published height is laden.'] }, [42, 11, .56, 17]),
  roadster: car('roadster', { name: 'Roadster · Rocket', brand: 'Tesla', status: 'prototype inspiration / fictional arcade tuning', shape: 'roadster', color: 0xf34b48, length: 4.5, width: 2, height: 1.25, wheelbase: 2.75, massKg: 2000, airThrusters: true, sourceUrls: ['https://www.tesla.com/roadster'], estimates: [EST, 'Jump, boost, roll, suction and tank behavior are arcade tuning, not vehicle specifications.'] }, [56, 16.764, .56, 20]),
  'model-s': car('model-s', { name: 'Model S', brand: 'Tesla', status: 'production family', shape: 'sedan', color: 0xa52e39, length: 5.021, width: 1.987, height: 1.43, wheelbase: 2.96, massKg: 2070, sourceUrls: [TESLA_DIM+'models/en_kr/GUID-91E5877F-3CD2-4B3B-B2B8-B5DB4A6C0A05.html'], estimates: ['Representative non-Plaid configuration; availability is not asserted.'] }, [49, 13, .50, 18]),
  'model-3': car('model-3', { name: 'Model 3', brand: 'Tesla', status: 'production family', shape: 'sedan', color: 0xe9edea, length: 4.72, width: 1.85, height: 1.44, wheelbase: 2.875, massKg: 1850, sourceUrls: [TESLA_DIM+'model3/en_ie/GUID-56562137-FC31-4110-A13C-9A9FC6657BF0.html'], estimates: ['Mass is representative game estimate; dimensions are published RWD/Long Range.'] }, [44, 11, .56, 18]),
  'model-x': car('model-x', { name: 'Model X', brand: 'Tesla', status: 'production family', shape: 'suv', color: 0xe4e8ec, length: 5.06, width: 1.999, height: 1.68, wheelbase: 2.965, massKg: 2337, sourceUrls: [TESLA_DIM+'modelx/en_kr/GUID-91E5877F-3CD2-4B3B-B2B8-B5DB4A6C0A05.html'], estimates: ['AWD five-seat reference configuration; availability is not asserted.'] }, [42, 10, .49, 16]),
  'model-y': car('model-y', { name: 'Model Y', brand: 'Tesla', status: 'production family', shape: 'suv', color: 0x517baa, length: 4.795, width: 1.92, height: 1.62, wheelbase: 2.89, massKg: 2000, sourceUrls: ['https://www.tesla.com/modely'], estimates: [EST] }, [40, 9, .52, 16]),
  'model-y-l': car('model-y-l', { name: 'Model Y L', brand: 'Tesla', status: 'production long-wheelbase family', shape: 'suv', color: 0x6e7b85, length: 4.968, width: 1.92, height: 1.669, wheelbase: 3.04, massKg: 2092, sourceUrls: ['https://www.tesla.com/modely'], estimates: ['Length/height/mass rounded from 195.6 in / 65.7 in / 4612 lb; body width and wheelbase estimated.'] }, [39, 8.7, .49, 16]),
  cybertruck: car('cybertruck', { name: 'Cybertruck', brand: 'Tesla', status: 'production family', shape: 'pickup', color: 0xaebcc0, length: 5.683, width: 2.032, height: 1.796, wheelbase: 3.635, massKg: 3000, fourWheelSteering: true, sourceUrls: ['https://static.nhtsa.gov/odi/tsbs/2024/MC-11008782-0001.pdf', 'https://www.tesla.com/cybertruck', 'https://ir.tesla.com/_flysystem/s3/sec/000162828025002993/tsla-20250129-gen.pdf'], estimates: ['Mass estimated; dimensions from Tesla manual filed with NHTSA, medium suspension setting.'] }, [40, 10, .48, 15]),
  cybercab: car('cybercab', { name: 'Cybercab', brand: 'Tesla', status: 'purpose-built robotaxi', shape: 'roadster', color: 0xd1ad66, length: 4.45, width: 1.87, height: 1.4, wheelbase: 2.8, massKg: 1500, sourceUrls: ['https://www.tesla.com/support/robotaxi/cybercab'], estimates: [EST, 'Player controls are fictional: real Cybercab has no steering wheel or pedals.'] }, [34, 8, .59, 16]),
  'tesla-semi': car('tesla-semi', { name: 'Tesla Semi', brand: 'Tesla', status: 'production tractor family', shape: 'semi', color: 0xc0c8cc, length: 7.2, width: 2.55, height: 3.8, wheelbase: 4.4, massKg: 10500, sourceUrls: ['https://www.tesla.com/semi'], estimates: [EST, 'Tractor only; no trailer, cargo, or gross-combination weight simulation.'] }, [30, 4.5, .44, 10]),
  robovan: car('robovan', { name: 'Robovan', brand: 'Tesla', status: 'announced concept', shape: 'bus', color: 0xd8d4c7, length: 6.5, width: 2.5, height: 2.8, wheelbase: 4.3, massKg: 5500, sourceUrls: ['https://www.tesla.com/robotaxi'], estimates: [EST] }, [25, 4, .46, 11]),
  'waymo-prius': car('waymo-prius', { name: 'Waymo · Prius', brand: 'Waymo', status: 'historical test platform', shape: 'sedan', color: 0xe1e5df, length: 4.46, width: 1.745, height: 1.49, wheelbase: 2.7, massKg: 1550, sensorRig: 'roof', sourceUrls: [HISTORY] }, [32, 6, .57, 15]),
  'waymo-lexus': car('waymo-lexus', { name: 'Waymo · Lexus RX', brand: 'Waymo', status: 'historical test platform', shape: 'suv', color: 0xe6e8e5, length: 4.77, width: 1.885, height: 1.685, wheelbase: 2.74, massKg: 2300, sensorRig: 'roof', sourceUrls: ['https://waymo.com/blog/2020/09/the-waymo-drivers-training-regime/'] }, [33, 7, .52, 15]),
  'waymo-firefly': car('waymo-firefly', { name: 'Waymo · Firefly', brand: 'Waymo', status: 'retired prototype', shape: 'pod', color: 0xe3e7df, length: 2.65, width: 1.55, height: 1.55, wheelbase: 1.8, massKg: 1000, sensorRig: 'roof', sourceUrls: ['https://waymo.com/blog/2017/06/from-post-it-note-to-prototype-journey/'], estimates: [EST, '25 mph real limit informs low game speed; manual control is fictional.'] }, [11.2, 4.5, .65, 14]),
  'waymo-pacifica': car('waymo-pacifica', { name: 'Waymo · Pacifica', brand: 'Waymo', status: 'historical service platform', shape: 'van', color: 0xecebe4, length: 5.18, width: 2.02, height: 1.78, wheelbase: 3.09, massKg: 2400, sensorRig: 'roof', sourceUrls: [HISTORY, 'https://waymo.com/blog/2019/09/waymo-iaa-frankfurt-2019/'] }, [32, 6, .50, 14]),
  'waymo-ipace': car('waymo-ipace', { name: 'Waymo · I-PACE', brand: 'Waymo', status: 'service platform', shape: 'suv', color: 0xf0f1e8, length: 4.68, width: 1.9, height: 1.57, wheelbase: 2.99, massKg: 2350, sensorRig: 'roof', sourceUrls: ['https://community.waymo.com/firstresponders/'] }, [38, 9, .54, 17]),
  'waymo-ojai': car('waymo-ojai', { name: 'Waymo · Ojai / Zeekr', brand: 'Waymo', status: 'purpose-built service platform', shape: 'van', color: 0xe9ece7, length: 4.65, width: 1.95, height: 1.85, wheelbase: 3, massKg: 2500, sensorRig: 'roof', sourceUrls: ['https://community.waymo.com/blog/2026/05/welcoming-riders-in-the-ojai/'] }, [34, 7, .55, 15]),
  'waymo-ioniq5': car('waymo-ioniq5', { name: 'Waymo · IONIQ 5', brand: 'Waymo', status: 'announced / testing platform', shape: 'suv', color: 0xd4e2df, length: 4.655, width: 1.89, height: 1.605, wheelbase: 3, massKg: 2250, sensorRig: 'roof', sourceUrls: ['https://waymo.com/blog/2024/10/waymo-and-hyundai-enter-partnership/', 'https://community.waymo.com/firstresponders/'] }, [37, 8.5, .54, 16]),
  'waymo-peterbilt': car('waymo-peterbilt', { name: 'Waymo Via · Peterbilt', brand: 'Waymo', status: 'historical truck test platform', shape: 'semi', color: 0xedece6, length: 7.7, width: 2.55, height: 3.7, wheelbase: 4.9, massKg: 9000, sensorRig: 'roof', sourceUrls: [TRUCKS], estimates: [EST, 'Peterbilt family confirmed; exact chassis variant unverified. Tractor only.'] }, [29, 3.7, .43, 10]),
  'waymo-cascadia': car('waymo-cascadia', { name: 'Waymo Via · Cascadia', brand: 'Waymo', status: 'historical truck test platform', shape: 'semi', color: 0xa9cee0, length: 7.4, width: 2.55, height: 3.8, wheelbase: 4.7, massKg: 9200, sensorRig: 'roof', sourceUrls: [TRUCKS], estimates: [EST, 'Tractor only; trailer articulation deferred.'] }, [29, 3.8, .43, 10]),
  'cruise-rp1': car('cruise-rp1', { name: 'Cruise · Audi RP-1', brand: 'Cruise', status: 'historical retrofit prototype', shape: 'sedan', color: 0x545e67, length: 4.7, width: 1.83, height: 1.43, wheelbase: 2.81, massKg: 1700, sensorRig: 'roof', sourceUrls: ['https://techcrunch.com/2014/06/23/cruise/'], estimates: [EST, 'Direct founder interview establishes A4/S4 retrofit; no surviving manufacturer specification located. A4/S4 share this family entry.'] }, [36, 8, .54, 16]),
  'cruise-leaf': car('cruise-leaf', { name: 'Cruise · LEAF', brand: 'Cruise', status: 'historical test platform', shape: 'suv', color: 0xd8e3e8, length: 4.445, width: 1.77, height: 1.55, wheelbase: 2.7, massKg: 1650, sensorRig: 'roof', sourceUrls: ['https://www.forbes.com/sites/alanohnsman/2017/03/13/cruises-kyle-vogt-says-gm-will-deploy-automated-rideshare-cars-very-quickly/'], estimates: [EST, 'Platform confirmed by direct Kyle Vogt interview; equipped vehicle measurements not published.'] }, [30, 6.5, .59, 15]),
  'cruise-bolt': car('cruise-bolt', { name: 'Cruise · Bolt EV', brand: 'Cruise', status: 'historical service platform', shape: 'suv', color: 0xf0ece4, length: 4.17, width: 1.765, height: 1.61, wheelbase: 2.6, massKg: 1800, sensorRig: 'roof', sourceUrls: ['https://investor.gm.com/static-files/6eb181e4-612e-488d-b73c-2d632e3a0949'] }, [33, 7.5, .61, 16]),
  'cruise-origin': car('cruise-origin', { name: 'Cruise · Origin', brand: 'Cruise', status: 'historical purpose-built prototype', shape: 'pod', color: 0xe5e5dc, length: 4.6, width: 2, height: 2, wheelbase: 3.1, massKg: 3000, sensorRig: 'corners', sourceUrls: [CRUISE, 'https://medium.com/cruise/cruise-embedded-systems-articulating-radars-7cae24642930'], estimates: [EST, 'Manual controls are fictional; real prototype was designed without wheel/pedals.'] }, [27, 5.5, .53, 13]),
  zoox: car('zoox', { name: 'Zoox · Robotaxi', brand: 'Zoox', status: 'purpose-built robotaxi', shape: 'pod', color: 0x96c6b8, length: 3.63, width: 1.94, height: 1.94, wheelbase: 2.6, massKg: 2450, fourWheelSteering: true, sensorRig: 'corners', sourceUrls: ['https://zoox.com/know-your-ride', 'https://zoox.com/common/files/galcpo3qq8khj63lhpqhiw-202507-zoox-vehicle-brochure-pdf.pdf'], estimates: [EST, 'Four-wheel steering and bidirectional exterior are sourced; manual control is fictional.'] }, [30, 6.5, .60, 15]),
  'zoox-highlander': car('zoox-highlander', { name: 'Zoox · Highlander', brand: 'Zoox', status: 'supervised test platform', shape: 'suv', color: 0x374e58, length: 4.95, width: 1.93, height: 1.73, wheelbase: 2.85, massKg: 2250, sensorRig: 'roof', sourceUrls: ['https://zoox.com/journal/autonomous-zoox-testing-vehicle', 'https://zoox.com/common/files/global-202604-zoox-leip-testing-fleet.pdf'] }, [34, 7, .51, 15]),
};
