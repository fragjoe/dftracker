import http from 'node:http';
import { handleTrackerRequest } from './handler.js';

const PORT = Number(process.env.DFTRACKER_API_PORT || 3001);
const HOST = process.env.DFTRACKER_API_HOST || '127.0.0.1';

const server = http.createServer((request, response) => {
  handleTrackerRequest(request, response);
});

server.listen(PORT, HOST, () => {
  console.log(`DFtracker storage API listening on http://${HOST}:${PORT}`);
});
