const StrBase: string = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export class Utils {
  static random_string(size: number = 16, rules: string | undefined = undefined): string {
    if (!rules) {
      rules = StrBase;
    }
    let result: string = "";
    for (let i = 0; i < size; i++) {
      result += rules.charAt(Math.floor(Math.random() * rules.length));
    }
    return result;
  }

  static async sha1(...args: any[]): Promise<string> {
    const params: string[] = args.map(arg => String(arg)).sort();
    const data: string = params.join("");
    const dataBytes: Uint8Array<ArrayBufferLike> = new TextEncoder().encode(data);
    const hashBuffer: ArrayBuffer = await crypto.subtle.digest("SHA-1", dataBytes);
    const hashArray: number[] = Array.from(new Uint8Array(hashBuffer));
    const hashHex: string = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    return hashHex;
  }

  static time_now(str: boolean = true): number | string {
    const time = Math.floor(Date.now() / 1000);
    return str ? time.toString() : time;
  }

  static async unique_key(env: Env): Promise<string> {
    let key = this.random_string(env.KVTicketSize);
    while (await this.get_kv(env, key) !== null) {
      key = this.random_string(env.KVTicketSize);
    }
    return key;
  }

  static async set_kv(env: Env, key: string, value: any, opt: KVNamespacePutOptions = {}) {
    if ("string" !== typeof value) value = JSON.stringify(value);
    await env.KeyValue.put(`${env.KVTicketPrefix}${key}`, value, opt);
  }

  static async get_kv(env: Env, key: string): Promise<string | null> {
    return await env.KeyValue.get(`${env.KVTicketPrefix}${key}`);
  }

  static async set_access_key(env: Env, token: string) {
    await env.KeyValue.put(env.AppAccessKey, token, { expirationTtl: 7100 });
  }

  static async get_access_key(env: Env): Promise<string | null> {
    return await env.KeyValue.get(env.AppAccessKey);
  }
}