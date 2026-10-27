import { runModelArm } from './model-runner';
import type { ModelContext } from './model-runner';
import type { Packet } from '../../src/core/types';
export const h = (packet: Packet, date: string, dates: Record<string, string>, context: ModelContext) => runModelArm('H', packet, date, dates, context);
