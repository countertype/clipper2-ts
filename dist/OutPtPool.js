import { OutRec, OutPt } from './Engine.js';
export class OutPtPool {
    pool = [];
    index = 0;
    growthFactor = 2;
    constructor(initialSize = 1024) {
        this.expand(initialSize);
    }
    expand(newSize) {
        const currentSize = this.pool.length;
        // We can't easily pre-allocate objects that require constructor args without dummy values
        // But OutPt requires Point64 and OutRec in constructor.
        // We'll create them with dummy values and re-initialize them on retrieval.
        // This is a trade-off: slightly slower expansion for faster retrieval.
        const dummyPt = { x: 0, y: 0 };
        // We need a dummy OutRec. Since OutRec is a class, we can just cast a dummy object 
        // or create a real one if it's cheap. OutRec constructor is cheap.
        const dummyOutRec = new OutRec();
        for (let i = currentSize; i < newSize; i++) {
            this.pool.push(new OutPt(dummyPt, dummyOutRec));
        }
    }
    get(pt, outrec) {
        if (this.index >= this.pool.length) {
            this.expand(this.pool.length * this.growthFactor);
        }
        const op = this.pool[this.index++];
        // Re-initialize the object
        op.pt = pt;
        op.outrec = outrec;
        op.next = op;
        op.prev = op;
        op.horz = null;
        return op;
    }
    reset() {
        this.index = 0;
    }
}
//# sourceMappingURL=OutPtPool.js.map