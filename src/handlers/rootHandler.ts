import { Utils } from "../utils/utils";
import { XMLParser, XMLBuilder } from "fast-xml-parser";

interface XmlWxMsg {
  FromUserName: string;
  ToUserName: string;
  MsgType: "event" | "text";
  // text
  Content: string;
  // event
  Event: "subscribe" | "CLICK" | "scancode_waitmsg";
  // scan
  EventKey: "GetCode" | "NewChat" | "CallScan";
}

function handleSubscribe(xmlMsg: XmlWxMsg): string {
  const xmlReply = {
    xml: {
      ToUserName: xmlMsg.FromUserName,
      FromUserName: xmlMsg.ToUserName,
      CreateTime: Utils.time_now(),
      MsgType: "text",
      Content: `感谢关注\n${xmlMsg.FromUserName}`
    }
  };
  return new XMLBuilder().build(xmlReply);
}

async function doAction(xmlMsg: XmlWxMsg): Promise<string> {
  if (xmlMsg.MsgType === "event") {
    if (xmlMsg.Event === "subscribe") {
      return handleSubscribe(xmlMsg);
    }
    return `unknown event type: ${xmlMsg.Event}`;
  }
  const xmlReply = {
    xml: {
      ToUserName: xmlMsg.FromUserName,
      FromUserName: xmlMsg.ToUserName,
      CreateTime: Math.floor(Date.now() / 1000).toString(),
      MsgType: "text",
      Content: "暂未接入对话功能"
    }
  };
  return new XMLBuilder().build(xmlReply);
}

async function action(request: Request, env: Env): Promise<string> {
  const xmlParser = new XMLParser();
  try {
    const args = Object.fromEntries(new URL(request.url).searchParams);
    if (!await verify(args, env.AppToken)) {
      return "Signature Failed";
    }
    const strMsg = await request.text();
    const xmlMsg = xmlParser.parse(strMsg).xml as XmlWxMsg;
    return doAction(xmlMsg);
  } catch (e) {
    console.log("Root Plain Action:", e);
    return "Failed";
  }
}

async function verify(args: { [k: string]: string }, token: string): Promise<boolean> {
  return args.signature === await Utils.sha1(token, args.timestamp, args.nonce);
}

export async function rootHandler(
  request: Request,
  env: Env
): Promise<Response> {
  let reply = "Method Not Allowed";
  if (request.method === "POST") {
    reply = await action(request, env);
  } else if (request.method === "GET") {
    const args = Object.fromEntries(new URL(request.url).searchParams);
    reply = (await verify(args, env.AppToken)) ? args.echostr || "Success" : "Failed";
  }
  return new Response(reply);
}