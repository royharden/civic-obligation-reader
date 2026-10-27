import type { Field } from './types';
import type { Modality } from './row';
import type { Trigger } from './candidates';
import { known } from './row';
import { assertNever } from './assert-never';
export function modality(trigger:Trigger):Field<Modality>{switch(trigger.modality){case 'must':case 'must_not':case 'may':case 'need_not':return known(trigger.modality,trigger.span);default:return assertNever(trigger.modality);}}
