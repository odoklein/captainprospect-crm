import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { walkSources, type CallProvider, type CallRecord, type CallSourceKey, type SourceAvailability } from './provider';

const windows = [
  { label: 'Jour de prise du RDV', start: new Date('2026-11-10T00:00:00Z'), end: new Date('2026-11-10T23:59:59Z') },
  { label: 'Prise du RDV ±24h', start: new Date('2026-11-09T12:00:00Z'), end: new Date('2026-11-11T12:00:00Z') },
];
const input = { phones: ['+33612345678'], alloNumbers: ['+33100000000'], sdrId: 'sdr', windows };
const allAvailable: SourceAvailability[] = [
  { source: 'vault', available: true },
  { source: 'twilio', available: true },
  { source: 'allo', available: true },
];

function fake(byWindow: Record<string, CallRecord | null | Error>, calls: string[] = []): CallProvider {
  return {
    async fetchMatchingCallRecord(i) {
      const label = windows.find((w) => w.start.getTime() === i.windowStart.getTime())!.label;
      calls.push(label);
      const r = byWindow[label] ?? null;
      if (r instanceof Error) throw r;
      return r;
    },
  };
}

const none = (): Record<CallSourceKey, CallProvider | null> => ({ vault: fake({}), twilio: fake({}), allo: fake({}) });

describe('call source chain (Call Vault → Twilio → Allo)', () => {
  it('stops at the first source that has the call', async () => {
    const alloCalls: string[] = [];
    const { record, attempts } = await walkSources(input, allAvailable, {
      vault: fake({}),
      twilio: fake({ 'Prise du RDV ±24h': { recordingUrl: 'https://api.twilio.com/x' } }),
      allo: fake({ 'Jour de prise du RDV': { summary: 'allo' } }, alloCalls),
    });
    assert.equal(record?.source, 'twilio');
    assert.equal(record?.window, 'Prise du RDV ±24h');
    assert.deepEqual(attempts.map((a) => `${a.source}:${a.status}`), ['vault:empty', 'twilio:found']);
    assert.equal(alloCalls.length, 0, 'Allo is never asked once Twilio answered');
  });

  it('prefers Call Vault when it has the call', async () => {
    const { record } = await walkSources(input, allAvailable, {
      ...none(),
      vault: fake({ 'Jour de prise du RDV': { transcription: 'SDR : bonjour' } }),
      twilio: fake({ 'Jour de prise du RDV': { recordingUrl: 'x' } }),
    });
    assert.equal(record?.source, 'vault');
  });

  it('falls back to Allo when Call Vault and Twilio have nothing', async () => {
    const { record, attempts } = await walkSources(input, allAvailable, {
      ...none(),
      allo: fake({ 'Prise du RDV ±24h': { summary: 'Rappel le 12' } }),
    });
    assert.equal(record?.source, 'allo');
    assert.deepEqual(attempts.map((a) => a.status), ['empty', 'empty', 'found']);
  });

  it('a failing source does not block the next ones', async () => {
    const { record, attempts } = await walkSources(input, allAvailable, {
      ...none(),
      vault: fake({ 'Jour de prise du RDV': new Error('ECONNREFUSED') }),
      twilio: fake({ 'Jour de prise du RDV': { recordingUrl: 'x' } }),
    });
    assert.equal(record?.source, 'twilio');
    assert.equal(attempts[0]?.status, 'error');
  });

  it('skips unavailable sources and records why', async () => {
    const { record, attempts } = await walkSources(
      input,
      [
        { source: 'vault', available: false, reason: 'Call Vault non configuré' },
        { source: 'twilio', available: true },
        { source: 'allo', available: false, reason: 'Aucune ligne Allo pour ce SDR' },
      ],
      none(),
    );
    assert.equal(record, null);
    assert.deepEqual(attempts, [
      { source: 'vault', status: 'skipped', reason: 'Call Vault non configuré' },
      { source: 'twilio', status: 'empty' },
      { source: 'allo', status: 'skipped', reason: 'Aucune ligne Allo pour ce SDR' },
    ]);
  });

  it('still asks Twilio (match by contact) when the prospect has no usable number', async () => {
    const { record, attempts } = await walkSources({ ...input, phones: [] }, allAvailable, {
      ...none(),
      twilio: fake({ 'Jour de prise du RDV': { recordingUrl: 'x' } }),
    });
    assert.equal(record?.source, 'twilio');
    assert.equal(attempts[0]?.status, 'skipped');
  });

  it('ignores a match with no content', async () => {
    const { record } = await walkSources(input, allAvailable, {
      ...none(),
      vault: fake({ 'Jour de prise du RDV': { summary: '  ', recordingUrl: '' } }),
    });
    assert.equal(record, null);
  });
});
