import {readFileSync} from 'node:fs';
import {describe,test,expect} from 'vitest';
import {union,booleanOpWithPolyTree,PolyTree64,ClipType,FillRule,type Paths64} from '../src';
const paths:Paths64=JSON.parse(readFileSync(new URL('./test-data/union-pocket.json',import.meta.url),'utf8'));
function winding(rings:Paths64,x:number,y:number){let w=0;for(const r of rings)for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length];const c=(b.x-a.x)*(y-a.y)-(x-a.x)*(b.y-a.y);if(a.y<=y){if(b.y>y&&c>0)w++}else if(b.y<=y&&c<0)w--}return w;}
function flatten(node:PolyTree64,out:Paths64=[]):Paths64{for(let i=0;i<node.count;i++){const child=node.child(i) as PolyTree64;out.push(child.poly);flatten(child,out);}return out;}

// Truncating the intersection points of three thin triangles makes one edge
// cross another, closing a crack into a small hole. fixSelfIntersects splits it
// off as a loop of opposite orientation; that loop lies inside the remainder,
// so dropping it (as spurious twists are dropped) filled the hole.
const minimal:Paths64=[
  [{x:91,y:7},{x:-145,y:-11},{x:-141,y:-15}],
  [{x:-28,y:75},{x:-33,y:76},{x:1,y:0}],
  [{x:-22,y:51},{x:-39,y:76},{x:-25,y:-2}],
];

describe('union keeps a hole split off as a reversed loop',()=>{
  test('minimal three triangles',()=>{
    expect(winding(minimal,-7,7)).toBe(0);
    expect(winding(union(minimal,FillRule.NonZero),-7,7)).toBe(0);
  });

  test('pocket from the fog walk',()=>{
    const x=3274.55*1024,y=2269.71*1024;
    expect(winding(paths,x,y)).toBe(0);
    expect(winding(union(paths,FillRule.NonZero),x,y)).toBe(0);
  });

  test('pocket from the fog walk, PolyTree',()=>{
    const x=3274.55*1024,y=2269.71*1024;
    const tree=new PolyTree64();
    booleanOpWithPolyTree(ClipType.Union,paths,null,tree,FillRule.NonZero);
    expect(winding(flatten(tree),x,y)).toBe(0);
  });
});
