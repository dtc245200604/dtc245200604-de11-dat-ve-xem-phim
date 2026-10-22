import fs from 'node:fs';
const failures=[];
function check(name,passed){console.log(`${passed?'[DAT]':'[LOI]'} ${name}`);if(!passed) failures.push(name);}
async function json(url,options={}){const r=await fetch(url,{...options,signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(`${r.status} ${new URL(url).pathname}`);return r.json();}
const prom='http://prometheus:9090';
const query=async q=>(await json(`${prom}/api/v1/query?query=${encodeURIComponent(q)}`)).data.result;
try{
 const targets=(await json(`${prom}/api/v1/targets`)).data.activeTargets;
 for(const job of ['prometheus','app','nginx','mysql','cadvisor'])check(`target ${job} UP`,targets.some(x=>x.labels.job===job&&x.health==='up'));
 for(const q of ['mysql_up','nginx_up']){const x=await query(q);check(`${q} = 1`,x.length===1&&Number(x[0].value[1])===1);}
 for(const svc of ['app','nginx','mysql'])for(const metric of ['container_memory_working_set_bytes','container_cpu_usage_seconds_total'])check(`${metric}: ${svc}`,(await query(`${metric}{job="cadvisor",service="${svc}"}`)).length>0);
 check('HTTP metrics có dữ liệu',(await query('cinema_http_requests_total')).length>0);
 const auth={Authorization:'Basic '+Buffer.from('admin:'+fs.readFileSync('/run/secrets/grafana_password','utf8').trim()).toString('base64')};
 check('Grafana database OK',(await json('http://grafana:3000/api/health')).database==='ok');
 const dashboard=await json('http://grafana:3000/api/dashboards/uid/de11-tong-quan',{headers:auth});
 check('Dashboard được provision',dashboard.dashboard.panels.length>=18);
 const ds=await json('http://grafana:3000/api/datasources',{headers:auth});
 check('Datasource Prometheus',ds.some(x=>x.uid==='prometheus'));
 if(process.env.CHECK_LOGS==='1'){
  check('Datasource Loki',ds.some(x=>x.uid==='loki'));
  const queries=[['Đơn đặt vé','{project="de11datvewsl",service="app"} | json | event="booking_created"','query_range'],['Nginx HTTP lỗi','{project="de11datvewsl",service="nginx",stream="access"} | json | status >= 400','query_range'],['Thanh toán thất bại','sum(count_over_time({project="de11datvewsl",service="app"} | json | event="payment_failed" [5m]))','query']];
  for(const [name,q,endpoint]of queries){const r=await json(`http://loki:3100/loki/api/v1/${endpoint}?query=${encodeURIComponent(q)}`);check(`LogQL: ${name}`,r.status==='success'&&r.data.result.length>0&&(endpoint!=='query'||Number(r.data.result[0].value[1])>0));}
 }
}catch(e){check(`Không đọc được endpoint: ${e.message}`,false);}
console.log(`Kết quả: ${failures.length===0?'TẤT CẢ ĐẠT':failures.length+' kiểm tra chưa đạt'}`);
process.exitCode=failures.length?1:0;
