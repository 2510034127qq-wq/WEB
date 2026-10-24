import type { Piece } from './model';

/** Metres, shared by the visible slurry, vessel pose and coating simulation. */
export const GLAZE_VAT = { base: .99, floor: 1.028, liquid: 1.31, rest: 1.37, clearance: .008 } as const;

export function glazeContact(piece: Pick<Piece,'height'|'shrink'>, travel: number) {
  const height=piece.height*piece.shrink;
  const requested=GLAZE_VAT.rest-(height+.078)*Math.max(0,Math.min(1,travel));
  const bottom=Math.max(GLAZE_VAT.floor+GLAZE_VAT.clearance,requested);
  const immersed=Math.max(0,Math.min(1,(GLAZE_VAT.liquid-bottom-.012*piece.shrink)/height));
  return { bottom, immersed, atFloor: requested<bottom };
}
