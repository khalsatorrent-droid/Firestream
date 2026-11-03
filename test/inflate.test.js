const fs=require('fs'),vm=require('vm'),z=require('zlib');
const ctx={console,Uint8Array,Uint16Array,Error,String};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname+'/../src/lib/inflate.js','utf8'),ctx);
let fail=0;const big=JSON.stringify({a:Array.from({length:3000},(_,i)=>({id:i,t:'ep '+(i%17)+' '+Math.random()}))});
for(const s of ['', 'hello', 'aaaaaaaaaaaaaaaaaaaaaaaaaaa', big]){
 for(const [n,f] of [['raw',z.deflateRawSync],['zlib',z.deflateSync],['gzip',z.gzipSync],['store',b=>z.deflateRawSync(b,{level:0})]]){
  const out=Buffer.from(ctx.inflateAuto(new Uint8Array(f(Buffer.from(s))))).toString();
  if(out!==s){fail++;console.log('FAIL',n,s.length,out.length)}}}
console.log(fail?'inflate FAILED':'inflate OK');process.exit(fail?1:0)
