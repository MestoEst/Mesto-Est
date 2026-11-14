const fs=require('fs'),vm=require('vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const output=process.argv[2];
if(!output)throw new Error('Usage: node tools/export_canonical_initial.cjs NEW_OUTPUT.geojson (one-time provenance export only)');
if(fs.existsSync(output))throw new Error('Refusing to overwrite an existing file; ordinary updates must edit saved IDs explicitly');
const c={localStorage:{getItem:()=>null},window:{console},crypto:require('crypto').webcrypto};vm.createContext(c);
vm.runInContext(fs.readFileSync(path.join(root,'main/data/archive/frontend-generator-e4e0875.js'),'utf8'),c);
vm.runInContext(fs.readFileSync(path.join(root,'main/data/archive/frontend-streets-e4e0875.js'),'utf8'),c);
const mx=c.MX,my=c.MY;
const zones=c.ZS.slice().sort((a,b)=>b.c[1]-a.c[1]||a.c[0]-b.c[0]||a.id.localeCompare(b.id));
const features=[],registry=[];
const allIds=c.ZS.flatMap(z=>z.bays.map(b=>b.id));if(allIds.some(id=>!id)||new Set(allIds).size!==allIds.length)throw new Error('Missing or duplicate saved frontend IDs');
zones.forEach((z,zi)=>{
 const st=c.STREETS.find(s=>s.id===z.street);
 registry.push({id:z.id,name:'Зона '+(zi+1),display_number:zi+1,display_order:zi+1,street_id:st.id,street_name:st.name});
 const bays=z.bays.slice().sort((a,b)=>b.c[1]-a.c[1]||a.c[0]-b.c[0]||a.id.localeCompare(b.id));
 bays.forEach((b,bi)=>{
  // Undo only makeBays' visual 0.46 (= half width * .92); preserve actual generated orientation.
  const dx=(b.poly[1][0]-b.poly[0][0])*mx,dy=(b.poly[1][1]-b.poly[0][1])*my,len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len;
  const ring=b.poly.map(p=>{const x=(p[0]-b.c[0])*mx,y=(p[1]-b.c[1])*my,a=x*ux+y*uy;return [p[0]+a*(1/.92-1)*ux/mx,p[1]+a*(1/.92-1)*uy/my]});
  features.push({type:'Feature',properties:{id:b.id,zone:z.id,display_number:bi+1,display_order:bi+1,row_id:'row-'+b.fi},geometry:{type:'Polygon',coordinates:[ring]}});
 });
});
fs.writeFileSync(output,JSON.stringify({type:'FeatureCollection',dataset:'canonical-v1',zones:registry,features},null,2)+'\n');

console.log(features.length,registry.length);
