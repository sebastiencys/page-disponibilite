import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPublicVCard } from './vcard.ts';

test('buildPublicVCard formats RFC 3.0 vCard with proper escaping and no sensitive leaks', () => {
  const vcf = buildPublicVCard(
    {
      name: 'Jean-Luc Picard',
      role: 'Capitaine; Commandement, Flotte',
      company: 'Starfleet\\HQ',
      email: 'jl.picard@example.com',
      bookingUrl: 'https://cal.example.com/picard',
    },
    'https://dispo.example.com/?view=public'
  );

  assert.ok(vcf.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n'));
  assert.ok(vcf.includes('FN:Jean-Luc Picard\r\n'));
  assert.ok(vcf.includes('N:Picard;Jean-Luc;;;\r\n'));
  assert.ok(vcf.includes('ORG:Starfleet\\\\HQ\r\n'));
  assert.ok(vcf.includes('TITLE:Capitaine\\; Commandement\\, Flotte\r\n'));
  assert.ok(vcf.includes('EMAIL;TYPE=INTERNET,WORK:jl.picard@example.com\r\n'));
  assert.ok(vcf.includes('URL;TYPE=Booking:https://cal.example.com/picard\r\n'));
  assert.ok(vcf.includes('URL;TYPE=Status:https://dispo.example.com/?view=public\r\n'));
  assert.ok(vcf.endsWith('END:VCARD\r\n'));
});

test('buildPublicVCard omits "null", "none", "undefined", and blank contact fields cleanly', () => {
  const vcf = buildPublicVCard(
    {
      name: 'null',
      role: 'none',
      company: 'undefined',
      email: ' NULL ',
      bookingUrl: '   ',
    },
    'undefined'
  );

  assert.ok(vcf.includes('FN:Contact\r\n'));
  assert.ok(vcf.includes('N:;Contact;;;\r\n'));
  assert.ok(!vcf.includes('ORG:'));
  assert.ok(!vcf.includes('TITLE:'));
  assert.ok(!vcf.includes('EMAIL'));
  assert.ok(!vcf.includes('URL;TYPE='));
  assert.ok(!/null|none|undefined/i.test(vcf));
});

