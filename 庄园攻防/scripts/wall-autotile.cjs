'use strict';
// Register surfaces, not just tile borders. All sixteen masks use the same
// walkway, parapet and south-facing facade cross-sections from the source art.
const {PNG}=require('pngjs');
const TILE=64,PROFILE=Object.freeze({left:16,right:48,top:14,bottom:42,floorLeft:25,floorRight:39,floorTop:23,floorBottom:31,foot:54});
const mod=(n,d)=>(n%d+d)%d;
function geometry(mask,x,y){
  const n=!!(mask&1),e=!!(mask&2),s=!!(mask&4),w=!!(mask&8),p=PROFILE;
  const column=x>=p.left&&x<p.right,row=y>=p.top&&y<p.bottom;
  const top=column&&(row||n&&y<p.top||s&&y>=p.bottom)||row&&(w&&x<p.left||e&&x>=p.right);
  const floorColumn=x>=p.floorLeft&&x<p.floorRight,floorRow=y>=p.floorTop&&y<p.floorBottom;
  const walkway=top&&(floorColumn&&(floorRow||n&&y<p.floorTop||s&&y>=p.floorBottom)||floorRow&&(w&&x<p.floorLeft||e&&x>=p.floorRight));
  const facade=y>=p.bottom&&y<p.foot&&(column&&!s||w&&x<p.left||e&&x>=p.right);
  return {top,walkway,facade};
}
function copy(src,dst,x,y,xx,yy){
  const a=(y*src.width+x)*4,b=(yy*dst.width+xx)*4;src.data.copy(dst.data,b,a,a+4);
}
function assembleWalls(vertical,horizontal,outline){
  const p=PROFILE,frames=[];
  // Common global phase: repeat periods divide 64, including at chunk seams.
  const floor=(out,x,y)=>copy(horizontal,out,16+mod(x,16),p.floorTop+mod(y-p.floorTop,8),x,y);
  const side=(out,x,y,east)=>copy(vertical,out,(east?p.floorRight:p.left)+mod(x-(east?p.floorRight:p.left),9),16+mod(y,16),x,y);
  const across=(out,x,y)=>copy(horizontal,out,16+mod(x,16),y,x,y);
  for(let mask=0;mask<16;mask++){
    const frame=new PNG({width:TILE,height:TILE});frame.data.fill(0);
    for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){
      const g=geometry(mask,x,y);
      if(g.facade){across(frame,x,y);continue;}
      if(!g.top)continue;
      if(g.walkway){floor(frame,x,y);continue;}
      // Outside the centre, each arm is exactly the canonical straight profile.
      if(y<p.top||y>=p.bottom){side(frame,x,y,x>=p.floorRight);continue;}
      if(x<p.left||x>=p.right){across(frame,x,y);continue;}
      const west=x<p.floorLeft,east=x>=p.floorRight,north=y<p.floorTop,south=y>=p.floorBottom;
      if((west||east)&&(north||south)){
        const verticalOpen=!!(mask&(north?1:4)),horizontalOpen=!!(mask&(west?8:2));
        // A single open arm continues unbroken. When both/neither are open,
        // miter the same two strips inside a fixed 9x9/9x11 corner block.
        const dx=west?x-p.left:p.right-1-x,dy=north?y-p.top:p.bottom-1-y;
        const useVertical=verticalOpen!==horizontalOpen?verticalOpen:dx/9<=dy/(north?9:11);
        if(useVertical)side(frame,x,y,east);else across(frame,x,y);
      }else if(west||east)side(frame,x,y,east);else across(frame,x,y);
    }
    // Source merlon gaps are intentional; do not turn their alpha into stray
    // horizontal end-cap lines inside an adjoining vertical parapet.
    outline(frame,mask,(x,y)=>{const g=geometry(mask,x,y);return g.top||g.facade;});frames.push(frame);
  }
  return frames;
}
module.exports={PROFILE,geometry,assembleWalls};
