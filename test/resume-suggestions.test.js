import test from 'node:test';
import assert from 'node:assert/strict';
import { getResumeSuggestions, validateSuggestions, resumeFeedbackContext } from '../server/services/resumeSuggestions.js';
import { applySuggestion, suggestionTargets } from '../src/data/resumeSuggestionTargets.js';
import { fixture, profile, register } from './support/api.js';
const suggestion = {target:'skills',before:'React, SQL',after:'React; SQL',category:'structure',reason:'Use a consistent list.'};
test('feedback validates targets and rejects fabricated paths, duplicates and changed text', () => {
  const targets = suggestionTargets(profile);
  assert.equal(validateSuggestions({suggestions:[suggestion]},targets).suggestions.length,1);
  for (const item of [{...suggestion,target:'email'}, {...suggestion,before:'invented'}]) assert.throws(() => validateSuggestions({suggestions:[item]},targets));
  assert.throws(() => validateSuggestions({suggestions:[suggestion,suggestion]},targets));
  assert.throws(() => applySuggestion({...profile,skills:'Python'},suggestion));
});
test('accepting a bullet updates structured and legacy text without mutating the source', () => {
  const original = {...profile, experienceEntries:[{title:'Intern',organization:'Example',dates:'2026',bullets:['Built reports']}]};
  const changed = applySuggestion(original,{target:'experienceEntries.0.0',before:'Built reports',after:'Created reports'});
  assert.match(changed.experience,/Created reports/); assert.equal(original.experienceEntries[0].bullets[0],'Built reports');
});
test('Gemini request excludes contact identity and handles quota and malformed feedback', async () => {
  let sent;
  const result = await getResumeSuggestions({...profile,phone:'7045551234'}, {apiKey:'test-key',fetchImpl:async (url,options) => {
    sent = JSON.parse(options.body); return {ok:true,status:200,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({suggestions:[suggestion]})}]}}]})};
  }});
  assert.equal(result.suggestions.length,1);
  assert.doesNotMatch(JSON.stringify(sent),/alex@example|7045551234|Alex Chen/);
  await assert.rejects(getResumeSuggestions(profile,{apiKey:'key',fetchImpl:async()=>({status:429})}),error=>error.status===429);
  await assert.rejects(getResumeSuggestions(profile,{apiKey:''}),error=>error.status===503);
  await assert.rejects(getResumeSuggestions(profile,{apiKey:'key',fetchImpl:async()=>({ok:true,status:200,json:async()=>({candidates:[]})})}),error=>error.status===502);
});
test('feedback requires auth, consent, and an uploaded resume belonging to the session', async t => {
  const seen=[]; const app=await fixture(t,{suggestResume:async value=>{seen.push(value);return {suggestions:[]};}});
  const alice=app.client(),bob=app.client(),anonymous=app.client();
  assert.equal((await anonymous('/api/resumes/suggestions',{consent:true})).status,401);
  await register(alice);await register(bob,'bob@example.org');
  const user=app.store.findUser('alex@example.org');
  app.store.saveResume(user.id,{originalname:'resume.pdf',mimetype:'application/pdf',buffer:Buffer.from('test-only')});
  app.store.saveDraft(user.id,{fields:{skills:'Python'}});
  assert.equal((await alice('/api/resumes/suggestions',{consent:false})).status,400);
  assert.equal((await bob('/api/resumes/suggestions',{consent:true})).status,422);
  assert.equal((await alice('/api/resumes/suggestions',{consent:true,userId:999})).status,200);
  assert.equal(seen[0].skills,'Python');
});


test('feedback can flag missing information and text formatting without inserting invented facts', () => {
  const feedback=validateSuggestions({suggestions:[],findings:[
    {category:'skills',message:'Verify whether relevant SQL coursework should be listed; do not claim skills you lack.'},
    {category:'formatting',message:'Use consistent punctuation across the supplied bullets.'},
  ]},suggestionTargets(profile));
  assert.equal(feedback.findings.length,2);assert.deepEqual(feedback.suggestions,[]);
  assert.equal(resumeFeedbackContext({...profile,phone:'7045551234',email:'private@example.org'}).phone,undefined);
  assert.throws(()=>validateSuggestions({suggestions:[{...suggestion,target:'title',before:'Software Engineer',after:'x'.repeat(201)}]},suggestionTargets(profile)));
});
