import { registerJobHandler } from "@/worker/handlers";

import { decideAndReply } from "./decide";

registerJobHandler("decide_and_reply", decideAndReply);
