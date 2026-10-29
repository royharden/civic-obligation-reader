import type { Packet } from '../../src/core/types';
import { asOf } from '../../src/core/asof';
import { extractResolution } from '../../src/core/extract';
/** Deliberately date-naive baseline; quotes original sections even after amendment or sunset. */
export function rOrig(packet:Packet,date:string,triggerDates:Record<string,string>={}){const original={...packet,enactment:{...packet.enactment,amendments:[]}};return extractResolution(original,{...asOf(original,original.enactment.commencesOn),asOf:date},triggerDates,'R-orig');}
export { rOrig as run };
