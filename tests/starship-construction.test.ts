import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STARSHIP_GOAL } from '../shared/starship';
import { constructionFraction, constructionNoseRadius } from '../src/starship-construction';

test('construction follows the confirmed total continuously and handles missing data',()=>{
  assert.equal(constructionFraction(null),null);
  assert.equal(constructionFraction(NaN),null);
  assert.equal(constructionFraction(-1),null);
  assert.equal(constructionFraction(0),0);
  assert.equal(constructionFraction(STARSHIP_GOAL*.015),.015);
  assert.equal(constructionFraction(STARSHIP_GOAL*.35),.35);
  assert.equal(constructionFraction(STARSHIP_GOAL*2),1);
});

test('the incomplete nose keeps the radius of the unfinished cross section',()=>{
  assert.equal(constructionNoseRadius(0),4.5);
  assert.equal(constructionNoseRadius(6.5),2.25);
  assert.equal(constructionNoseRadius(13),0);
});
