import { runModelArm } from './model-runner';
import type { ModelContext } from './model-runner';
import type { Packet } from '../../src/core/types';
export const m1b = (packet: Packet, date: string, dates: Record<string, string>, context: ModelContext, tier: 'small' | 'mid') => runModelArm(tier === 'small' ? 'M1b-small' : 'M1b-mid', packet, date, dates, context);
