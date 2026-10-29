import { describe, expect, it } from 'vitest';
import { deadline } from '../../src/core/deadline';

describe('deadline reason precedence', () => {
  it.each(['annually', 'within two months after the hearing', 'before the next hearing'])
    ('unsupported second phrase %s outranks conflicting figures', second => {
      // what_bug_this_catches: early number failure hides a higher-precedence unsupported deadline.
      const text = `within thirty (35) calendar days after the hearing; ${second}.`;
      expect(deadline(text, [0, text.length]).field).toEqual({ unknown: 'deadline_unsupported' });
    });

  it('detects unsupported month units in a second phrase after a valid count', () => {
    // what_bug_this_catches: the suffix check omitted units recognized by the initial deadline cue.
    const text = 'within thirty (30) calendar days after the hearing; two months later.';
    expect(deadline(text, [0, text.length]).field).toEqual({ unknown: 'deadline_unsupported' });
  });

  it('retains conflicting figures over an unresolved anchor without a second phrase', () => {
    // what_bug_this_catches: enforcing unsupported precedence must preserve the next two reason levels.
    const text = 'within thirty (35) calendar days after such notice.';
    expect(deadline(text, [0, text.length]).field).toEqual({ unknown: 'conflicting_figures' });
  });

  it('keeps timing words inside a stated event in the event text', () => {
    // what_bug_this_catches: counting every cue word as an independent deadline rejects legitimate anchors.
    const text = 'within thirty (30) calendar days after the annual hearing before the festival.';
    expect(deadline(text, [0, text.length]).field).toMatchObject({ known: {
      kind: 'relative_calendar_days', n: 30, anchorText: 'the annual hearing before the festival',
    } });
  });
});
