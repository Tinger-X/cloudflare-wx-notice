import { DetailRouteName } from "../utils/shard.d";
import { Utils } from "../utils/utils";

interface MsgOption {
  template?: string;
  uid?: string;
  // url优于detail，即detail和url同时有效时，不在本服务中存储内容
  url?: string;  // 如果url为空且不使用本服务存储，则发送的内容为仅通知无详情；如果url不为空或者使用本服务存储，则发送的内容有详情页。
  detail?: {
    ttl?: number;  // 非正数: 不使用本服务的内容存储，正数：使用本服务存储，最大值：env.MaxContentTTL
    content: string;  // 详情内容，HTML格式，最大长度：env.MaxContentLength
  }
}

type MsgParam = { [k: string]: { value: any } };

export interface MessageConfig {
  option?: MsgOption;
  params: { [k: string]: any } | MsgParam;
}

function fillDefaultOption(opt: MsgOption | undefined, env: Env): MsgOption {
  if (opt === undefined) opt = {};
  if (opt?.template === undefined) opt.template = env.DefaultTemplate;
  if (opt?.uid === undefined) opt.uid = env.Owner;
  if (opt?.url !== undefined) opt.detail = undefined;
  else {
    if (opt?.detail?.content !== undefined) {
      if (opt?.detail?.ttl === undefined || isNaN(+opt?.detail?.ttl)) opt.detail.ttl = env.MaxContentTTL;
      opt.detail.ttl = Math.max(+opt?.detail?.ttl, 60);
      if (opt.detail.ttl < 1) opt.detail = undefined;
      else opt.detail.ttl = Math.min(opt.detail.ttl, env.MaxContentTTL);
    }
  }
  return opt;
}

async function generateUriForContent(env: Env, opt: { ttl: number, content: string }): Promise<string> {
  const key = await Utils.unique_key(env);
  if (opt.content.length > env.MaxContentLength) {
    opt.content = opt.content.slice(0, env.MaxContentLength);
  }
  await Utils.set_kv(env, key, opt.content, { expirationTtl: opt.ttl });
  return `/${DetailRouteName}/${key}`;
}

function buildParams(params: { [k: string]: any }): MsgParam {
  const res: MsgParam = {};
  for (let key in params) {
    res[key] = { value: params[key] }
  }
  return res;
}

async function fetchAccessToken(env: Env): Promise<{ token?: string, msg?: string }> {
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${env.AppID}&secret=${env.AppSecret}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      return { msg: resp.statusText };
    }
    const data: any = await resp.json();
    if (data.access_token === undefined) {
      return { msg: JSON.stringify(data) };
    }
    return { token: data.access_token };
  } catch (err: any) {
    return { msg: err.message };
  }
}

async function prepareAccessToken(env: Env): Promise<{ token?: string, msg?: string }> {
  let access = await Utils.get_access_key(env);
  if (access !== null) return { token: access };
  const resp = await fetchAccessToken(env);
  if (resp.token) {
    await Utils.set_access_key(env, resp.token);
    return { token: resp.token };
  }
  console.log(`Access Token Fetch Error: ${resp.msg}`);
  return resp;
}

async function sendWxNotice(access: string, option: MsgOption, params: MsgParam): Promise<Response> {
  const url = `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${access}`;
  const payload = { touser: option.uid, template_id: option.template, url: option.url, data: params };
  try {
    const resp = await fetch(url, { method: "POST", body: JSON.stringify(payload) });
    if (!resp.ok) {
      return Response.json({ code: 500, msg: resp.statusText });
    }
    const data: any = await resp.json();
    if (data.errcode === 0) {
      return Response.json({ code: 200, msg: "success" });
    }
    return Response.json({ code: 400, msg: data.errmsg });
  } catch (err: any) {
    return Response.json({ code: 500, msg: err.message });
  }
}

export async function rpcSendNotice(payload: MessageConfig, env: Env): Promise<Response> {
  payload.option = fillDefaultOption(payload.option, env);
  if (payload.option?.detail !== undefined) {
    const uri = await generateUriForContent(env, payload.option.detail as { ttl: number, content: string });
    payload.option.url = `${env.WorkerHost}${uri}`;
  }
  payload.params = buildParams(payload.params);
  const access = await prepareAccessToken(env);
  if (access.token === undefined) return Response.json({ code: 500, msg: access.msg });
  return sendWxNotice(access.token, payload.option, payload.params);
}

export async function sendHandler(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.headers.get(env.AuthHeader) !== env.AuthValue) {
    return Response.json({ code: 406, msg: "Auth Failed" });
  }
  if (request.method !== "POST") {
    return Response.json({ code: 403, msg: "Method Not Allowed" });
  }
  const text = await request.text();
  let payload: MessageConfig;
  try {
    payload = JSON.parse(text);
  } catch(e: any) {
    return Response.json({ code: 400, msg: "request body error" });
  }
  payload.option = fillDefaultOption(payload.option, env);
  if (payload.option?.detail !== undefined) {
    const uri = await generateUriForContent(env, payload.option.detail as { ttl: number, content: string });
    const url = new URL(request.url);
    payload.option.url = `${url.origin}${uri}`;
  }
  payload.params = buildParams(payload.params);
  const access = await prepareAccessToken(env);
  if (access.token === undefined) return Response.json({ code: 500, msg: access.msg });
  return sendWxNotice(access.token, payload.option, payload.params);
}