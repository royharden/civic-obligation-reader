import {it,expect} from 'vitest';
import {sha256,utf8Bytes} from '../../src/core/hash';
import {canonicalJSON} from '../../src/core/canonical-json';
import {addDays,daysBetween,isValidDate} from '../../src/core/dates';
it('HASH-ABC: published SHA-256 known answer',()=>{expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');});
it('HASH-UNICODE: hashes UTF-8, preserves distinct normalization forms',()=>{expect(utf8Bytes('😀')).toEqual([240,159,152,128]);expect(sha256('é')).not.toBe(sha256('e\u0301'));expect(()=>sha256('\ud800')).toThrow();});
it('CANONICAL-KEYS: nested key ordering stable, arrays retain order',()=>{expect(canonicalJSON({z:[{b:2,a:1}],a:0})).toBe('{"a":0,"z":[{"a":1,"b":2}]}');expect(()=>canonicalJSON({a:undefined})).toThrow();});
it('DATE-LEAP-MONTH: Gregorian month ends and excluded trigger day',()=>{expect(addDays('2028-02-28',1)).toBe('2028-02-29');expect(addDays('2028-02-28',2)).toBe('2028-03-01');expect(addDays('2026-01-31',30)).toBe('2026-03-02');expect(addDays('2026-03-01',-1)).toBe('2026-02-28');expect(addDays('2026-12-31',1)).toBe('2027-01-01');expect(daysBetween('2028-02-28','2028-03-01')).toBe(2);});
it('DATE-CENTURIES: 1900 nonleap, 2000 leap, bounded year domain',()=>{expect(isValidDate('1900-02-29')).toBe(false);expect(isValidDate('2000-02-29')).toBe(true);expect(isValidDate('0000-01-01')).toBe(false);expect(addDays('0001-01-01',0)).toBe('0001-01-01');expect(addDays('9999-12-31',0)).toBe('9999-12-31');expect(()=>addDays('9999-12-31',1)).toThrow();expect(()=>addDays('0001-01-01',-1)).toThrow();});
