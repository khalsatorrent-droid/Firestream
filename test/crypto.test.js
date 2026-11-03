const fs=require('fs'),vm=require('vm'),nc=require('crypto');
const ctx={console,Uint8Array,Int32Array,Math,String,Array,parseInt,Object};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname+'/../src/lib/crypto.js','utf8'),ctx);
let fail=0;const eq=(n,a,b)=>{if(a!==b){fail++;console.log('FAIL',n,a,b)}};
for(const s of ['', 'abc', 'x'.repeat(55),'y'.repeat(56),'z'.repeat(64),'héllo 😀 '.repeat(20)]){
 eq('md5',ctx.md5Hex(s),nc.createHash('md5').update(s).digest('hex'));
 eq('sha1',ctx.sha1Hex(s),nc.createHash('sha1').update(s).digest('hex'));
 eq('sha256',ctx.sha256Hex(s),nc.createHash('sha256').update(s).digest('hex'));
 eq('hmac',ctx.bytesToHex(ctx.hmacSha256('k'.repeat(70),s)),nc.createHmac('sha256','k'.repeat(70)).update(s).digest('hex'));
 eq('b64',ctx.bytesToB64(ctx.utf8Encode(s)),Buffer.from(s).toString('base64'));
 eq('b64d',ctx.utf8Decode(ctx.b64ToBytes(Buffer.from(s).toString('base64'))),s);
}
for(const kl of [16,24,32]){const key=nc.randomBytes(kl),iv=nc.randomBytes(16);
 for(const pt of ['a','0123456789abcdef','long text '.repeat(9)]){
  const c=nc.createCipheriv('aes-'+kl*8+'-cbc',key,iv);const ct=Buffer.concat([c.update(pt),c.final()]);
  eq('cbcdec'+kl,ctx.utf8Decode(ctx.aesCbcDecrypt(new Uint8Array(ct),new Uint8Array(key),new Uint8Array(iv))),pt);
  eq('cbcenc'+kl,Buffer.from(ctx.aesCbcEncrypt(pt,new Uint8Array(key),new Uint8Array(iv))).toString('hex'),ct.toString('hex'));
  const g=nc.createCipheriv('aes-'+kl*8+'-gcm',key,iv.subarray(0,12));const gt=Buffer.concat([g.update(pt),g.final()]);
  eq('gcm'+kl,ctx.utf8Decode(ctx.aesGcmDecrypt(new Uint8Array(gt),new Uint8Array(key),new Uint8Array(iv.subarray(0,12)))),pt);
  const e=nc.createCipheriv('aes-'+kl*8+'-ecb',key,null);const et=Buffer.concat([e.update(pt),e.final()]);
  eq('ecb'+kl,ctx.utf8Decode(ctx.aesEcbDecrypt(new Uint8Array(et),new Uint8Array(key))),pt);
 }}
console.log(fail?'crypto FAILED '+fail:'crypto OK');process.exit(fail?1:0);
