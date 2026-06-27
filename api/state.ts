import type { IncomingMessage, ServerResponse } from "node:http";
import { handleState } from "../server/vercelHandlers.js";

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  await handleState(request, response);
}
