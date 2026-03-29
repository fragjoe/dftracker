import { handleTrackerRequest } from '../../server/handler.js';

export default async function handler(request, response) {
  return handleTrackerRequest(request, response);
}
