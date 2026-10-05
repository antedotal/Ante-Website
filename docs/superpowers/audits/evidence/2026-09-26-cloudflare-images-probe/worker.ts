// Standalone module entrypoint for a uniquely named temporary Worker, never an Ante application route.
import { handleProbe, type ProbeEnv } from "./handler.js";

const worker = {
  fetch(request: Request, env: ProbeEnv): Promise<Response> {
    return handleProbe(request, env);
  },
};

export default worker;
