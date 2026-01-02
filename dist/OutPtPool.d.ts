import { Point64 } from './Core.js';
import { OutRec, OutPt } from './Engine.js';
export declare class OutPtPool {
    private pool;
    private index;
    private readonly growthFactor;
    constructor(initialSize?: number);
    private expand;
    get(pt: Point64, outrec: OutRec): OutPt;
    reset(): void;
}
//# sourceMappingURL=OutPtPool.d.ts.map