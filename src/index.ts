import { rootHandler } from "./handlers/rootHandler";
import { sendHandler, rpcSendNotice, MessageConfig } from "./handlers/sendHandler";
import { detailHandler } from "./handlers/detailHandler";
import { DetailRouteName } from "./utils/shard.d";
import { WorkerEntrypoint } from "cloudflare:workers";

export class RpcWxNotice extends WorkerEntrypoint {
	async fetch(request: Request): Promise<Response> {
		return sendHandler(request, this.env as Env);
	}

	async sendNotice(payload: MessageConfig): Promise<Response> {
		return rpcSendNotice(payload, this.env as Env);
	}
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname.split("/").filter(Boolean);

		if (path.length === 0) {
			return rootHandler(request, env);
		} else if (path[0] === "send") {
			return sendHandler(request, env);
		} else if (path[0] === DetailRouteName) {
			return detailHandler(request, env, path[1]);
		}

		return Response.json({ code: 404, msg: "resource not found" });
	}
};
