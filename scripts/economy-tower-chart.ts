// Draw the milestones from economy-developer.ts's checked-in 250-seed output.
import { readFileSync, writeFileSync } from 'node:fs';

type Row = { path:string; homeHoursMedian:number; plotHoursMedian:number; floors5:{medianHours:number}; floors10:{medianHours:number}; floors20:{medianHours:number} };
const { output } = JSON.parse(readFileSync('public/blog/economy/developer-simulation.json', 'utf8')) as { output:Row[] };
const escape = (s:string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
function chart(mobile:boolean) {
  const width = mobile ? 400 : 720, left = mobile ? 30 : 185, right = width - 35;
  const height = mobile ? 680 : 470, plotTop = mobile ? 132 : 142, rowGap = mobile ? 68 : 38;
  const x = (value:number) => left + value / 180 * (right - left);
  const desc = output.map(r => `${r.path}: home ${r.homeHoursMedian}, plot ${r.plotHoursMedian}, five floors ${r.floors5.medianHours}, ten floors ${r.floors10.medianHours}, twenty floors ${r.floors20.medianHours} hours`).join('; ');
  const text = (x:number,y:number,s:string,extra='') => `<text x="${x}" y="${y}" ${extra}>${escape(s)}</text>`;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc"><title id="title">The path to a tower</title><desc id="desc">Median active hours, 250 runs per strategy. ${escape(desc)}.</desc><rect width="${width}" height="${height}" rx="16" fill="#fff"/><g font-family="system-ui,-apple-system,sans-serif" fill="#1e2933">`;
  svg += text(24,39,'The path to a tower','font-size="26" font-weight="700"');
  svg += text(24,67,'Median active hours · 250 runs per path','font-size="16" fill="#4d5f6d"');
  svg += `<g font-size="13">${[["#849aa0","Home"],["#70a0a2","Plot"],["#1268a3","5 floors"],["#bd6a00","10 floors"],["#91472d","20 floors"]].map(([color,label], i) => `<circle cx="${29+i*(mobile?72:98)}" cy="98" r="5" fill="${color}"/>${text(40+i*(mobile?72:98),102,label)}`).join('')}</g>`;
  output.forEach((r,i) => {
    const y = plotTop + i*rowGap;
    svg += text(mobile?24:24,mobile?y:y+5,r.path,'font-size="15" font-weight="600"');
    const lineY = mobile ? y+22 : y;
    svg += `<line x1="${left}" x2="${right}" y1="${lineY}" y2="${lineY}" stroke="#d6dde2" stroke-width="2"/>`;
    const values:[[number,string],...[number,string][]] = [[r.homeHoursMedian,'#849aa0'],[r.plotHoursMedian,'#70a0a2'],[r.floors5.medianHours,'#1268a3'],[r.floors10.medianHours,'#bd6a00'],[r.floors20.medianHours,'#91472d']];
    svg += values.map(([value,color]) => `<circle cx="${x(value).toFixed(1)}" cy="${lineY}" r="${mobile?5:6}" fill="${color}"/>`).join('');
    svg += text(x(r.floors20.medianHours),lineY-10,`${r.floors20.medianHours}h`,'text-anchor="middle" font-size="12" font-weight="700" fill="#91472d"');
  });
  const axisY = mobile ? 617 : 419;
  svg += [0,40,80,120,160].map(v => text(x(v),axisY,`${v}`,'text-anchor="middle" font-size="13" fill="#4d5f6d"')).join('');
  svg += text((left+right)/2,axisY+24,'Active hours since starting','text-anchor="middle" font-size="14" fill="#4d5f6d"');
  return `${svg}</g></svg>\n`;
}
writeFileSync('public/blog/economy/developer-journey.svg',chart(false));
writeFileSync('public/blog/economy/developer-journey-mobile.svg',chart(true));
