import { runModelArm } from './model-runner';
import type { ModelContext } from './model-runner';
import type { Packet } from '../../src/core/types';
export const m1a = (packet: Packet, date: string, dates: Record<string, string>, context: ModelContext) => runModelArm('M1a', packet, date, dates, context);
