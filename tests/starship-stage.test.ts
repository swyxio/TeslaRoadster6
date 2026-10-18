import assert from 'node:assert/strict';
import test from 'node:test';
import { STARSHIP_GOAL, STARSHIP_STAGE_PERCENTAGES, starshipStage } from '../shared/starship';

test('construction changes only at the five confirmed goal milestones',()=>{
  assert.equal(starshipStage(0),0);
  for(const [index,percent] of STARSHIP_STAGE_PERCENTAGES.entries()){
    const threshold=STARSHIP_GOAL*percent/100;
    assert.equal(starshipStage(threshold-1),index);
    assert.equal(starshipStage(threshold),index+1);
  }
  assert.equal(starshipStage(STARSHIP_GOAL),5);
  assert.equal(starshipStage(NaN),0);
});
