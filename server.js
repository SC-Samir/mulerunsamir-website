const http = require('http');
const fs = require('fs');
const path = require('path');
const { createClient } = require('redis');

const PORT = process.env.PORT || 3000;
const REDIS_URL = process.env.SCALINGO_REDIS_URL || 'redis://localhost:6379';

const redisClient = createClient({ url: REDIS_URL });

redisClient.on('error', (err) => console.error('Redis Client Error', err));
redisClient.on('connect', () => console.log('✅ Connected to Redis successfully'));

let cachedData = null;
let cacheTimestamp = null;
const CACHE_TTL_SECONDS = 10;

async function getCachedData() {
  const now = Date.now();
  if (cachedData && (now - cacheTimestamp < CACHE_TTL_SECONDS * 1000)) {
    return { data: cachedData, timestamp: cacheTimestamp, isCached: true };
  }
  
  // Simulate an expensive operation (e.g., database query or external API call)
  await new Promise(resolve => setTimeout(resolve, 500)); 
  
  const newData = `Data generated at ${new Date().toISOString()}`;
  cachedData = newData;
  cacheTimestamp = now;
  return { data: cachedData, timestamp: cacheTimestamp, isCached: false };
}

async function incrementVisits() {
  try {
    return await redisClient.incr('website_visits');
  } catch (err) {
    console.error('Redis increment error:', err);
    return 0;
  }
}

(async () => {
  await redisClient.connect();

  const server = http.createServer(async (req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
      const visits = await incrementVisits();
      const cacheInfo = await getCachedData();
      
      let html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
      
      // Inject dynamic content into the HTML
      html = html.replace('{{VISITS}}', visits);
      html = html.replace('{{CACHE_STATUS}}', cacheInfo.isCached ? '✅ Served from Cache' : '⚡ Freshly Generated');
      html = html.replace('{{CACHE_TIME}}', new Date(cacheInfo.timestamp).toLocaleTimeString());
      html = html.replace('{{DATA}}', cacheInfo.data);

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    } else if (req.url === '/api/data') {
      const cacheInfo = await getCachedData();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(cacheInfo, null, 2));
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
})();