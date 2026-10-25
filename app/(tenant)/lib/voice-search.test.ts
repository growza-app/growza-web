import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  claimVoiceSession,
  cleanVoiceTranscript,
  extractVoiceTranscript,
  releaseVoiceSession,
  voiceSearchLang,
  type BrowserSpeechRecognitionResultList,
} from './voice-search';

const tenant = join(__dirname, '..');
const read = (p: string) => readFileSync(join(tenant, p), 'utf8');

describe('voice-to-text transcript cleaning and language selection (Jira GRW-651)', () => {
  it('strips trailing sentence punctuation added by speech engines while keeping internal characters', () => {
    expect(cleanVoiceTranscript('Butter chicken.')).toBe('Butter chicken');
    expect(cleanVoiceTranscript('  बटर चिकन।  ')).toBe('बटर चिकन');
    expect(cleanVoiceTranscript('Paneer   tikka?!')).toBe('Paneer tikka');
    expect(cleanVoiceTranscript('O3+ Clean-up.')).toBe('O3+ Clean-up');
    expect(cleanVoiceTranscript('...')).toBe('');
  });

  it('joins multi-segment SpeechRecognitionResultList and cleans trailing punctuation', () => {
    const list: BrowserSpeechRecognitionResultList = {
      length: 2,
      0: { isFinal: true, length: 1, 0: { transcript: 'tandoori' } },
      1: { isFinal: false, length: 1, 0: { transcript: 'roti.' } },
    };
    expect(extractVoiceTranscript(list)).toBe('tandoori roti');
  });

  it('picks hi-IN for Hindi locale and en-IN otherwise', () => {
    expect(voiceSearchLang('hi')).toBe('hi-IN');
    expect(voiceSearchLang('en')).toBe('en-IN');
    expect(voiceSearchLang('en-IN')).toBe('en-IN');
  });

  it('stops a previous active voice session when a second search box claims the microphone', () => {
    const stopA = vi.fn();
    const stopB = vi.fn();
    claimVoiceSession(stopA);
    expect(stopA).not.toHaveBeenCalled();

    claimVoiceSession(stopB);
    expect(stopA).toHaveBeenCalledTimes(1);
    expect(stopB).not.toHaveBeenCalled();

    releaseVoiceSession(stopB);
  });
});

describe('POS and Menu search automatically ask the server for OpenAI embedding suggestions (Jira GRW-651)', () => {
  it.each([
    'appointments/new/DeskServiceGrid.tsx',
    'components/ServiceSheet.tsx',
    'products/ProductsList.tsx',
  ])('%s wires useServiceSuggestions and extraSuggestions', (file) => {
    const src = read(file);
    expect(src).toContain('useServiceSuggestions(');
    expect(src).toContain('extraSuggestions(');
    expect(src).toContain('also-try-chip');
  });
});
