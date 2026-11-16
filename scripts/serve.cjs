const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', 'site');
http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0] || '/');
    const file = path.join(root, urlPath === '/' ? 'index.html' : urlPath);
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
      res.end(data);
    });
  })
  .listen(5190, '127.0.0.1', () => console.log('serving ' + root + ' on 5190'));
