import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const script = readFileSync(new URL('../public/changelog.js', import.meta.url), 'utf8');
function render(since: string) {
  const context = { textContent:'', hidden:true };
  const releases = ['0.0.3-alpha','0.0.2-alpha','0.0.1-alpha'].map((version, i) => ({
    dataset:{version,label:`0.0.${3-i} Alpha`}, tags:[] as string[],
    querySelector:() => ({append:(tag:{textContent:string}) => releases[i].tags.push(tag.textContent)})
  }));
  runInNewContext(script, {
    URLSearchParams, location:{search:`?since=${encodeURIComponent(since)}`},
    document:{querySelector:() => context,querySelectorAll:() => releases,createElement:() => ({className:'',textContent:''})}
  });
  return {context,releases};
}
test('marks only releases newer than the last-played release', () => {
  const {context,releases} = render('0.0.1-alpha');
  assert.equal(context.textContent,'2 releases since you last played 0.0.1 Alpha.');
  assert.deepEqual(releases.map(release=>release.tags.length),[1,1,0]);
});
test('reports same and unknown versions honestly', () => {
  assert.match(render('0.0.3-alpha').context.textContent,/no newer release notes/);
  assert.match(render('not-a-release').context.textContent,/not in this changelog/);
});
