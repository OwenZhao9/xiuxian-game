import type { IncomingMessage, ServerResponse } from "node:http";
import { handleAction } from "../server/vercelHandlers.js";

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  await handleAction(request, response);
}
