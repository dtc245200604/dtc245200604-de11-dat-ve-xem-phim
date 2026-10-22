// Run inside the app container; no host Node.js installation is needed.
const endpoints = ['http://prometheus:9090/-/ready', 'http://grafana:3000/api/health'];
if (process.env.CHECK_LOGS === '1') endpoints.push('http://loki:3100/ready', 'http://promtail:9080/ready');
(async () => {
  for (const endpoint of endpoints) {
    let ready = false;
    for (let attempt = 0; attempt < 36; attempt++) {
      try {
        const response = await fetch(endpoint, {signal: AbortSignal.timeout(3000)});
        if (response.ok) {ready = true; break;}
      } catch { /* Retry while the service initializes. */ }
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    if (!ready) throw new Error('Service not ready: ' + endpoint);
    console.log('Ready: ' + endpoint);
  }
})().catch(error => {console.error(error.message); process.exitCode = 1;});
