import { Point64 } from './Core.js';
import { Vertex, VertexFlags } from './Engine.js';
export declare class VertexPool {
    private pool;
    private index;
    private readonly growthFactor;
    constructor(initialSize?: number);
    private expand;
    get(pt: Point64, flags: VertexFlags, prev: Vertex | null): Vertex;
    reset(): void;
}
//# sourceMappingURL=VertexPool.d.ts.map