import { readAiJourney } from './aiJourney';

export function readAiPracticalFlow(value) {
  if (!value || !Array.isArray(value.steps) || value.steps.length < 2 || value.steps.length > 3) return null;
  const seen = new Set();
  const steps = [];
  for (const step of value.steps) {
    if (!step || typeof step.title !== 'string' || step.title.length > 48
      || /[<>\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(step.title)) return null;
    const title = step.title.normalize('NFKC').replace(/\s+/gu, ' ').trim();
    const key = title.replace(/[\p{P}\p{S}\p{M}ـ]/gu, '').trim();
    if (!key || !/[\p{Script=Arabic}]/u.test(title) || title.split(/\s+/u).length > 4 || seen.has(key)) return null;
    seen.add(key);
    steps.push({ title });
  }
  return { steps };
}

export function readAiResponseDiagrams(value, analysisType, studyMode) {
  const empty = { journey: null, practicalFlow: null };
  if (studyMode !== 'old_man') return empty;
  if (analysisType === 'practical') return { ...empty, practicalFlow: readAiPracticalFlow(value?.practicalFlow) };
  if (analysisType === 'explain') return { ...empty, journey: readAiJourney(value?.journey) };
  return empty;
}
