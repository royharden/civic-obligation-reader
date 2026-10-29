/** Synchronous SHA-256 and strict UTF-8 without platform APIs. */
export function utf8Bytes(text:string):number[] {
 const bytes:number[]=[];for(let i=0;i<text.length;i++){let c=text.charCodeAt(i);
 if(c>=0xd800&&c<=0xdbff){const d=text.charCodeAt(++i);if(!(d>=0xdc00&&d<=0xdfff))throw new TypeError('Lone surrogate');c=0x10000+((c-0xd800)<<10)+d-0xdc00;}
 else if(c>=0xdc00&&c<=0xdfff)throw new TypeError('Lone surrogate');
 if(c<128)bytes.push(c);else if(c<2048)bytes.push(192|(c>>6),128|(c&63));else if(c<65536)bytes.push(224|(c>>12),128|((c>>6)&63),128|(c&63));else bytes.push(240|(c>>18),128|((c>>12)&63),128|((c>>6)&63),128|(c&63));}return bytes;
}
const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
const rotr=(x:number,n:number):number=>(x>>>n)|(x<<(32-n));
export function sha256(text:string):string {
 const bytes=utf8Bytes(text),bits=bytes.length*8;bytes.push(128);while(bytes.length%64!==56)bytes.push(0);
 const hi=Math.floor(bits/4294967296),low=bits>>>0;for(const v of [hi,low])for(let j=3;j>=0;j--)bytes.push((v>>>(j*8))&255);
 const h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
 for(let off=0;off<bytes.length;off+=64){const w:number[]=[];for(let j=0;j<16;j++){const k=off+j*4;w[j]=((bytes[k]!<<24)|(bytes[k+1]!<<16)|(bytes[k+2]!<<8)|bytes[k+3]!)>>>0;}
 for(let j=16;j<64;j++){const x=w[j-15]!,y=w[j-2]!;w[j]=(w[j-16]!+(rotr(x,7)^rotr(x,18)^(x>>>3))+w[j-7]!+(rotr(y,17)^rotr(y,19)^(y>>>10)))>>>0;}
 let [a=0,b=0,c=0,d=0,e=0,f=0,g=0,z=0]=h;
 for(let j=0;j<64;j++){const t1=(z+(rotr(e,6)^rotr(e,11)^rotr(e,25))+((e&f)^(~e&g))+K[j]!+w[j]!)>>>0;const t2=((rotr(a,2)^rotr(a,13)^rotr(a,22))+((a&b)^(a&c)^(b&c)))>>>0;z=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}
 const out=[a,b,c,d,e,f,g,z];for(let j=0;j<8;j++)h[j]=(h[j]!+out[j]!)>>>0;}
 return h.map(v=>v.toString(16).padStart(8,'0')).join('');
}
