import type { Packet } from '../../src/core/types';
import { asOf, statePeriods } from '../../src/core/asof';
import { extractResolution } from '../../src/core/extract';
/** Deliberately date-naive baseline; newest text even before its commencement. */
export function rLatest(packet:Packet,date:string,triggerDates:Record<string,string>={}){const periods=statePeriods(packet);const latest=asOf(packet,periods[periods.length-1]!.from);return extractResolution(packet,{...latest,asOf:date},triggerDates,'R-latest');}
export { rLatest as run };
