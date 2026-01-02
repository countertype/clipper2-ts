import { Vertex, VertexFlags } from './Engine.js';
export class VertexPool {
    pool = [];
    index = 0;
    growthFactor = 2;
    constructor(initialSize = 1024) {
        this.expand(initialSize);
    }
    expand(newSize) {
        const currentSize = this.pool.length;
        const dummyPt = { x: 0, y: 0 };
        for (let i = currentSize; i < newSize; i++) {
            this.pool.push(new Vertex(dummyPt, VertexFlags.None, null));
        }
    }
    get(pt, flags, prev) {
        if (this.index >= this.pool.length) {
            this.expand(this.pool.length * this.growthFactor);
        }
        const v = this.pool[this.index++];
        v.pt = pt;
        v.flags = flags;
        v.prev = prev;
        v.next = null;
        return v;
    }
    reset() {
        this.index = 0;
    }
}
//# sourceMappingURL=VertexPool.js.map