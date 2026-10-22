import test from 'node:test';
import assert from 'node:assert/strict';
test('Nginx phân biệt cookie local HTTP và Tunnel HTTPS, không tin header từ khách',async()=>{
 const local=await fetch('http://nginx:8080/',{headers:{'X-Forwarded-Proto':'https'}});
 assert.equal(local.status,200);
 assert.ok(local.headers.getSetCookie().some(x=>x.startsWith('rapmay.sid=')&&!/;\s*Secure/i.test(x)));
 const tunnel=await fetch('http://nginx:8083/');
 assert.equal(tunnel.status,200);
 assert.ok(tunnel.headers.getSetCookie().some(x=>x.startsWith('rapmay.sid=')&&/;\s*Secure/i.test(x)));
 assert.equal(tunnel.headers.get('cache-control'),'no-store');
 for(const path of ['/metrics','/stub_status','/healthz','/readyz'])assert.equal((await fetch('http://nginx:8083'+path)).status,404);
});
