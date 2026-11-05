import { registerJobHandler } from "@/worker/handlers";

import { sendApiMessage } from "./api-outreach";
import { discoverProfile } from "./discovery";
import { pollWebhookInbox } from "./inbound";
import { sendBrowserDm } from "./outreach";

registerJobHandler("discover_profile", discoverProfile);
registerJobHandler("send_browser_dm", sendBrowserDm);
registerJobHandler("poll_webhook_inbox", pollWebhookInbox);
registerJobHandler("send_api_message", sendApiMessage);
